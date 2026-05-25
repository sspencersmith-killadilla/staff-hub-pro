import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GIG_COLS =
  "id, title, description, venue_id, stage_id, event_id, location_label, starts_at, ends_at, status, claimed_by_artist_id, claimed_at";

async function attachVenueAndArtist(rows: any[]) {
  const venueIds = Array.from(
    new Set(rows.map((g) => g.venue_id).filter(Boolean)),
  );
  const artistIds = Array.from(
    new Set(rows.map((g) => g.claimed_by_artist_id).filter(Boolean)),
  );
  const [venuesRes, artistsRes] = await Promise.all([
    venueIds.length
      ? supabaseAdmin.from("venues").select("id, name, city").in("id", venueIds)
      : Promise.resolve({ data: [] as any[] }),
    artistIds.length
      ? supabaseAdmin
          .from("streetbeats_artists")
          .select("id, stage_name, genre")
          .in("id", artistIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const venues = new Map((venuesRes.data ?? []).map((v: any) => [v.id, v]));
  const artists = new Map((artistsRes.data ?? []).map((a: any) => [a.id, a]));
  return rows.map((g) => ({
    ...g,
    venue: g.venue_id ? venues.get(g.venue_id) ?? null : null,
    artist: g.claimed_by_artist_id
      ? artists.get(g.claimed_by_artist_id) ?? null
      : null,
  }));
}

// ---------- Public reads ----------

export const listOpenGigs = createServerFn({ method: "GET" }).handler(
  async () => {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("streetbeats_gigs")
      .select(GIG_COLS)
      .eq("status", "open")
      .gte("starts_at", nowIso)
      .order("starts_at");
    if (error) throw new Error(error.message);
    return attachVenueAndArtist(data ?? []);
  },
);

export const listScheduledGigs = createServerFn({ method: "GET" }).handler(
  async () => {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("streetbeats_gigs")
      .select(GIG_COLS)
      .eq("status", "claimed")
      .gte("ends_at", nowIso)
      .order("starts_at");
    if (error) throw new Error(error.message);
    return attachVenueAndArtist(data ?? []);
  },
);

// ---------- Artist self-service ----------

const artistInput = z.object({
  stage_name: z.string().trim().min(1).max(120),
  contact_email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().nullable(),
  genre: z.string().trim().max(120).optional().nullable(),
  bio: z.string().trim().max(2000).optional().nullable(),
  website: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  social_links: z.record(z.string(), z.string().max(500)).optional().nullable(),
});

export const getMyArtistProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("streetbeats_artists")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const upsertMyArtistProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => artistInput.parse(i))
  .handler(async ({ data, context }) => {
    const payload = {
      ...data,
      website: data.website || null,
      user_id: context.userId,
    };
    const { data: existing } = await supabaseAdmin
      .from("streetbeats_artists")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabaseAdmin
        .from("streetbeats_artists")
        .update({
          stage_name: payload.stage_name,
          contact_email: payload.contact_email,
          phone: payload.phone,
          genre: payload.genre,
          bio: payload.bio,
          website: payload.website,
          social_links: payload.social_links ?? {},
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id, status: existing.status };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("streetbeats_artists")
      .insert({ ...payload, status: "pending" })
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

// ---------- Claim / release ----------

async function getApprovedArtist(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("streetbeats_artists")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apply as an artist first");
  if (data.status !== "approved")
    throw new Error("Your artist profile must be approved before claiming gigs");
  return data;
}

export const claimGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ gig_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const artist = await getApprovedArtist(context.userId);
    const { data: gig, error: gigErr } = await supabaseAdmin
      .from("streetbeats_gigs")
      .select("id, status, starts_at, ends_at")
      .eq("id", data.gig_id)
      .maybeSingle();
    if (gigErr) throw new Error(gigErr.message);
    if (!gig) throw new Error("Gig not found");
    if (gig.status !== "open") throw new Error("This gig is no longer open");

    // Prevent the artist from claiming overlapping gigs
    const { data: conflicts } = await supabaseAdmin
      .from("streetbeats_gigs")
      .select("id")
      .eq("claimed_by_artist_id", artist.id)
      .eq("status", "claimed")
      .lt("starts_at", gig.ends_at)
      .gt("ends_at", gig.starts_at);
    if ((conflicts ?? []).length > 0) {
      throw new Error("You already have a gig that overlaps this time");
    }

    const { error } = await supabaseAdmin
      .from("streetbeats_gigs")
      .update({
        status: "claimed",
        claimed_by_artist_id: artist.id,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", gig.id)
      .eq("status", "open"); // optimistic guard
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const releaseMyGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ gig_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const artist = await getApprovedArtist(context.userId);
    const { error } = await supabaseAdmin
      .from("streetbeats_gigs")
      .update({
        status: "open",
        claimed_by_artist_id: null,
        claimed_at: null,
      })
      .eq("id", data.gig_id)
      .eq("claimed_by_artist_id", artist.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyClaimedGigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: artist } = await supabaseAdmin
      .from("streetbeats_artists")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!artist) return { artist: null, gigs: [] };
    const { data, error } = await supabaseAdmin
      .from("streetbeats_gigs")
      .select(GIG_COLS)
      .eq("claimed_by_artist_id", artist.id)
      .order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { artist, gigs: await attachVenueAndArtist(data ?? []) };
  });
