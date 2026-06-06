// Click tracking redirect
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/email/track/click/$rid")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const rid = params.rid;
        const url = new URL(request.url);
        const encoded = url.searchParams.get("u") ?? "";
        let target = "";
        try {
          // base64url decode
          const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
          target = atob(b64);
        } catch {
          target = "";
        }
        if (!target || !/^https?:\/\//i.test(target)) {
          return new Response("Invalid link", { status: 400 });
        }

        if (rid && /^[0-9a-f-]{36}$/i.test(rid)) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const now = new Date().toISOString();
            const { data: row } = await supabaseAdmin
              .from("campaign_recipients")
              .select("campaign_id, clicks_count, first_clicked_at")
              .eq("id", rid)
              .maybeSingle();
            if (row) {
              await supabaseAdmin
                .from("campaign_recipients")
                .update({
                  clicks_count: (row.clicks_count ?? 0) + 1,
                  first_clicked_at: row.first_clicked_at ?? now,
                  last_clicked_at: now,
                })
                .eq("id", rid);
              await supabaseAdmin.from("campaign_link_clicks").insert({
                recipient_id: rid,
                campaign_id: row.campaign_id,
                url: target,
                user_agent: request.headers.get("user-agent") ?? null,
              });
            }
          } catch {
            // never block the redirect on tracking failure
          }
        }

        return new Response(null, {
          status: 302,
          headers: { Location: target, "Cache-Control": "no-store" },
        });
      },
    },
  },
});
