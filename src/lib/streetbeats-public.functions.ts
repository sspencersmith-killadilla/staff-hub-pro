import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Streetbeats data model:
//   public.artists      — performer profiles (multiple per user allowed)
//   public.slots        — gigs; slot.artist_id -> artists.id when claimed
//                          (legacy busker_id kept for backward compatibility,
//                           but writes go through artist_id)
//   public.stages/venues — location for a gig

const SLOT_COLS =
  "id, title, description, start_time, end_time, stage_id, session_id, artist_id, busker_id, is_booked, booked_at, notes";

const ARTIST_COLS =
  "id, owner_user_id, full_name, email, genre, bio, avatar_url, avatar_focal_x, avatar_focal_y, spotify_link, youtube_link, soundcloud_link, tip_link, other_link_url, other_link_name, status, staff_notes, created_at, updated_at";

function artistToPublic(a: any) {
  if (!a) return null;
  return {
    id: a.id,
    stage_name: a.full_name ?? "Unnamed artist",
    contact_email: a.email ?? null,
    phone: null,
    genre: a.genre ?? null,
    bio: a.bio ?? null,
    website:
      a.other_link_url ??
      a.spotify_link ??
      a.soundcloud_link ??
      a.youtube_link ??
      null,
    avatar_url: a.avatar_url ?? null,
    status: a.status,
    staff_notes: a.staff_notes ?? null,
    user_id: a.owner_user_id,
  };
}

function artistToEditable(a: any) {
  if (!a) return null;
  return {
    id: a.id,
    owner_user_id: a.owner_user_id,
    full_name: a.full_name ?? "",
    email: a.email ?? "",
    genre: a.genre ?? "",
    bio: a.bio ?? "",
    avatar_url: a.avatar_url ?? "",
    avatar_focal_x: a.avatar_focal_x ?? 50,
    avatar_focal_y: a.avatar_focal_y ?? 50,
    spotify_link: a.spotify_link ?? "",
    youtube_link: a.youtube_link ?? "",
    soundcloud_link: a.soundcloud_link ?? "",
    tip_link: a.tip_link ?? "",
    other_link_url: a.other_link_url ?? "",
    other_link_name: a.other_link_name ?? "",
    status: a.status,
    is_approved: a.status === "approved",
    stage_name: a.full_name ?? "",
    contact_email: a.email ?? null,
    staff_notes: a.staff_notes ?? null,
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
  const artistKey = s.artist_id ?? null;
  const artist = artistKey ? artistsById.get(artistKey) ?? null : null;
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
    claimed_by_artist_id: artistKey,
    claimed_at: s.booked_at ?? null,
    venue: venue ? { id: venue.id, name: venue.name, city: venue.city ?? null } : null,
    stage: stage ? { id: stage.id, name: stage.name } : null,
    artist,
  };
}

async function hydrateSlots(rows: any[]) {
  const stageIds = Array.from(new Set(rows.map((r) => r.stage_id).filter(Boolean)));
  const artistIds = Array.from(new Set(rows.map((r) => r.artist_id).filter(Boolean)));
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
    artistIds.length
      ? supabaseAdmin
          .from("artists")
          .select("id, full_name, email, genre")
          .in("id", artistIds as any)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const stagesById = new Map(stages.map((s: any) => [s.id, s]));
  const venuesById = new Map((venuesRes.data ?? []).map((v: any) => [v.id, v]));
  const artistsById = new Map(
    (artistsRes.data ?? []).map((a: any) => [
      a.id,
      {
        id: a.id,
        stage_name: a.full_name ?? "Unknown",
        contact_email: a.email ?? null,
        genre: a.genre ?? null,
      },
    ]),
  );
  return rows.map((r) => slotToGig(r, stagesById, venuesById, artistsById));
}

// ---------- Public reads ----------

