import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "./staff-guard";

// City-controlled events live in the `sessions` table.
// Community events live in the `events` table (see community.functions.ts).

const sessionInput = z.object({
  title: z.string().min(1),
  event_type: z.string().optional().nullable(),
  featured_guest: z.string().optional().nullable(), // -> speaker_name
  venue_id: z.number().int().nullable().optional(), // ignored (sessions has no venue_id)
  stage_id: z.string().uuid().nullable().optional(),
  room_id: z.string().uuid().nullable().optional(), // ignored
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(), // ignored
  end_date: z.string().nullable().optional(), // ignored
  description: z.string().optional().nullable(), // ignored
  image_url: z.string().optional().nullable(),
  open_to_vendors: z.boolean().optional(), // -> accepts_vendors
});

function toSessionRow(data: z.infer<typeof sessionInput>) {
  const row: Record<string, unknown> = {
    title: data.title,
    event_type: data.event_type ?? null,
    speaker_name: data.featured_guest ?? null,
    stage_id: data.stage_id ?? null,
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
      .select("*, stages(id,name)")
      .order("start_time", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromSessionRow);
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => sessionInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
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
    const patch = toSessionRow({ title: "x", ...data.patch } as any);
    // Drop title if not in original patch
    if (!("title" in data.patch)) delete (patch as any).title;
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
