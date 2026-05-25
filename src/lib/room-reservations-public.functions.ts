import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  requester_email: z.string().trim().email().max(255),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  party_size: z.number().int().positive().max(10000).optional().nullable(),
  purpose: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const submitReservationRequest = createServerFn({ method: "POST" })
  .inputValidator((i) => requestSchema.parse(i))
  .handler(async ({ data }) => {
    const start = new Date(data.starts_at);
    const end = new Date(data.ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Invalid date");
    }
    if (!(end > start)) throw new Error("End must be after start");
    if (start < new Date(Date.now() - 60_000)) {
      throw new Error("Start time must be in the future");
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

    const { data: overlaps } = await supabaseAdmin
      .from("room_reservations")
      .select("id")
      .eq("room_id", data.room_id)
      .eq("status", "approved")
      .lt("starts_at", data.ends_at)
      .gt("ends_at", data.starts_at);
    if ((overlaps ?? []).length > 0) {
      throw new Error("That time conflicts with an existing approved booking");
    }

    const { error } = await supabaseAdmin.from("room_reservations").insert({
      ...data,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
