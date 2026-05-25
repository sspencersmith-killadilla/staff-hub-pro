import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "./staff-guard";

const GIG_COLS =
  "id, title, description, venue_id, stage_id, event_id, location_label, starts_at, ends_at, status, claimed_by_artist_id, claimed_at, created_at";

const gigInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  venue_id: z.number().int().nullable().optional(),
  stage_id: z.string().uuid().nullable().optional(),
  event_id: z.string().uuid().nullable().optional(),
  location_label: z.string().trim().max(200).optional().nullable(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
});

// ---------- Artists ----------

export const listArtistsStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("streetbeats_artists")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setArtistStatus = createServerFn({ method: "POST" })
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
      .from("streetbeats_artists")
      .update({ status: data.status, staff_notes: data.staff_notes ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Gigs ----------

export const listGigsStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("streetbeats_gigs")
      .select(GIG_COLS)
      .order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);
    const gigs = data ?? [];
    const venueIds = Array.from(
      new Set(gigs.map((g) => g.venue_id).filter(Boolean)),
    );
    const artistIds = Array.from(
      new Set(gigs.map((g) => g.claimed_by_artist_id).filter(Boolean)),
    );
    const [venuesRes, artistsRes] = await Promise.all([
      venueIds.length
        ? supabaseAdmin.from("venues").select("id, name").in("id", venueIds)
        : Promise.resolve({ data: [] as any[] }),
      artistIds.length
        ? supabaseAdmin
            .from("streetbeats_artists")
            .select("id, stage_name, contact_email")
            .in("id", artistIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const venues = new Map((venuesRes.data ?? []).map((v: any) => [v.id, v]));
    const artists = new Map(
      (artistsRes.data ?? []).map((a: any) => [a.id, a]),
    );
    return gigs.map((g) => ({
      ...g,
      venue: g.venue_id ? venues.get(g.venue_id) ?? null : null,
      artist: g.claimed_by_artist_id
        ? artists.get(g.claimed_by_artist_id) ?? null
        : null,
    }));
  });

export const createGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => gigInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    if (new Date(data.ends_at) <= new Date(data.starts_at)) {
      throw new Error("End must be after start");
    }
    const { error } = await supabaseAdmin.from("streetbeats_gigs").insert({
      ...data,
      created_by: context.userId,
      status: "open",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    gigInput.extend({ id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { id, ...rest } = data;
    if (new Date(rest.ends_at) <= new Date(rest.starts_at)) {
      throw new Error("End must be after start");
    }
    const { error } = await supabaseAdmin
      .from("streetbeats_gigs")
      .update(rest)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("streetbeats_gigs")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setGigStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["open", "claimed", "cancelled", "completed"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const patch: any = { status: data.status };
    if (data.status === "open") {
      patch.claimed_by_artist_id = null;
      patch.claimed_at = null;
    }
    const { error } = await supabaseAdmin
      .from("streetbeats_gigs")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listVenuesForGigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("venues")
      .select("id, name")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
