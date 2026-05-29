import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac, randomBytes } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- helpers ----------

async function assertSocialAccess(userId: string) {
  const { data: admin } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (admin) return;
  const { data: perm } = await supabaseAdmin
    .from("staff_permissions")
    .select("permission")
    .eq("user_id", userId)
    .eq("permission", "page.social_command")
    .maybeSingle();
  if (!perm) throw new Error("Forbidden: missing page.social_command");
}

function stateSecret() {
  return (
    process.env.OAUTH_STATE_SECRET ||
    process.env.EXT_SUPABASE_SERVICE_ROLE_KEY ||
    "lovable-dev-state-secret"
  );
}

function signState(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(token: string): {
  departmentId: string;
  userId: string;
  platform: "meta" | "linkedin";
  exp: number;
} | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

async function getIntegration(platform: "meta" | "linkedin") {
  const { data } = await supabaseAdmin
    .from("social_integration_secrets")
    .select("client_id, client_secret, redirect_uri")
    .eq("platform", platform)
    .maybeSingle();
  return data;
}

function appOrigin(req: Request) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

// ---------- integration secrets (admin) ----------

export const listIntegrationSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
      nonce: randomBytes(8).toString("hex"),
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

    // linkedin
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

// ---------- OAuth exchange (called from server route) ----------

export async function completeMetaOAuth(args: {
  code: string;
  departmentId: string;
  userId: string;
  redirectUri: string;
}) {
  const cfg = await getIntegration("meta");
  if (!cfg?.client_id || !cfg?.client_secret) throw new Error("Meta not configured");

  const tokRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
      new URLSearchParams({
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
        redirect_uri: args.redirectUri,
        code: args.code,
      }),
  );
  if (!tokRes.ok) throw new Error(`Meta token exchange failed: ${await tokRes.text()}`);
  const tok = (await tokRes.json()) as { access_token: string; expires_in?: number };

  // Get the user's pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${tok.access_token}`,
  );
  if (!pagesRes.ok) throw new Error(`Failed listing FB pages: ${await pagesRes.text()}`);
  const pages = (await pagesRes.json()) as {
    data: Array<{ id: string; name: string; access_token: string }>;
  };

  for (const page of pages.data) {
    // Facebook page
    await supabaseAdmin.from("social_connections").upsert(
      {
        department_id: args.departmentId,
        platform: "facebook",
        account_id: page.id,
        account_name: page.name,
        access_token: page.access_token,
        scopes: ["pages_manage_posts"],
        connected_by: args.userId,
      },
      { onConflict: "department_id,platform,account_id" },
    );

    // Linked Instagram business account, if any
    const igRes = await fetch(
      `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${page.access_token}`,
    );
    if (igRes.ok) {
      const igJson = (await igRes.json()) as {
        instagram_business_account?: { id: string; username: string };
      };
      const ig = igJson.instagram_business_account;
      if (ig) {
        await supabaseAdmin.from("social_connections").upsert(
          {
            department_id: args.departmentId,
            platform: "instagram",
            account_id: ig.id,
            account_name: ig.username,
            access_token: page.access_token,
            scopes: ["instagram_content_publish"],
            connected_by: args.userId,
          },
          { onConflict: "department_id,platform,account_id" },
        );
      }
    }
  }
  return { ok: true, connected: pages.data.length };
}

