import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "./staff-guard";

// ---------- Orgs ----------

export const listOrgsStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("community_organizations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setOrgStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected"]),
        staff_notes: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("community_organizations")
      .update({ status: data.status, staff_notes: data.staff_notes ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Events ----------

export const listCommunityEventsStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("community_events")
      .select("*")
      .order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const orgIds = Array.from(new Set(rows.map((r) => r.org_id).filter(Boolean)));
    const locIds = Array.from(
      new Set(rows.map((r) => r.location_id).filter(Boolean)),
    );
    const [orgsRes, locsRes] = await Promise.all([
      orgIds.length
        ? supabaseAdmin
            .from("community_organizations")
            .select("id, name, contact_email, status")
            .in("id", orgIds)
        : Promise.resolve({ data: [] as any[] }),
      locIds.length
        ? supabaseAdmin
            .from("community_event_locations")
            .select("id, name, address, city")
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
  });

export const setCommunityEventStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected", "cancelled"]),
        staff_notes: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("community_events")
      .update({ status: data.status, staff_notes: data.staff_notes ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCommunityEventStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("community_events")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
