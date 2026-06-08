import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertStaff,
  isAdmin,
  getUserDepartmentIds,
} from "./staff-guard";

export type IssueCategory = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  default_department_id: string | null;
};

export type TicketRow = {
  id: string;
  user_id: string;
  category_id: string;
  description: string;
  location_address: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_url: string;
  status: "submitted" | "received" | "in_progress" | "resolved";
  assigned_department_id: string | null;
  created_at: string;
  updated_at: string;
  category?: IssueCategory | null;
  department?: { id: string; name: string } | null;
};

export type TicketUpdateRow = {
  id: string;
  ticket_id: string;
  staff_id: string | null;
  status_change: TicketRow["status"] | null;
  public_note: string | null;
  internal_note?: string | null;
  created_at: string;
};

// --- PUBLIC: list active categories ---------------------------------------
export const listIssueCategories = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("issue_categories")
      .select("id, name, description, icon, default_department_id, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as (IssueCategory & { sort_order: number })[];
  },
);

// --- CITIZEN: create ticket -----------------------------------------------
const createTicketInput = z.object({
  category_id: z.string().uuid(),
  description: z.string().min(10).max(2000),
  photo_url: z.string().url().min(1),
  location_address: z.string().max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => createTicketInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("tickets")
      .insert({
        user_id: userId,
        category_id: data.category_id,
        description: data.description,
        photo_url: data.photo_url,
        location_address: data.location_address ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

// --- CITIZEN: list my tickets + public updates ----------------------------
export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: tickets, error } = await supabase
      .from("tickets")
      .select(
        "id, user_id, category_id, description, location_address, latitude, longitude, photo_url, status, assigned_department_id, created_at, updated_at, category:issue_categories(id, name, icon, description, default_department_id), department:departments!tickets_assigned_department_id_fkey(id, name)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = (tickets ?? []) as unknown as TicketRow[];
    if (list.length === 0) return { tickets: [], updates: {} as Record<string, TicketUpdateRow[]> };

    const ids = list.map((t) => t.id);
    const { data: updates } = await supabase
      .from("ticket_updates_public")
      .select("id, ticket_id, staff_id, status_change, public_note, created_at")
      .in("ticket_id", ids)
      .order("created_at", { ascending: true });
    const byTicket: Record<string, TicketUpdateRow[]> = {};
    for (const u of (updates ?? []) as TicketUpdateRow[]) {
      (byTicket[u.ticket_id] ||= []).push(u);
    }
    return { tickets: list, updates: byTicket };
  });

// --- STAFF: list dispatch board -------------------------------------------
export const listDispatchTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    await assertStaff(userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = await isAdmin(userId);
    let q = supabaseAdmin
      .from("tickets")
      .select(
        "id, user_id, category_id, description, location_address, latitude, longitude, photo_url, status, assigned_department_id, created_at, updated_at, category:issue_categories(id, name, icon, description, default_department_id), department:departments!tickets_assigned_department_id_fkey(id, name)",
      )
      .order("created_at", { ascending: false });
    if (!admin) {
      const depts = Array.from(await getUserDepartmentIds(userId));
      if (depts.length === 0) return { tickets: [] as TicketRow[] };
      q = q.in("assigned_department_id", depts);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { tickets: (data ?? []) as unknown as TicketRow[] };
  });

// --- STAFF: ticket detail incl. internal notes ----------------------------
export const getTicketDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertStaff(userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket, error } = await supabaseAdmin
      .from("tickets")
      .select(
        "id, user_id, category_id, description, location_address, latitude, longitude, photo_url, status, assigned_department_id, created_at, updated_at, category:issue_categories(id, name, icon, description, default_department_id), department:departments!tickets_assigned_department_id_fkey(id, name)",
      )
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    // Department scoping: admins see all; staff only their depts
    if (!(await isAdmin(userId))) {
      const depts = await getUserDepartmentIds(userId);
      if (!ticket.assigned_department_id || !depts.has(ticket.assigned_department_id as string)) {
        throw new Error("Forbidden");
      }
    }

    const { data: updates } = await supabaseAdmin
      .from("ticket_updates")
      .select("id, ticket_id, staff_id, status_change, public_note, internal_note, created_at")
      .eq("ticket_id", data.id)
      .order("created_at", { ascending: true });

    // Look up requester contact (email) for staff
    let requester_email: string | null = null;
    try {
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(
        (ticket as any).user_id,
      );
      requester_email = userRes?.user?.email ?? null;
    } catch {
      // ignore — email is optional context
    }

    return {
      ticket: ticket as unknown as TicketRow,
      updates: (updates ?? []) as TicketUpdateRow[],
      requester_email,
    };
  });

