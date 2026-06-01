import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";


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
  focal_x: number; // 0-100, CSS object-position x
  focal_y: number; // 0-100, CSS object-position y
  sold_out: boolean;
  waitlist_available: boolean;
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
      .select("id, title, start_time, end_time, image_url, focal_x, focal_y, event_type, speaker_name, stage_id, room_id, stages(id,name,venue_id), rooms(id,name,venue_id)")
      .order("start_time", { ascending: true });
    if (!includeArchived) sessionsQ.gte("end_time", nowIso);

    // 2. Community events (approved)
    const commQ = supabaseAdmin
      .from("events")
      .select("id, organization_id, title, description, start_time, end_time, location, image_url, image_focal_x, image_focal_y, is_community, approval_status")
      .eq("is_community", true)
      .eq("approval_status", "approved")
      .order("start_time", { ascending: true });
    if (!includeArchived) commQ.gte("end_time", nowIso);

    // 3. Music gigs (booked slots)
    const slotsQ = supabaseAdmin
      .from("slots")
      .select("id, title, description, start_time, end_time, is_booked, stage_id, artist_id, busker_id")
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

    // Artists for music gigs (preferred), with legacy busker profile fallback
    const artistIds = Array.from(
      new Set((slotRes.data ?? []).map((s: any) => s.artist_id).filter(Boolean)),
    );
    const artistsRes = artistIds.length
      ? await supabaseAdmin
          .from("artists")
          .select("id, full_name, avatar_url, avatar_focal_x, avatar_focal_y")
          .in("id", artistIds as any)
      : { data: [] as any[] };
    const artistsById = new Map((artistsRes.data ?? []).map((a: any) => [a.id, a]));

    const buskerIds = Array.from(
      new Set(
        (slotRes.data ?? [])
          .filter((s: any) => !s.artist_id && s.busker_id)
          .map((s: any) => s.busker_id),
      ),
    );
    const buskersRes = buskerIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name, avatar_url, avatar_focal_x, avatar_focal_y")
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

    // Sold-out check for city sessions (sessionIds already defined above)
    const [tiersRes, attRes] = await Promise.all([
      sessionIds.length
        ? supabaseAdmin.from("ticket_tiers").select("id, session_id, capacity").in("session_id", sessionIds as any)
        : Promise.resolve({ data: [] as any[] }),
      sessionIds.length
        ? supabaseAdmin
            .from("attendees")
            .select("ticket_tier_id, quantity, ticket_tiers!inner(session_id)")
            .in("ticket_tiers.session_id", sessionIds as any)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const soldByTier = new Map<string, number>();
    for (const a of (attRes.data ?? []) as any[]) {
      if (!a.ticket_tier_id) continue;
      soldByTier.set(
        a.ticket_tier_id,
        (soldByTier.get(a.ticket_tier_id) ?? 0) + (a.quantity ?? 1),
      );
    }

    const tiersBySession = new Map<string, { capacity: number; sold: number }[]>();
    for (const t of (tiersRes.data ?? []) as any[]) {
      const sid = t.session_id as string;
      const sold = soldByTier.get(t.id) ?? 0;
      const capacity = Number(t.capacity ?? 0);
      const list = tiersBySession.get(sid) ?? [];
      list.push({ capacity, sold });
      tiersBySession.set(sid, list);
    }

    function isSoldOut(sessionId: string): boolean {
      const tiers = tiersBySession.get(sessionId);
      if (!tiers || tiers.length === 0) return false;
      // Sold out if every tier with a positive capacity is at/over capacity
      return tiers.every((t) => t.capacity > 0 && t.sold >= t.capacity);
    }

    const out: UnifiedEvent[] = [];

    for (const s of sessRes.data ?? []) {
      const sid = String((s as any).id);
      const stage = (s as any).stage_id ? stagesById.get((s as any).stage_id) : null;
      const room = (s as any).room_id ? roomsById.get((s as any).room_id) : null;
      const venue =
        (stage?.venue_id && venuesById.get(stage.venue_id)) ||
        (room?.venue_id && venuesById.get(room.venue_id)) ||
        null;
      const sub = stage ?? room;
      const soldOut = isSoldOut(sid);
      out.push({
        id: sid,
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
        detail_href: `/events/${sid}`,
        sponsors: sponsorsBySession.get(sid) ?? [],
        focal_x: (s as any).focal_x ?? 50,
        focal_y: (s as any).focal_y ?? 50,
        sold_out: soldOut,
        waitlist_available: soldOut,
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
        detail_href: `/community-events/${(e as any).id}`,
        sponsors: [],
        focal_x: (e as any).image_focal_x ?? 50,
        focal_y: (e as any).image_focal_y ?? 50,
        sold_out: false,
        waitlist_available: false,
      });

    }

    for (const s of slotRes.data ?? []) {
      const stage = (s as any).stage_id ? stagesById.get((s as any).stage_id) : null;
      const venue = stage?.venue_id ? venuesById.get(stage.venue_id) : null;
      const performer =
        ((s as any).artist_id && artistsById.get((s as any).artist_id)) ||
        ((s as any).busker_id && buskersById.get((s as any).busker_id)) ||
        null;
      out.push({
        id: `slot-${(s as any).id}`,
        source: "music",
        title: (s as any).title ?? "Live music",
        description: (s as any).description ?? null,
        starts_at: (s as any).start_time ?? null,
        ends_at: (s as any).end_time ?? null,
        image_url: performer?.avatar_url ?? null,
        venue_name: venue?.name ?? stage?.name ?? null,
        venue_city: venue?.city ?? null,
        sub_location_name: stage?.name ?? null,
        sub_location_type: stage ? "stage" : null,
        org_name: performer?.full_name ?? null,
        cost_text: "Free",
        ticketed: false,
        detail_href: `/gigs/${(s as any).id}`,
        sponsors: [],
        focal_x: performer?.avatar_focal_x ?? 50,
        focal_y: performer?.avatar_focal_y ?? 50,
        sold_out: false,
        waitlist_available: false,
      });
    }


    return out;
  });

