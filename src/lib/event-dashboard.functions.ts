import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "./staff-guard";

const idIn = z.object({ id: z.string().uuid() });

export const getEventDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idIn.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const id = data.id;
    const [
      sess, att, tal, vol, tt, vt, st, v, sp, gigs, stages,
    ] = await Promise.all([
      supabaseAdmin.from("sessions").select("*, stages(*)").eq("id", id).maybeSingle(),
      supabaseAdmin
        .from("attendees")
        .select("*, ticket_tiers!inner(name, price, session_id)")
        .eq("ticket_tiers.session_id", id)
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("talent").select("*").eq("session_id", id).order("performance_start", { ascending: true }),
      supabaseAdmin.from("volunteers").select("*").eq("session_id", id).order("name", { ascending: true }),
      supabaseAdmin.from("ticket_tiers").select("*").eq("session_id", id),
      supabaseAdmin.from("vendor_tiers").select("*").eq("session_id", id).order("price", { ascending: false }),
      supabaseAdmin.from("sponsorship_tiers").select("*").eq("session_id", id).order("price", { ascending: false }),
      supabaseAdmin.from("vendors").select("*, vendor_tiers(name, price)").eq("session_id", id),
      supabaseAdmin.from("sponsors").select("*, sponsorship_tiers(name, price)").eq("session_id", id),
      supabaseAdmin
        .from("slots")
        .select("*, stages(*), profiles(full_name)")
        .eq("session_id", id)
        .order("start_time", { ascending: true }),
      supabaseAdmin.from("stages").select("*").order("name"),
    ]);

    return {
      session: sess.data ?? null,
      attendees: att.data ?? [],
      talent: tal.data ?? [],
      volunteers: vol.data ?? [],
      ticketTiers: tt.data ?? [],
      vendorTiers: vt.data ?? [],
      sponsorTiers: st.data ?? [],
      vendors: v.data ?? [],
      sponsors: sp.data ?? [],
      gigs: gigs.data ?? [],
      stages: stages.data ?? [],
    };
  });

// ─── Check-in ────────────────────────────────────────────────────────
export const toggleCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      id: z.string(),
      table: z.enum(["attendees", "volunteers"]),
      checked_in: z.boolean(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from(data.table)
      .update({ checked_in: data.checked_in })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Tickets ─────────────────────────────────────────────────────────
const ticketIn = z.object({
  session_id: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().default(0),
  capacity: z.number().int().default(0),
});

export const saveTicketTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid().optional(), patch: ticketIn }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = data.id
      ? await supabaseAdmin.from("ticket_tiers").update(data.patch).eq("id", data.id)
      : await supabaseAdmin.from("ticket_tiers").insert(data.patch);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTicketTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idIn.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin.from("ticket_tiers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Gigs (slots linked to a session) ────────────────────────────────
const gigIn = z.object({
  session_id: z.string().uuid(),
  title: z.string().optional().nullable(),
  stage_id: z.string().uuid().nullable().optional(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  inherit_time: z.boolean().default(false),
});

export const createGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => gigIn.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { data: gig, error } = await supabaseAdmin
      .from("slots")
      .insert({
        session_id: data.session_id,
        stage_id: data.stage_id ?? null,
        start_time: data.start_time ?? null,
        end_time: data.end_time ?? null,
        is_booked: false,
        inherit_time: data.inherit_time,
        title: data.title ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Mirror in Run-of-Show talent row
    await supabaseAdmin.from("talent").insert({
      session_id: data.session_id,
      name: "TBD – " + (data.title || "Community Gig"),
      role: "Community Gig",
      performance_start: data.start_time ?? null,
      load_in_time: data.start_time ?? null,
      cost: 0,
      rider_notes: `gig_id:${gig?.id}`,
    });

    return gig;
  });

export const unlinkGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.union([z.string(), z.number()]) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("slots")
      .update({ session_id: null, inherit_time: false })
      .eq("id", data.id as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.union([z.string(), z.number()]) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin.from("slots").delete().eq("id", data.id as any);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("talent").delete().ilike("rider_notes", `%gig_id:${data.id}%`);
    return { ok: true };
  });

// ─── Tiers: vendor / sponsor ─────────────────────────────────────────
export const addCommercialTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      kind: z.enum(["vendor", "sponsor"]),
      session_id: z.string().uuid(),
      name: z.string().min(1),
      price: z.number().default(0),
      capacity: z.number().int().default(1),
      perks_description: z.string().optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const table = data.kind === "vendor" ? "vendor_tiers" : "sponsorship_tiers";
    const row: Record<string, unknown> = {
      session_id: data.session_id,
      name: data.name,
      price: data.price,
      capacity: data.capacity,
    };
    if (data.kind === "sponsor") row.perks_description = data.perks_description ?? null;
    const { error } = await supabaseAdmin.from(table).insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Talent ──────────────────────────────────────────────────────────
const talentIn = z.object({
  session_id: z.string().uuid(),
  name: z.string().min(1),
  role: z.string().optional().nullable(),
  cost: z.number().default(0),
  performance_start: z.string().nullable().optional(),
  load_in_time: z.string().nullable().optional(),
  contact_name: z.string().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  rider_notes: z.string().optional().nullable(),
  status: z.string().default("contracted"),
});

export const saveTalent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid().optional(), patch: talentIn }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = data.id
      ? await supabaseAdmin.from("talent").update(data.patch).eq("id", data.id)
      : await supabaseAdmin.from("talent").insert(data.patch);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTalent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idIn.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin.from("talent").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Floorplan ───────────────────────────────────────────────────────
export const saveFloorplan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      data: z.any(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("sessions")
      .update({ interactive_map_data: data.data })
      .eq("id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
