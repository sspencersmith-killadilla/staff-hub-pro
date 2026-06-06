import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin only");
}

export const getEmailSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("email_integration_settings")
      .select("provider, api_key, from_address, reply_to, site_url, is_active, updated_at")
      .eq("provider", "resend")
      .maybeSingle();
    return {
      provider: "resend" as const,
      from_address: data?.from_address ?? null,
      reply_to: data?.reply_to ?? null,
      site_url: data?.site_url ?? null,
      is_active: !!data?.is_active,
      has_api_key: !!data?.api_key,
      updated_at: data?.updated_at ?? null,
    };
  });

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        provider: z.enum(["resend"]).default("resend"),
        api_key: z.string().trim().max(2048).optional(),
        from_address: z.string().trim().max(255).optional(),
        reply_to: z.string().trim().max(255).optional(),
        site_url: z.string().trim().max(512).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, unknown> = {
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.api_key) patch.api_key = data.api_key;
    if (data.from_address !== undefined) patch.from_address = data.from_address || null;
    if (data.reply_to !== undefined) patch.reply_to = data.reply_to || null;
    if (data.site_url !== undefined) patch.site_url = data.site_url || null;
    if (data.is_active !== undefined) patch.is_active = data.is_active;

    // Ensure row exists, then update.
    await supabaseAdmin
      .from("email_integration_settings")
      .upsert({ provider: data.provider }, { onConflict: "provider" });

    const { error } = await supabaseAdmin
      .from("email_integration_settings")
      .update(patch)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendProviderTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ to: z.string().trim().email().max(255) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { resolveEmailConfig, resendSendWithConfig } = await import(
      "@/lib/communications.server"
    );
    const cfg = await resolveEmailConfig();
    if (!cfg.apiKey) {
      throw new Error(
        "No Resend API key configured. Paste your key above and click Save first.",
      );
    }
    const res = await resendSendWithConfig(
      cfg,
      data.to,
      "Test email from your event platform",
      `<p>This is a test email sent from <strong>Admin → Email Settings</strong>.</p>
       <p>If you received this, your Resend integration is working.</p>`,
    );
    if (res.error) throw new Error(res.error);
    return { ok: true, id: res.id };
  });
