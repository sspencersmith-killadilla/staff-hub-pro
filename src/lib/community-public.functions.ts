import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVENT_COLS =
  "id, org_id, location_id, title, description, starts_at, ends_at, cost_text, contact_info, status, staff_notes, created_at";

async function attachOrgAndLocation(rows: any[]) {
  const orgIds = Array.from(new Set(rows.map((r) => r.org_id).filter(Boolean)));
  const locIds = Array.from(
    new Set(rows.map((r) => r.location_id).filter(Boolean)),
  );
  const [orgsRes, locsRes] = await Promise.all([
    orgIds.length
      ? supabaseAdmin
          .from("community_organizations")
          .select("id, name, org_type, website")
          .in("id", orgIds)
      : Promise.resolve({ data: [] as any[] }),
    locIds.length
      ? supabaseAdmin
          .from("community_event_locations")
          .select("id, name, address, city, latitude, longitude")
          .in("id", locIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const orgs = new Map((orgsRes.data ?? []).map((o: any) => [o.id, o]));
  const locs = new Map((locsRes.data ?? []).map((l: any) => [l.id, l]));
  return rows.map((r) => ({
    ...r,
    org: r.org_id ? orgs.get(r.org_id) ?? null : null,
    location: r.location_id ? locs.get(r.location_id) ?? null : null,
  }));
}

// ---------- Public reads ----------

export const listPublicCommunityEvents = createServerFn({ method: "GET" }).handler(
  async () => {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("community_events")
      .select(EVENT_COLS)
      .eq("status", "approved")
      .gte("ends_at", nowIso)
      .order("starts_at");
    if (error) throw new Error(error.message);
    return attachOrgAndLocation(data ?? []);
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
    const payload = {
      ...data,
      website: data.website || null,
      user_id: context.userId,
    };
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
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apply as a community organization first");
  if (data.status !== "approved")
    throw new Error("Your organization must be approved before submitting");
  return data;
}

// ---------- Locations ----------

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
  .inputValidator((i) =>
    locationInput.extend({ id: z.string().uuid() }).parse(i),
  )
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

// ---------- Events ----------

const eventInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  location_id: z.string().uuid().nullable().optional(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  cost_text: z.string().trim().max(120).optional().nullable(),
  contact_info: z.string().trim().max(300).optional().nullable(),
});

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
      .from("community_events")
      .select(EVENT_COLS)
      .eq("org_id", org.id)
      .order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { org, events: await attachOrgAndLocation(data ?? []) };
  });

export const createMyCommunityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => eventInput.parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrg(context.userId);
    if (new Date(data.ends_at) <= new Date(data.starts_at)) {
      throw new Error("End must be after start");
    }
    const { error } = await supabaseAdmin.from("community_events").insert({
      ...data,
      org_id: org.id,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMyCommunityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    eventInput.extend({ id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrg(context.userId);
    const { id, ...rest } = data;
    if (new Date(rest.ends_at) <= new Date(rest.starts_at)) {
      throw new Error("End must be after start");
    }
    // editing resets to pending so staff re-reviews
    const { error } = await supabaseAdmin
      .from("community_events")
      .update({ ...rest, status: "pending" })
      .eq("id", id)
      .eq("org_id", org.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelMyCommunityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await getApprovedOrg(context.userId);
    const { error } = await supabaseAdmin
      .from("community_events")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("org_id", org.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
