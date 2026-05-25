import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "./staff-guard";

// Staff moderation. Orgs live on community_organizations (new table).
// Community events live on the legacy `events` table (is_community=true).

// ---------- Orgs ----------

export const listOrgsStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("community_organizations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setOrgStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected"]),
        staff_notes: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("community_organizations")
      .update({ status: data.status, staff_notes: data.staff_notes ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Community Events (from legacy `events` table) ----------

const EVENT_COLS =
  "id, organization_id, title, description, start_time, end_time, location, image_url, approval_status, reviewer_notes, submitted_by, is_community";

export const listCommunityEventsStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("events")
      .select(EVENT_COLS)
      .eq("is_community", true)
      .order("start_time", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const orgIds = Array.from(
      new Set(rows.map((r) => r.organization_id).filter(Boolean)),
    );
    const orgsRes = orgIds.length
      ? await supabaseAdmin
          .from("community_organizations")
          .select("id, name, contact_email, status")
          .in("id", orgIds)
      : { data: [] as any[] };
    const orgs = new Map((orgsRes.data ?? []).map((o: any) => [o.id, o]));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      starts_at: r.start_time,
      ends_at: r.end_time,
      status: r.approval_status ?? "pending",
      staff_notes: r.reviewer_notes ?? null,
      location: r.location ? { name: r.location, address: null, city: null } : null,
      org: r.organization_id ? orgs.get(r.organization_id) ?? null : null,
    }));
  });

export const setCommunityEventStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected", "cancelled"]),
        staff_notes: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const mapped =
      data.status === "cancelled" ? "rejected" : data.status;
    const { error } = await supabaseAdmin
      .from("events")
      .update({
        approval_status: mapped,
        reviewer_notes: data.staff_notes ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("is_community", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCommunityEventStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("events")
      .delete()
      .eq("id", data.id)
      .eq("is_community", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
