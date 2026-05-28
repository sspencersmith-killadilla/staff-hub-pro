import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listPublicClasses = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z
      .object({
        departmentId: z.string().uuid().nullable().optional(),
        includePast: z.boolean().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const nowIso = new Date().toISOString();
    let courseQ = supabaseAdmin
      .from("courses")
      .select("id,title,description,price,department_id,image_url");
    if (data.departmentId) courseQ = courseQ.eq("department_id", data.departmentId);
    const { data: courses, error: cErr } = await courseQ;
    if (cErr) throw new Error(cErr.message);

    const courseIds = (courses ?? []).map((c: any) => c.id);
    if (courseIds.length === 0)
      return { courses: [], sessionsByCourse: {} as Record<string, any[]> };

    let sessQ = supabaseAdmin
      .from("course_sessions")
      .select(
        "id, course_id, room_id, start_time, end_time, capacity, instructor_name, rooms(name, venue_id, venues(name))",
      )
      .in("course_id", courseIds)
      .order("start_time", { ascending: true });
    if (!data.includePast) sessQ = sessQ.gte("end_time", nowIso);
    const { data: sessions, error: sErr } = await sessQ;
    if (sErr) throw new Error(sErr.message);

    const sessionIds = (sessions ?? []).map((s: any) => s.id);
    let enrollCounts: Record<string, number> = {};
    if (sessionIds.length) {
      const { data: enrolls } = await supabaseAdmin
        .from("enrollments")
        .select("session_id")
        .in("session_id", sessionIds)
        .in("payment_status", ["paid", "free", "pending"]);
      for (const e of enrolls ?? []) {
        const k = (e as any).session_id as string;
        enrollCounts[k] = (enrollCounts[k] ?? 0) + 1;
      }
    }

    const depIds = Array.from(
      new Set((courses ?? []).map((c: any) => c.department_id).filter(Boolean)),
    );
    const { data: depts } = depIds.length
      ? await supabaseAdmin
          .from("departments")
          .select("id,name")
          .in("id", depIds)
      : { data: [] as any[] };
    const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));

    const sessionsByCourse: Record<string, any[]> = {};
    for (const s of sessions ?? []) {
      const enrolled = enrollCounts[(s as any).id] ?? 0;
      const row = {
        id: (s as any).id,
        start_time: (s as any).start_time,
        end_time: (s as any).end_time,
        capacity: (s as any).capacity,
        enrolled,
        seats_left: Math.max(0, (s as any).capacity - enrolled),
        room_name: (s as any).rooms?.name ?? null,
        venue_name: (s as any).rooms?.venues?.name ?? null,
        instructor_name: (s as any).instructor_name ?? null,
      };
      (sessionsByCourse[(s as any).course_id] ??= []).push(row);
    }

    const result = (courses ?? []).map((c: any) => ({
      ...c,
      department_name: c.department_id ? deptMap.get(c.department_id) ?? null : null,
      sessions: sessionsByCourse[c.id] ?? [],
    }));
    return { courses: result, sessionsByCourse };
  });

export const getPublicClass = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: course, error } = await supabaseAdmin
      .from("courses")
      .select("id,title,description,price,department_id,image_url")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!course) throw new Error("Class not found");

    const { data: sessions } = await supabaseAdmin
      .from("course_sessions")
      .select(
        "id, room_id, start_time, end_time, capacity, instructor_name, rooms(name, venue_id, venues(name))",
      )
      .eq("course_id", data.id)
      .gte("end_time", new Date().toISOString())
      .order("start_time", { ascending: true });

    const sessionIds = (sessions ?? []).map((s: any) => s.id);
    let enrollCounts: Record<string, number> = {};
    if (sessionIds.length) {
      const { data: enrolls } = await supabaseAdmin
        .from("enrollments")
        .select("session_id")
        .in("session_id", sessionIds)
        .in("payment_status", ["paid", "free", "pending"]);
      for (const e of enrolls ?? []) {
        const k = (e as any).session_id as string;
        enrollCounts[k] = (enrollCounts[k] ?? 0) + 1;
      }
    }

    let department_name: string | null = null;
    if (course.department_id) {
      const { data: d } = await supabaseAdmin
        .from("departments")
        .select("name")
        .eq("id", course.department_id)
        .maybeSingle();
      department_name = d?.name ?? null;
    }

    return {
      ...course,
      department_name,
      sessions: (sessions ?? []).map((s: any) => ({
        id: s.id,
        start_time: s.start_time,
        end_time: s.end_time,
        capacity: s.capacity,
        enrolled: enrollCounts[s.id] ?? 0,
        seats_left: Math.max(0, s.capacity - (enrollCounts[s.id] ?? 0)),
        room_name: s.rooms?.name ?? null,
        venue_name: s.rooms?.venues?.name ?? null,
        instructor_name: s.instructor_name ?? null,
      })),
    };
  });

export const listDepartmentsForFilter = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("departments")
      .select("id,name")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
