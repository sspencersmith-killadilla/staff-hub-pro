import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FAV_TYPES = [
  "session",
  "community_event",
  "gig",
  "artist",
  "vendor",
  "room",
  "venue",
] as const;
export type FavType = (typeof FAV_TYPES)[number];

const favInput = z.object({
  item_type: z.enum(FAV_TYPES),
  item_id: z.string().min(1).max(120),
});

// ─── Toggle ────────────────────────────────────────────────────────
export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => favInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: existing } = await supabaseAdmin
      .from("favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("item_type", data.item_type)
      .eq("item_id", data.item_id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("favorites")
        .delete()
        .eq("id", (existing as any).id);
      if (error) throw new Error(error.message);
      return { favorited: false as const };
    }

    const { error } = await supabaseAdmin
      .from("favorites")
      .insert({ user_id: userId, ...data });
    if (error) throw new Error(error.message);
    return { favorited: true as const };
  });

// ─── List raw favorite keys (used by FavoriteButton for cheap lookups) ──
export const listMyFavoriteKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("favorites")
      .select("item_type, item_id")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []) as { item_type: FavType; item_id: string }[];
  });

// ─── Hydrated itinerary ────────────────────────────────────────────
export type ItineraryItem = {
  key: string; // `${item_type}:${item_id}`
  item_type: FavType;
  item_id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  href: string;
  starts_at: string | null; // ISO; null = no time (artist/room/venue/vendor)
  ends_at: string | null;
  location: string | null;
};

