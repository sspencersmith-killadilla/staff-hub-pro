import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Department = {
  id: string;
  name: string;
  logo_url: string | null;
  brand_css: Record<string, string> | null;
  room_policy_text: string | null;
};

export type DepartmentMembership = {
  department: Department;
  role: "super_admin" | "dept_admin" | "staff";
};

/** Returns the departments the current user belongs to via department_roles. */
export const getMyDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DepartmentMembership[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("department_roles")
      .select("role, department:departments(id, name, logo_url, brand_css, room_policy_text)")
      .eq("user_id", userId);
    if (error) {
      // If table missing (migration not yet applied) return empty list rather than failing app shell.
      if (/relation .* does not exist/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? [])
      .filter((r: any) => r.department)
      .map((r: any) => ({
        role: r.role,
        department: r.department as Department,
      }));
  });

/** Public department hub data — department info + upcoming events + rooms scoped to it. */
export const getDepartmentHub = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const nowIso = new Date().toISOString();

    const { data: dept, error: deptErr } = await supabaseAdmin
      .from("departments")
      .select("id, name, logo_url, brand_css, room_policy_text")
      .eq("id", data.id)
      .maybeSingle();
    if (deptErr) throw new Error(deptErr.message);
    if (!dept) throw new Error("Department not found");

    const [sessionsRes, roomsRes, venueRoomsRes, deptStagesRes] = await Promise.all([
      supabaseAdmin
        .from("sessions")
        .select("id, title, start_time, end_time, image_url, focal_x, focal_y")
        .eq("department_id", data.id)
        .gte("start_time", nowIso)
        .order("start_time", { ascending: true })
        .limit(24),
      supabaseAdmin
        .from("rooms")
        .select("id, name, capacity, image_url, instant_bookable, venue:venues(id, name, city)")
        .eq("department_id", data.id)
        .limit(24),
      supabaseAdmin
        .from("rooms")
        .select("id, name, capacity, image_url, instant_bookable, venue:venues!inner(id, name, city, department_id)")
        .eq("venues.department_id", data.id)
        .limit(24),
      // Stages whose venue belongs to this department — used to scope streetbeats gigs.
      supabaseAdmin
        .from("stages")
        .select("id, name, venue:venues!inner(id, name, department_id)")
        .eq("venues.department_id", data.id),
    ]);

    if (sessionsRes.error) throw new Error(sessionsRes.error.message);
    if (roomsRes.error) throw new Error(roomsRes.error.message);
    if (venueRoomsRes.error) throw new Error(venueRoomsRes.error.message);
    if (deptStagesRes.error) throw new Error(deptStagesRes.error.message);
    const roomsById = new Map<string, any>();
    for (const room of [...(roomsRes.data ?? []), ...(venueRoomsRes.data ?? [])]) {
      roomsById.set(String((room as any).id), room);
    }

    // Streetbeats gigs scoped to stages owned by this department.
    const stageIds = (deptStagesRes.data ?? []).map((s: any) => s.id);
    const stagesById = new Map<string, any>(
      (deptStagesRes.data ?? []).map((s: any) => [s.id, s]),
    );
    let gigs: any[] = [];
    if (stageIds.length) {
      const { data: slotRows, error: slotsErr } = await supabaseAdmin
        .from("slots")
        .select("id, title, start_time, end_time, stage_id, artist_id, is_booked")
        .in("stage_id", stageIds as any)
        .gte("end_time", nowIso)
        .order("start_time", { ascending: true })
        .limit(48);
      if (slotsErr) throw new Error(slotsErr.message);
      const artistIds = Array.from(
        new Set((slotRows ?? []).map((s: any) => s.artist_id).filter(Boolean)),
      );
      const artistsRes = artistIds.length
        ? await supabaseAdmin
            .from("artists")
            .select("id, full_name, avatar_url, genre")
            .in("id", artistIds as any)
        : { data: [] as any[] };
      const artistsById = new Map((artistsRes.data ?? []).map((a: any) => [a.id, a]));
      gigs = (slotRows ?? []).map((s: any) => {
        const stage = stagesById.get(s.stage_id);
        const artist = s.artist_id ? artistsById.get(s.artist_id) : null;
        return {
          id: String(s.id),
          title: s.title ?? "Open slot",
          start_time: s.start_time,
          end_time: s.end_time,
          status: s.is_booked ? "claimed" : "open",
          stage: stage ? { id: stage.id, name: stage.name } : null,
          venue: stage?.venue ? { id: stage.venue.id, name: stage.venue.name } : null,
          artist: artist
            ? {
                id: artist.id,
                full_name: artist.full_name,
                avatar_url: artist.avatar_url ?? null,
                genre: artist.genre ?? null,
              }
            : null,
        };
      });
    }

    return {
      department: dept as Department,
      events: sessionsRes.data ?? [],
      rooms: Array.from(roomsById.values()),
      gigs,
    };
  });
