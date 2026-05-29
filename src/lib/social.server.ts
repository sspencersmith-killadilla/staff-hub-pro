import { createHmac, randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertSocialAccess(userId: string) {
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

export function signState(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function newNonce() {
  return randomBytes(8).toString("hex");
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

export async function getIntegration(platform: "meta" | "linkedin") {
  const { data } = await supabaseAdmin
    .from("social_integration_secrets")
    .select("client_id, client_secret, redirect_uri")
    .eq("platform", platform)
    .maybeSingle();
  return data;
}

export function appOrigin(req: Request) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

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

  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${tok.access_token}`,
  );
  if (!pagesRes.ok) throw new Error(`Failed listing FB pages: ${await pagesRes.text()}`);
  const pages = (await pagesRes.json()) as {
    data: Array<{ id: string; name: string; access_token: string }>;
  };

  for (const page of pages.data) {
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

export async function publishPostInternal(postId: string) {
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
