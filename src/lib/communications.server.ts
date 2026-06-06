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

function withFooter(html: string, email: string, siteUrl: string): string {
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  const unsubUrl = `${siteUrl}/api/public/unsubscribe?email=${encodeURIComponent(email)}`;
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:24px">
    ${clean}
    <hr style="margin-top:32px;border:none;border-top:1px solid #eee" />
    <p style="font-size:12px;color:#888;text-align:center;margin-top:16px">
      You're receiving this because you're part of our community.
      <a href="${unsubUrl}" style="color:#888">Unsubscribe</a>
    </p>
  </body></html>`;
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
  const res = await resendSendWithConfig(
    cfg,
    email,
    `[TEST] ${c.subject}`,
    withFooter(c.body_html, email, cfg.siteUrl),
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
  let sent = 0;
  let failed = 0;
  const rows: any[] = [];

  for (let i = 0; i < emails.length; i += 10) {
    const batch = emails.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(async (email) => {
        const res = await resendSendWithConfig(
          cfg,
          email,
          c.subject,
          withFooter(c.body_html, email, cfg.siteUrl),
        );
        return { email, res };
      }),
    );
    for (const r of results) {
      if (r.res.error) {
        failed++;
        rows.push({ campaign_id: campaignId, email: r.email, status: "failed", error: r.res.error });
      } else {
        sent++;
        rows.push({
          campaign_id: campaignId,
          email: r.email,
          status: "sent",
          resend_id: r.res.id,
          sent_at: new Date().toISOString(),
        });
      }
    }
    if (i + 10 < emails.length) await new Promise((r) => setTimeout(r, 250));
  }

  if (rows.length) await supabaseAdmin.from("campaign_recipients").insert(rows);

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
