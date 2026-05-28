import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const VENUE_COLS =
  "id, name, address, city, state, zip, capacity, stage_type, load_in_notes, rules, latitude, longitude, open_hours, closures";
const STAGE_COLS = "id, name, venue_id, description, address";
const ROOM_COLS =
  "id, name, venue_id, building, capacity, is_publicly_bookable, linked_stage_id, image_url, description, tags, instant_bookable, department_id";

export const listVenuesPublic = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("venues")
      .select(VENUE_COLS)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  },
);

export const listRoomsPublic = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data: rooms, error } = await supabaseAdmin
      .from("rooms")
      .select(ROOM_COLS)
      .eq("is_publicly_bookable", true)
      .order("name");
    if (error) throw new Error(error.message);
    const venueIds = Array.from(new Set((rooms ?? []).map((r: any) => r.venue_id).filter(Boolean)));
    let venuesById: Record<string, any> = {};
    if (venueIds.length) {
      const { data: venues } = await supabaseAdmin
        .from("venues")
        .select("id, name, address, city, state, zip")
        .in("id", venueIds);
      venuesById = Object.fromEntries((venues ?? []).map((v: any) => [String(v.id), v]));
    }
    return (rooms ?? []).map((r: any) => ({ ...r, venue: venuesById[String(r.venue_id)] ?? null }));
  },
);

export const getVenuePublic = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.number().int() }).parse(i))
  .handler(async ({ data }) => {
    const [venueRes, stagesRes, roomsRes] = await Promise.all([
      supabaseAdmin.from("venues").select(VENUE_COLS).eq("id", data.id).maybeSingle(),
      supabaseAdmin.from("stages").select(STAGE_COLS).eq("venue_id", data.id).order("name"),
      supabaseAdmin
        .from("rooms")
        .select(ROOM_COLS)
        .eq("venue_id", data.id)
        .eq("is_publicly_bookable", true)
        .order("name"),
    ]);
    if (venueRes.error) throw new Error(venueRes.error.message);
    if (!venueRes.data) throw new Error("Venue not found");
    return {
      venue: venueRes.data,
      stages: stagesRes.data ?? [],
      rooms: roomsRes.data ?? [],
    };
  });

export const getRoomPublic = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: room, error } = await supabaseAdmin
      .from("rooms")
      .select(ROOM_COLS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!room || !room.is_publicly_bookable) throw new Error("Room not found");
    const { data: venue } = await supabaseAdmin
      .from("venues")
      .select(VENUE_COLS)
      .eq("id", room.venue_id)
      .maybeSingle();
    return { room, venue };
  });

export const getStagePublic = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: stage, error } = await supabaseAdmin
      .from("stages")
      .select(STAGE_COLS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!stage) throw new Error("Stage not found");
    const { data: venue } = await supabaseAdmin
      .from("venues")
      .select(VENUE_COLS)
      .eq("id", stage.venue_id)
      .maybeSingle();
    return { stage, venue };
  });