export async function completeLinkedInOAuth(args: {
  code: string;
  departmentId: string;
  userId: string;
  redirectUri: string;
}) {
  const cfg = await getIntegration("linkedin");
  if (!cfg?.client_id || !cfg?.client_secret) throw new Error("LinkedIn not configured");

  const tokRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
    }),
  });
  if (!tokRes.ok) throw new Error(`LinkedIn token exchange failed: ${await tokRes.text()}`);
  const tok = (await tokRes.json()) as {
    access_token: string;
    expires_in?: number;
  };

  // Member identity
  const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  const me = meRes.ok
    ? ((await meRes.json()) as { sub: string; name?: string })
    : { sub: "me", name: "LinkedIn member" };

  await supabaseAdmin.from("social_connections").upsert(
    {
      department_id: args.departmentId,
      platform: "linkedin",
      account_id: me.sub,
      account_name: me.name ?? "LinkedIn account",
      access_token: tok.access_token,
      token_expires_at: tok.expires_in
        ? new Date(Date.now() + tok.expires_in * 1000).toISOString()
        : null,
      scopes: ["w_member_social"],
      connected_by: args.userId,
    },
    { onConflict: "department_id,platform,account_id" },
  );
  return { ok: true };
}

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

    // Fire-and-forget publish if scheduled in the past or within 1 minute
    if (new Date(data.scheduledFor).getTime() - Date.now() < 60_000) {
      await publishPostInternal(row.id);
    }
    return { id: row.id };
  });

export const listPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ departmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
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
    await assertSocialAccess(context.userId);
    return publishPostInternal(data.id);
  });

async function publishPostInternal(postId: string) {
  const { data: post } = await supabaseAdmin
    .from("social_posts")
    .select("*")
    .eq("id", postId)
    .single();
  if (!post) throw new Error("Post not found");

  await supabaseAdmin.from("social_posts").update({ status: "publishing" }).eq("id", postId);

  const { data: conns } = await supabaseAdmin
    .from("social_connections")
    .select("*")
    .eq("department_id", post.department_id);

  const results: Array<{ platform: string; ok: boolean; post_id?: string; error?: string }> = [];

  for (const platform of post.platforms as string[]) {
    const conn = (conns ?? []).find((c) => c.platform === platform);
    if (!conn) {
      results.push({ platform, ok: false, error: "No connected account" });
      continue;
    }
    try {
      const id = await publishToPlatform(platform, conn, post);
      results.push({ platform, ok: true, post_id: id });
    } catch (e) {
      results.push({ platform, ok: false, error: (e as Error).message });
    }
  }

  const allOk = results.every((r) => r.ok);
  const anyOk = results.some((r) => r.ok);
  const status = allOk ? "published" : anyOk ? "partial" : "failed";
  await supabaseAdmin
    .from("social_posts")
    .update({ status, results })
    .eq("id", postId);

  return { status, results };
}

async function publishToPlatform(
  platform: string,
  conn: { account_id: string; access_token: string },
  post: { caption: string; media_url: string | null },
): Promise<string> {
  if (platform === "facebook") {
    const url = post.media_url
      ? `https://graph.facebook.com/v19.0/${conn.account_id}/photos`
      : `https://graph.facebook.com/v19.0/${conn.account_id}/feed`;
    const body = new URLSearchParams({
      access_token: conn.access_token,
      ...(post.media_url
        ? { url: post.media_url, caption: post.caption }
        : { message: post.caption }),
    });
    const res = await fetch(url, { method: "POST", body });
    if (!res.ok) throw new Error(await res.text());
    const json = (await res.json()) as { id?: string; post_id?: string };
    return json.post_id || json.id || "ok";
  }

  if (platform === "instagram") {
    if (!post.media_url) throw new Error("Instagram requires an image URL");
    const create = await fetch(
      `https://graph.facebook.com/v19.0/${conn.account_id}/media`,
      {
        method: "POST",
        body: new URLSearchParams({
          image_url: post.media_url,
          caption: post.caption,
          access_token: conn.access_token,
        }),
      },
    );
    if (!create.ok) throw new Error(await create.text());
    const { id: creationId } = (await create.json()) as { id: string };
    const pub = await fetch(
      `https://graph.facebook.com/v19.0/${conn.account_id}/media_publish`,
      {
        method: "POST",
        body: new URLSearchParams({
          creation_id: creationId,
          access_token: conn.access_token,
        }),
      },
    );
    if (!pub.ok) throw new Error(await pub.text());
    const json = (await pub.json()) as { id: string };
    return json.id;
  }

  if (platform === "linkedin") {
    const author = `urn:li:person:${conn.account_id}`;
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: post.caption },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = (await res.json()) as { id: string };
    return json.id;
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

export { appOrigin };