async function filterOutSessionConflicts(rows: any[]) {
  if (!rows.length) return rows;
  const stageIds = Array.from(new Set(rows.map((r) => r.stage_id).filter(Boolean)));
  if (!stageIds.length) return rows;
  const earliest = rows.reduce(
    (m, r) => (r.start_time && r.start_time < m ? r.start_time : m),
    rows[0].start_time ?? new Date().toISOString(),
  );
  const latest = rows.reduce(
    (m, r) => (r.end_time && r.end_time > m ? r.end_time : m),
    rows[0].end_time ?? earliest,
  );
  const { data: sessions } = await supabaseAdmin
    .from("sessions")
    .select("stage_id, start_time, end_time")
    .in("stage_id", stageIds as any)
    .lt("start_time", latest)
    .gt("end_time", earliest);
  const byStage = new Map<string, { start: string; end: string }[]>();
  for (const s of sessions ?? []) {
    if (!s.stage_id || !s.start_time || !s.end_time) continue;
    const arr = byStage.get(s.stage_id) ?? [];
    arr.push({ start: s.start_time, end: s.end_time });
    byStage.set(s.stage_id, arr);
  }
  return rows.filter((r) => {
    const blocks = byStage.get(r.stage_id) ?? [];
    return !blocks.some((b) => b.start < r.end_time && b.end > r.start_time);
  });
}

export const listOpenGigs = createServerFn({ method: "GET" }).handler(async () => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("slots")
    .select(SLOT_COLS)
    .eq("is_booked", false)
    .gte("start_time", nowIso)
    .order("start_time");
  if (error) throw new Error(error.message);
  const available = await filterOutSessionConflicts(data ?? []);
  return hydrateSlots(available);
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

// ---------- Artist self-service (multi-profile) ----------

function urlOrEmpty(v: string | null | undefined) {
  if (!v) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const artistInput = z.object({
  full_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal("")),
  genre: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  bio: z.string().trim().max(4000).optional().nullable().or(z.literal("")),
  avatar_url: z.string().trim().max(1000).optional().nullable().or(z.literal("")),
  avatar_focal_x: z.number().int().min(0).max(100).optional(),
  avatar_focal_y: z.number().int().min(0).max(100).optional(),
  spotify_link: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  youtube_link: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  soundcloud_link: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  tip_link: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  other_link_url: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  other_link_name: z.string().trim().max(120).optional().nullable().or(z.literal("")),
});

async function listUpcomingGigsForArtist(artistId: string) {
  const nowIso = new Date().toISOString();
  const { data: slots, error } = await supabaseAdmin
    .from("slots")
    .select("id, title, start_time, end_time, stage_id, artist_id")
    .eq("artist_id", artistId)
    .eq("is_booked", true)
    .gte("start_time", nowIso)
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);

  const stageIds = Array.from(
    new Set((slots ?? []).map((s: any) => s.stage_id).filter(Boolean)),
  );
  const stagesRes = stageIds.length
    ? await supabaseAdmin
        .from("stages")
        .select("id, name, venue_id")
        .in("id", stageIds as any)
    : { data: [] as any[] };
  const stagesById = new Map((stagesRes.data ?? []).map((s: any) => [s.id, s]));
  const venueIds = Array.from(
    new Set((stagesRes.data ?? []).map((s: any) => s.venue_id).filter(Boolean)),
  );
  const venuesRes = venueIds.length
    ? await supabaseAdmin.from("venues").select("id, name").in("id", venueIds as any)
    : { data: [] as any[] };
  const venuesById = new Map((venuesRes.data ?? []).map((v: any) => [v.id, v]));

  return (slots ?? []).map((s: any) => {
    const stage = s.stage_id ? stagesById.get(s.stage_id) : null;
    const venue = stage?.venue_id ? venuesById.get(stage.venue_id) : null;
    return {
      id: s.id as number,
      artist_id: s.artist_id,
      title: s.title ?? null,
      start_time: s.start_time ?? null,
      end_time: s.end_time ?? null,
      stage_name: stage?.name ?? null,
      venue_name: venue?.name ?? null,
    };
  });
}

