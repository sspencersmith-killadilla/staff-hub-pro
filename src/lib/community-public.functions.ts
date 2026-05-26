import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVENT_COLS =
  "id, organization_id, title, description, start_time, end_time, location, image_url, image_focal_x, image_focal_y, is_community, approval_status, reviewer_notes, submitted_by";


function eventRow(e: any, org: any | null, loc: any | null) {
  return {
    id: e.id,
    org_id: e.organization_id ?? null,
    location_id: null as string | null,
    title: e.title,
    description: e.description ?? null,
    starts_at: e.start_time,
    ends_at: e.end_time,
    cost_text: null as string | null,
    contact_info: null as string | null,

    status: e.approval_status ?? "pending",
    staff_notes: e.reviewer_notes ?? null,
    image_url: e.image_url ?? null,
    image_focal_x: typeof e.image_focal_x === "number" ? e.image_focal_x : 50,
    image_focal_y: typeof e.image_focal_y === "number" ? e.image_focal_y : 50,
    location: loc ?? (e.location ? { name: e.location, address: null, city: null } : null),
    org: org,
    created_at: null as string | null,
  };
}


async function hydrate(rows: any[]) {
  const orgIds = Array.from(new Set(rows.map((r) => r.organization_id).filter(Boolean)));
  const orgsRes = orgIds.length
    ? await supabaseAdmin
        .from("community_organizations")
        .select("id, name, org_type, website, contact_email")
        .in("id", orgIds)
    : { data: [] as any[] };
  const orgs = new Map((orgsRes.data ?? []).map((o: any) => [o.id, o]));
  return rows.map((r) =>
    eventRow(r, r.organization_id ? orgs.get(r.organization_id) ?? null : null, null),
  );
}

// ---------- Public reads ----------

export const listPublicCommunityEvents = createServerFn({ method: "GET" }).handler(
  async () => {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("events")
      .select(EVENT_COLS)
      .eq("is_community", true)
      .eq("approval_status", "approved")
      .gte("end_time", nowIso)
      .order("start_time");
    if (error) throw new Error(error.message);
    return hydrate(data ?? []);
  },
);

// ---------- Org self-service ----------

const orgInput = z.object({
  name: z.string().trim().min(1).max(200),
  org_type: z.string().trim().max(120).optional().nullable(),
  contact_email: z.string().trim().email().max(255),
  contact_phone: z.string().trim().max(40).optional().nullable(),
  website: z
    .string()
    .trim()
    .url()
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("")),
  description: z.string().trim().max(2000).optional().nullable(),
});

// List all orgs the user has registered.
export const listMyOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("community_organizations")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Back-compat: return the user's most recent org (first registered), or null.
export const getMyOrg = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("community_organizations")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] ?? null;
  });