// ---------- City event ticketing (public) ----------

export const getPublicCityEvent = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const [sessRes, tiersRes, talentRes, sponsorsRes, attRes] = await Promise.all([
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
      supabaseAdmin
        .from("sponsors")
        .select("id, company_name, logo_url, status")
        .eq("session_id", data.id)
        .in("status", ["approved", "paid"]),
      supabaseAdmin
        .from("attendees")
        .select("ticket_tier_id, quantity, ticket_tiers!inner(session_id)")
        .eq("ticket_tiers.session_id", data.id),
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
    const deptId = (sessRes.data as any).department_id ?? null;
    let department: { id: string; name: string; logo_url: string | null; brand_css: Record<string, string> | null } | null = null;
    if (deptId) {
      const d = await supabaseAdmin
        .from("departments")
        .select("id, name, logo_url, brand_css")
        .eq("id", deptId)
        .maybeSingle();
      department = (d.data as any) ?? null;
    }
    const sponsors: EventSponsor[] = (sponsorsRes.data ?? []).map((sp: any) => ({
      id: sp.id,
      company_name: sp.company_name ?? null,
      logo_url: sp.logo_url ?? null,
    }));

    // Per-tier sold counts so the UI can detect sold-out tiers.
    const soldByTier = new Map<string, number>();
    for (const a of (attRes.data ?? []) as any[]) {
      if (!a.ticket_tier_id) continue;
      soldByTier.set(
        a.ticket_tier_id,
        (soldByTier.get(a.ticket_tier_id) ?? 0) + (a.quantity ?? 1),
      );
    }
    const tiers = (tiersRes.data ?? []).map((t: any) => {
      const sold = soldByTier.get(t.id) ?? 0;
      const capacity = Number(t.capacity ?? 0);
      const sold_out = capacity > 0 && sold >= capacity;
      return { ...t, sold, sold_out };
    });

    return {
      event: sessRes.data,
      stage,
      room,
      venue,
      department,
      tiers,
      talent: talentRes.data ?? [],
      sponsors,
    };
  });

export const joinTicketWaitlist = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        session_id: z.string().uuid(),
        ticket_tier_id: z.string().uuid(),
        full_name: z.string().trim().min(1).max(200),
        email: z.string().trim().email().max(255),
        quantity: z.number().int().min(1).max(20).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { data: tier } = await supabaseAdmin
      .from("ticket_tiers")
      .select("id, session_id")
      .eq("id", data.ticket_tier_id)
      .maybeSingle();
    if (!tier || tier.session_id !== data.session_id) {
      throw new Error("Invalid ticket tier for this event");
    }
    const { error } = await supabaseAdmin
      .from("ticket_waitlist")
      .upsert(
        {
          session_id: data.session_id,
          ticket_tier_id: data.ticket_tier_id,
          full_name: data.full_name,
          email: data.email.toLowerCase(),
          quantity: data.quantity ?? 1,
        },
        { onConflict: "ticket_tier_id,email" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
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
    // Force the attendee email to the authenticated user's email so a
    // logged-in user cannot register arbitrary third-party emails.
    const authEmail =
      typeof context.claims.email === "string" ? context.claims.email : null;
    const attendeeEmail = authEmail ?? data.email;
    let tierId = data.ticket_tier_id ?? null;
    if (tierId) {
      const { data: tier } = await supabaseAdmin
        .from("ticket_tiers")
        .select("id, session_id")
        .eq("id", tierId)
        .maybeSingle();
      if (!tier || tier.session_id !== data.session_id) {
        throw new Error("Invalid ticket tier for this event");
      }
    } else {
      const { data: anyTier } = await supabaseAdmin
        .from("ticket_tiers")
        .select("id")
        .eq("session_id", data.session_id)
        .limit(1)
        .maybeSingle();
      tierId = anyTier?.id ?? null;
    }

    // Insert one attendee row per requested seat so each gets its own QR code.
    const qty = Math.max(1, Math.min(20, data.quantity ?? 1));
    const groupId = crypto.randomUUID();
    const rows = Array.from({ length: qty }, () => ({
      full_name: data.full_name,
      email: data.email,
      ticket_tier_id: tierId,
      quantity: 1,
      checked_in: false,
      group_id: groupId,
    }));

    const { data: inserted, error } = await supabaseAdmin
      .from("attendees")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);
    return { id: inserted?.[0]?.id, group_id: groupId, count: qty };
  });

