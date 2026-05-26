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

// ---------- Artist self-service ----------

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

function profileToEditable(p: any) {
  if (!p) return null;
  return {
    id: p.id,
    full_name: p.full_name ?? "",
    email: p.email ?? "",
    genre: p.genre ?? "",
    bio: p.bio ?? "",
    avatar_url: p.avatar_url ?? "",
    spotify_link: p.spotify_link ?? "",
    youtube_link: p.youtube_link ?? "",
    soundcloud_link: p.soundcloud_link ?? "",
    tip_link: p.tip_link ?? "",
    other_link_url: p.other_link_url ?? "",
    other_link_name: p.other_link_name ?? "",
    status: p.is_approved ? "approved" : "pending",
    is_approved: !!p.is_approved,
    // Back-compat for any older callers
    stage_name: p.full_name ?? p.email ?? "",
    contact_email: p.email ?? null,
    staff_notes: null as string | null,
  };
}

async function listUpcomingGigsFor(userId: string) {
  const nowIso = new Date().toISOString();
  const { data: slots, error } = await supabaseAdmin
    .from("slots")
    .select("id, title, start_time, end_time, stage_id")
    .eq("busker_id", userId)
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
      title: s.title ?? null,
      start_time: s.start_time ?? null,
      end_time: s.end_time ?? null,
      stage_name: stage?.name ?? null,
      venue_name: venue?.name ?? null,
    };
  });
}

export const getMyArtistProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const artist = profileToEditable(data);
    const gigs = data ? await listUpcomingGigsFor(context.userId) : [];
    return { artist, gigs };
  });

export const upsertMyArtistProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => artistInput.parse(i))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      id: context.userId,
      full_name: data.full_name,
      genre: urlOrEmpty(data.genre),
      bio: urlOrEmpty(data.bio),
      avatar_url: urlOrEmpty(data.avatar_url),
      spotify_link: urlOrEmpty(data.spotify_link),
      youtube_link: urlOrEmpty(data.youtube_link),
      soundcloud_link: urlOrEmpty(data.soundcloud_link),
      tip_link: urlOrEmpty(data.tip_link),
      other_link_url: urlOrEmpty(data.other_link_url),
      other_link_name: urlOrEmpty(data.other_link_name),
      updated_at: new Date().toISOString(),
    };
    if (data.email) patch.email = data.email;
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .upsert(patch, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const artist = profileToEditable(row);
    const gigs = await listUpcomingGigsFor(context.userId);
    return { artist, gigs };
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
