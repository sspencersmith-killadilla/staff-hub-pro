import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "./staff-guard";

export type MyTicket = {
  id: string;
  full_name: string;
  email: string;
  quantity: number | null;
  checked_in: boolean;
  created_at: string | null;
  tier_name: string | null;
  tier_price: number | null;
  session_id: string | null;
  session_title: string | null;
  session_start: string | null;
  session_end: string | null;
  venue_name: string | null;
  group_id: string | null;
  seat_index: number;
  seat_total: number;
};


function annotateSeats(rows: MyTicket[]) {
  // Group siblings by group_id, then assign seat_index by created_at ascending.
  const byGroup = new Map<string, MyTicket[]>();
  for (const r of rows) {
    if (!r.group_id) continue;
    const list = byGroup.get(r.group_id) ?? [];
    list.push(r);
    byGroup.set(r.group_id, list);
  }
  for (const list of byGroup.values()) {
    list.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id));
    list.forEach((r, i) => {
      r.seat_index = i + 1;
      r.seat_total = list.length;
    });
  }
}

// ─── User-facing: my tickets ────────────────────────────────────────
export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? null;
    if (!email) return { email: null, tickets: [] as MyTicket[] };

    const { data: rows, error } = await supabaseAdmin
      .from("attendees")
      .select(
        "id, full_name, email, quantity, checked_in, created_at, group_id, ticket_tier_id, ticket_tiers(name, price, session_id, sessions(id, title, start_time, end_time, stages(name, venues(name))))",
      )
      .eq("email", email)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const tickets: MyTicket[] = (rows ?? []).map((r: any) => {
      const tier = r.ticket_tiers ?? null;
      const session = tier?.sessions ?? null;
      const stage = session?.stages ?? null;
      const venue = stage?.venues ?? null;
      return {
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        quantity: r.quantity,
        checked_in: !!r.checked_in,
        created_at: r.created_at ?? null,
        tier_name: tier?.name ?? null,
        tier_price: tier?.price ?? null,
        session_id: session?.id ?? null,
        session_title: session?.title ?? null,
        session_start: session?.start_time ?? null,
        session_end: session?.end_time ?? null,
        venue_name: venue?.name ?? stage?.name ?? null,
        group_id: r.group_id ?? null,
        seat_index: 1,
        seat_total: 1,
      };
    });
    annotateSeats(tickets);
    void userId;
    return { email, tickets };
  });

// ─── Staff: all attendees across events ─────────────────────────────
export type StaffAttendee = MyTicket;

export const listAllAttendees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        session_id: z.string().uuid().optional().nullable(),
        departmentId: z.string().uuid().optional().nullable(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);

    let q = supabaseAdmin
      .from("attendees")
      .select(
        "id, full_name, email, quantity, checked_in, created_at, group_id, ticket_tier_id, ticket_tiers!inner(name, price, session_id, sessions(id, title, start_time, end_time, stages(name, venues(name))))",
      )
      .order("created_at", { ascending: false });
    if (data.session_id) q = q.eq("ticket_tiers.session_id", data.session_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const attendees: StaffAttendee[] = (rows ?? []).map((r: any) => {
      const tier = r.ticket_tiers ?? null;
      const session = tier?.sessions ?? null;
      const stage = session?.stages ?? null;
      const venue = stage?.venues ?? null;
      return {
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        quantity: r.quantity,
        checked_in: !!r.checked_in,
        created_at: r.created_at ?? null,
        tier_name: tier?.name ?? null,
        tier_price: tier?.price ?? null,
        session_id: session?.id ?? null,
        session_title: session?.title ?? null,
        session_start: session?.start_time ?? null,
        session_end: session?.end_time ?? null,
        venue_name: venue?.name ?? stage?.name ?? null,
        group_id: r.group_id ?? null,
        seat_index: 1,
        seat_total: 1,
      };
    });
    annotateSeats(attendees);

    const { data: sessions } = await supabaseAdmin
      .from("sessions")
      .select("id, title, start_time")
      .order("start_time", { ascending: false })
      .limit(500);

    let waitlist: any[] = [];
    if (data.session_id) {
      const { data: w } = await supabaseAdmin
        .from("ticket_waitlist")
        .select("id, full_name, email, quantity, created_at, ticket_tier_id, ticket_tiers(name)")
        .eq("session_id", data.session_id)
        .order("created_at", { ascending: true });
      waitlist = w ?? [];
    }

    return { attendees, sessions: sessions ?? [], waitlist };
  });

// ─── Staff: check-in by attendee id (scanner) ────────────────────────
export const checkInAttendee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().min(1).max(120),
        checked_in: z.boolean().optional(),
        expected_session_id: z.string().uuid().optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const id = data.id.trim();
    const { data: existing, error: getErr } = await supabaseAdmin
      .from("attendees")
      .select(
        "id, full_name, email, checked_in, ticket_tiers(name, sessions(id, title))",
      )
      .eq("id", id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!existing) return { ok: false as const, reason: "not_found" as const };

    const e = existing as any;
    const sessionId = e.ticket_tiers?.sessions?.id ?? null;
    const sessionTitle = e.ticket_tiers?.sessions?.title ?? null;

    if (
      data.expected_session_id &&
      sessionId &&
      sessionId !== data.expected_session_id
    ) {
      return {
        ok: false as const,
        reason: "wrong_event" as const,
        full_name: e.full_name,
        session_title: sessionTitle,
      };
    }

    const target = data.checked_in ?? !e.checked_in;
    if (target === true && e.checked_in) {
      return {
        ok: false as const,
        reason: "already_checked_in" as const,
        full_name: e.full_name,
        session_title: sessionTitle,
      };
    }
    const { error } = await supabaseAdmin
      .from("attendees")
      .update({ checked_in: target })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return {
      ok: true as const,
      checked_in: target,
      full_name: e.full_name,
      session_title: sessionTitle,
    };
  });

