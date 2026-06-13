import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function isGlobalAdmin(userId: string): Promise<boolean> {
  const supabaseAdmin = await loadAdmin();
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

async function listManageableDepartmentIds(userId: string): Promise<string[] | "all"> {
  if (await isGlobalAdmin(userId)) return "all";
  const supabaseAdmin = await loadAdmin();
  const { data, error } = await supabaseAdmin
    .from("department_roles")
    .select("department_id")
    .eq("user_id", userId)
    .in("role", ["super_admin", "dept_admin"]);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r: any) => r.department_id as string)));
}

async function assertCanManageDepartment(departmentId: string, userId: string) {
  const ids = await listManageableDepartmentIds(userId);
  if (ids !== "all" && !ids.includes(departmentId)) {
    throw new Error("Forbidden: department admin role required");
  }
}

async function assertCanManageEvent(eventId: string, userId: string) {
  const supabaseAdmin = await loadAdmin();
  let { data: ev, error } = await supabaseAdmin
    .from("events")
    .select("id, department_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!ev) {
    const sessionLookup = await supabaseAdmin
      .from("sessions")
      .select("id, department_id")
      .eq("id", eventId)
      .maybeSingle();
    if (sessionLookup.error) throw new Error(sessionLookup.error.message);
    ev = sessionLookup.data;
  }
  if (!ev) throw new Error("Event not found");
  if (!ev.department_id) {
    // No department scope — only global admins can resend.
    if (!(await isGlobalAdmin(userId))) {
      throw new Error("Event has no department; admin role required");
    }
    return;
  }
  await assertCanManageDepartment(ev.department_id, userId);
}

const wpoTypes = z.enum([
  "event.created",
  "event.updated",
  "event.cancelled",
  "gig.assigned",
]);

export const resendWpoEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        eventId: z.string().uuid(),
        type: wpoTypes.default("event.updated"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageEvent(data.eventId, context.userId);
    const { dispatchToWpo } = await import("@/lib/wpo-dispatch.server");
    const result = await dispatchToWpo({ eventId: data.eventId, type: data.type });
    return result;
  });

export const retryWpoDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ dispatchId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await loadAdmin();
    const { data: row, error } = await supabaseAdmin
      .from("integration_dispatches")
      .select("id, department_id, event_id, direction, payload")
      .eq("id", data.dispatchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Dispatch not found");
    if (row.direction !== "outbound") {
      throw new Error("Only outbound dispatches can be retried");
    }
    if (!row.event_id) throw new Error("Dispatch has no linked event");
    await assertCanManageDepartment(row.department_id, context.userId);

    const type =
      ((row.payload as any)?.type as
        | "event.created"
        | "event.updated"
        | "event.cancelled"
        | "gig.assigned"
        | undefined) ?? "event.updated";

    const { dispatchToWpo } = await import("@/lib/wpo-dispatch.server");
    return dispatchToWpo({ eventId: row.event_id, type });
  });

export const listRecentWpoDispatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ departmentId: z.string().uuid().optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ids = await listManageableDepartmentIds(context.userId);
    if (ids !== "all" && ids.length === 0) return [];
    const supabaseAdmin = await loadAdmin();
    let q = supabaseAdmin
      .from("integration_dispatches")
      .select(
        "id, direction, status_code, error, attempts, event_id, department_id, created_at, next_retry_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.departmentId) {
      if (ids !== "all" && !ids.includes(data.departmentId)) {
        throw new Error("Forbidden");
      }
      q = q.eq("department_id", data.departmentId);
    } else if (ids !== "all") {
      q = q.in("department_id", ids);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
