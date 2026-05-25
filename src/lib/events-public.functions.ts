import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Unified public events feed: city sessions + approved community events + booked streetbeats gigs.

export type EventSponsor = {
  id: string;
  company_name: string | null;
  logo_url: string | null;
};

export type UnifiedEvent = {
  id: string;
  source: "city" | "community" | "music";
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  image_url: string | null;
  venue_name: string | null;
  venue_city: string | null;
  sub_location_name: string | null; // stage or room name
  sub_location_type: "stage" | "room" | null;
  org_name: string | null;
  cost_text: string | null;
  ticketed: boolean; // city events route to /events/:id ticketing
  detail_href: string | null; // for non-ticketed types
  sponsors: EventSponsor[];
};

export const listPublicAllEvents = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z
      .object({ includeArchived: z.boolean().optional() })
      .parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const includeArchived = !!data.includeArchived;
    const nowIso = new Date().toISOString();

    // 1. City sessions
    const sessionsQ = supabaseAdmin
      .from("sessions")
      .select("id, title, start_time, end_time, image_url, event_type, speaker_name, stage_id, room_id, stages(id,name,venue_id), rooms(id,name,venue_id)")
      .order("start_time", { ascending: true });
    if (!includeArchived) sessionsQ.gte("end_time", nowIso);

    // 2. Community events (approved)
    const commQ = supabaseAdmin
      .from("events")
      .select("id, organization_id, title, description, start_time, end_time, location, image_url, is_community, approval_status")
      .eq("is_community", true)
      .eq("approval_status", "approved")
      .order("start_time", { ascending: true });
    if (!includeArchived) commQ.gte("end_time", nowIso);

    // 3. Music gigs (booked slots)
    const slotsQ = supabaseAdmin
      .from("slots")
      .select("id, title, description, start_time, end_time, is_booked, stage_id, busker_id")
      .eq("is_booked", true)
      .order("start_time", { ascending: true });
    if (!includeArchived) slotsQ.gte("end_time", nowIso);

    const [sessRes, commRes, slotRes] = await Promise.all([sessionsQ, commQ, slotsQ]);
    if (sessRes.error) throw new Error(sessRes.error.message);
    if (commRes.error) throw new Error(commRes.error.message);
    if (slotRes.error) throw new Error(slotRes.error.message);

    // Resolve venues for sessions + slots via their stages or rooms.
    const stageIds = new Set<string>();
    const roomIds = new Set<string>();
    for (const s of sessRes.data ?? []) {
      if ((s as any).stage_id) stageIds.add((s as any).stage_id);
      if ((s as any).room_id) roomIds.add((s as any).room_id);
    }
    for (const s of slotRes.data ?? []) if ((s as any).stage_id) stageIds.add((s as any).stage_id);
    const [stagesRes, roomsRes] = await Promise.all([
      stageIds.size
        ? supabaseAdmin.from("stages").select("id, name, venue_id").in("id", Array.from(stageIds))
        : Promise.resolve({ data: [] as any[] }),
      roomIds.size
        ? supabaseAdmin.from("rooms").select("id, name, venue_id").in("id", Array.from(roomIds))
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const stagesById = new Map((stagesRes.data ?? []).map((s: any) => [s.id, s]));
    const roomsById = new Map((roomsRes.data ?? []).map((r: any) => [r.id, r]));
    const venueIds = Array.from(
      new Set(
        [...(stagesRes.data ?? []), ...(roomsRes.data ?? [])]
          .map((s: any) => s.venue_id)
          .filter(Boolean),
      ),
    );
    const venuesRes = venueIds.length
      ? await supabaseAdmin.from("venues").select("id, name, city").in("id", venueIds as any)
      : { data: [] as any[] };
    const venuesById = new Map((venuesRes.data ?? []).map((v: any) => [v.id, v]));

    // Orgs for community events
    const orgIds = Array.from(
      new Set((commRes.data ?? []).map((e: any) => e.organization_id).filter(Boolean)),
    );
    const orgsRes = orgIds.length
      ? await supabaseAdmin
          .from("community_organizations")
          .select("id, name")
          .in("id", orgIds as any)
      : { data: [] as any[] };
    const orgsById = new Map((orgsRes.data ?? []).map((o: any) => [o.id, o]));

    // Busker profiles for music gigs
    const buskerIds = Array.from(
      new Set((slotRes.data ?? []).map((s: any) => s.busker_id).filter(Boolean)),
    );
    const buskersRes = buskerIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", buskerIds as any)
      : { data: [] as any[] };
    const buskersById = new Map((buskersRes.data ?? []).map((p: any) => [p.id, p]));

    // Sponsors for city sessions (approved/paid only)
    const sessionIds = (sessRes.data ?? []).map((s: any) => s.id);
    const sponsorsRes = sessionIds.length
      ? await supabaseAdmin
          .from("sponsors")
          .select("id, company_name, logo_url, session_id, status")
          .in("session_id", sessionIds as any)
          .in("status", ["approved", "paid"])
      : { data: [] as any[] };
    const sponsorsBySession = new Map<string, EventSponsor[]>();
    for (const sp of sponsorsRes.data ?? []) {
      const sid = (sp as any).session_id as string;
      const list = sponsorsBySession.get(sid) ?? [];
      list.push({
        id: (sp as any).id,
        company_name: (sp as any).company_name ?? null,
        logo_url: (sp as any).logo_url ?? null,
      });
      sponsorsBySession.set(sid, list);
    }

    const out: UnifiedEvent[] = [];

    for (const s of sessRes.data ?? []) {
      const stage = (s as any).stage_id ? stagesById.get((s as any).stage_id) : null;
      const room = (s as any).room_id ? roomsById.get((s as any).room_id) : null;
      const venue =
        (stage?.venue_id && venuesById.get(stage.venue_id)) ||
        (room?.venue_id && venuesById.get(room.venue_id)) ||
        null;
      const sub = stage ?? room;
      out.push({
        id: String((s as any).id),
        source: "city",
        title: (s as any).title,
        description: (s as any).event_type ?? null,
        starts_at: (s as any).start_time ?? null,
        ends_at: (s as any).end_time ?? null,
        image_url: (s as any).image_url ?? null,
        venue_name: venue?.name ?? sub?.name ?? null,
        venue_city: venue?.city ?? null,
        sub_location_name: sub?.name ?? null,
        sub_location_type: stage ? "stage" : room ? "room" : null,
        org_name: (s as any).speaker_name ?? null,
        cost_text: null,
        ticketed: true,
        detail_href: `/events/${(s as any).id}`,
        sponsors: sponsorsBySession.get((s as any).id) ?? [],
      });
    }

    for (const e of commRes.data ?? []) {
      const org = (e as any).organization_id ? orgsById.get((e as any).organization_id) : null;
      out.push({
        id: String((e as any).id),
        source: "community",
        title: (e as any).title,
        description: (e as any).description ?? null,
        starts_at: (e as any).start_time ?? null,
        ends_at: (e as any).end_time ?? null,
        image_url: (e as any).image_url ?? null,
        venue_name: (e as any).location ?? null,
        venue_city: null,
        sub_location_name: null,
        sub_location_type: null,
        org_name: org?.name ?? null,
        cost_text: null,
        ticketed: false,
        detail_href: "/community",
        sponsors: [],
      });
    }

    for (const s of slotRes.data ?? []) {
      const stage = (s as any).stage_id ? stagesById.get((s as any).stage_id) : null;
      const venue = stage?.venue_id ? venuesById.get(stage.venue_id) : null;
      const busker = (s as any).busker_id ? buskersById.get((s as any).busker_id) : null;
      out.push({
        id: `slot-${(s as any).id}`,
        source: "music",
        title: (s as any).title ?? "Live music",
        description: (s as any).description ?? null,
        starts_at: (s as any).start_time ?? null,
        ends_at: (s as any).end_time ?? null,
        image_url: busker?.avatar_url ?? null,
        venue_name: venue?.name ?? stage?.name ?? null,
        venue_city: venue?.city ?? null,
        sub_location_name: stage?.name ?? null,
        sub_location_type: stage ? "stage" : null,
        org_name: busker?.full_name ?? null,
        cost_text: "Free",
        ticketed: false,
        detail_href: (s as any).busker_id ? `/artists/${(s as any).busker_id}` : "/streetbeats",
      });
    }

    return out;
  });

