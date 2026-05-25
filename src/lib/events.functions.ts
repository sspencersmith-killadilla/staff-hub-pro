import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "./staff-guard";

// City-controlled events live in the `sessions` table.
// Each session attaches to EITHER a room OR a stage — exactly one — so
// that room reservations and gigs can detect the conflict.

const sessionInput = z.object({
  title: z.string().min(1),
  event_type: z.string().optional().nullable(),
  featured_guest: z.string().optional().nullable(),
  stage_id: z.string().uuid().nullable().optional(),
  room_id: z.string().uuid().nullable().optional(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  image_url: z.string().optional().nullable(),
  open_to_vendors: z.boolean().optional(),
});

type SessionInput = z.infer<typeof sessionInput>;

function assertRoomOrStage(data: { room_id?: string | null; stage_id?: string | null }) {
  const r = data.room_id || null;
  const s = data.stage_id || null;
  if (!r && !s) throw new Error("Pick a room or a stage for this event");
  if (r && s) throw new Error("Pick only one of room or stage, not both");
}

function toSessionRow(data: SessionInput) {
  const row: Record<string, unknown> = {
    title: data.title,
    event_type: data.event_type ?? null,
    speaker_name: data.featured_guest ?? null,
    stage_id: data.stage_id ?? null,
    room_id: data.room_id ?? null,
    start_time: data.start_time ?? null,
    end_time: data.end_time ?? null,
    image_url: data.image_url ?? null,
    accepts_vendors: data.open_to_vendors ?? false,
  };
  return row;
}

function fromSessionRow(row: any) {
  if (!row) return row;
  return {
    ...row,
    featured_guest: row.speaker_name ?? null,
    open_to_vendors: row.accepts_vendors ?? false,
    venues: null,
  };
}

export const listEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("sessions")
      .select("*, stages(id,name), rooms(id,name)")
      .order("start_time", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromSessionRow);
  });

export const listEventLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const [rooms, stages, venues] = await Promise.all([
      supabaseAdmin.from("rooms").select("id, name, venue_id").order("name"),
      supabaseAdmin.from("stages").select("id, name, venue_id").order("name"),
      supabaseAdmin.from("venues").select("id, name"),
    ]);
    if (rooms.error) throw new Error(rooms.error.message);
    if (stages.error) throw new Error(stages.error.message);
    if (venues.error) throw new Error(venues.error.message);
    const venueName = new Map((venues.data ?? []).map((v: any) => [v.id, v.name]));
    return {
      rooms: (rooms.data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        venue_name: venueName.get(r.venue_id) ?? null,
      })),
      stages: (stages.data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        venue_name: venueName.get(s.venue_id) ?? null,
      })),
    };
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => sessionInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    assertRoomOrStage(data);
    const { data: row, error } = await supabaseAdmin
      .from("sessions")
      .insert(toSessionRow(data))
      .select()
      .single();
    if (error) throw new Error(error.message);
    return fromSessionRow(row);
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), patch: sessionInput.partial() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    // If either room_id or stage_id appears in the patch, enforce XOR with the
    // existing row's other side.
    if ("room_id" in data.patch || "stage_id" in data.patch) {
      const { data: existing } = await supabaseAdmin
        .from("sessions")
        .select("room_id, stage_id")
        .eq("id", data.id)
        .maybeSingle();
      const merged = {
        room_id:
          "room_id" in data.patch ? data.patch.room_id ?? null : existing?.room_id ?? null,
        stage_id:
          "stage_id" in data.patch
            ? data.patch.stage_id ?? null
            : existing?.stage_id ?? null,
      };
      assertRoomOrStage(merged);
    }
    const patch = toSessionRow({ title: "x", ...data.patch } as SessionInput);
    if (!("title" in data.patch)) delete (patch as any).title;
    if (!("room_id" in data.patch)) delete (patch as any).room_id;
    if (!("stage_id" in data.patch)) delete (patch as any).stage_id;
    const { data: row, error } = await supabaseAdmin
      .from("sessions")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return fromSessionRow(row);
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin.from("sessions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Bulk CSV upsert ----------

const bulkRow = sessionInput.extend({
  id: z.string().uuid().optional().nullable(),
});

export const bulkUpsertEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ rows: z.array(bulkRow).min(1).max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const results: { ok: number; created: number; updated: number; errors: string[] } = {
      ok: 0,
      created: 0,
      updated: 0,
      errors: [],
    };
    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      try {
        assertRoomOrStage(row);
        const payload = toSessionRow(row);
        if (row.id) {
          const { error } = await supabaseAdmin
            .from("sessions")
            .update(payload)
            .eq("id", row.id);
          if (error) throw new Error(error.message);
          results.updated += 1;
        } else {
          const { error } = await supabaseAdmin.from("sessions").insert(payload);
          if (error) throw new Error(error.message);
          results.created += 1;
        }
        results.ok += 1;
      } catch (e: any) {
        results.errors.push(`Row ${i + 1} (${row.title ?? "untitled"}): ${e?.message ?? "failed"}`);
      }
    }
    return results;
  });