// --- STAFF: write an update -----------------------------------------------
const addUpdateInput = z.object({
  ticket_id: z.string().uuid(),
  status_change: z.enum(["submitted", "received", "in_progress", "resolved"]).nullable().optional(),
  public_note: z.string().max(2000).nullable().optional(),
  internal_note: z.string().max(2000).nullable().optional(),
});

export const addTicketUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => addUpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(userId);
    if (!data.status_change && !data.public_note && !data.internal_note) {
      throw new Error("Provide a status change, public note, or internal note");
    }
    const { error } = await supabase.from("ticket_updates").insert({
      ticket_id: data.ticket_id,
      staff_id: userId,
      status_change: data.status_change ?? null,
      public_note: data.public_note?.trim() || null,
      internal_note: data.internal_note?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// --- Geocoding helpers via Google Maps connector gateway ------------------
const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

async function gatewayFetch(path: string): Promise<any> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !mapsKey) throw new Error("Google Maps connector is not configured");
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": mapsKey,
    },
  });
  if (!res.ok) throw new Error(`Maps gateway error: ${res.status}`);
  return res.json();
}

export const reverseGeocode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const json = await gatewayFetch(
      `/maps/api/geocode/json?latlng=${data.latitude},${data.longitude}`,
    );
    const result = json?.results?.[0];
    return { address: (result?.formatted_address as string) ?? null };
  });

export const geocodeAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ address: z.string().min(2).max(500) }).parse(i))
  .handler(async ({ data }) => {
    const json = await gatewayFetch(
      `/maps/api/geocode/json?address=${encodeURIComponent(data.address)}`,
    );
    const result = json?.results?.[0];
    const loc = result?.geometry?.location;
    if (!loc) return { latitude: null, longitude: null, address: null };
    return {
      latitude: loc.lat as number,
      longitude: loc.lng as number,
      address: (result?.formatted_address as string) ?? null,
    };
  });

// --- ADMIN: manage issue categories ---------------------------------------
async function assertAdminUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

export type AdminIssueCategory = IssueCategory & {
  sort_order: number;
  active: boolean;
};

export const listIssueCategoriesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminIssueCategory[]> => {
    await assertAdminUser(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("issue_categories")
      .select("id, name, description, icon, default_department_id, sort_order, active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminIssueCategory[];
  });

const upsertCategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(80).nullable().optional(),
  default_department_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

export const upsertIssueCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => upsertCategorySchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdminUser(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      name: data.name,
      description: data.description ?? null,
      icon: data.icon ?? null,
      default_department_id: data.default_department_id ?? null,
      sort_order: data.sort_order,
      active: data.active,
    };
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("issue_categories")
        .update(payload)
        .eq("id", data.id)
        .select("id, name, description, icon, default_department_id, sort_order, active")
        .single();
      if (error) throw new Error(error.message);
      return row as AdminIssueCategory;
    }
    const { data: row, error } = await supabaseAdmin
      .from("issue_categories")
      .insert(payload)
      .select("id, name, description, icon, default_department_id, sort_order, active")
      .single();
    if (error) throw new Error(error.message);
    return row as AdminIssueCategory;
  });

export const deleteIssueCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdminUser(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("issue_categories")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });


// =========================================================================
// === MULTI-DEPARTMENT ASSIGNMENT =========================================
// =========================================================================
export type TicketDepartmentRow = {
  department_id: string;
  is_primary: boolean;
  department?: { id: string; name: string } | null;
};

export const listTicketDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ticket_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("ticket_departments")
      .select("department_id, is_primary, department:departments!ticket_departments_department_id_fkey(id, name)")
      .eq("ticket_id", data.ticket_id);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as TicketDepartmentRow[];
  });

export const setTicketDepartments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ticket_id: z.string().uuid(),
      department_ids: z.array(z.string().uuid()).min(1).max(10),
      primary_department_id: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    if (!data.department_ids.includes(data.primary_department_id)) {
      throw new Error("Primary department must be in the assigned list");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await supabaseAdmin
      .from("ticket_departments").delete().eq("ticket_id", data.ticket_id);
    if (delErr) throw new Error(delErr.message);
    const rows = data.department_ids.map((id) => ({
      ticket_id: data.ticket_id,
      department_id: id,
      is_primary: id === data.primary_department_id,
      added_by: context.userId,
    }));
    const { error: insErr } = await supabaseAdmin.from("ticket_departments").insert(rows);
    if (insErr) throw new Error(insErr.message);
    return { ok: true as const };
  });

// =========================================================================
// === ASSIGNEES (staff users + raw email invites) =========================
// =========================================================================
export type TicketAssigneeRow = {
  id: string;
  ticket_id: string;
  staff_user_id: string | null;
  invited_email: string | null;
  assigned_at: string;
  accepted_at: string | null;
  email?: string | null;
  full_name?: string | null;
};

