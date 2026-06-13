import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const itemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    assignee_email: z.string().email().optional().nullable(),
    starts_at: z.string().optional().nullable(),
    ends_at: z.string().optional().nullable(),
    venue: z.string().optional().nullable(),
    url: z.string().url().optional().nullable(),
  })
  .partial({
    title: true,
    status: true,
    assignee_email: true,
    starts_at: true,
    ends_at: true,
    venue: true,
    url: true,
  });

const payloadSchema = z.object({
  type: z.enum([
    "ping",
    "item.updated",
    "item.status_changed",
    "item.assignee_changed",
    "item.renamed",
    "item.deleted",
  ]),
  item: itemSchema.optional(),
});

export const Route = createFileRoute("/api/public/integrations/wpo/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const departmentId = request.headers.get("x-wpo-department");
        const signature = request.headers.get("x-wpo-signature") ?? "";
        const rawBody = await request.text();

        if (!departmentId) {
          return new Response("Missing x-wpo-department", { status: 400 });
        }

        const { data: integ, error: integErr } = await supabaseAdmin
          .from("workplanos_integration")
          .select("department_id, shared_secret, enabled")
          .eq("department_id", departmentId)
          .maybeSingle();

        if (integErr) return new Response("Lookup failed", { status: 500 });
        if (!integ || !integ.enabled || !integ.shared_secret) {
          return new Response("Integration not enabled", { status: 404 });
        }

        // HMAC verify (timing-safe)
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
            department_id: departmentId,
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
            department_id: departmentId,
            direction: "inbound",
            payload: null,
            status_code: 400,
            error: (e as Error).message.slice(0, 500),
          });
          return new Response("Invalid payload", { status: 400 });
        }

        // Ping — no DB writes other than the dispatch log entry.
        if (parsed.type === "ping") {
          await supabaseAdmin.from("integration_dispatches").insert({
            department_id: departmentId,
            direction: "inbound",
            payload: parsed,
            status_code: 200,
          });
          return Response.json({ ok: true, pong: true });
        }

        const item = parsed.item;
        if (!item || !item.id) {
          await supabaseAdmin.from("integration_dispatches").insert({
            department_id: departmentId,
            direction: "inbound",
            payload: parsed,
            status_code: 400,
            error: "Missing item.id",
          });
          return new Response("Missing item.id", { status: 400 });
        }

        // Resolve linked event by external ref
        const { data: ref, error: refErr } = await supabaseAdmin
          .from("event_external_refs")
          .select("event_id, external_url")
          .eq("source", "wpo")
          .eq("external_item_id", item.id)
          .maybeSingle();

        if (refErr) {
          await supabaseAdmin.from("integration_dispatches").insert({
            department_id: departmentId,
            direction: "inbound",
            payload: parsed,
            status_code: 500,
            error: refErr.message.slice(0, 500),
          });
          return new Response("Lookup failed", { status: 500 });
        }

        // Resolve assignee email -> user id (best-effort, case-insensitive)
        const resolveAssignee = async (): Promise<string | null | undefined> => {
          const email = item.assignee_email;
          if (email === undefined || email === null) return undefined; // no change
          if (email === "") return null; // explicit unset
          const { data: uid } = await supabaseAdmin.rpc(
            "find_user_id_by_email",
            { _email: email },
          );
          // skip (undefined => no change) when no match
          return (uid as string | null) ?? undefined;
        };

        // ------ DELETE ------
        if (parsed.type === "item.deleted") {
          if (!ref) {
            await supabaseAdmin.from("integration_dispatches").insert({
              department_id: departmentId,
              direction: "inbound",
              payload: parsed,
              status_code: 200,
              error: "unlinked-delete",
            });
            return Response.json({ ok: true, event_id: null });
          }
          // Soft-delete: mark approval_status = 'cancelled'
          const { error: updErr } = await supabaseAdmin
            .from("events")
            .update({ approval_status: "cancelled" })
            .eq("id", ref.event_id);
          if (updErr) {
            await supabaseAdmin.from("integration_dispatches").insert({
              department_id: departmentId,
              direction: "inbound",
              event_id: ref.event_id,
              payload: parsed,
              status_code: 500,
              error: updErr.message.slice(0, 500),
            });
            return new Response("Cancel failed", { status: 500 });
          }
          await supabaseAdmin.from("event_activity_log").insert({
            event_id: ref.event_id,
            source: "wpo",
            message: "Cancelled from WorkPlanOS",
            payload: parsed,
          });
          await supabaseAdmin.from("integration_dispatches").insert({
            department_id: departmentId,
            direction: "inbound",
            event_id: ref.event_id,
            payload: parsed,
            status_code: 200,
          });
          return Response.json({ ok: true, event_id: ref.event_id });
        }

        // ------ CREATE (no ref) ------
        if (!ref) {
          const assignee = await resolveAssignee();
          const startsAt = item.starts_at ?? new Date().toISOString();
          const endsAt =
            item.ends_at ??
            new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();
          const insertRow: Record<string, unknown> = {
            title: item.title ?? "Untitled (WorkPlanOS)",
            start_time: startsAt,
            end_time: endsAt,
            location: item.venue ?? null,
            department_id: departmentId,
            wpo_status: item.status ?? null,
            wpo_assignee_id: assignee ?? null,
          };
          const { data: newEvent, error: insErr } = await supabaseAdmin
            .from("events")
            .insert(insertRow)
            .select("id")
            .single();
          if (insErr || !newEvent) {
            await supabaseAdmin.from("integration_dispatches").insert({
              department_id: departmentId,
              direction: "inbound",
              payload: parsed,
              status_code: 500,
              error: (insErr?.message ?? "Insert failed").slice(0, 500),
            });
            return new Response("Insert failed", { status: 500 });
          }
          const { error: refInsErr } = await supabaseAdmin
            .from("event_external_refs")
            .insert({
              event_id: newEvent.id,
              source: "wpo",
              external_item_id: item.id,
              external_url: item.url ?? null,
            });
          if (refInsErr) {
            await supabaseAdmin.from("integration_dispatches").insert({
              department_id: departmentId,
              direction: "inbound",
              event_id: newEvent.id,
              payload: parsed,
              status_code: 500,
              error: refInsErr.message.slice(0, 500),
            });
            return new Response("Ref insert failed", { status: 500 });
          }
          await supabaseAdmin.from("event_activity_log").insert({
            event_id: newEvent.id,
            source: "wpo",
            message: "Created from WorkPlanOS",
            payload: parsed,
          });
          await supabaseAdmin.from("integration_dispatches").insert({
            department_id: departmentId,
            direction: "inbound",
            event_id: newEvent.id,
            payload: parsed,
            status_code: 200,
          });
          return Response.json({ ok: true, event_id: newEvent.id });
        }

        // ------ UPDATE (ref exists) ------
        // Safety: ensure linked event belongs to this department.
        const { data: ev } = await supabaseAdmin
          .from("events")
          .select("id, department_id")
          .eq("id", ref.event_id)
          .maybeSingle();

        if (!ev || (ev.department_id && ev.department_id !== departmentId)) {
          await supabaseAdmin.from("integration_dispatches").insert({
            department_id: departmentId,
            direction: "inbound",
            event_id: ref.event_id,
            payload: parsed,
            status_code: 200,
            error: "department_mismatch",
          });
          return Response.json({ ok: true, event_id: null });
        }

        const assignee = await resolveAssignee();
        const patch: Record<string, unknown> = {};
        if (item.title != null) patch.title = item.title;
        if (item.status != null) patch.wpo_status = item.status;
        if (item.starts_at != null) patch.start_time = item.starts_at;
        if (item.ends_at != null) patch.end_time = item.ends_at;
        if (item.venue != null) patch.location = item.venue;
        if (assignee !== undefined) patch.wpo_assignee_id = assignee;

        if (Object.keys(patch).length > 0) {
          const { error: updErr } = await supabaseAdmin
            .from("events")
            .update(patch)
            .eq("id", ref.event_id);
          if (updErr) {
            await supabaseAdmin.from("integration_dispatches").insert({
              department_id: departmentId,
              direction: "inbound",
              event_id: ref.event_id,
              payload: parsed,
              status_code: 500,
              error: updErr.message.slice(0, 500),
            });
            return new Response("Update failed", { status: 500 });
          }
        }

        // Keep external_url fresh if provided
        if (item.url && item.url !== ref.external_url) {
          await supabaseAdmin
            .from("event_external_refs")
            .update({ external_url: item.url })
            .eq("event_id", ref.event_id);
        }

        await supabaseAdmin.from("event_activity_log").insert({
          event_id: ref.event_id,
          source: "wpo",
          message: "Synced from WorkPlanOS",
          payload: parsed,
        });

        await supabaseAdmin.from("integration_dispatches").insert({
          department_id: departmentId,
          direction: "inbound",
          event_id: ref.event_id,
          payload: parsed,
          status_code: 200,
        });

        return Response.json({ ok: true, event_id: ref.event_id });
      },
    },
  },
});
