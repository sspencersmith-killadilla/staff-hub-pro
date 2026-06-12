import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const pingSchema = z.object({ type: z.literal("ping") });

const changesSchema = z
  .object({
    columnId: z.string().optional(),
    text_value: z.string().optional(),
    number_value: z.number().optional(),
    date_value: z.string().optional(),
    status_label: z.string().optional(),
    assignee_email: z.string().email().optional(),
  })
  .partial();

const itemSchema = z.object({
  type: z.enum(["item.updated", "item.status_changed", "item.assignee_changed"]),
  external_id: z.string().min(1),
  title: z.string().optional(),
  changes: changesSchema.default({}),
});

const payloadSchema = z.union([pingSchema, itemSchema]);

export const Route = createFileRoute("/api/public/integrations/wpo/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // The integration is keyed by tenant_id (was org_id pre-058).
        // Header name kept as x-wpo-workspace for backwards compat.
        const workspaceId =
          request.headers.get("x-wpo-workspace") ??
          request.headers.get("x-wpo-tenant");
        const signature = request.headers.get("x-wpo-signature") ?? "";
        const rawBody = await request.text();

        if (!workspaceId) {
          return new Response("Missing x-wpo-workspace", { status: 400 });
        }

        const { data: integ, error: integErr } = await supabaseAdmin
          .from("workplanos_integration")
          .select("tenant_id, shared_secret, enabled")
          .eq("tenant_id", workspaceId)
          .maybeSingle();

        if (integErr) return new Response("Lookup failed", { status: 500 });
        if (!integ || !integ.enabled || !integ.shared_secret) {
          return new Response("Integration not enabled", { status: 404 });
        }

        // HMAC verify
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
            tenant_id: workspaceId,
            direction: "inbound",
            payload: null,
            status_code: 401,
            error: "Invalid signature",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        // Parse + validate
        let parsed: z.infer<typeof payloadSchema>;
        try {
          const json = rawBody ? JSON.parse(rawBody) : {};
          parsed = payloadSchema.parse(json);
        } catch (e) {
          await supabaseAdmin.from("integration_dispatches").insert({
            tenant_id: workspaceId,
            direction: "inbound",
            payload: null,
            status_code: 400,
            error: (e as Error).message.slice(0, 500),
          });
          return new Response("Invalid payload", { status: 400 });
        }

        // Ping
        if (parsed.type === "ping") {
          await supabaseAdmin.from("integration_dispatches").insert({
            tenant_id: workspaceId,
            direction: "inbound",
            payload: parsed,
            status_code: 200,
          });
          return Response.json({ ok: true });
        }

        // Item events — resolve linked event
        const { data: ref, error: refErr } = await supabaseAdmin
          .from("event_external_refs")
          .select("event_id")
          .eq("source", "wpo")
          .eq("external_item_id", parsed.external_id)
          .maybeSingle();

        if (refErr) {
          await supabaseAdmin.from("integration_dispatches").insert({
            tenant_id: workspaceId,
            direction: "inbound",
            payload: parsed,
            status_code: 500,
            error: refErr.message.slice(0, 500),
          });
          return new Response("Lookup failed", { status: 500 });
        }

        if (!ref) {
          await supabaseAdmin.from("integration_dispatches").insert({
            tenant_id: workspaceId,
            direction: "inbound",
            payload: parsed,
            status_code: 200,
            error: "unlinked",
          });
          // 200 so WPO does not retry forever.
          return Response.json({ ok: true, linked: false });
        }

        // Build update patch from changes
        const c = parsed.changes ?? {};
        const patch: Record<string, unknown> = {};
        if (parsed.title) patch.title = parsed.title;
        if (c.status_label !== undefined) patch.wpo_status = c.status_label;

        if (c.assignee_email !== undefined) {
          if (c.assignee_email === "") {
            patch.wpo_assignee_id = null;
          } else {
            const { data: uid } = await supabaseAdmin.rpc(
              "find_user_id_by_email",
              { _email: c.assignee_email },
            );
            patch.wpo_assignee_id = (uid as string | null) ?? null;
          }
        }

        if (Object.keys(patch).length > 0) {
          const { error: updErr } = await supabaseAdmin
            .from("events")
            .update(patch)
            .eq("id", ref.event_id);
          if (updErr) {
            await supabaseAdmin.from("integration_dispatches").insert({
              tenant_id: workspaceId,
              direction: "inbound",
              event_id: ref.event_id,
              payload: parsed,
              status_code: 500,
              error: updErr.message.slice(0, 500),
            });
            return new Response("Update failed", { status: 500 });
          }
        }

        await supabaseAdmin.from("event_activity_log").insert({
          event_id: ref.event_id,
          source: "wpo",
          message: "Synced from WorkPlanOS",
          payload: parsed,
        });

        await supabaseAdmin.from("integration_dispatches").insert({
          tenant_id: workspaceId,
          direction: "inbound",
          event_id: ref.event_id,
          payload: parsed,
          status_code: 200,
        });

        return Response.json({ ok: true, linked: true });
      },
    },
  },
});