export const listMyArtists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("artists")
      .select(ARTIST_COLS)
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const artists = (data ?? []).map(artistToEditable).filter(Boolean) as any[];

    // hydrate upcoming gigs per artist
    const withGigs = await Promise.all(
      artists.map(async (a) => ({
        ...a,
        gigs: await listUpcomingGigsForArtist(a.id),
      })),
    );
    return { artists: withGigs };
  });

export const createArtist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => artistInput.parse(i))
  .handler(async ({ data, context }) => {
    // Soft cap: 10 per user to prevent abuse.
    const { count } = await supabaseAdmin
      .from("artists")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", context.userId);
    if ((count ?? 0) >= 10) {
      throw new Error("You've reached the limit of 10 artist profiles per account");
    }

    const insert: Record<string, unknown> = {
      owner_user_id: context.userId,
      full_name: data.full_name,
      email: urlOrEmpty(data.email),
      genre: urlOrEmpty(data.genre),
      bio: urlOrEmpty(data.bio),
      avatar_url: urlOrEmpty(data.avatar_url),
      avatar_focal_x: typeof data.avatar_focal_x === "number" ? data.avatar_focal_x : 50,
      avatar_focal_y: typeof data.avatar_focal_y === "number" ? data.avatar_focal_y : 50,
      spotify_link: urlOrEmpty(data.spotify_link),
      youtube_link: urlOrEmpty(data.youtube_link),
      soundcloud_link: urlOrEmpty(data.soundcloud_link),
      tip_link: urlOrEmpty(data.tip_link),
      other_link_url: urlOrEmpty(data.other_link_url),
      other_link_name: urlOrEmpty(data.other_link_name),
      status: "pending",
    };
    const { data: row, error } = await supabaseAdmin
      .from("artists")
      .insert(insert)
      .select(ARTIST_COLS)
      .single();
    if (error) throw new Error(error.message);
    return { artist: artistToEditable(row) };
  });

export const updateArtist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => artistInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("artists")
      .select("id, owner_user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("Artist profile not found");
    if (existing.owner_user_id !== context.userId) {
      throw new Error("Not your artist profile");
    }
    const patch: Record<string, unknown> = {
      full_name: data.full_name,
      email: urlOrEmpty(data.email),
      genre: urlOrEmpty(data.genre),
      bio: urlOrEmpty(data.bio),
      avatar_url: urlOrEmpty(data.avatar_url),
      avatar_focal_x: typeof data.avatar_focal_x === "number" ? data.avatar_focal_x : 50,
      avatar_focal_y: typeof data.avatar_focal_y === "number" ? data.avatar_focal_y : 50,
      spotify_link: urlOrEmpty(data.spotify_link),
      youtube_link: urlOrEmpty(data.youtube_link),
      soundcloud_link: urlOrEmpty(data.soundcloud_link),
      tip_link: urlOrEmpty(data.tip_link),
      other_link_url: urlOrEmpty(data.other_link_url),
      other_link_name: urlOrEmpty(data.other_link_name),
    };
    const { data: row, error } = await supabaseAdmin
      .from("artists")
      .update(patch)
      .eq("id", data.id)
      .select(ARTIST_COLS)
      .single();
    if (error) throw new Error(error.message);
    return { artist: artistToEditable(row) };
  });

