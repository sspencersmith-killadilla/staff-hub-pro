import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isAdmin } from "./staff-guard";

const RangeInput = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentId: z.string().uuid().nullable().optional(),
});

async function assertAdmin(userId: string) {
  if (!(await isAdmin(userId))) throw new Error("Forbidden: admin role required");
}

function rangeBounds(start: string, end: string) {
  return {
    startIso: `${start}T00:00:00.000Z`,
    endIso: `${end}T23:59:59.999Z`,
  };
}

async function fetchData(
  startIso: string,
  endIso: string,
  departmentId: string | null | undefined,
) {
  // Events (sessions)
  let sessQ = supabaseAdmin
    .from("sessions")
    .select(
      "id, title, description, start_time, end_time, department_id, stage_id, room_id, stages(id, name, venue_id), rooms(id, name, venue_id)",
    )
    .gte("start_time", startIso)
    .lte("start_time", endIso)
    .order("start_time", { ascending: true });
  if (departmentId) sessQ = sessQ.eq("department_id", departmentId);
  const sessRes = await sessQ;
  if (sessRes.error) throw new Error(sessRes.error.message);
  const sessions = sessRes.data ?? [];

  // Streetbeats: claimed slots only
  let slotQ = supabaseAdmin
    .from("slots")
    .select(
      "id, title, start_time, end_time, stage_id, artist_id, is_booked, stages(id, name, venue_id)",
    )
    .eq("is_booked", true)
    .gte("start_time", startIso)
    .lte("start_time", endIso)
    .order("start_time", { ascending: true });
  const slotRes = await slotQ;
  if (slotRes.error) throw new Error(slotRes.error.message);
  let slots = slotRes.data ?? [];

  // Collect venue + artist + department lookups
  const venueIds = Array.from(
    new Set(
      [
        ...sessions.map((s: any) => s.stages?.venue_id ?? s.rooms?.venue_id),
        ...slots.map((s: any) => s.stages?.venue_id),
      ].filter((v) => v != null),
    ),
  );
  const artistIds = Array.from(
    new Set(slots.map((s: any) => s.artist_id).filter(Boolean)),
  );
  const deptIds = Array.from(
    new Set(sessions.map((s: any) => s.department_id).filter(Boolean)),
  );

  const [venuesRes, artistsRes, deptsRes] = await Promise.all([
    venueIds.length
      ? supabaseAdmin
          .from("venues")
          .select("id, name, department_id")
          .in("id", venueIds as any)
      : Promise.resolve({ data: [] as any[], error: null }),
    artistIds.length
      ? supabaseAdmin
          .from("artists")
          .select("id, full_name, genre")
          .in("id", artistIds as any)
      : Promise.resolve({ data: [] as any[], error: null }),
    Promise.resolve({ data: [] as any[], error: null }),
  ]);
  if (venuesRes.error) throw new Error((venuesRes as any).error.message);
  if (artistsRes.error) throw new Error((artistsRes as any).error.message);

  const venuesById = new Map((venuesRes.data ?? []).map((v: any) => [v.id, v]));
  const artistsById = new Map((artistsRes.data ?? []).map((a: any) => [a.id, a]));

  // Filter slots by venue department if requested
  if (departmentId) {
    slots = slots.filter(
      (s: any) => venuesById.get(s.stages?.venue_id)?.department_id === departmentId,
    );
  }

  // Department names
  const allDeptIds = Array.from(
    new Set([
      ...deptIds,
      ...Array.from(venuesById.values()).map((v: any) => v.department_id).filter(Boolean),
    ]),
  );
  let deptsById = new Map<string, any>();
  if (allDeptIds.length) {
    const r = await supabaseAdmin
      .from("departments")
      .select("id, name")
      .in("id", allDeptIds as any);
    if (!r.error) deptsById = new Map((r.data ?? []).map((d: any) => [d.id, d]));
  }

  // Sponsors with the Guidebook Ad Space tier (approved or paid)
  // Match tier by name OR placement='guidebook'
  const tiersRes = await supabaseAdmin
    .from("sponsorship_tiers")
    .select("id, name, placement");
  if (tiersRes.error) throw new Error(tiersRes.error.message);
  const guidebookTierIds = new Set(
    (tiersRes.data ?? [])
      .filter(
        (t: any) =>
          t.placement === "guidebook" ||
          (t.name ?? "").toLowerCase().includes("guidebook"),
      )
      .map((t: any) => t.id),
  );

  let sponsors: any[] = [];
  if (guidebookTierIds.size) {
    const spRes = await supabaseAdmin
      .from("sponsors")
      .select("id, company_name, logo_url, ad_copy, status, sponsorship_tier_id")
      .in("sponsorship_tier_id", Array.from(guidebookTierIds))
      .in("status", ["approved", "paid"]);
    if (spRes.error) throw new Error(spRes.error.message);
    sponsors = spRes.data ?? [];
  }

  const events = sessions.map((s: any) => {
    const venueId = s.stages?.venue_id ?? s.rooms?.venue_id;
    const venue = venueId != null ? venuesById.get(venueId) : null;
    return {
      id: s.id,
      title: s.title,
      start_time: s.start_time,
      end_time: s.end_time,
      description: s.description ?? null,
      department_name: deptsById.get(s.department_id)?.name ?? null,
      venue_name: venue?.name ?? null,
      location_name: s.stages?.name ?? s.rooms?.name ?? null,
    };
  });

  const gigs = slots.map((s: any) => {
    const venue = venuesById.get(s.stages?.venue_id);
    const artist = s.artist_id ? artistsById.get(s.artist_id) : null;
    return {
      id: String(s.id),
      title: s.title ?? "Performance",
      start_time: s.start_time,
      end_time: s.end_time,
      stage_name: s.stages?.name ?? null,
      venue_name: venue?.name ?? null,
      department_name: deptsById.get(venue?.department_id)?.name ?? null,
      artist_name: artist?.full_name ?? null,
      artist_genre: artist?.genre ?? null,
    };
  });

  return { events, gigs, sponsors };
}

