// SERVER ONLY. Outbound dispatcher to WorkPlanOS.
// Loads supabaseAdmin lazily so this module is safe to import from server fns.

import { createHmac } from "crypto";

export type WpoOutboundType =
  | "event.created"
  | "event.updated"
  | "event.cancelled"
  | "gig.assigned";

export type DispatchResult =
  | { skipped: true; reason: string }
  | { ok: true; status: number; dispatch_id: string }
  | { ok: false; status: number; error: string; dispatch_id: string };

const TIMEOUT_MS = 8000;

function withOrigin(path: string): string {
  const origin =
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://totaleventsystemsolutions.lovable.app";
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function buildEventPayload(eventId: string) {
  const supabaseAdmin = await loadAdmin();

  // Compute ticket inventory from ticket_tiers (capacity) + attendees (sold).
  // Returns nulls if there are no tiers configured for the session.
  async function getTicketInventory(
    sessionId: string,
  ): Promise<{ tickets_available: number | null; tickets_sold: number | null }> {
    try {
      const { data: tiers } = await supabaseAdmin
        .from("ticket_tiers")
        .select("id, capacity")
        .eq("session_id", sessionId);
      if (!tiers || tiers.length === 0) {
        return { tickets_available: null, tickets_sold: null };
      }
      const tierIds = tiers.map((t: any) => t.id);
      const { data: atts } = await supabaseAdmin
        .from("attendees")
        .select("ticket_tier_id, quantity")
        .in("ticket_tier_id", tierIds);
      const sold = (atts ?? []).reduce(
        (sum: number, a: any) => sum + (a.quantity ?? 1),
        0,
      );
      const capacity = tiers.reduce(
        (sum: number, t: any) => sum + Number(t.capacity ?? 0),
        0,
      );
      const available = capacity > 0 ? Math.max(capacity - sold, 0) : null;
      return { tickets_available: available, tickets_sold: sold };
    } catch {
      return { tickets_available: null, tickets_sold: null };
    }
  }

  // Query sessions FIRST — that's where TESS staff events live.
  const { data: sess, error: sessErr } = await supabaseAdmin
    .from("sessions")
    .select(
      "id, title, start_time, end_time, department_id, staff_owner_id, rooms(name, venues(name)), stages(name, venues(name))",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (sessErr) throw new Error(sessErr.message);

  if (sess) {
    let assigneeEmail: string | null = null;
    if (sess.staff_owner_id) {
      try {
        const { data: u } = await supabaseAdmin
          .rpc("find_user_email_by_id", { _user_id: sess.staff_owner_id })
          .single<string>();
        assigneeEmail = (u as unknown as string) ?? null;
      } catch {
        assigneeEmail = null;
      }
    }

    const room = Array.isArray(sess.rooms) ? sess.rooms[0] : sess.rooms;
    const stage = Array.isArray(sess.stages) ? sess.stages[0] : sess.stages;
    const roomVenue = Array.isArray(room?.venues) ? room?.venues[0] : room?.venues;
    const stageVenue = Array.isArray(stage?.venues) ? stage?.venues[0] : stage?.venues;
    const venue = room?.name ?? stage?.name ?? roomVenue?.name ?? stageVenue?.name ?? null;
    const deepLink = withOrigin(`/events/${sess.id}`);

    const { tickets_available, tickets_sold } = await getTicketInventory(sess.id);

    return {
      department_id: sess.department_id as string | null,
      body: {
        id: sess.id,
        title: sess.title,
        starts_at: (sess as any).start_time ?? null,
        ends_at: (sess as any).end_time ?? null,
        doors_at: null,
        venue,
        status: "scheduled",
        assignee_email: assigneeEmail,
        tickets_available,
        tickets_sold,
        notes: null,
        url: deepLink,
      },
    };
  }

  // Legacy fallback: community events table. Only select columns that exist.
  const { data: ev, error } = await supabaseAdmin
    .from("events")
    .select(
      "id, title, description, start_time, end_time, location, department_id, approval_status",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!ev) throw new Error("Event not found");

  const deepLink = withOrigin(`/events/${ev.id}`);
  return {
    department_id: (ev as any).department_id as string | null,
    body: {
      id: ev.id,
      title: ev.title,
      starts_at: (ev as any).start_time ?? null,
      ends_at: (ev as any).end_time ?? null,
      doors_at: null,
      venue: (ev as any).location ?? null,
      status: (ev as any).approval_status ?? null,
      assignee_email: null,
      tickets_available: null,
      tickets_sold: null,
      notes: (ev as any).description ?? null,
      url: deepLink,
    },
  };
}

export async function dispatchToWpo(args: {
  eventId: string;
  type: WpoOutboundType;
  bodyOverride?: Record<string, unknown>;
  departmentId?: string | null;
}): Promise<DispatchResult> {
  const { eventId, type } = args;
  let supabaseAdmin: Awaited<ReturnType<typeof loadAdmin>>;
  try {
    supabaseAdmin = await loadAdmin();
  } catch (e) {
    return { skipped: true, reason: `admin client unavailable: ${(e as Error).message}` };
  }

  // Helper that logs a failure row to integration_dispatches without throwing.
  const logFailure = async (
    departmentId: string | null,
    payload: unknown,
    message: string,
  ) => {
    try {
      await supabaseAdmin.from("integration_dispatches").insert({
        department_id: departmentId,
        direction: "outbound",
        payload: payload ?? { type, eventId },
        attempts: 1,
        status_code: null,
        error: message.slice(0, 500),
      });
    } catch {
      // swallow — we tried our best
    }
  };

  try {
    console.log(`[wpo] dispatch start type=${type} eventId=${eventId}`);
    const built = args.bodyOverride
      ? { department_id: args.departmentId ?? null, body: args.bodyOverride as any }
      : await buildEventPayload(eventId);
    const { department_id, body } = built;

    if (!department_id) {
      await logFailure(null, { type, eventId, body }, "event has no department_id");
      return { skipped: true, reason: "event has no department_id" };
    }

    const { data: integ, error: integErr } = await supabaseAdmin
      .from("workplanos_integration")
      .select("department_id, wpo_base_url, wpo_workspace_id, shared_secret, enabled")
      .eq("department_id", department_id)
      .maybeSingle();
    if (integErr) throw new Error(integErr.message);

    if (!integ || !integ.enabled) {
      console.log(`[wpo] skip: integration disabled for dept=${department_id}`);
      await logFailure(department_id, { type, eventId, body }, "integration disabled");
      return { skipped: true, reason: "integration disabled" };
    }
    if (!integ.wpo_base_url || !integ.shared_secret) {
      console.log(`[wpo] skip: missing base_url/secret for dept=${department_id}`);
      await logFailure(
        department_id,
        { type, eventId, body },
        "integration missing base_url or secret",
      );
      return { skipped: true, reason: "integration missing base_url or secret" };
    }
    console.log(`[wpo] POST ${integ.wpo_base_url} dept=${department_id}`);

    const url = `${integ.wpo_base_url.replace(/\/$/, "")}/api/public/integrations/tess/inbound`;
    const outboundBody =
      typeof (body as any).url === "string" && (body as any).url.startsWith("/")
        ? { ...body, url: withOrigin((body as any).url) }
        : body;
    const payload = { type, event: outboundBody };
    const raw = JSON.stringify(payload);
    const signature =
      "sha256=" + createHmac("sha256", integ.shared_secret).update(raw).digest("hex");

    // Pre-insert the dispatch row so we always have an id to update
    let { data: pre, error: preErr } = await supabaseAdmin
      .from("integration_dispatches")
      .insert({
        department_id,
        event_id: eventId,
        direction: "outbound",
        payload,
        attempts: 1,
      })
      .select("id")
      .single();
    if (preErr || !pre) {
      const retry = await supabaseAdmin
        .from("integration_dispatches")
        .insert({
          department_id,
          direction: "outbound",
          payload,
          attempts: 1,
          error: `event_id log omitted: ${preErr?.message ?? "unknown"}`.slice(0, 500),
        })
        .select("id")
        .single();
      if (retry.error || !retry.data) {
        throw new Error(retry.error?.message ?? "Failed to log dispatch");
      }
      pre = retry.data;
    }

    let status = 0;
    let errMsg: string | null = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tess-workspace": integ.wpo_workspace_id ?? "",
          "x-tess-signature": signature,
        },
        body: raw,
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      status = res.status;
      if (!res.ok) {
        errMsg = (await res.text().catch(() => "")).slice(0, 500) || `HTTP ${status}`;
      }
    } catch (e) {
      errMsg = (e as Error).message.slice(0, 500);
    }

    const success = !errMsg && status >= 200 && status < 300;
    const nextRetry = success
      ? null
      : new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("integration_dispatches")
      .update({
        status_code: status || null,
        error: errMsg,
        next_retry_at: nextRetry,
      })
      .eq("id", pre.id);

    if (success) {
      return { ok: true, status, dispatch_id: pre.id };
    }
    return { ok: false, status, error: errMsg ?? "unknown", dispatch_id: pre.id };
  } catch (e) {
    const message = (e as Error).message ?? "unknown dispatcher error";
    // eslint-disable-next-line no-console
    console.error("[wpo] dispatchToWpo caught:", message);
    await logFailure(args.departmentId ?? null, { type, eventId }, message);
    return { ok: false, status: 0, error: message, dispatch_id: "" };
  }
}

// Safe wrapper: never throws. Must be awaited in Cloudflare Workers —
// fire-and-forget promises are cancelled when the response returns.
export async function dispatchToWpoSafe(args: {
  eventId: string;
  type: WpoOutboundType;
  bodyOverride?: Record<string, unknown>;
  departmentId?: string | null;
}): Promise<void> {
  const task = dispatchToWpo(args)
    .then((result) => {
      if ("ok" in result && !result.ok) {
        console.warn("[wpo] outbound dispatch returned error:", result);
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[wpo] outbound dispatch failed:", err);
    });
  const edgeRuntime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task);
    return;
  }
  await task;
}