export const deleteArtist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("artists")
      .select("id, owner_user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) return { ok: true };
    if (existing.owner_user_id !== context.userId) {
      throw new Error("Not your artist profile");
    }
    // Release any active future gigs first
    await supabaseAdmin
      .from("slots")
      .update({ is_booked: false, artist_id: null, busker_id: null, booked_at: null })
      .eq("artist_id", data.id);
    const { error } = await supabaseAdmin
      .from("artists")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Claim / release ----------

const claimInput = z.object({
  gig_id: z.union([z.string(), z.number()]),
  artist_id: z.string().uuid(),
});

function toSlotId(v: string | number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error("Invalid gig id");
  return n;
}

async function getOwnedApprovedArtist(userId: string, artistId: string) {
  const { data, error } = await supabaseAdmin
    .from("artists")
    .select("id, status, owner_user_id, full_name")
    .eq("id", artistId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Artist profile not found");
  if (data.owner_user_id !== userId) throw new Error("Not your artist profile");
  if (data.status !== "approved") {
    throw new Error("This artist profile must be approved before claiming gigs");
  }
  return data;
}

export const claimGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => claimInput.parse(i))
  .handler(async ({ data, context }) => {
    const artist = await getOwnedApprovedArtist(context.userId, data.artist_id);
    const slotId = toSlotId(data.gig_id);

    const { data: slot, error: slotErr } = await supabaseAdmin
      .from("slots")
      .select("id, is_booked, start_time, end_time, stage_id")
      .eq("id", slotId)
      .maybeSingle();
    if (slotErr) throw new Error(slotErr.message);
    if (!slot) throw new Error("Gig not found");
    if (slot.is_booked) throw new Error("This gig is no longer open");

    if (slot.stage_id && slot.start_time && slot.end_time) {
      const { data: sessionBlocks } = await supabaseAdmin
        .from("sessions")
        .select("id")
        .eq("stage_id", slot.stage_id)
        .lt("start_time", slot.end_time)
        .gt("end_time", slot.start_time);
      if ((sessionBlocks ?? []).length > 0) {
        throw new Error("This stage is reserved for a city event at that time");
      }
    }

    if (slot.start_time && slot.end_time) {
      // Conflict check: any of THIS USER's artists can't be in two places at once
      const { data: myArtists } = await supabaseAdmin
        .from("artists")
        .select("id")
        .eq("owner_user_id", context.userId);
      const myArtistIds = (myArtists ?? []).map((a: any) => a.id);
      if (myArtistIds.length) {
        const { data: conflicts } = await supabaseAdmin
          .from("slots")
          .select("id")
          .in("artist_id", myArtistIds as any)
          .eq("is_booked", true)
          .lt("start_time", slot.end_time)
          .gt("end_time", slot.start_time);
        if ((conflicts ?? []).length > 0) {
          throw new Error("You already have a gig that overlaps this time");
        }
      }
    }

    const { error } = await supabaseAdmin
      .from("slots")
      .update({
        is_booked: true,
        artist_id: artist.id,
        busker_id: context.userId, // legacy mirror
        booked_at: new Date().toISOString(),
      })
      .eq("id", slotId)
      .eq("is_booked", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const releaseMyGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ gig_id: z.union([z.string(), z.number()]) }).parse(i))
  .handler(async ({ data, context }) => {
    const slotId = toSlotId(data.gig_id);
    // Confirm the slot belongs to one of the user's artists
    const { data: slot } = await supabaseAdmin
      .from("slots")
      .select("id, artist_id")
      .eq("id", slotId)
      .maybeSingle();
    if (!slot?.artist_id) throw new Error("Gig not found");
    const { data: artist } = await supabaseAdmin
      .from("artists")
      .select("id, owner_user_id")
      .eq("id", slot.artist_id)
      .maybeSingle();
    if (!artist || artist.owner_user_id !== context.userId) {
      throw new Error("Not your gig");
    }
    const { error } = await supabaseAdmin
      .from("slots")
      .update({ is_booked: false, artist_id: null, busker_id: null, booked_at: null })
      .eq("id", slotId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyClaimedGigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: artists } = await supabaseAdmin
      .from("artists")
      .select(ARTIST_COLS)
      .eq("owner_user_id", context.userId);
    const list = (artists ?? []).map(artistToPublic).filter(Boolean) as any[];
    const ids = list.map((a) => a.id);
    if (ids.length === 0) return { artists: [], gigs: [] };
    const { data, error } = await supabaseAdmin
      .from("slots")
      .select(SLOT_COLS)
      .in("artist_id", ids as any)
      .order("start_time", { ascending: false });
    if (error) throw new Error(error.message);
    return { artists: list, gigs: await hydrateSlots(data ?? []) };
  });
