import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PublicArtist = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  genre: string | null;
  bio: string | null;
  spotify_link: string | null;
  youtube_link: string | null;
  soundcloud_link: string | null;
  tip_link: string | null;
  other_link_url: string | null;
  other_link_name: string | null;
};

export type PublicArtistGig = {
  id: string | number;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  stage_name: string | null;
  venue_name: string | null;
};

const ARTIST_COLS =
  "id, full_name, avatar_url, genre, bio, spotify_link, youtube_link, soundcloud_link, tip_link, other_link_url, other_link_name, status";

function rowToArtist(a: any): PublicArtist {
  return {
    id: a.id,
    full_name: a.full_name ?? null,
    avatar_url: a.avatar_url ?? null,
    genre: a.genre ?? null,
    bio: a.bio ?? null,
    spotify_link: a.spotify_link ?? null,
    youtube_link: a.youtube_link ?? null,
    soundcloud_link: a.soundcloud_link ?? null,
    tip_link: a.tip_link ?? null,
    other_link_url: a.other_link_url ?? null,
    other_link_name: a.other_link_name ?? null,
  };
}

export const getPublicArtist = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.string().min(1).max(64) }).parse(i))
  .handler(async ({ data }) => {
    const { data: artistRow, error } = await supabaseAdmin
      .from("artists")
      .select(ARTIST_COLS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!artistRow || artistRow.status !== "approved") {
      return { artist: null, gigs: [] as PublicArtistGig[] };
    }

    const artist = rowToArtist(artistRow);

    const nowIso = new Date().toISOString();
    const { data: slots, error: slotErr } = await supabaseAdmin
      .from("slots")
      .select("id, title, start_time, end_time, stage_id")
      .eq("artist_id", data.id)
      .eq("is_booked", true)
      .gte("start_time", nowIso)
      .order("start_time", { ascending: true });
    if (slotErr) throw new Error(slotErr.message);

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

    const gigs: PublicArtistGig[] = (slots ?? []).map((s: any) => {
      const stage = s.stage_id ? stagesById.get(s.stage_id) : null;
      const venue = stage?.venue_id ? venuesById.get(stage.venue_id) : null;
      return {
        id: s.id,
        title: s.title ?? null,
        start_time: s.start_time ?? null,
        end_time: s.end_time ?? null,
        stage_name: stage?.name ?? null,
        venue_name: venue?.name ?? null,
      };
    });

    return { artist, gigs };
  });

// ---------- Single gig (flyer) ----------

export type PublicGig = {
  id: number;
  title: string | null;
  notes: string | null;
  start_time: string | null;
  end_time: string | null;
  stage: {
    id: string | number | null;
    name: string | null;
    address: string | null;
    capacity: number | null;
    load_in_notes: string | null;
    features: Record<string, any> | null;
  } | null;
  venue: { id: string | null; name: string | null; city: string | null; address: string | null } | null;
  artist: PublicArtist | null;
};

export const getPublicGig = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.union([z.string(), z.number()]) }).parse(i))
  .handler(async ({ data }) => {
    const slotId = Number(data.id);
    if (!Number.isFinite(slotId)) throw new Error("Invalid gig id");
    const { data: slot, error } = await supabaseAdmin
      .from("slots")
      .select("*")
      .eq("id", slotId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!slot) return null;
    const s = slot as any;

    const [stageRes, artistRes] = await Promise.all([
      s.stage_id
        ? supabaseAdmin.from("stages").select("*").eq("id", s.stage_id).maybeSingle()
        : Promise.resolve({ data: null }),
      s.artist_id
        ? supabaseAdmin.from("artists").select(ARTIST_COLS).eq("id", s.artist_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const stage = (stageRes as any).data;
    const venueRes = stage?.venue_id
      ? await supabaseAdmin.from("venues").select("id, name, city, address").eq("id", stage.venue_id).maybeSingle()
      : { data: null };
    const venue = (venueRes as any).data;
    const a = (artistRes as any).data;

    const gig: PublicGig = {
      id: s.id,
      title: s.title ?? null,
      notes: s.notes ?? null,
      start_time: s.start_time ?? null,
      end_time: s.end_time ?? null,
      stage: stage
        ? {
            id: stage.id ?? null,
            name: stage.name ?? null,
            address: stage.address ?? venue?.address ?? null,
            capacity: stage.capacity ?? null,
            load_in_notes: stage.load_in_notes ?? null,
            features: stage.features ?? null,
          }
        : null,
      venue: venue
        ? { id: venue.id, name: venue.name, city: venue.city, address: venue.address }
        : null,
      artist: a ? rowToArtist(a) : null,
    };
    return gig;
  });