// ---------- City event ticketing (public) ----------

export const getPublicCityEvent = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const [sessRes, tiersRes, talentRes] = await Promise.all([
      supabaseAdmin
        .from("sessions")
        .select(
          "*, stages(id,name,venue_id,description,address), rooms(id,name,venue_id,building,capacity)",
        )
        .eq("id", data.id)
        .maybeSingle(),
      supabaseAdmin.from("ticket_tiers").select("*").eq("session_id", data.id),
      supabaseAdmin
        .from("talent")
        .select("id, name, role, performance_start, load_in_time, status")
        .eq("session_id", data.id)
        .order("performance_start", { ascending: true, nullsFirst: false }),
    ]);
    if (sessRes.error) throw new Error(sessRes.error.message);
    if (!sessRes.data) throw new Error("Event not found");
    const stage = (sessRes.data as any).stages ?? null;
    const room = (sessRes.data as any).rooms ?? null;
    const venueId = stage?.venue_id ?? room?.venue_id ?? null;
    let venue: any = null;
    if (venueId) {
      const v = await supabaseAdmin
        .from("venues")
        .select("id, name, city, state, address")
        .eq("id", venueId)
        .maybeSingle();
      venue = v.data ?? null;
    }
    return {
      event: sessRes.data,
      stage,
      room,
      venue,
      tiers: tiersRes.data ?? [],
      talent: talentRes.data ?? [],
    };
  });

export const registerForCityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        session_id: z.string().uuid(),
        ticket_tier_id: z.string().uuid().nullable().optional(),
        full_name: z.string().trim().min(1).max(200),
        email: z.string().trim().email().max(255),
        quantity: z.number().int().min(1).max(20).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (data.ticket_tier_id) {
      const { data: tier } = await supabaseAdmin
        .from("ticket_tiers")
        .select("id, session_id")
        .eq("id", data.ticket_tier_id)
        .maybeSingle();
      if (!tier || tier.session_id !== data.session_id) {
        throw new Error("Invalid ticket tier for this event");
      }
    }
    // Prevent the same user from double-registering for the same event.
    const { data: existing } = await supabaseAdmin
      .from("attendees")
      .select("id")
      .eq("user_id", userId)
      .eq("session_id", data.session_id)
      .maybeSingle();
    if (existing) return { id: existing.id };

    const { data: row, error } = await supabaseAdmin
      .from("attendees")
      .insert({
        user_id: userId,
        session_id: data.session_id,
        full_name: data.full_name,
        email: data.email,
        ticket_tier_id: data.ticket_tier_id ?? null,
        quantity: data.quantity ?? 1,
        checked_in: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
