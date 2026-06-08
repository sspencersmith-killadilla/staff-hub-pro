import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaff, isAdmin, getUserDepartmentIds } from "./staff-guard";

export type AssetType =
  | "streetlight" | "sign" | "hydrant" | "bench" | "tree"
  | "playground" | "sidewalk" | "road" | "park" | "building" | "other";

export type Asset = {
  id: string;
  name: string;
  asset_type: AssetType;
  external_ref: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  install_date: string | null;
  department_id: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  department?: { id: string; name: string } | null;
};

// ---- List & search ------------------------------------------------------
export const listAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      search: z.string().max(200).optional(),
      asset_type: z.string().max(40).optional(),
      department_id: z.string().uuid().nullable().optional(),
    }).optional().parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("assets")
      .select(
        "id, name, asset_type, external_ref, address, latitude, longitude, install_date, department_id, notes, active, created_at, updated_at, department:departments!assets_department_id_fkey(id, name)",
      )
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(500);
    if (data?.search) q = q.ilike("name", `%${data.search}%`);
    if (data?.asset_type) q = q.eq("asset_type", data.asset_type);
    if (data?.department_id) q = q.eq("department_id", data.department_id);

    if (!(await isAdmin(context.userId))) {
      const depts = Array.from(await getUserDepartmentIds(context.userId));
      if (depts.length > 0) {
        q = q.or(`department_id.is.null,department_id.in.(${depts.join(",")})`);
      }
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as Asset[];
  });

const assetInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  asset_type: z.string().min(1).max(40),
  external_ref: z.string().max(120).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  install_date: z.string().max(20).nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});

export const upsertAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => assetInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      name: data.name,
      asset_type: data.asset_type,
      external_ref: data.external_ref ?? null,
      address: data.address ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      install_date: data.install_date || null,
      department_id: data.department_id ?? null,
      notes: data.notes ?? null,
      active: data.active ?? true,
    };
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("assets").update(payload).eq("id", data.id)
        .select("id").single();
      if (error) throw new Error(error.message);
      return { id: row.id as string };
    }
    const { data: row, error } = await supabaseAdmin
      .from("assets").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

// ---- Auto-suggest nearest assets for a ticket --------------------------
export const suggestAssetsForTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      asset_type: z.string().max(40).optional(),
      limit: z.number().int().min(1).max(20).default(5),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Bounding box ~0.005 deg ≈ 500m
    const dLat = 0.005;
    const dLng = 0.005;
    let q = supabaseAdmin
      .from("assets")
      .select("id, name, asset_type, address, latitude, longitude, department_id")
      .eq("active", true)
      .gte("latitude", data.latitude - dLat).lte("latitude", data.latitude + dLat)
      .gte("longitude", data.longitude - dLng).lte("longitude", data.longitude + dLng);
    if (data.asset_type) q = q.eq("asset_type", data.asset_type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const withDist = (rows ?? []).map((a: any) => {
      const dx = ((a.longitude ?? 0) - data.longitude) * 111000 * Math.cos(data.latitude * Math.PI / 180);
      const dy = ((a.latitude ?? 0) - data.latitude) * 111000;
      return { ...a, distance_m: Math.round(Math.sqrt(dx * dx + dy * dy)) };
    });
    withDist.sort((a, b) => a.distance_m - b.distance_m);
    return withDist.slice(0, data.limit);
  });

export const linkAssetToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ticket_id: z.string().uuid(),
      asset_id: z.string().uuid().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tickets").update({ asset_id: data.asset_id }).eq("id", data.ticket_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---- Asset history -----------------------------------------------------
export const getAssetHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ asset_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: asset, error: aerr } = await supabaseAdmin
      .from("assets")
      .select("id, name, asset_type, external_ref, address, latitude, longitude, install_date, department_id, notes, active, created_at, updated_at, department:departments!assets_department_id_fkey(id, name)")
      .eq("id", data.asset_id)
      .single();
    if (aerr) throw new Error(aerr.message);

    const { data: tickets } = await supabaseAdmin
      .from("tickets")
      .select("id, description, status, created_at, updated_at, category:issue_categories(id, name)")
      .eq("asset_id", data.asset_id)
      .order("created_at", { ascending: false });

    const ids = (tickets ?? []).map((t: any) => t.id);
    let costs: any[] = [];
    if (ids.length > 0) {
      const { data: c } = await supabaseAdmin
        .from("ticket_costs")
        .select("id, ticket_id, kind, description, hours, rate, amount, incurred_on")
        .in("ticket_id", ids);
      costs = c ?? [];
    }
    const totalCost = costs.reduce((s, c) => s + Number(c.amount ?? 0), 0);

    return {
      asset: asset as unknown as Asset,
      tickets: (tickets ?? []) as any[],
      costs,
      total_cost: totalCost,
    };
  });
