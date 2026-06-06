import DOMPurify from "isomorphic-dompurify";
import { resolveAudience } from "@/lib/campaigns.functions";

const RESEND_URL = "https://api.resend.com/emails";

export type EmailConfig = {
  apiKey: string | null;
  from: string;
  replyTo: string | null;
  siteUrl: string;
};

const FALLBACK_SITE_URL = "https://totaleventsystemsolutions.lovable.app";

export async function resolveEmailConfig(): Promise<EmailConfig> {
  let dbApiKey: string | null = null;
  let dbFrom: string | null = null;
  let dbReplyTo: string | null = null;
  let dbSiteUrl: string | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("email_integration_settings")
      .select("api_key, from_address, reply_to, site_url, is_active")
      .eq("provider", "resend")
      .maybeSingle();
    if (data?.is_active) {
      dbApiKey = data.api_key ?? null;
      dbFrom = data.from_address ?? null;
      dbReplyTo = data.reply_to ?? null;
      dbSiteUrl = data.site_url ?? null;
    }
  } catch {
    // table may not exist yet (pre-migration); fall through to env
  }

  return {
    apiKey: dbApiKey || process.env.RESEND_API_KEY || null,
    from: dbFrom || process.env.RESEND_FROM || "onboarding@resend.dev",
    replyTo: dbReplyTo || process.env.RESEND_REPLY_TO || null,
    siteUrl:
      dbSiteUrl ||
      process.env.SITE_URL ||
      process.env.VITE_SITE_URL ||
      FALLBACK_SITE_URL,
  };
}

function toBase64Url(input: string): string {
  // Worker-safe base64url
  const b64 = btoa(unescape(encodeURIComponent(input)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Rewrite all <a href="..."> to go through the click tracker, skipping unsub + mailto/tel. */
function rewriteLinks(html: string, recipientId: string, siteUrl: string): string {
  return html.replace(
    /(<a\b[^>]*?\bhref\s*=\s*)(["'])([^"']+)\2/gi,
    (_m, pre, q, href) => {
      if (
        /^(mailto:|tel:|#)/i.test(href) ||
        href.includes("/api/public/unsubscribe") ||
        href.includes("/api/public/email/track/")
      ) {
        return `${pre}${q}${href}${q}`;
      }
      const tracked = `${siteUrl}/api/public/email/track/click/${recipientId}?u=${toBase64Url(href)}`;
      return `${pre}${q}${tracked}${q}`;
    },
  );
}

function injectPixel(html: string, recipientId: string, siteUrl: string): string {
  const pixel = `<img src="${siteUrl}/api/public/email/track/open/${recipientId}" width="1" height="1" alt="" style="display:none;border:0;outline:none;text-decoration:none" />`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${pixel}</body>`);
  return html + pixel;
}

function buildEmailBody(
  rawHtml: string,
  email: string,
  siteUrl: string,
  recipientId: string | null,
): string {
  const clean = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
  const unsubUrl = `${siteUrl}/api/public/unsubscribe?email=${encodeURIComponent(email)}`;
  let body = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:24px">
    ${clean}
    <hr style="margin-top:32px;border:none;border-top:1px solid #eee" />
    <p style="font-size:12px;color:#888;text-align:center;margin-top:16px">
      You're receiving this because you're part of our community.
      <a href="${unsubUrl}" style="color:#888">Unsubscribe</a>
    </p>
  </body></html>`;
  if (recipientId) {
    body = rewriteLinks(body, recipientId, siteUrl);
    body = injectPixel(body, recipientId, siteUrl);
  }
  return body;
}

export async function resendSendWithConfig(
  cfg: EmailConfig,
  to: string,
  subject: string,
  html: string,
): Promise<{ id?: string; error?: string }> {
  if (!cfg.apiKey) {
    return {
      error:
        "Email provider not configured. An admin can set it up in Admin → Email Settings.",
    };
  }
  const body: Record<string, unknown> = {
    from: cfg.from,
    to: [to],
    subject,
    html,
  };
  if (cfg.replyTo) body.reply_to = cfg.replyTo;
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) return { error: json?.message || `HTTP ${res.status}` };
  return { id: json?.id };
}

export async function sendTest(campaignId: string, email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: c, error } = await supabaseAdmin
    .from("communication_campaigns")
    .select("subject, body_html")
    .eq("id", campaignId)
    .single();
  if (error || !c) throw new Error(error?.message || "Campaign not found");
  const cfg = await resolveEmailConfig();
  // Tests don't track (no recipient row).
  const res = await resendSendWithConfig(
    cfg,
    email,
    `[TEST] ${c.subject}`,
    buildEmailBody(c.body_html, email, cfg.siteUrl, null),
  );
  if (res.error) throw new Error(res.error);
  return { ok: true, id: res.id };
}

export async function dispatchCampaign(campaignId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: c, error } = await supabaseAdmin
    .from("communication_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (error || !c) throw new Error(error?.message || "Campaign not found");
  if (c.status === "sent" || c.status === "sending") {
    return { ok: true, alreadySent: true };
  }
  await supabaseAdmin
    .from("communication_campaigns")
    .update({ status: "sending" })
    .eq("id", campaignId);

  const cfg = await resolveEmailConfig();
  const emails = await resolveAudience(supabaseAdmin, c.target_audience_rules);

  // Pre-insert one recipient row per email so we have stable IDs to embed
  // into the tracking pixel and link rewrites.
  const queuedRows = emails.map((email) => ({
    campaign_id: campaignId,
    email,
    status: "queued",
  }));
  let recipients: Array<{ id: string; email: string }> = [];
  if (queuedRows.length) {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("campaign_recipients")
      .insert(queuedRows)
      .select("id, email");
    if (insErr) throw new Error(insErr.message);
    recipients = inserted ?? [];
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += 10) {
    const batch = recipients.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(async (r) => {
        const res = await resendSendWithConfig(
          cfg,
          r.email,
          c.subject,
          buildEmailBody(c.body_html, r.email, cfg.siteUrl, r.id),
        );
        return { recipient: r, res };
      }),
    );
    const updates = results.map((r) => {
      if (r.res.error) {
        failed++;
        return supabaseAdmin
          .from("campaign_recipients")
          .update({ status: "failed", error: r.res.error })
          .eq("id", r.recipient.id);
      }
      sent++;
      return supabaseAdmin
        .from("campaign_recipients")
        .update({
          status: "sent",
          resend_id: r.res.id ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", r.recipient.id);
    });
    await Promise.all(updates);
    if (i + 10 < recipients.length) await new Promise((r) => setTimeout(r, 250));
  }

  await supabaseAdmin
    .from("communication_campaigns")
    .update({
      status: failed > 0 && sent === 0 ? "failed" : "sent",
      sent_at: new Date().toISOString(),
      recipient_count: sent,
    })
    .eq("id", campaignId);

  return { ok: true, sent, failed };
}
