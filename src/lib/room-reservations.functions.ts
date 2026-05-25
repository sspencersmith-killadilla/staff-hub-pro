import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "./staff-guard";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function toMinutes(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

type Conflict = { reason: string };

function validateAgainstVenue(
  start: Date,
  end: Date,
  openHours: any,
  closures: any,
): Conflict | null {
  const hours = openHours ?? {};
  const closureList: any[] = Array.isArray(closures) ? closures : [];

  // Walk each calendar day the booking touches
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  while (cur <= last) {
    const ymd = cur.toISOString().slice(0, 10);
    if (closureList.some((c) => c?.date === ymd)) {
      return { reason: `Venue is closed on ${ymd}` };
    }
    const day = hours[DAY_KEYS[cur.getDay()]];
    if (!day || day.closed) {
      return { reason: `Venue is closed on ${ymd}` };
    }
    const opens = toMinutes(day.open);
    const closes = toMinutes(day.close);
    if (opens == null || closes == null) {
      return { reason: `Operating hours not set for ${ymd}` };
    }
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
      return {
        reason: `Outside operating hours on ${ymd} (${day.open}–${day.close})`,
      };
    }
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

export const listReservations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        status: z
          .enum(["pending", "approved", "declined", "cancelled", "all"])
          .default("pending"),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    let q = supabaseAdmin
      .from("room_reservations")
      .select(
        "id, room_id, requester_name, requester_email, starts_at, ends_at, party_size, purpose, notes, status, decision_note, decided_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const [resvRes, roomsRes, venuesRes] = await Promise.all([
      q,
      supabaseAdmin.from("rooms").select("id, name, venue_id"),
      supabaseAdmin.from("venues").select("id, name"),
    ]);
    if (resvRes.error) throw new Error(resvRes.error.message);
    const roomMap = new Map(
      (roomsRes.data ?? []).map((r: any) => [r.id, r]),
    );
    const venueMap = new Map(
      (venuesRes.data ?? []).map((v: any) => [v.id, v]),
    );
    return (resvRes.data ?? []).map((r: any) => {
      const room: any = roomMap.get(r.room_id);
      const venue: any = room ? venueMap.get(room.venue_id) : null;
      return {
        ...r,
        room_name: room?.name ?? "—",
        venue_name: venue?.name ?? "—",
      };
    });
  });

const upsertSchema = z.object({
  room_id: z.string().uuid(),
  requester_name: z.string().min(1).max(200),
  requester_email: z.string().email(),
  starts_at: z.string(),
  ends_at: z.string(),
  party_size: z.number().int().positive().max(10000).optional().nullable(),
  purpose: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

async function validateBooking(input: z.infer<typeof upsertSchema>) {
  const start = new Date(input.starts_at);
  const end = new Date(input.ends_at);
  if (!(end > start)) throw new Error("End must be after start");

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("id, venue_id, is_publicly_bookable")
    .eq("id", input.room_id)
    .maybeSingle();
  if (!room) throw new Error("Room not found");
  const { data: venue } = await supabaseAdmin
    .from("venues")
    .select("id, open_hours, closures")
    .eq("id", room.venue_id)
    .maybeSingle();
  if (venue) {
    const conflict = validateAgainstVenue(
      start,
      end,
      venue.open_hours,
      venue.closures,
    );
    if (conflict) throw new Error(conflict.reason);
  }

  // Overlap check vs approved reservations
  const { data: overlaps } = await supabaseAdmin
    .from("room_reservations")
    .select("id")
    .eq("room_id", input.room_id)
    .eq("status", "approved")
    .lt("starts_at", input.ends_at)
    .gt("ends_at", input.starts_at);
  if ((overlaps ?? []).length > 0) {
    throw new Error("Time conflicts with an existing approved booking");
  }
}

export const createReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => upsertSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    await validateBooking(data);
    const reservationPayload = {
      ...data,
      start_time: data.starts_at,
      end_time: data.ends_at,
      status: "approved",
      decided_by: context.userId,
      decided_at: new Date().toISOString(),
    };
    const { data: row, error } = await supabaseAdmin
      .from("room_reservations")
      .insert(reservationPayload)
      .select()
      .single();
    if (!error) return row;
    if (error.message.includes("'start_time'") || error.message.includes("'end_time'")) {
      const { start_time, end_time, ...canonicalPayload } = reservationPayload;
      const { data: retryRow, error: retryError } = await supabaseAdmin
        .from("room_reservations")
        .insert(canonicalPayload)
        .select()
        .single();
      if (retryError) throw new Error(retryError.message);
      return retryRow;
    }
    throw new Error(error.message);
  });

export const setReservationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["approved", "declined", "cancelled", "pending"]),
        decision_note: z.string().max(2000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    if (data.status === "approved") {
      const { data: r } = await supabaseAdmin
        .from("room_reservations")
        .select("room_id, starts_at, ends_at, requester_name, requester_email")
        .eq("id", data.id)
        .maybeSingle();
      if (!r) throw new Error("Reservation not found");
      await validateBooking({
        room_id: r.room_id,
        requester_name: r.requester_name,
        requester_email: r.requester_email,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
      });
    }
    const { data: row, error } = await supabaseAdmin
      .from("room_reservations")
      .update({
        status: data.status,
        decision_note: data.decision_note ?? null,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("room_reservations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listBookableRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const [roomsRes, venuesRes] = await Promise.all([
      supabaseAdmin
        .from("rooms")
        .select("id, name, venue_id, capacity")
        .order("name"),
      supabaseAdmin.from("venues").select("id, name"),
    ]);
    const venueMap = new Map(
      (venuesRes.data ?? []).map((v: any) => [v.id, v.name]),
    );
    return (roomsRes.data ?? []).map((r: any) => ({
      ...r,
      venue_name: venueMap.get(r.venue_id) ?? "—",
    }));
  });
