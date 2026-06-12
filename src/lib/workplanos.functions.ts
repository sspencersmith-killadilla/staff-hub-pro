import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function userCanManage(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "dept_admin"]);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

async function assertCanManageWpo(tenantId: string, userId: string) {
  if (!(await userCanManage(userId))) {
    throw new Error("Forbidden: admin or dept_admin role required");
  }
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Tenant not found");
}

function maskSecret(secret: string): string {
  if (!secret || secret.length < 8) return "••••";
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

type IntegrationView = {
  tenant_id: string;
  wpo_base_url: string;
  wpo_workspace_id: string | null;
  enabled: boolean;
  has_secret: boolean;
  secret_masked: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function toView(row: any | null, tenantId: string): IntegrationView {
  if (!row) {
    return {
      tenant_id: tenantId,
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
    tenant_id: row.tenant_id,
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
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanManageWpo(data.tenantId, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("workplanos_integration")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return toView(row, data.tenantId);
  });

export const saveWpoIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        tenantId: z.string().uuid(),
        wpo_base_url: z.string().url().max(500),
        wpo_workspace_id: z.string().trim().max(200).nullable().optional(),
        enabled: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageWpo(data.tenantId, context.userId);
    const patch: Record<string, unknown> = {
      tenant_id: data.tenantId,
      wpo_base_url: data.wpo_base_url,
      wpo_workspace_id: data.wpo_workspace_id ?? null,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (typeof data.enabled === "boolean") patch.enabled = data.enabled;

    const { data: row, error } = await supabaseAdmin
      .from("workplanos_integration")
      .upsert(patch, { onConflict: "tenant_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return toView(row, data.tenantId);
  });

export const rotateWpoSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanManageWpo(data.tenantId, context.userId);
    const secret = `wpo_${randomBytes(32).toString("hex")}`;
    const hash = createHash("sha256").update(secret).digest("hex");

    const { error } = await supabaseAdmin
      .from("workplanos_integration")
      .upsert(
        {
          tenant_id: data.tenantId,
          shared_secret: secret,
          shared_secret_hash: hash,
          enabled: true,
          created_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );
    if (error) throw new Error(error.message);

    return { secret, masked: maskSecret(secret) };
  });

export const disableWpoIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanManageWpo(data.tenantId, context.userId);
    const { error } = await supabaseAdmin
      .from("workplanos_integration")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWpoDispatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanManageWpo(data.tenantId, context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("integration_dispatches")
      .select("id, direction, status_code, error, attempts, event_id, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listManageableTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await userCanManage(context.userId))) return [];
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