async function fetchLogoBytes(
  url: string | null,
): Promise<{ bytes: Uint8Array | null; mime: string | null }> {
  if (!url) return { bytes: null, mime: null };
  try {
    const res = await fetch(url);
    if (!res.ok) return { bytes: null, mime: null };
    const mime = res.headers.get("content-type") ?? "image/png";
    const buf = new Uint8Array(await res.arrayBuffer());
    return { bytes: buf, mime };
  } catch {
    return { bytes: null, mime: null };
  }
}

export const previewGuidebookCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => RangeInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { startIso, endIso } = rangeBounds(data.startDate, data.endDate);
    const { events, gigs, sponsors } = await fetchData(
      startIso,
      endIso,
      data.departmentId ?? null,
    );
    return {
      events: events.length,
      gigs: gigs.length,
      sponsors: sponsors.length,
    };
  });

export const generateGuidebook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => RangeInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { startIso, endIso } = rangeBounds(data.startDate, data.endDate);
    const { events, gigs, sponsors } = await fetchData(
      startIso,
      endIso,
      data.departmentId ?? null,
    );

    // Hydrate logos
    const sponsorsWithLogos = await Promise.all(
      sponsors.map(async (s: any) => {
        const { bytes, mime } = await fetchLogoBytes(s.logo_url);
        return {
          id: s.id,
          company_name: s.company_name,
          ad_copy: s.ad_copy ?? null,
          logo_bytes: bytes,
          logo_mime: mime,
        };
      }),
    );

    const { buildGuidebookPdf } = await import("./guidebook-pdf.server");
    const pdfBytes = await buildGuidebookPdf({
      startDate: data.startDate,
      endDate: data.endDate,
      title: "Community Program Guide",
      events,
      gigs,
      sponsors: sponsorsWithLogos,
    });

    // Convert to base64 for JSON transport
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    return {
      filename: `program-guide-${data.startDate}_to_${data.endDate}.pdf`,
      base64,
      counts: { events: events.length, gigs: gigs.length, sponsors: sponsors.length },
    };
  });