export const listTicketAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ticket_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("ticket_assignees")
      .select("id, ticket_id, staff_user_id, invited_email, assigned_at, accepted_at")
      .eq("ticket_id", data.ticket_id)
      .order("assigned_at", { ascending: true });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as TicketAssigneeRow[];
    const ids = list.map((r) => r.staff_user_id).filter((x): x is string => !!x);
    if (ids.length === 0) return list;
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const byId = new Map(users.users.map((u) => [u.id, u]));
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id, full_name").in("id", ids);
    const profById = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return list.map((r) => ({
      ...r,
      email: r.staff_user_id ? byId.get(r.staff_user_id)?.email ?? null : r.invited_email,
      full_name: r.staff_user_id ? (profById.get(r.staff_user_id) as any)?.full_name ?? null : null,
    }));
  });

export const listAssignableStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: roles }, { data: deptRoles }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id"),
      supabaseAdmin.from("department_roles").select("user_id"),
    ]);
    const ids = Array.from(new Set([
      ...((roles ?? []).map((r: any) => r.user_id as string)),
      ...((deptRoles ?? []).map((r: any) => r.user_id as string)),
    ]));
    if (ids.length === 0) return [];
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const byId = new Map(users.users.map((u) => [u.id, u]));
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id, full_name").in("id", ids);
    const profById = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return ids
      .map((id) => ({
        user_id: id,
        email: byId.get(id)?.email ?? null,
        full_name: (profById.get(id) as any)?.full_name ?? null,
      }))
      .filter((u) => !!u.email)
      .sort((a, b) => (a.full_name ?? a.email!).localeCompare(b.full_name ?? b.email!));
  });

export const assignTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ticket_id: z.string().uuid(),
      staff_user_id: z.string().uuid().nullable().optional(),
      email: z.string().trim().email().max(255).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    if (!data.staff_user_id && !data.email) throw new Error("Provide a staff user or email");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let staffId = data.staff_user_id ?? null;
    let invitedEmail: string | null = null;
    if (!staffId && data.email) {
      const targetEmail = data.email.toLowerCase();
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const existing = users.users.find((u) => u.email?.toLowerCase() === targetEmail);
      if (existing) staffId = existing.id;
      else invitedEmail = data.email;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("ticket_assignees")
      .insert({
        ticket_id: data.ticket_id,
        staff_user_id: staffId,
        invited_email: invitedEmail,
        assigned_by: context.userId,
        accepted_at: staffId ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error) {
      if ((error as any).code === "23505") return { ok: true as const, already: true };
      throw new Error(error.message);
    }

    // If we resolved to a real user, grant scoped staff + dept access now.
    if (staffId) {
      const { error: grantErr } = await supabaseAdmin.rpc("grant_assignee_access", {
        _ticket_id: data.ticket_id,
        _user_id: staffId,
      });
      if (grantErr) console.error("grant_assignee_access failed", grantErr.message);
    }
    return { ok: true as const, id: inserted?.id as string | undefined };
  });

// --- STAFF: tickets where I am an accepted assignee -----------------------
export const listTicketsAssignedToMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ticket_assignees")
      .select(
        "ticket_id, ticket:tickets!ticket_assignees_ticket_id_fkey(id, user_id, category_id, description, location_address, latitude, longitude, photo_url, status, assigned_department_id, created_at, updated_at, category:issue_categories(id, name, icon, description, default_department_id), department:departments!tickets_assigned_department_id_fkey(id, name))",
      )
      .eq("staff_user_id", context.userId)
      .not("accepted_at", "is", null);
    if (error) throw new Error(error.message);
    const tickets = ((data ?? []) as any[])
      .map((r) => r.ticket as TicketRow | null)
      .filter((t): t is TicketRow => !!t);
    return { tickets };
  });

export const countMyOpenAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ticket_assignees")
      .select("ticket:tickets!ticket_assignees_ticket_id_fkey(status)")
      .eq("staff_user_id", context.userId)
      .not("accepted_at", "is", null);
    if (error) throw new Error(error.message);
    let open = 0;
    let in_progress = 0;
    for (const row of (data ?? []) as any[]) {
      const status = row.ticket?.status as string | undefined;
      if (!status || status === "resolved") continue;
      if (status === "in_progress") in_progress += 1;
      else open += 1;
    }
    return { open, in_progress, total: open + in_progress };
  });

export const unassignTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ticket_assignees").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// =========================================================================
// === DUPLICATE LINKING ===================================================
// =========================================================================
export type DuplicateCandidate = TicketRow & { distance_m: number | null };

