import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVENT_COLS =
  "id, organization_id, title, description, start_time, end_time, location, image_url, is_community, approval_status, reviewer_notes, submitted_by";

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

export const getMyOrg = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("community_organizations")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const upsertMyOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgInput.parse(i))
  .handler(async ({ data, context }) => {
    const payload = { ...data, website: data.website || null, user_id: context.userId };
    const { data: existing } = await supabaseAdmin
      .from("community_organizations")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabaseAdmin
        .from("community_organizations")
        .update({
          name: payload.name,
          org_type: payload.org_type,
          contact_email: payload.contact_email,
          contact_phone: payload.contact_phone,
          website: payload.website,
          description: payload.description,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id, status: existing.status };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("community_organizations")
      .insert({ ...payload, status: "pending" })
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

async function getApprovedOrg(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("community_organizations")
    .select("id, status, name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apply as a community organization first");
  if (data.status !== "approved")
    throw new Error("Your organization must be approved before submitting");
  return data;
}

// ---------- Locations (kept on the community_event_locations table) ----------

const locationInput = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const listMyLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const org = await getApprovedOrg(context.userId);
    const { data, error } = await supabaseAdmin
      .from("community_event_locations")
      .select("*")
      .eq("org_id", org.id)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMyLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => locationInput.parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrg(context.userId);
    const { error } = await supabaseAdmin
      .from("community_event_locations")
      .insert({ ...data, org_id: org.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMyLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => locationInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrg(context.userId);
    const { id, ...rest } = data;
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
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrg(context.userId);
    const { error } = await supabaseAdmin
      .from("community_event_locations")
      .delete()
      .eq("id", data.id)
      .eq("org_id", org.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Events (stored on the legacy events table) ----------

const eventInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  location_id: z.string().uuid().nullable().optional(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  cost_text: z.string().trim().max(120).optional().nullable(),
  contact_info: z.string().trim().max(300).optional().nullable(),
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
  .handler(async ({ context }) => {
    const { data: org } = await supabaseAdmin
      .from("community_organizations")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!org) return { org: null, events: [] };
    const { data, error } = await supabaseAdmin
      .from("events")
      .select(EVENT_COLS)
      .eq("is_community", true)
      .eq("organization_id", org.id)
      .order("start_time", { ascending: false });
    if (error) throw new Error(error.message);
    return { org, events: await hydrate(data ?? []) };
  });

export const createMyCommunityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => eventInput.parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrg(context.userId);
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
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMyCommunityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => eventInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrg(context.userId);
    if (new Date(data.ends_at) <= new Date(data.starts_at)) {
      throw new Error("End must be after start");
    }
    const locationLabel = await resolveLocationLabel(org.id, data.location_id ?? null);
    const startIso = new Date(data.starts_at).toISOString();
    const endIso = new Date(data.ends_at).toISOString();
    // Editing resets to pending so staff re-reviews.
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
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrg(context.userId);
    const { error } = await supabaseAdmin
      .from("events")
      .update({ approval_status: "rejected", reviewer_notes: "Cancelled by organization" })
      .eq("id", data.id)
      .eq("organization_id", org.id)
      .eq("is_community", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