export const createMyOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgInput.parse(i))
  .handler(async ({ data, context }) => {
    const payload = { ...data, website: data.website || null, user_id: context.userId };
    const { data: inserted, error } = await supabaseAdmin
      .from("community_organizations")
      .insert({ ...payload, status: "pending" })
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const updateMyOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await supabaseAdmin
      .from("community_organizations")
      .update({
        name: rest.name,
        org_type: rest.org_type,
        contact_email: rest.contact_email,
        contact_phone: rest.contact_phone,
        website: rest.website || null,
        description: rest.description,
      })
      .eq("id", id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { id, ok: true };
  });

// Legacy upsert: now creates a NEW org per call (multi-org). Kept so older
// callers don't break, but new UI should call createMyOrg / updateMyOrg.
export const upsertMyOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgInput.parse(i))
  .handler(async ({ data, context }) => {
    const payload = { ...data, website: data.website || null, user_id: context.userId };
    const { data: inserted, error } = await supabaseAdmin
      .from("community_organizations")
      .insert({ ...payload, status: "pending" })
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

async function getApprovedOrgById(userId: string, orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("community_organizations")
    .select("id, status, name, user_id")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("Organization not found");
  if (data.status !== "approved")
    throw new Error("Your organization must be approved before submitting");
  return data;
}

const orgIdInput = z.object({ org_id: z.string().uuid() });

// ---------- Locations (per-org) ----------

const locationInput = z.object({
  org_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const listMyLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrgById(context.userId, data.org_id);
    const { data: rows, error } = await supabaseAdmin
      .from("community_event_locations")
      .select("*")
      .eq("org_id", org.id)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createMyLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => locationInput.parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrgById(context.userId, data.org_id);
    const { org_id: _ignore, ...rest } = data;
    const { error } = await supabaseAdmin
      .from("community_event_locations")
      .insert({ ...rest, org_id: org.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMyLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => locationInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrgById(context.userId, data.org_id);
    const { id, org_id: _ignore, ...rest } = data;
    const { error } = await supabaseAdmin
      .from("community_event_locations")
      .update(rest)
      .eq("id", id)
      .eq("org_id", org.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), org_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrgById(context.userId, data.org_id);
    const { error } = await supabaseAdmin
      .from("community_event_locations")
      .delete()
      .eq("id", data.id)
      .eq("org_id", org.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Events (per-org) ----------

const eventInput = z.object({
  org_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  location_id: z.string().uuid().nullable().optional(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  cost_text: z.string().trim().max(120).optional().nullable(),
  contact_info: z.string().trim().max(300).optional().nullable(),
  image_url: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  image_focal_x: z.number().int().min(0).max(100).optional(),
  image_focal_y: z.number().int().min(0).max(100).optional(),
});


async function resolveLocationLabel(orgId: string, locId: string | null | undefined) {
  if (!locId) return null;
  const { data } = await supabaseAdmin
    .from("community_event_locations")
    .select("name, address, city")
    .eq("id", locId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null;
  return [data.name, data.address, data.city].filter(Boolean).join(", ");
}

export const listMyCommunityEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: org } = await supabaseAdmin
      .from("community_organizations")
      .select("id, status, user_id")
      .eq("id", data.org_id)
      .maybeSingle();
    if (!org || org.user_id !== context.userId) return { org: null, events: [] };
    const { data: rows, error } = await supabaseAdmin
      .from("events")
      .select(EVENT_COLS)
      .eq("is_community", true)
      .eq("organization_id", org.id)
      .order("start_time", { ascending: false });
    if (error) throw new Error(error.message);
    return { org, events: await hydrate(rows ?? []) };
  });

export const createMyCommunityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => eventInput.parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrgById(context.userId, data.org_id);
    if (new Date(data.ends_at) <= new Date(data.starts_at)) {
      throw new Error("End must be after start");
    }
    const locationLabel = await resolveLocationLabel(org.id, data.location_id ?? null);
    const startIso = new Date(data.starts_at).toISOString();
    const endIso = new Date(data.ends_at).toISOString();
    const { error } = await supabaseAdmin.from("events").insert({
      title: data.title,
      description: data.description ?? null,
      start_time: startIso,
      end_time: endIso,
      start_date: startIso.slice(0, 10),
      end_date: endIso.slice(0, 10),
      location: locationLabel,
      organization_id: org.id,
      is_community: true,
      approval_status: "pending",
      submitted_by: context.userId,
      event_type: "Community",
      image_url: data.image_url || null,
      image_focal_x: data.image_focal_x ?? 50,
      image_focal_y: data.image_focal_y ?? 50,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const updateMyCommunityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => eventInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrgById(context.userId, data.org_id);
    if (new Date(data.ends_at) <= new Date(data.starts_at)) {
      throw new Error("End must be after start");
    }
    const locationLabel = await resolveLocationLabel(org.id, data.location_id ?? null);
    const startIso = new Date(data.starts_at).toISOString();
    const endIso = new Date(data.ends_at).toISOString();
    const { error } = await supabaseAdmin
      .from("events")
      .update({
        title: data.title,
        description: data.description ?? null,
        start_time: startIso,
        end_time: endIso,
        start_date: startIso.slice(0, 10),
        end_date: endIso.slice(0, 10),
        location: locationLabel,
        approval_status: "pending",
      })
      .eq("id", data.id)
      .eq("organization_id", org.id)
      .eq("is_community", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelMyCommunityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), org_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrgById(context.userId, data.org_id);
    const { error } = await supabaseAdmin
      .from("events")
      .update({ approval_status: "rejected", reviewer_notes: "Cancelled by organization" })
      .eq("id", data.id)
      .eq("organization_id", org.id)
      .eq("is_community", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
