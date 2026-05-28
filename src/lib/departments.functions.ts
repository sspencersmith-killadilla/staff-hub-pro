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

    const [sessionsRes, roomsRes, venueRoomsRes] = await Promise.all([
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
    ]);

    if (sessionsRes.error) throw new Error(sessionsRes.error.message);
    if (roomsRes.error) throw new Error(roomsRes.error.message);
    if (venueRoomsRes.error) throw new Error(venueRoomsRes.error.message);
    const roomsById = new Map<string, any>();
    for (const room of [...(roomsRes.data ?? []), ...(venueRoomsRes.data ?? [])]) {
      roomsById.set(String((room as any).id), room);
    }

    return {
      department: dept as Department,
      events: sessionsRes.data ?? [],
      rooms: Array.from(roomsById.values()),
    };
  });
