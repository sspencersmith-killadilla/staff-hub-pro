import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "./staff-guard";

// Existing schema mapping (see streetbeats-public.functions.ts).
//   slots.id is integer; we coerce.
//   "status" is derived from is_booked. Cancelled/completed not supported
//   in legacy schema — fall back to delete or unclaim.

const SLOT_COLS =
  "id, title, description, start_time, end_time, stage_id, session_id, busker_id, is_booked, booked_at, notes, created_at";

const gigInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  // legacy form passes venue_id; we ignore it (slots only have stage_id)
  venue_id: z.number().int().nullable().optional(),
  stage_id: z.string().uuid().nullable().optional(),
  event_id: z.string().uuid().nullable().optional(),
  location_label: z.string().trim().max(200).optional().nullable(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
});

const idInput = z.union([z.string(), z.number()]);
function toSlotId(v: string | number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error("Invalid gig id");
  return n;
}

// ---------- Artists ----------

export const listArtistsStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .or("is_staff.is.null,is_staff.eq.false")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      id: p.id,
      stage_name: p.full_name ?? p.email ?? "Unnamed",
      contact_email: p.email ?? null,
      phone: null,
      genre: p.genre ?? null,
      bio: p.bio ?? null,
      website:
        p.other_link_url ??
        p.spotify_link ??
        p.soundcloud_link ??
        p.youtube_link ??
        null,
      status: p.is_approved ? "approved" : "pending",
      staff_notes: null,
      created_at: p.created_at,
    }));
  });

export const setArtistStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected"]),
        staff_notes: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    // Legacy profiles only have is_approved (boolean); 'rejected' maps to false.
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_approved: data.status === "approved" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Gigs ----------

export const listGigsStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("slots")
      .select(SLOT_COLS)
      .order("start_time", { ascending: false });
    if (error) throw new Error(error.message);
    const gigs = data ?? [];
    const stageIds = Array.from(new Set(gigs.map((g) => g.stage_id).filter(Boolean)));
    const buskerIds = Array.from(new Set(gigs.map((g) => g.busker_id).filter(Boolean)));
    const stagesRes = stageIds.length
      ? await supabaseAdmin.from("stages").select("id, name, venue_id").in("id", stageIds)
      : { data: [] as any[] };
    const stages = stagesRes.data ?? [];
    const venueIds = Array.from(new Set(stages.map((s: any) => s.venue_id).filter(Boolean)));
    const [venuesRes, profilesRes] = await Promise.all([
      venueIds.length
        ? supabaseAdmin.from("venues").select("id, name").in("id", venueIds)
        : Promise.resolve({ data: [] as any[] }),
      buskerIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("id, full_name, email")
            .in("id", buskerIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const stagesById = new Map(stages.map((s: any) => [s.id, s]));
    const venuesById = new Map((venuesRes.data ?? []).map((v: any) => [v.id, v]));
    const artistsById = new Map(
      (profilesRes.data ?? []).map((p: any) => [
        p.id,
        {
          stage_name: p.full_name ?? p.email ?? "Unknown",
          contact_email: p.email ?? null,
        },
      ]),
    );
    return gigs.map((g) => {
      const stage = g.stage_id ? stagesById.get(g.stage_id) : null;
      const venue = stage?.venue_id ? venuesById.get(stage.venue_id) : null;
      return {
        id: String(g.id),
        title: g.title ?? "Open slot",
        description: g.description ?? g.notes ?? null,
        venue_id: venue?.id ?? null,
        stage_id: g.stage_id ?? null,
        event_id: g.session_id ?? null,
        location_label: stage?.name ?? null,
        starts_at: g.start_time,
        ends_at: g.end_time,
        status: g.is_booked ? "claimed" : "open",
        claimed_by_artist_id: g.busker_id ?? null,
        claimed_at: g.booked_at ?? null,
        created_at: g.created_at,
        venue: venue ? { id: venue.id, name: venue.name } : null,
        artist: g.busker_id ? artistsById.get(g.busker_id) ?? null : null,
      };
    });
  });

export const createGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => gigInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    if (new Date(data.ends_at) <= new Date(data.starts_at)) {
      throw new Error("End must be after start");
    }
    const { error } = await supabaseAdmin.from("slots").insert({
      title: data.title,
      description: data.description ?? null,
      notes: data.location_label ?? null,
      stage_id: data.stage_id ?? null,
      session_id: data.event_id ?? null,
      start_time: data.starts_at,
      end_time: data.ends_at,
      is_booked: false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => gigInput.extend({ id: idInput }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    if (new Date(data.ends_at) <= new Date(data.starts_at)) {
      throw new Error("End must be after start");
    }
    const slotId = toSlotId(data.id);
    const { error } = await supabaseAdmin
      .from("slots")
      .update({
        title: data.title,
        description: data.description ?? null,
        notes: data.location_label ?? null,
        stage_id: data.stage_id ?? null,
        session_id: data.event_id ?? null,
        start_time: data.starts_at,
        end_time: data.ends_at,
      })
      .eq("id", slotId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: idInput }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("slots")
      .delete()
      .eq("id", toSlotId(data.id));
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setGigStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: idInput,
        status: z.enum(["open", "claimed", "cancelled", "completed"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const slotId = toSlotId(data.id);
    if (data.status === "open") {
      const { error } = await supabaseAdmin
        .from("slots")
        .update({ is_booked: false, busker_id: null, booked_at: null })
        .eq("id", slotId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    if (data.status === "cancelled" || data.status === "completed") {
      // Legacy slots schema has no status column; treat as delete.
      const { error } = await supabaseAdmin.from("slots").delete().eq("id", slotId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    // 'claimed' would require a busker_id; nothing to do generically.
    return { ok: true };
  });

export const listVenuesForGigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("venues")
      .select("id, name")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
