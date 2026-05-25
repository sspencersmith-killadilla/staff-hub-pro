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

export const getPublicArtist = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.string().min(1).max(64) }).parse(i))
  .handler(async ({ data }) => {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) return { artist: null, gigs: [] as PublicArtistGig[] };

    const p = profile as any;
    const artist: PublicArtist = {
      id: p.id,
      full_name: p.full_name ?? null,
      avatar_url: p.avatar_url ?? null,
      genre: p.genre ?? null,
      bio: p.bio ?? null,
      spotify_link: p.spotify_link ?? null,
      youtube_link: p.youtube_link ?? null,
      soundcloud_link: p.soundcloud_link ?? null,
      tip_link: p.tip_link ?? null,
      other_link_url: p.other_link_url ?? null,
      other_link_name: p.other_link_name ?? null,
    };

    const nowIso = new Date().toISOString();
    const { data: slots, error: slotErr } = await supabaseAdmin
      .from("slots")
      .select("id, title, start_time, end_time, stage_id")
      .eq("busker_id", data.id)
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
