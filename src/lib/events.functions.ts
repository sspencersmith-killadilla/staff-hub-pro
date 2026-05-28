import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff, assertCanManageDepartment, isAdmin, getUserDepartmentIds } from "./staff-guard";

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
  focal_x: z.number().int().min(0).max(100).optional(),
  focal_y: z.number().int().min(0).max(100).optional(),
  open_to_vendors: z.boolean().optional(),
  department_id: z.string().uuid().nullable().optional(),
  staff_owner_id: z.string().uuid().nullable().optional(),
  staff_owner_name: z.string().trim().max(200).nullable().optional(),
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
    focal_x: data.focal_x ?? 50,
    focal_y: data.focal_y ?? 50,
    accepts_vendors: data.open_to_vendors ?? false,
    department_id: data.department_id ?? null,
    staff_owner_id: data.staff_owner_id ?? null,
    staff_owner_name: data.staff_owner_name ?? null,
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
  .inputValidator((i) =>
    z
      .object({ departmentId: z.string().uuid().nullable().optional(), includeAll: z.boolean().optional() })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const admin = await isAdmin(context.userId);
    let q = supabaseAdmin
      .from("sessions")
      .select("*, stages(id,name), rooms(id,name)")
      .order("start_time", { ascending: true, nullsFirst: false });
    if (data.departmentId && !(admin && data.includeAll)) {
      q = q.eq("department_id", data.departmentId);
    } else if (!admin) {
      // Non-admin without explicit dept: restrict to their departments.
      const ids = Array.from(await getUserDepartmentIds(context.userId));
      if (ids.length === 0) return [];
      q = q.in("department_id", ids);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map(fromSessionRow);
  });

export const listAllStaffProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["staff", "admin"]);
    if (roleError) throw new Error(roleError.message);
    const userIds = Array.from(new Set((roles ?? []).map((r: any) => r.user_id).filter(Boolean)));
    if (userIds.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds)
      .order("full_name", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAssignableDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("departments")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listEventLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ departmentId: z.string().uuid().nullable().optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    // Fetch ALL rooms/stages/venues, then filter by department on the server
    // using BOTH the room's own department_id and its parent venue's
    // department_id. Older rooms/stages may not have department_id set
    // directly but belong to a venue that does — without the venue fallback
    // those rooms wouldn't show up in the events dashboard dropdowns.
    const [rooms, stages, venues] = await Promise.all([
      supabaseAdmin.from("rooms").select("id, name, venue_id, department_id").order("name"),
      supabaseAdmin.from("stages").select("id, name, venue_id").order("name"),
      supabaseAdmin.from("venues").select("id, name, department_id"),
    ]);
    if (rooms.error) throw new Error(rooms.error.message);
    if (stages.error) throw new Error(stages.error.message);
    if (venues.error) throw new Error(venues.error.message);
    const venueName = new Map((venues.data ?? []).map((v: any) => [v.id, v.name]));
    const venueDept = new Map((venues.data ?? []).map((v: any) => [v.id, v.department_id]));
    const deptId = data.departmentId ?? null;
    const roomRows = deptId
      ? (rooms.data ?? []).filter(
          (r: any) => r.department_id === deptId || venueDept.get(r.venue_id) === deptId,
        )
      : (rooms.data ?? []);
    const stageRows = deptId
      ? (stages.data ?? []).filter((s: any) => venueDept.get(s.venue_id) === deptId)
      : (stages.data ?? []);
    return {
      rooms: roomRows.map((r: any) => ({
        id: r.id,
        name: r.name,
        venue_name: venueName.get(r.venue_id) ?? null,
      })),
      stages: stageRows.map((s: any) => ({
        id: s.id,
        name: s.name,
        venue_name: venueName.get(s.venue_id) ?? null,
      })),
    };
  });


/** Users assigned to a department via department_roles — used to pick a staff owner. */
export const listDepartmentStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ departmentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { data: roles, error } = await supabaseAdmin
      .from("department_roles")
      .select("user_id, role")
      .eq("department_id", data.departmentId);
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    const userIds = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (userIds.length === 0) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    const profById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return userIds.map((id) => {
      const p: any = profById.get(id) ?? {};
      const roleList = (roles ?? []).filter((r: any) => r.user_id === id).map((r: any) => r.role);
      return {
        user_id: id,
        full_name: p.full_name ?? null,
        email: p.email ?? null,
        roles: roleList,
      };
    });
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => sessionInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    assertRoomOrStage(data);
    await assertCanManageDepartment(context.userId, data.department_id ?? null);
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
    // Fetch existing row for cross-dept guard + room/stage XOR check.
    const { data: existing } = await supabaseAdmin
      .from("sessions")
      .select("room_id, stage_id, department_id")
      .eq("id", data.id)
      .maybeSingle();
    // Guard: caller must own the existing department AND, if reassigning, the target one too.
    await assertCanManageDepartment(context.userId, existing?.department_id ?? null);
    if ("department_id" in data.patch) {
      await assertCanManageDepartment(context.userId, data.patch.department_id ?? null);
    }
    if ("room_id" in data.patch || "stage_id" in data.patch) {
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
    if (!("event_type" in data.patch)) delete (patch as any).event_type;
    if (!("featured_guest" in data.patch)) delete (patch as any).speaker_name;
    if (!("room_id" in data.patch)) delete (patch as any).room_id;
    if (!("stage_id" in data.patch)) delete (patch as any).stage_id;
    if (!("start_time" in data.patch)) delete (patch as any).start_time;
    if (!("end_time" in data.patch)) delete (patch as any).end_time;
    if (!("image_url" in data.patch)) delete (patch as any).image_url;
    if (!("focal_x" in data.patch)) delete (patch as any).focal_x;
    if (!("focal_y" in data.patch)) delete (patch as any).focal_y;
    if (!("open_to_vendors" in data.patch)) delete (patch as any).accepts_vendors;
    if (!("department_id" in data.patch)) delete (patch as any).department_id;
    if (!("staff_owner_id" in data.patch)) delete (patch as any).staff_owner_id;
    if (!("staff_owner_name" in data.patch)) delete (patch as any).staff_owner_name;
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
    const { data: existing } = await supabaseAdmin
      .from("sessions")
      .select("department_id")
      .eq("id", data.id)
      .maybeSingle();
    await assertCanManageDepartment(context.userId, existing?.department_id ?? null);
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
