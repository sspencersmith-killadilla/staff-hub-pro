import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOrgOwner(orgId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("community_organizations")
    .select("id, user_id")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) {
    throw new Error("Forbidden: org owner required");
  }
}

function maskSecret(secret: string): string {
  if (!secret || secret.length < 8) return "••••";
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

type IntegrationView = {
  org_id: string;
  wpo_base_url: string;
  wpo_workspace_id: string | null;
  enabled: boolean;
  has_secret: boolean;
  secret_masked: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function toView(row: any | null, orgId: string): IntegrationView {
  if (!row) {
    return {
      org_id: orgId,
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
    org_id: row.org_id,
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
  .inputValidator((i) => z.object({ orgId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgOwner(data.orgId, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("workplanos_integration")
      .select("*")
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return toView(row, data.orgId);
  });

export const saveWpoIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        orgId: z.string().uuid(),
        wpo_base_url: z.string().url().max(500),
        wpo_workspace_id: z.string().trim().max(200).nullable().optional(),
        enabled: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOrgOwner(data.orgId, context.userId);
    const patch: Record<string, unknown> = {
      org_id: data.orgId,
      wpo_base_url: data.wpo_base_url,
      wpo_workspace_id: data.wpo_workspace_id ?? null,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (typeof data.enabled === "boolean") patch.enabled = data.enabled;

    const { data: row, error } = await supabaseAdmin
      .from("workplanos_integration")
      .upsert(patch, { onConflict: "org_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return toView(row, data.orgId);
  });

export const rotateWpoSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orgId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgOwner(data.orgId, context.userId);
    const secret = `wpo_${randomBytes(32).toString("hex")}`;
    const hash = createHash("sha256").update(secret).digest("hex");

    const { error } = await supabaseAdmin
      .from("workplanos_integration")
      .upsert(
        {
          org_id: data.orgId,
          shared_secret: secret,
          shared_secret_hash: hash,
          enabled: true,
          created_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" },
      );
    if (error) throw new Error(error.message);

    // Returned exactly once. Subsequent reads only see the mask.
    return { secret, masked: maskSecret(secret) };
  });

export const disableWpoIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orgId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgOwner(data.orgId, context.userId);
    const { error } = await supabaseAdmin
      .from("workplanos_integration")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWpoDispatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orgId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgOwner(data.orgId, context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("integration_dispatches")
      .select("id, direction, status_code, error, attempts, event_id, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMyOwnedOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("community_organizations")
      .select("id, name")
      .eq("user_id", context.userId)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
