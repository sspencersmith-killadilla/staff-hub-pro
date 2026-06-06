import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const email = url.searchParams.get("email")?.toLowerCase().trim();
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return new Response("Invalid email", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("campaign_unsubscribes")
          .upsert({ email }, { onConflict: "email" });
        const html = `<!doctype html><html><body style="font-family:system-ui;padding:48px;text-align:center;max-width:480px;margin:0 auto">
          <h1 style="font-size:22px">You've been unsubscribed</h1>
          <p style="color:#555">${email} will no longer receive campaign emails.</p>
        </body></html>`;
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      },
    },
  },
});
