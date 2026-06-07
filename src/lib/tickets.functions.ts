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
