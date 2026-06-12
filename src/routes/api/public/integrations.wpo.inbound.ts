import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/integrations/wpo/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const orgId = request.headers.get("x-wpo-workspace");
        const signature = request.headers.get("x-wpo-signature") ?? "";
        const rawBody = await request.text();

        if (!orgId) {
          return new Response("Missing x-wpo-workspace", { status: 400 });
        }

        const { data: integ, error: integErr } = await supabaseAdmin
          .from("workplanos_integration")
          .select("org_id, shared_secret, enabled")
          .eq("org_id", orgId)
          .maybeSingle();

        if (integErr) {
          return new Response("Lookup failed", { status: 500 });
        }
        if (!integ || !integ.enabled || !integ.shared_secret) {
          return new Response("Integration not enabled", { status: 404 });
        }

        const expected =
          "sha256=" +
          createHmac("sha256", integ.shared_secret)
            .update(rawBody)
            .digest("hex");
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        const sigOk =
          sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);

        if (!sigOk) {
          await supabaseAdmin.from("integration_dispatches").insert({
            org_id: orgId,
            direction: "inbound",
            payload: null,
            status_code: 401,
            error: "Invalid signature",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: unknown = null;
        try {
          payload = rawBody ? JSON.parse(rawBody) : null;
        } catch {
          await supabaseAdmin.from("integration_dispatches").insert({
            org_id: orgId,
            direction: "inbound",
            payload: null,
            status_code: 400,
            error: "Invalid JSON",
          });
          return new Response("Invalid JSON", { status: 400 });
        }

        await supabaseAdmin.from("integration_dispatches").insert({
          org_id: orgId,
          direction: "inbound",
          payload: payload as object,
          status_code: 200,
        });

        return Response.json({ ok: true });
      },
    },
  },
});
