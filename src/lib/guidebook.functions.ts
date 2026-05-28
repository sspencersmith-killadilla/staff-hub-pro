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
  // Events (sessions) — note: `sessions` has no description column
  let sessQ = supabaseAdmin
    .from("sessions")
    .select(
      "id, title, speaker_name, start_time, end_time, department_id, stage_id, room_id, image_url, stages(id, name, venue_id), rooms(id, name, venue_id)",
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
      description: s.speaker_name ?? null,
      department_name: deptsById.get(s.department_id)?.name ?? null,
      venue_name: venue?.name ?? null,
      location_name: s.stages?.name ?? s.rooms?.name ?? null,
      image_url: s.image_url ?? null,
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

  // Classes (course_sessions) in range
  let classQ = supabaseAdmin
    .from("course_sessions")
    .select(
      "id, start_time, end_time, instructor_name, room_id, course_id, courses(title, price, department_id, image_url, description), rooms(name, venue_id, venues(name))",
    )
    .gte("start_time", startIso)
    .lte("start_time", endIso)
    .order("start_time", { ascending: true });
  const classRes = await classQ;
  if (classRes.error) throw new Error(classRes.error.message);
  let classRows = classRes.data ?? [];
  if (departmentId) {
    classRows = classRows.filter(
      (c: any) => c.courses?.department_id === departmentId,
    );
  }
  // Resolve extra dept names referenced by classes
  const classDeptIds = Array.from(
    new Set(classRows.map((c: any) => c.courses?.department_id).filter(Boolean)),
  ).filter((id) => !deptsById.has(id as string));
  if (classDeptIds.length) {
    const r = await supabaseAdmin
      .from("departments")
      .select("id, name")
      .in("id", classDeptIds as any);
    if (!r.error) {
      for (const d of r.data ?? []) deptsById.set(d.id, d);
    }
  }
  const classes = classRows.map((c: any) => ({
    id: c.id,
    course_title: c.courses?.title ?? "Class",
    start_time: c.start_time,
    end_time: c.end_time,
    room_name: c.rooms?.name ?? null,
    venue_name: c.rooms?.venues?.name ?? null,
    department_name: c.courses?.department_id
      ? deptsById.get(c.courses.department_id)?.name ?? null
      : null,
    instructor_name: c.instructor_name ?? null,
    price: Number(c.courses?.price ?? 0),
    image_url: c.courses?.image_url ?? null,
    description: c.courses?.description ?? null,
  }));

  return { events, gigs, classes, sponsors };
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
    const { events, gigs, classes, sponsors } = await fetchData(
      startIso,
      endIso,
      data.departmentId ?? null,
    );
    return {
      events: events.length,
      gigs: gigs.length,
      classes: classes.length,
      sponsors: sponsors.length,
    };
  });

export const fetchGuidebookCanvasData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => RangeInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { startIso, endIso } = rangeBounds(data.startDate, data.endDate);
    const { events, gigs, classes, sponsors } = await fetchData(
      startIso,
      endIso,
      data.departmentId ?? null,
    );
    return {
      startDate: data.startDate,
      endDate: data.endDate,
      events,
      gigs,
      classes,
      sponsors: sponsors.map((s: any) => ({
        id: s.id,
        company_name: s.company_name,
        ad_copy: s.ad_copy ?? null,
        logo_url: s.logo_url ?? null,
      })),
    };
  });

// ─── Standalone guidebook sponsor management (no event required) ─────
const StandaloneSponsorInput = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200).optional().nullable(),
  contactEmail: z.string().email().max(200).optional().nullable(),
  logoUrl: z.string().max(1000).optional().nullable(),
  adCopy: z.string().max(2000).optional().nullable(),
});

async function getOrCreateGuidebookTierId(): Promise<string> {
  const tiersRes = await supabaseAdmin
    .from("sponsorship_tiers")
    .select("id, name, placement");
  if (tiersRes.error) throw new Error(tiersRes.error.message);
  const existing = (tiersRes.data ?? []).find(
    (t: any) =>
      t.placement === "guidebook" ||
      (t.name ?? "").toLowerCase().includes("guidebook"),
  );
  if (existing) return existing.id;
  const ins = await supabaseAdmin
    .from("sponsorship_tiers")
    .insert([{ name: "Guidebook Ad Space", placement: "guidebook", price: 0 }])
    .select("id")
    .single();
  if (ins.error) throw new Error(ins.error.message);
  return ins.data.id;
}

