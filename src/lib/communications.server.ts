import DOMPurify from "isomorphic-dompurify";
import { resolveAudience } from "@/lib/campaigns.functions";

const RESEND_URL = "https://api.resend.com/emails";

function getFrom() {
  return process.env.RESEND_FROM || "onboarding@resend.dev";
}

function getSiteUrl(): string {
  return process.env.SITE_URL || process.env.VITE_SITE_URL || "https://totaleventsystemsolutions.lovable.app";
}

function withFooter(html: string, email: string): string {
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  const unsubUrl = `${getSiteUrl()}/api/public/unsubscribe?email=${encodeURIComponent(email)}`;
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:24px">
    ${clean}
    <hr style="margin-top:32px;border:none;border-top:1px solid #eee" />
    <p style="font-size:12px;color:#888;text-align:center;margin-top:16px">
      You're receiving this because you're part of our community.
      <a href="${unsubUrl}" style="color:#888">Unsubscribe</a>
    </p>
  </body></html>`;
}

async function resendSend(to: string, subject: string, html: string): Promise<{ id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "RESEND_API_KEY not configured" };
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: getFrom(), to: [to], subject, html }),
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) return { error: body?.message || `HTTP ${res.status}` };
  return { id: body?.id };
}

export async function sendTest(campaignId: string, email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: c, error } = await supabaseAdmin
    .from("communication_campaigns")
    .select("subject, body_html")
    .eq("id", campaignId)
    .single();
  if (error || !c) throw new Error(error?.message || "Campaign not found");
  const res = await resendSend(email, `[TEST] ${c.subject}`, withFooter(c.body_html, email));
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

  const emails = await resolveAudience(supabaseAdmin, c.target_audience_rules);
  let sent = 0;
  let failed = 0;
  const rows: any[] = [];

  // Process in chunks
  for (let i = 0; i < emails.length; i += 10) {
    const batch = emails.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(async (email) => {
        const res = await resendSend(email, c.subject, withFooter(c.body_html, email));
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
