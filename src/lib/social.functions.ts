import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- integration secrets (admin) ----------

export const listIntegrationSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admin } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!admin) throw new Error("Forbidden: admin only");
    const { data } = await supabaseAdmin
      .from("social_integration_secrets")
      .select("platform, client_id, redirect_uri, updated_at");
    return (data ?? []) as Array<{
      platform: "meta" | "linkedin";
      client_id: string | null;
      redirect_uri: string | null;
      updated_at: string;
    }>;
  });

export const saveIntegrationSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        platform: z.enum(["meta", "linkedin"]),
        client_id: z.string().trim().max(255).optional(),
        client_secret: z.string().trim().max(1024).optional(),
        redirect_uri: z.string().trim().max(1024).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admin } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!admin) throw new Error("Forbidden: admin only");

    const patch: Record<string, unknown> = {
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.client_id !== undefined) patch.client_id = data.client_id || null;
    if (data.client_secret) patch.client_secret = data.client_secret;
    if (data.redirect_uri !== undefined) patch.redirect_uri = data.redirect_uri || null;

    const { error } = await supabaseAdmin
      .from("social_integration_secrets")
      .update(patch)
      .eq("platform", data.platform);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- connections ----------

export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ departmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertSocialAccess } = await import("./social.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSocialAccess(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("social_connections")
      .select("id, platform, account_id, account_name, scopes, connected_at, token_expires_at")
      .eq("department_id", data.departmentId)
      .order("connected_at", { ascending: false });
    return rows ?? [];
  });

export const disconnectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertSocialAccess } = await import("./social.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSocialAccess(context.userId);
    const { error } = await supabaseAdmin
      .from("social_connections")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- OAuth start ----------

export const startOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        platform: z.enum(["meta", "linkedin"]),
        departmentId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertSocialAccess, getIntegration, signState, newNonce } = await import(
      "./social.server"
    );
    await assertSocialAccess(context.userId);
    const cfg = await getIntegration(data.platform);
    if (!cfg?.client_id || !cfg?.client_secret) {
      throw new Error(
        `${data.platform} OAuth is not configured. An admin must add credentials in Admin → Social Integrations.`,
      );
    }
    const state = signState({
      departmentId: data.departmentId,
      userId: context.userId,
      platform: data.platform,
      nonce: newNonce(),
      exp: Date.now() + 10 * 60 * 1000,
    });

    const redirectUri =
      cfg.redirect_uri ||
      `${process.env.APP_URL ?? "https://totaleventsystemsolutions.lovable.app"}/api/public/oauth/${data.platform}/callback`;

    if (data.platform === "meta") {
      const scope = [
        "pages_show_list",
        "pages_manage_posts",
        "pages_read_engagement",
        "instagram_basic",
        "instagram_content_publish",
        "business_management",
      ].join(",");
      const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
      url.searchParams.set("client_id", cfg.client_id);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("scope", scope);
      url.searchParams.set("response_type", "code");
      return { authorizeUrl: url.toString() };
    }

    const scope = [
      "openid",
      "profile",
      "w_member_social",
      "w_organization_social",
      "r_organization_social",
      "rw_organization_admin",
    ].join(" ");
    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", cfg.client_id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scope);
    return { authorizeUrl: url.toString() };
  });

// ---------- posts ----------

const postInput = z.object({
  departmentId: z.string().uuid(),
  scheduledFor: z.string(),
  caption: z.string().min(1).max(5000),
  mediaUrl: z.string().url().nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  platforms: z.array(z.enum(["facebook", "instagram", "linkedin"])).min(1),
});

export const schedulePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => postInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertSocialAccess, publishPostInternal } = await import("./social.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSocialAccess(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("social_posts")
      .insert({
        department_id: data.departmentId,
        scheduled_for: data.scheduledFor,
        caption: data.caption,
        media_url: data.mediaUrl ?? null,
        event_id: data.eventId ?? null,
        platforms: data.platforms,
        created_by: context.userId,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (new Date(data.scheduledFor).getTime() - Date.now() < 60_000) {
      await publishPostInternal(row.id);
    }
    return { id: row.id };
  });

export const listPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ departmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertSocialAccess } = await import("./social.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSocialAccess(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("social_posts")
      .select("id, scheduled_for, caption, media_url, event_id, platforms, status, results")
      .eq("department_id", data.departmentId)
      .order("scheduled_for", { ascending: true });
    return rows ?? [];
  });

export const publishNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertSocialAccess, publishPostInternal } = await import("./social.server");
    await assertSocialAccess(context.userId);
    return publishPostInternal(data.id);
  });
