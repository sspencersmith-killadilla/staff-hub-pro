import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function toMinutes(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

function validateAgainstVenue(
  start: Date,
  end: Date,
  openHours: any,
  closures: any,
): string | null {
  const hours = openHours ?? {};
  const closureList: any[] = Array.isArray(closures) ? closures : [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  while (cur <= last) {
    const ymd = cur.toISOString().slice(0, 10);
    if (closureList.some((c) => c?.date === ymd)) return `Venue is closed on ${ymd}`;
    const day = hours[DAY_KEYS[cur.getDay()]];
    if (!day || day.closed) return `Venue is closed on ${ymd}`;
    const opens = toMinutes(day.open);
    const closes = toMinutes(day.close);
    if (opens == null || closes == null) return `Operating hours not set for ${ymd}`;
    const dayStart = new Date(cur);
    const dayEnd = new Date(cur);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const segStart = start > dayStart ? start : dayStart;
    const segEnd = end < dayEnd ? end : dayEnd;
    const segStartMin = segStart.getHours() * 60 + segStart.getMinutes();
    const segEndMin =
      segEnd.getDate() !== cur.getDate()
        ? 24 * 60
        : segEnd.getHours() * 60 + segEnd.getMinutes();
    if (segStartMin < opens || segEndMin > closes) {
      return `Outside operating hours on ${ymd} (${day.open}–${day.close})`;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

const requestSchema = z.object({
  room_id: z.string().uuid(),
  requester_name: z.string().trim().min(1).max(200),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  party_size: z.number().int().positive().max(10000).optional().nullable(),
  purpose: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  policy_accepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the department's room policy" }),
  }),
});

// Limits per user (active = pending or approved, in the future)
export const MAX_ACTIVE_BOOKINGS_PER_USER = 3;
export const MAX_MINUTES_PER_DAY_PER_USER = 120; // 2 hours
const ACTIVE_STATUSES = ["pending", "approved"] as const;

function ymdLocal(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const submitReservationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => requestSchema.parse(i))
  .handler(async ({ data, context }) => {
    const email = context.claims.email;
    if (!email) throw new Error("Your account has no email on file");
    const start = new Date(data.starts_at);
    const end = new Date(data.ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Invalid date");
    }
    if (!(end > start)) throw new Error("End must be after start");
    if (start < new Date(Date.now() - 60_000)) {
      throw new Error("Start time must be in the future");
    }
    const requestedMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    if (requestedMinutes > MAX_MINUTES_PER_DAY_PER_USER) {
      throw new Error("Bookings can be at most 2 hours long");
    }

    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("id, venue_id, is_publicly_bookable")
      .eq("id", data.room_id)
      .maybeSingle();
    if (!room) throw new Error("Room not found");
    if (!room.is_publicly_bookable) {
      throw new Error("This room is not publicly bookable");
    }

    const { data: venue } = await supabaseAdmin
      .from("venues")
      .select("open_hours, closures")
      .eq("id", room.venue_id)
      .maybeSingle();
    if (venue) {
      const reason = validateAgainstVenue(start, end, venue.open_hours, venue.closures);
      if (reason) throw new Error(reason);
    }

    // No conflicts with any active (pending or approved) booking for this room
    const { data: overlaps } = await supabaseAdmin
      .from("room_reservations")
      .select("id")
      .eq("room_id", data.room_id)
      .in("status", ACTIVE_STATUSES as unknown as string[])
      .lt("starts_at", data.ends_at)
      .gt("ends_at", data.starts_at);
    if ((overlaps ?? []).length > 0) {
      throw new Error("That time is already booked or pending review");
    }

    // No conflicts with a scheduled city event in this room
    const { data: sessionOverlaps } = await supabaseAdmin
      .from("sessions")
      .select("id")
      .eq("room_id", data.room_id)
      .lt("start_time", data.ends_at)
      .gt("end_time", data.starts_at);
    if ((sessionOverlaps ?? []).length > 0) {
      throw new Error("This room is reserved for a city event at that time");
    }


    // Per-user limits — count this user's active future bookings
    const nowIso = new Date().toISOString();
    const { data: mine } = await supabaseAdmin
      .from("room_reservations")
      .select("id, starts_at, ends_at, status")
      .eq("requester_user_id", context.userId)
      .in("status", ACTIVE_STATUSES as unknown as string[])
      .gte("ends_at", nowIso);
    const mineRows = mine ?? [];
    if (mineRows.length >= MAX_ACTIVE_BOOKINGS_PER_USER) {
      throw new Error(
        `You already have ${MAX_ACTIVE_BOOKINGS_PER_USER} active bookings. Cancel one before booking another.`,
      );
    }
    const dayKey = ymdLocal(start);
    const minutesThatDay = mineRows
      .filter((r) => ymdLocal(new Date(r.starts_at)) === dayKey)
      .reduce(
        (sum, r) =>
          sum +
          Math.max(
            0,
            Math.round(
              (new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) /
                60000,
            ),
          ),
        0,
      );
    if (minutesThatDay + requestedMinutes > MAX_MINUTES_PER_DAY_PER_USER) {
      throw new Error("You can only book up to 2 hours per day");
    }

    const reservationPayload = {
      ...data,
      start_time: data.starts_at,
      end_time: data.ends_at,
      requester_email: email,
      requester_user_id: context.userId,
      status: "pending",
    };
    const { error } = await supabaseAdmin.from("room_reservations").insert(reservationPayload);
    if (error) {
      if (error.message.includes("'start_time'") || error.message.includes("'end_time'")) {
        const { start_time, end_time, ...canonicalPayload } = reservationPayload;
        const { error: retryError } = await supabaseAdmin
          .from("room_reservations")
          .insert(canonicalPayload);
        if (retryError) throw new Error(retryError.message);
      } else {
        throw new Error(error.message);
      }
    }
    return { ok: true };
  });

export const getRoomAvailability = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z
      .object({
        room_id: z.string().uuid(),
        from: z.string().min(1),
        to: z.string().min(1),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    // Include pending + approved so users can't double-book against either.
    const [resvRes, sessRes] = await Promise.all([
      supabaseAdmin
        .from("room_reservations")
        .select("id, starts_at, ends_at, status")
        .eq("room_id", data.room_id)
        .in("status", ACTIVE_STATUSES as unknown as string[])
        .lt("starts_at", data.to)
        .gt("ends_at", data.from)
        .order("starts_at"),
      supabaseAdmin
        .from("sessions")
        .select("id, start_time, end_time, title")
        .eq("room_id", data.room_id)
        .lt("start_time", data.to)
        .gt("end_time", data.from),
    ]);
    if (resvRes.error) throw new Error(resvRes.error.message);
    if (sessRes.error) throw new Error(sessRes.error.message);
    const sessions = (sessRes.data ?? []).map((s: any) => ({
      id: `session:${s.id}`,
      starts_at: s.start_time,
      ends_at: s.end_time,
      status: "event" as const,
    }));
    return [...(resvRes.data ?? []), ...sessions];
  });


export const getMyReservationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("room_reservations")
      .select("id, starts_at, ends_at, status, room_id")
      .eq("requester_user_id", context.userId)
      .in("status", ACTIVE_STATUSES as unknown as string[])
      .gte("ends_at", nowIso)
      .order("starts_at");
    if (error) throw new Error(error.message);
    return {
      activeCount: (data ?? []).length,
      maxActive: MAX_ACTIVE_BOOKINGS_PER_USER,
      maxMinutesPerDay: MAX_MINUTES_PER_DAY_PER_USER,
      bookings: data ?? [],
    };
  });

export const listMyReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = context.claims.email;
    if (!email) return { reservations: [], rooms: [], venues: [], email: null };
    const { data: rows, error } = await supabaseAdmin
      .from("room_reservations")
      .select(
        "id, starts_at, ends_at, status, purpose, party_size, notes, room_id, requester_name, created_at",
      )
      .ilike("requester_email", email)
      .order("starts_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const roomIds = Array.from(new Set((rows ?? []).map((r) => r.room_id)));
    let rooms: any[] = [];
    if (roomIds.length) {
      const { data: rs } = await supabaseAdmin
        .from("rooms")
        .select("id, name, venue_id")
        .in("id", roomIds);
      rooms = rs ?? [];
    }
    const venueIds = Array.from(new Set(rooms.map((r) => r.venue_id)));
    let venues: any[] = [];
    if (venueIds.length) {
      const { data: vs } = await supabaseAdmin
        .from("venues")
        .select("id, name")
        .in("id", venueIds);
      venues = vs ?? [];
    }
    return { reservations: rows ?? [], rooms, venues, email };
  });


