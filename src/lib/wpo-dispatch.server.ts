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
  const origin = process.env.PUBLIC_APP_URL || process.env.APP_URL || "";
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function buildEventPayload(eventId: string) {
  const supabaseAdmin = await loadAdmin();
  const { data: ev, error } = await supabaseAdmin
    .from("events")
    .select(
      "id, title, start_time, location, department_id, wpo_status, wpo_assignee_id, approval_status",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!ev) throw new Error("Event not found");

  // Resolve assignee email (best-effort)
  let assigneeEmail: string | null = null;
  if (ev.wpo_assignee_id) {
    const { data: u } = await supabaseAdmin
      .rpc("find_user_email_by_id", { _user_id: ev.wpo_assignee_id })
      .single<string>();
    assigneeEmail = (u as unknown as string) ?? null;
  }

  // Pull external URL if present
  const { data: ref } = await supabaseAdmin
    .from("event_external_refs")
    .select("external_url")
    .eq("event_id", ev.id)
    .eq("source", "wpo")
    .maybeSingle();

  const deepLink = withOrigin(`/events/${ev.id}`);

  return {
    department_id: ev.department_id as string | null,
    body: {
      id: ev.id,
      title: ev.title,
      starts_at: ev.start_time,
      venue: ev.location,
      status: ev.wpo_status ?? ev.approval_status ?? null,
      assignee_email: assigneeEmail,
      url: ref?.external_url || deepLink,
    },
  };
}

export async function dispatchToWpo(args: {
  eventId: string;
  type: WpoOutboundType;
  bodyOverride?: Record<string, unknown>;
}): Promise<DispatchResult> {
  const supabaseAdmin = await loadAdmin();
  const { eventId, type } = args;

  const { department_id, body } = args.bodyOverride
    ? { department_id: null, body: args.bodyOverride as any }
    : await buildEventPayload(eventId);

  if (!department_id) {
    return { skipped: true, reason: "event has no department_id" };
  }

  const { data: integ, error: integErr } = await supabaseAdmin
    .from("workplanos_integration")
    .select("department_id, wpo_base_url, wpo_workspace_id, shared_secret, enabled")
    .eq("department_id", department_id)
    .maybeSingle();
  if (integErr) throw new Error(integErr.message);

  if (!integ || !integ.enabled) {
    return { skipped: true, reason: "integration disabled" };
  }
  if (!integ.wpo_base_url || !integ.shared_secret) {
    return { skipped: true, reason: "integration missing base_url or secret" };
  }

  const url = `${integ.wpo_base_url.replace(/\/$/, "")}/api/public/integrations/tess/inbound`;
  const payload = { type, event: body };
  const raw = JSON.stringify(payload);
  const signature =
    "sha256=" + createHmac("sha256", integ.shared_secret).update(raw).digest("hex");

  // Pre-insert the dispatch row so we always have an id to update
  const { data: pre, error: preErr } = await supabaseAdmin
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
  if (preErr || !pre) throw new Error(preErr?.message ?? "Failed to log dispatch");

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
}

// Safe wrapper: never throws. Must be awaited in Cloudflare Workers —
// fire-and-forget promises are cancelled when the response returns.
export async function dispatchToWpoSafe(args: {
  eventId: string;
  type: WpoOutboundType;
}): Promise<void> {
  try {
    await dispatchToWpo(args);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[wpo] outbound dispatch failed:", err);
  }
}
