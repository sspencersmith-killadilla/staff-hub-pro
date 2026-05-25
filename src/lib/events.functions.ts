import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "./staff-guard";

const eventInput = z.object({
  title: z.string().min(1),
  event_type: z.string().optional().nullable(),
  featured_guest: z.string().optional().nullable(),
  venue_id: z.number().int().nullable().optional(),
  stage_id: z.string().uuid().nullable().optional(),
  room_id: z.string().uuid().nullable().optional(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  description: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  open_to_vendors: z.boolean().optional(),
});

export const listEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("events")
      .select("*, venues(id,name), stages(id,name), rooms(id,name)")
      .order("start_time", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => eventInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const payload: Record<string, unknown> = { ...data, submitted_by: context.userId };
    if (data.start_time) payload.start_date = data.start_time.slice(0, 10);
    if (data.end_time) payload.end_date = data.end_time.slice(0, 10);
    const { data: row, error } = await supabaseAdmin
      .from("events")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), patch: eventInput.partial() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("events")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