export const createStandaloneGuidebookSponsor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => StandaloneSponsorInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const tierId = await getOrCreateGuidebookTierId();
    const { data: row, error } = await supabaseAdmin
      .from("sponsors")
      .insert([
        {
          user_id: context.userId,
          company_name: data.companyName,
          contact_name: data.contactName ?? null,
          contact_email: data.contactEmail ?? null,
          logo_url: data.logoUrl ?? null,
          ad_copy: data.adCopy ?? null,
          session_id: null,
          sponsorship_tier_id: tierId,
          status: "approved",
        },
      ])
      .select("id, company_name")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, company_name: row.company_name };
  });

export const listGuidebookSponsors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const tiersRes = await supabaseAdmin
      .from("sponsorship_tiers")
      .select("id, name, placement");
    if (tiersRes.error) throw new Error(tiersRes.error.message);
    const ids = (tiersRes.data ?? [])
      .filter(
        (t: any) =>
          t.placement === "guidebook" ||
          (t.name ?? "").toLowerCase().includes("guidebook"),
      )
      .map((t: any) => t.id);
    if (!ids.length) return { sponsors: [] };
    const { data, error } = await supabaseAdmin
      .from("sponsors")
      .select("id, company_name, status, logo_url, ad_copy, session_id, created_at")
      .in("sponsorship_tier_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { sponsors: data ?? [] };
  });

const DeleteSponsorInput = z.object({ id: z.string().uuid() });

export const deleteGuidebookSponsor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DeleteSponsorInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("sponsors").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const LayoutItem = z.object({
  id: z.string(),
  kind: z.enum(["section", "event", "gig", "class", "ad"]),
  refId: z.string().optional().nullable(),
  label: z.string().optional().nullable(),
  hidden: z.boolean().optional(),
  overrides: z
    .object({
      title: z.string().optional().nullable(),
      description: z.string().optional().nullable(),
      adCopy: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const GenerateInput = RangeInput.extend({
  layout: z.array(LayoutItem).optional().nullable(),
});

export const generateGuidebook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => GenerateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { startIso, endIso } = rangeBounds(data.startDate, data.endDate);
    const { events, gigs, classes, sponsors } = await fetchData(
      startIso,
      endIso,
      data.departmentId ?? null,
    );

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

    const { buildGuidebookPdf, buildGuidebookPdfFromLayout } = await import(
      "./guidebook-pdf.server"
    );
    const baseInput = {
      startDate: data.startDate,
      endDate: data.endDate,
      title: "Community Program Guide",
      events,
      gigs,
      classes,
      sponsors: sponsorsWithLogos,
    };
    const pdfBytes =
      data.layout && data.layout.length
        ? await buildGuidebookPdfFromLayout(baseInput, data.layout as any)
        : await buildGuidebookPdf(baseInput);

    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    return {
      filename: `program-guide-${data.startDate}_to_${data.endDate}.pdf`,
      base64,
      counts: {
        events: events.length,
        gigs: gigs.length,
        classes: classes.length,
        sponsors: sponsors.length,
      },
    };
  });

// ─── Magazine-style page+block guidebook ──────────────────────────────
const MagazineBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "rect"]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  groupId: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  fontSize: z.number().nullable().optional(),
  bold: z.boolean().nullable().optional(),
  italic: z.boolean().nullable().optional(),
  color: z.string().nullable().optional(),
  bgColor: z.string().nullable().optional(),
  align: z.enum(["left", "center", "right"]).nullable().optional(),
  lineHeight: z.number().nullable().optional(),
  padding: z.number().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  fit: z.enum(["cover", "contain"]).nullable().optional(),
  frame: z.enum(["rect", "rounded", "circle", "hexagon"]).nullable().optional(),
  shape: z
    .enum(["rect", "circle", "ellipse", "triangle", "hexagon", "star", "line"])
    .nullable()
    .optional(),
  fill: z.string().nullable().optional(),
  borderColor: z.string().nullable().optional(),
  borderWidth: z.number().nullable().optional(),
  radius: z.number().nullable().optional(),
});

const MagazineInputSchema = z.object({
  title: z.string().max(200).default("Program Guide"),
  pages: z
    .array(
      z.object({
        id: z.string(),
        bgColor: z.string().nullable().optional(),
        blocks: z.array(MagazineBlockSchema).max(800),
      }),
    )
    .min(1)
    .max(80),
});

export const generateMagazineGuidebook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => MagazineInputSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { buildMagazinePdf } = await import("./guidebook-magazine-pdf.server");
    const pdfBytes = await buildMagazinePdf({
      title: data.title,
      pages: data.pages,
    });
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      filename: `program-guide-magazine-${stamp}.pdf`,
      base64,
      pageCount: data.pages.length,
    };
  });
