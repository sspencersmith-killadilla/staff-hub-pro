import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Existing schema mapping:
//   artists     -> profiles (id = auth.users.id, is_approved => 'approved')
//   gigs        -> slots    (integer id, is_booked => 'claimed', busker_id => artist)
//                  stages.venue_id -> venues for location display
// The UI continues to read stage_name / contact_email / starts_at / ends_at /
// status / venue / artist — we shape the rows accordingly.

const SLOT_COLS =
  "id, title, description, start_time, end_time, stage_id, session_id, busker_id, is_booked, booked_at, notes";

function profileToArtist(p: any) {
  if (!p) return null;
  return {
    id: p.id,
    stage_name: p.full_name ?? p.email ?? "Unnamed artist",
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
    avatar_url: p.avatar_url ?? null,
    status: p.is_approved ? "approved" : "pending",
    staff_notes: null as string | null,
    user_id: p.id,
  };
}

function slotToGig(
  s: any,
  stagesById: Map<string, any>,
  venuesById: Map<number, any>,
  artistsById: Map<string, any>,
) {
  const stage = s.stage_id ? stagesById.get(s.stage_id) ?? null : null;
  const venue = stage?.venue_id ? venuesById.get(stage.venue_id) ?? null : null;
  return {
    id: String(s.id),
    title: s.title ?? "Open slot",
    description: s.description ?? s.notes ?? null,
    venue_id: venue?.id ?? null,
    stage_id: s.stage_id ?? null,
    event_id: s.session_id ?? null,
    location_label: stage?.name ?? null,
    starts_at: s.start_time,
    ends_at: s.end_time,
    status: s.is_booked ? "claimed" : "open",
    claimed_by_artist_id: s.busker_id ?? null,
    claimed_at: s.booked_at ?? null,
    venue: venue ? { id: venue.id, name: venue.name, city: venue.city ?? null } : null,
    stage: stage ? { id: stage.id, name: stage.name } : null,
    artist: s.busker_id ? artistsById.get(s.busker_id) ?? null : null,
  };
}

async function hydrateSlots(rows: any[]) {
  const stageIds = Array.from(new Set(rows.map((r) => r.stage_id).filter(Boolean)));
  const buskerIds = Array.from(new Set(rows.map((r) => r.busker_id).filter(Boolean)));
  const stagesRes = stageIds.length
    ? await supabaseAdmin
        .from("stages")
        .select("id, name, venue_id")
        .in("id", stageIds)
    : { data: [] as any[] };
  const stages = stagesRes.data ?? [];
  const venueIds = Array.from(new Set(stages.map((s: any) => s.venue_id).filter(Boolean)));
  const [venuesRes, artistsRes] = await Promise.all([
    venueIds.length
      ? supabaseAdmin
          .from("venues")
          .select("id, name, city")
          .in("id", venueIds)
      : Promise.resolve({ data: [] as any[] }),
    buskerIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, genre")
          .in("id", buskerIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const stagesById = new Map(stages.map((s: any) => [s.id, s]));
  const venuesById = new Map((venuesRes.data ?? []).map((v: any) => [v.id, v]));
  const artistsById = new Map(
    (artistsRes.data ?? []).map((p: any) => [
      p.id,
      {
        id: p.id,
        stage_name: p.full_name ?? p.email ?? "Unknown",
        contact_email: p.email ?? null,
        genre: p.genre ?? null,
      },
    ]),
  );
  return rows.map((r) => slotToGig(r, stagesById, venuesById, artistsById));
}

// ---------- Public reads ----------

export const listOpenGigs = createServerFn({ method: "GET" }).handler(async () => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("slots")
    .select(SLOT_COLS)
    .eq("is_booked", false)
    .gte("start_time", nowIso)
    .order("start_time");
  if (error) throw new Error(error.message);
  return hydrateSlots(data ?? []);
});

export const listScheduledGigs = createServerFn({ method: "GET" }).handler(async () => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("slots")
    .select(SLOT_COLS)
    .eq("is_booked", true)
    .gte("end_time", nowIso)
    .order("start_time");
  if (error) throw new Error(error.message);
  return hydrateSlots(data ?? []);
});

// ---------- Artist self-service ----------

const artistInput = z.object({
  stage_name: z.string().trim().min(1).max(120),
  contact_email: z.string().trim().email().max(255).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  genre: z.string().trim().max(120).optional().nullable(),
  bio: z.string().trim().max(2000).optional().nullable(),
  website: z.string().trim().max(500).optional().nullable().or(z.literal("")),
});

export const getMyArtistProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return profileToArtist(data);
  });

export const upsertMyArtistProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => artistInput.parse(i))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      id: context.userId,
      full_name: data.stage_name,
      genre: data.genre ?? null,
      bio: data.bio ?? null,
      other_link_url: data.website || null,
      updated_at: new Date().toISOString(),
    };
    if (data.contact_email) patch.email = data.contact_email;
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .upsert(patch, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return profileToArtist(row);
  });

// ---------- Claim / release ----------

async function getApprovedArtist(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, is_approved, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Set up your artist profile first");
  if (!data.is_approved)
    throw new Error("Your artist profile must be approved before claiming gigs");
  return data;
}

const gigIdInput = z.object({ gig_id: z.union([z.string(), z.number()]) });

function toSlotId(v: string | number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error("Invalid gig id");
  return n;
}

export const claimGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => gigIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const artist = await getApprovedArtist(context.userId);
    const slotId = toSlotId(data.gig_id);

    const { data: slot, error: slotErr } = await supabaseAdmin
      .from("slots")
      .select("id, is_booked, start_time, end_time")
      .eq("id", slotId)
      .maybeSingle();
    if (slotErr) throw new Error(slotErr.message);
    if (!slot) throw new Error("Gig not found");
    if (slot.is_booked) throw new Error("This gig is no longer open");

    if (slot.start_time && slot.end_time) {
      const { data: conflicts } = await supabaseAdmin
        .from("slots")
        .select("id")
        .eq("busker_id", artist.id)
        .eq("is_booked", true)
        .lt("start_time", slot.end_time)
        .gt("end_time", slot.start_time);
      if ((conflicts ?? []).length > 0) {
        throw new Error("You already have a gig that overlaps this time");
      }
    }

    const { error } = await supabaseAdmin
      .from("slots")
      .update({
        is_booked: true,
        busker_id: artist.id,
        booked_at: new Date().toISOString(),
      })
      .eq("id", slotId)
      .eq("is_booked", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const releaseMyGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => gigIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const artist = await getApprovedArtist(context.userId);
    const slotId = toSlotId(data.gig_id);
    const { error } = await supabaseAdmin
      .from("slots")
      .update({ is_booked: false, busker_id: null, booked_at: null })
      .eq("id", slotId)
      .eq("busker_id", artist.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyClaimedGigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, is_approved, full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile) return { artist: null, gigs: [] };
    const artist = profileToArtist(profile);
    const { data, error } = await supabaseAdmin
      .from("slots")
      .select(SLOT_COLS)
      .eq("busker_id", context.userId)
      .order("start_time", { ascending: false });
    if (error) throw new Error(error.message);
    return { artist, gigs: await hydrateSlots(data ?? []) };
  });
