import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function isGlobalAdmin(userId: string): Promise<boolean> {
  const supabaseAdmin = await getAdminClient();
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
  const supabaseAdmin = await getAdminClient();
  const { data, error } = await supabaseAdmin
    .from("department_roles")
    .select("department_id")
    .eq("user_id", userId)
    .in("role", ["super_admin", "dept_admin"]);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r: any) => r.department_id as string)));
}

async function assertCanManage(departmentId: string, userId: string) {
  const ids = await listManageableDepartmentIds(userId);
  if (ids !== "all" && !ids.includes(departmentId)) {
    throw new Error("Forbidden: admin or department admin role required");
  }
  const supabaseAdmin = await getAdminClient();
  const { data, error } = await supabaseAdmin
    .from("departments")
    .select("id")
    .eq("id", departmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Department not found");
}

function maskSecret(secret: string): string {
  if (!secret || secret.length < 8) return "••••";
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

type IntegrationView = {
  department_id: string;
  wpo_base_url: string;
  wpo_workspace_id: string | null;
  enabled: boolean;
  has_secret: boolean;
  secret_masked: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function toView(row: any | null, departmentId: string): IntegrationView {
  if (!row) {
    return {
      department_id: departmentId,
      wpo_base_url: "https://workplanos.lovable.app",
      wpo_workspace_id: null,
      enabled: false,
      has_secret: false,
      secret_masked: null,
      created_at: null,
      updated_at: null,
    };
  }
  return {
    department_id: row.department_id,
    wpo_base_url: row.wpo_base_url,
    wpo_workspace_id: row.wpo_workspace_id ?? null,
    enabled: !!row.enabled,
    has_secret: !!row.shared_secret,
    secret_masked: row.shared_secret ? maskSecret(row.shared_secret) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const getWpoIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ departmentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanManage(data.departmentId, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("workplanos_integration")
      .select("*")
      .eq("department_id", data.departmentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return toView(row, data.departmentId);
  });

export const saveWpoIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        departmentId: z.string().uuid(),
        wpo_base_url: z.string().url().max(500),
        wpo_workspace_id: z.string().trim().max(200).nullable().optional(),
        enabled: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(data.departmentId, context.userId);
    const patch: Record<string, unknown> = {
      department_id: data.departmentId,
      wpo_base_url: data.wpo_base_url,
      wpo_workspace_id: data.wpo_workspace_id ?? null,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (typeof data.enabled === "boolean") patch.enabled = data.enabled;

    const { data: row, error } = await supabaseAdmin
      .from("workplanos_integration")
      .upsert(patch, { onConflict: "department_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return toView(row, data.departmentId);
  });

export const rotateWpoSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ departmentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanManage(data.departmentId, context.userId);
    const secret = `wpo_${randomBytes(32).toString("hex")}`;
    const hash = createHash("sha256").update(secret).digest("hex");

    const { error } = await supabaseAdmin
      .from("workplanos_integration")
      .upsert(
        {
          department_id: data.departmentId,
          shared_secret: secret,
          shared_secret_hash: hash,
          enabled: true,
          created_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "department_id" },
      );
    if (error) throw new Error(error.message);

    return { secret, masked: maskSecret(secret) };
  });

export const disableWpoIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ departmentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanManage(data.departmentId, context.userId);
    const { error } = await supabaseAdmin
      .from("workplanos_integration")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("department_id", data.departmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWpoDispatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ departmentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanManage(data.departmentId, context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("integration_dispatches")
      .select("id, direction, status_code, error, attempts, event_id, created_at")
      .eq("department_id", data.departmentId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listManageableDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ids = await listManageableDepartmentIds(context.userId);
    let query = supabaseAdmin
      .from("departments")
      .select("id, name")
      .order("name");
    if (ids !== "all") {
      if (ids.length === 0) return [];
      query = query.in("id", ids);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const canManageWpoIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ids = await listManageableDepartmentIds(context.userId);
    return ids === "all" || ids.length > 0;
  });