export const findPossibleDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ticket_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: source, error } = await supabaseAdmin
      .from("tickets")
      .select("id, category_id, latitude, longitude, created_at")
      .eq("id", data.ticket_id).single();
    if (error) throw new Error(error.message);

    const sinceDays = 30;
    const sourceTs = new Date(source.created_at as string).getTime();
    const since = new Date(sourceTs - sinceDays * 86400000).toISOString();
    const until = new Date(sourceTs + sinceDays * 86400000).toISOString();

    let q = supabaseAdmin
      .from("tickets")
      .select("id, user_id, category_id, description, location_address, latitude, longitude, photo_url, status, assigned_department_id, created_at, updated_at, category:issue_categories(id, name, icon, description, default_department_id)")
      .eq("category_id", source.category_id as string)
      .neq("id", data.ticket_id)
      .neq("status", "resolved")
      .gte("created_at", since)
      .lte("created_at", until)
      .order("created_at", { ascending: false })
      .limit(50);

    if (source.latitude != null && source.longitude != null) {
      const d = 0.003;
      q = q
        .gte("latitude", (source.latitude as number) - d)
        .lte("latitude", (source.latitude as number) + d)
        .gte("longitude", (source.longitude as number) - d)
        .lte("longitude", (source.longitude as number) + d);
    }
    const { data: rows } = await q;

    const sLat = source.latitude as number | null;
    const sLng = source.longitude as number | null;
    const cands: DuplicateCandidate[] = (rows ?? []).map((t: any) => {
      let dist: number | null = null;
      if (sLat != null && sLng != null && t.latitude != null && t.longitude != null) {
        const dx = (t.longitude - sLng) * 111000 * Math.cos((sLat * Math.PI) / 180);
        const dy = (t.latitude - sLat) * 111000;
        dist = Math.round(Math.sqrt(dx * dx + dy * dy));
      }
      return { ...t, distance_m: dist };
    });
    cands.sort((a, b) => (a.distance_m ?? 1e9) - (b.distance_m ?? 1e9));

    const { data: dupes } = await supabaseAdmin
      .from("ticket_duplicates")
      .select("id, primary_ticket_id, duplicate_ticket_id, linked_at")
      .or(`primary_ticket_id.eq.${data.ticket_id},duplicate_ticket_id.eq.${data.ticket_id}`);

    return { candidates: cands, links: dupes ?? [] };
  });

export const linkDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      primary_ticket_id: z.string().uuid(),
      duplicate_ticket_id: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    if (data.primary_ticket_id === data.duplicate_ticket_id) {
      throw new Error("A ticket cannot duplicate itself");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ticket_duplicates").insert({
      primary_ticket_id: data.primary_ticket_id,
      duplicate_ticket_id: data.duplicate_ticket_id,
      linked_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const unlinkDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ticket_duplicates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// =========================================================================
// === COST LINE ITEMS =====================================================
// =========================================================================
export type TicketCostRow = {
  id: string;
  ticket_id: string;
  kind: "labor" | "materials" | "equipment" | "other";
  description: string | null;
  hours: number | null;
  rate: number | null;
  amount: number;
  incurred_on: string;
  logged_by: string | null;
  created_at: string;
};

export const listTicketCosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ticket_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("ticket_costs")
      .select("id, ticket_id, kind, description, hours, rate, amount, incurred_on, logged_by, created_at")
      .eq("ticket_id", data.ticket_id)
      .order("incurred_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as TicketCostRow[];
  });

export const addTicketCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ticket_id: z.string().uuid(),
      kind: z.enum(["labor", "materials", "equipment", "other"]),
      description: z.string().max(500).nullable().optional(),
      hours: z.number().min(0).max(1000).nullable().optional(),
      rate: z.number().min(0).max(10000).nullable().optional(),
      amount: z.number().min(0).max(1000000),
      incurred_on: z.string().max(20).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ticket_costs").insert({
      ticket_id: data.ticket_id,
      kind: data.kind,
      description: data.description ?? null,
      hours: data.hours ?? null,
      rate: data.rate ?? null,
      amount: data.amount,
      incurred_on: data.incurred_on || new Date().toISOString().slice(0, 10),
      logged_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteTicketCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ticket_costs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// =========================================================================
// === STAFF: my assigned tickets ==========================================
// =========================================================================
export const listMyAssignedTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: assigns } = await supabaseAdmin
      .from("ticket_assignees")
      .select("ticket_id")
      .eq("staff_user_id", context.userId);
    const ids = Array.from(new Set((assigns ?? []).map((a: any) => a.ticket_id as string)));
    if (ids.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .select("id, status, description, location_address, photo_url, created_at, category:issue_categories(id, name)")
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

export const listDepartmentsForStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("departments").select("id, name").order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string }[];
  });
