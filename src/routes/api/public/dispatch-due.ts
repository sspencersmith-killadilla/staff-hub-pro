import { createFileRoute } from "@tanstack/react-router";

// Internal cron endpoint — dispatches campaigns where scheduled_for <= now()
export const Route = createFileRoute("/api/public/dispatch-due")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-dispatch-secret");
        const expected = process.env.DISPATCH_SECRET;
        if (!expected) {
          return new Response("Server misconfiguration", { status: 500 });
        }
        if (secret !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: due } = await supabaseAdmin
          .from("communication_campaigns")
          .select("id")
          .eq("status", "scheduled")
          .lte("scheduled_for", new Date().toISOString())
          .limit(20);
        const { dispatchCampaign } = await import("@/lib/communications.server");
        const ids = (due ?? []).map((r: any) => r.id);
        const results = [];
        for (const id of ids) {
          try {
            results.push({ id, ...(await dispatchCampaign(id)) });
          } catch (e) {
            results.push({ id, error: (e as Error).message });
          }
        }
        return Response.json({ dispatched: results.length, results });
      },
    },
  },
});