export const getMyItinerary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: favs, error } = await supabaseAdmin
      .from("favorites")
      .select("item_type, item_id, created_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    const rows = (favs ?? []) as {
      item_type: FavType;
      item_id: string;
      created_at: string;
    }[];

    const byType: Record<FavType, string[]> = {
      session: [],
      community_event: [],
      gig: [],
      artist: [],
      vendor: [],
      room: [],
      venue: [],
    };
    for (const r of rows) byType[r.item_type].push(r.item_id);

    const out: ItineraryItem[] = [];

    // Sessions
    if (byType.session.length) {
      const { data: sess } = await supabaseAdmin
        .from("sessions")
        .select(
          "id, title, start_time, end_time, image_url, stages(name, venues(name)), rooms(name, venues(name))",
        )
        .in("id", byType.session);
      for (const s of sess ?? []) {
        const stage = (s as any).stages;
        const room = (s as any).rooms;
        const loc =
          stage?.venues?.name ?? room?.venues?.name ?? stage?.name ?? room?.name ?? null;
        out.push({
          key: `session:${(s as any).id}`,
          item_type: "session",
          item_id: (s as any).id,
          title: (s as any).title,
          subtitle: null,
          image_url: (s as any).image_url ?? null,
          href: `/events/${(s as any).id}`,
          starts_at: (s as any).start_time ?? null,
          ends_at: (s as any).end_time ?? null,
          location: loc,
        });
      }
    }

    // Community events
    if (byType.community_event.length) {
      const { data: ce } = await supabaseAdmin
        .from("community_events")
        .select(
          "id, title, starts_at, ends_at, community_event_locations(name)",
        )
        .in("id", byType.community_event);
      for (const e of ce ?? []) {
        out.push({
          key: `community_event:${(e as any).id}`,
          item_type: "community_event",
          item_id: (e as any).id,
          title: (e as any).title,
          subtitle: "Community program",
          image_url: null,
          href: `/community-events/${(e as any).id}`,
          starts_at: (e as any).starts_at ?? null,
          ends_at: (e as any).ends_at ?? null,
          location: (e as any).community_event_locations?.name ?? null,
        });
      }
    }

    // Streetbeats gigs (current canonical source is `slots`; legacy
    // `streetbeats_gigs` rows are no longer used by the public gig route).
    if (byType.gig.length) {
      const gigIds = byType.gig
        .map((x) => Number(x.startsWith("slot-") ? x.slice(5) : x))
        .filter((n) => Number.isFinite(n));
      const { data: gigs } = gigIds.length
        ? await supabaseAdmin
            .from("slots")
            .select("id, title, notes, start_time, end_time, stage_id, artist_id, busker_id")
            .in("id", gigIds as any)
        : { data: [] as any[] };
      const stageIds = Array.from(
        new Set((gigs ?? []).map((g: any) => g.stage_id).filter(Boolean)),
      );
      const artistIds = Array.from(
        new Set((gigs ?? []).map((g: any) => g.artist_id).filter(Boolean)),
      );
      const buskerIds = Array.from(
        new Set(
          (gigs ?? [])
            .filter((g: any) => !g.artist_id && g.busker_id)
            .map((g: any) => g.busker_id),
        ),
      );
      const [stagesRes, artistsRes, buskersRes] = await Promise.all([
        stageIds.length
          ? supabaseAdmin.from("stages").select("id, name, venue_id").in("id", stageIds as any)
          : Promise.resolve({ data: [] as any[] }),
        artistIds.length
          ? supabaseAdmin.from("artists").select("id, full_name, avatar_url").in("id", artistIds as any)
          : Promise.resolve({ data: [] as any[] }),
        buskerIds.length
          ? supabaseAdmin.from("profiles").select("id, full_name, avatar_url").in("id", buskerIds as any)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const stagesById = new Map((stagesRes.data ?? []).map((s: any) => [s.id, s]));
      const venueIds = Array.from(
        new Set((stagesRes.data ?? []).map((s: any) => s.venue_id).filter(Boolean)),
      );
      const venuesRes = venueIds.length
        ? await supabaseAdmin.from("venues").select("id, name").in("id", venueIds as any)
        : { data: [] as any[] };
      const venuesById = new Map((venuesRes.data ?? []).map((v: any) => [v.id, v]));
      const artistsById = new Map((artistsRes.data ?? []).map((a: any) => [a.id, a]));
      const buskersById = new Map((buskersRes.data ?? []).map((p: any) => [p.id, p]));
      for (const g of gigs ?? []) {
        const stage = (g as any).stage_id ? stagesById.get((g as any).stage_id) : null;
        const venue = stage?.venue_id ? venuesById.get(stage.venue_id) : null;
        const artist =
          ((g as any).artist_id && artistsById.get((g as any).artist_id)) ||
          ((g as any).busker_id && buskersById.get((g as any).busker_id)) ||
          null;
        out.push({
          key: `gig:${(g as any).id}`,
          item_type: "gig",
          item_id: String((g as any).id),
          title: artist?.full_name
            ? `${artist.full_name} — ${(g as any).title}`
            : (g as any).title ?? "Live music",
          subtitle: "Streetbeats",
          image_url: artist?.avatar_url ?? null,
          href: `/gigs/${(g as any).id}`,
          starts_at: (g as any).start_time ?? null,
          ends_at: (g as any).end_time ?? null,
          location: venue?.name ?? stage?.name ?? (g as any).notes ?? null,
        });
      }
    }

    // Artists
    if (byType.artist.length) {
      const { data: ar } = await supabaseAdmin
        .from("artists")
        .select("id, full_name, genre, avatar_url")
        .in("id", byType.artist);
      for (const a of ar ?? []) {
        out.push({
          key: `artist:${(a as any).id}`,
          item_type: "artist",
          item_id: (a as any).id,
          title: (a as any).full_name,
          subtitle: (a as any).genre ?? "Artist",
          image_url: (a as any).avatar_url ?? null,
          href: `/artists/${(a as any).id}`,
          starts_at: null,
          ends_at: null,
          location: null,
        });
      }
    }

    // Vendors (approved booths)
    if (byType.vendor.length) {
      const { data: v } = await supabaseAdmin
        .from("vendor_applications")
        .select("id, business_name, category")
        .in("id", byType.vendor);
      for (const x of v ?? []) {
        out.push({
          key: `vendor:${(x as any).id}`,
          item_type: "vendor",
          item_id: (x as any).id,
          title: (x as any).business_name ?? "Vendor",
          subtitle: (x as any).category ?? "Vendor booth",
          image_url: null,
          href: `/vendor`,
          starts_at: null,
          ends_at: null,
          location: null,
        });
      }
    }

    // Rooms
    if (byType.room.length) {
      const { data: rms } = await supabaseAdmin
        .from("rooms")
        .select("id, name, venues(name)")
        .in("id", byType.room);
      for (const r of rms ?? []) {
        out.push({
          key: `room:${(r as any).id}`,
          item_type: "room",
          item_id: (r as any).id,
          title: (r as any).name,
          subtitle: "Room",
          image_url: null,
          href: `/rooms/${(r as any).id}`,
          starts_at: null,
          ends_at: null,
          location: (r as any).venues?.name ?? null,
        });
      }
    }

    // Venues
    if (byType.venue.length) {
      const ids = byType.venue
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n));
      if (ids.length) {
        const { data: vs } = await supabaseAdmin
          .from("venues")
          .select("id, name, city")
          .in("id", ids);
        for (const v of vs ?? []) {
          out.push({
            key: `venue:${(v as any).id}`,
            item_type: "venue",
            item_id: String((v as any).id),
            title: (v as any).name,
            subtitle: "Venue",
            image_url: null,
            href: `/venues/${(v as any).id}`,
            starts_at: null,
            ends_at: null,
            location: (v as any).city ?? null,
          });
        }
      }
    }

    // Sort: timed items first by start, then untimed alphabetical
    out.sort((a, b) => {
      if (a.starts_at && b.starts_at) return a.starts_at.localeCompare(b.starts_at);
      if (a.starts_at) return -1;
      if (b.starts_at) return 1;
      return a.title.localeCompare(b.title);
    });

    return { items: out };
  });
