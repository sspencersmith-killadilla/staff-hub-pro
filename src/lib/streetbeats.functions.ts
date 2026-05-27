import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "./staff-guard";

// Streetbeats staff functions — operate on the artists table (multi-profile).

const SLOT_COLS =
  "id, title, description, start_time, end_time, stage_id, session_id, artist_id, busker_id, is_booked, booked_at, notes, created_at";

const ARTIST_COLS =
  "id, owner_user_id, full_name, email, genre, bio, avatar_url, spotify_link, youtube_link, soundcloud_link, tip_link, other_link_url, other_link_name, status, staff_notes, created_at";

const gigInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
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
      .from("artists")
      .select(ARTIST_COLS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    // Hydrate owner email for staff display
    const userIds = Array.from(new Set(rows.map((r: any) => r.owner_user_id).filter(Boolean)));
    const ownersRes = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds as any)
      : { data: [] as any[] };
    const ownersById = new Map((ownersRes.data ?? []).map((p: any) => [p.id, p]));
    return rows.map((a: any) => {
      const owner = ownersById.get(a.owner_user_id);
      return {
        id: a.id,
        stage_name: a.full_name ?? "Unnamed",
        contact_email: a.email ?? owner?.email ?? null,
        owner_email: owner?.email ?? null,
        owner_name: owner?.full_name ?? null,
        phone: null,
        genre: a.genre ?? null,
        bio: a.bio ?? null,
        avatar_url: a.avatar_url ?? null,
        website:
          a.other_link_url ??
          a.spotify_link ??
          a.soundcloud_link ??
          a.youtube_link ??
          null,
        status: a.status,
        staff_notes: a.staff_notes ?? null,
        created_at: a.created_at,
      };
    });
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
    const patch: Record<string, unknown> = { status: data.status };
    if (data.staff_notes !== undefined) patch.staff_notes = data.staff_notes;
    const { error } = await supabaseAdmin
      .from("artists")
      .update(patch)
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
    const artistIds = Array.from(new Set(gigs.map((g: any) => g.artist_id).filter(Boolean)));
    const stagesRes = stageIds.length
      ? await supabaseAdmin.from("stages").select("id, name, venue_id").in("id", stageIds)
      : { data: [] as any[] };
    const stages = stagesRes.data ?? [];
    const venueIds = Array.from(new Set(stages.map((s: any) => s.venue_id).filter(Boolean)));
    const [venuesRes, artistsRes] = await Promise.all([
      venueIds.length
        ? supabaseAdmin.from("venues").select("id, name").in("id", venueIds)
        : Promise.resolve({ data: [] as any[] }),
      artistIds.length
        ? supabaseAdmin
            .from("artists")
            .select("id, full_name, email")
            .in("id", artistIds as any)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const stagesById = new Map(stages.map((s: any) => [s.id, s]));
    const venuesById = new Map((venuesRes.data ?? []).map((v: any) => [v.id, v]));
    const artistsById = new Map(
      (artistsRes.data ?? []).map((a: any) => [
        a.id,
        {
          stage_name: a.full_name ?? "Unknown",
          contact_email: a.email ?? null,
        },
      ]),
    );
    return gigs.map((g: any) => {
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
        claimed_by_artist_id: g.artist_id ?? null,
        claimed_at: g.booked_at ?? null,
        created_at: g.created_at,
        venue: venue ? { id: venue.id, name: venue.name } : null,
        artist: g.artist_id ? artistsById.get(g.artist_id) ?? null : null,
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
        .update({ is_booked: false, artist_id: null, busker_id: null, booked_at: null })
        .eq("id", slotId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    if (data.status === "cancelled" || data.status === "completed") {
      const { error } = await supabaseAdmin.from("slots").delete().eq("id", slotId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
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
