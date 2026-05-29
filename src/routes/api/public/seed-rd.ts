import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// One-shot seed endpoint. Delete this file after use.
const SEED_TOKEN = "rd-seed-9f2a4e6b1c8d";

export const Route = createFileRoute("/api/public/seed-rd")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("token") !== SEED_TOKEN) {
          return new Response("forbidden", { status: 403 });
        }

        const log: Record<string, any> = {};

        // 1. Create or fetch auth user
        const email = "beta@tester.test";
        const password = "Beta12345!";
        let userId: string | null = null;

        const { data: existing } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const found = existing?.users?.find(
          (u) => u.email?.toLowerCase() === email,
        );
        if (found) {
          userId = found.id;
          log.user = "existing";
        } else {
          const { data: created, error } =
            await supabaseAdmin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { full_name: "Beta Tester" },
            });
          if (error) return Response.json({ step: "createUser", error: error.message }, { status: 500 });
          userId = created.user!.id;
          log.user = "created";
        }

        // 2. Department
        let deptId: string | null = null;
        const { data: dExisting } = await supabaseAdmin
          .from("departments")
          .select("id")
          .eq("name", "Research and Development")
          .maybeSingle();
        if (dExisting?.id) {
          deptId = dExisting.id;
          log.dept = "existing";
        } else {
          const { data: dRow, error } = await supabaseAdmin
            .from("departments")
            .insert({
              name: "Research and Development",
              room_policy_text:
                "R&D spaces are bookable by department staff for research, prototyping, and pilot programs.",
            })
            .select("id")
            .single();
          if (error) return Response.json({ step: "dept", error: error.message }, { status: 500 });
          deptId = dRow.id;
          log.dept = "created";
        }

        // 3. Role: dept_admin
        await supabaseAdmin
          .from("department_roles")
          .upsert(
            { user_id: userId, department_id: deptId, role: "dept_admin" },
            { onConflict: "user_id,department_id,role" },
          );
        log.role = "ensured";

        // 4. Venue
        let venueId: number | null = null;
        const { data: vExisting } = await supabaseAdmin
          .from("venues")
          .select("id")
          .eq("name", "RD Hall")
          .maybeSingle();
        if (vExisting?.id) {
          venueId = vExisting.id;
          log.venue = "existing";
        } else {
          const { data: vRow, error } = await supabaseAdmin
            .from("venues")
            .insert({
              name: "RD Hall",
              department_id: deptId,
              city: "City",
              capacity: 120,
            })
            .select("id")
            .single();
          if (error) return Response.json({ step: "venue", error: error.message }, { status: 500 });
          venueId = vRow.id;
          log.venue = "created";
        }

        // 5. Stage
        let stageId: string | null = null;
        const { data: sExisting } = await supabaseAdmin
          .from("stages")
          .select("id")
          .eq("venue_id", venueId)
          .eq("name", "RD Stage")
          .maybeSingle();
        if (sExisting?.id) {
          stageId = sExisting.id;
          log.stage = "existing";
        } else {
          const { data: sRow, error } = await supabaseAdmin
            .from("stages")
            .insert({
              name: "RD Stage",
              venue_id: venueId,
              description: "Main stage for R&D programs.",
            })
            .select("id")
            .single();
          if (error) return Response.json({ step: "stage", error: error.message }, { status: 500 });
          stageId = sRow.id;
          log.stage = "created";
        }

        // 6. Room
        let roomId: string | null = null;
        const { data: rExisting } = await supabaseAdmin
          .from("rooms")
          .select("id")
          .eq("venue_id", venueId)
          .eq("name", "RD Room")
          .maybeSingle();
        if (rExisting?.id) {
          roomId = rExisting.id;
          log.room = "existing";
        } else {
          const { data: rRow, error } = await supabaseAdmin
            .from("rooms")
            .insert({
              name: "RD Room",
              venue_id: venueId,
              department_id: deptId,
              capacity: 30,
              is_publicly_bookable: false,
              description: "Multi-purpose room for R&D classes and meetings.",
            })
            .select("id")
            .single();
          if (error) return Response.json({ step: "room", error: error.message }, { status: 500 });
          roomId = rRow.id;
          log.room = "created";
        }

        // 7. Program / event about Father's Day (sessions table on RD Stage)
        const fdStart = "2026-06-21T17:00:00.000Z";
        const fdEnd = "2026-06-21T20:00:00.000Z";
        const { data: pExisting } = await supabaseAdmin
          .from("sessions")
          .select("id")
          .eq("title", "Father's Day Celebration")
          .eq("department_id", deptId)
          .maybeSingle();
        if (!pExisting?.id) {
          const { error } = await supabaseAdmin.from("sessions").insert({
            title: "Father's Day Celebration",
            event_type: "Community Program",
            speaker_name: null,
            stage_id: stageId,
            room_id: null,
            start_time: fdStart,
            end_time: fdEnd,
            focal_x: 50,
            focal_y: 50,
            accepts_vendors: true,
            department_id: deptId,
            staff_owner_id: userId,
            staff_owner_name: "Beta Tester",
          });
          if (error) return Response.json({ step: "program", error: error.message }, { status: 500 });
          log.program = "created";
        } else {
          log.program = "existing";
        }

        // 8. Class: "Managing Volunteers" + 3 sessions in RD Room
        let courseId: string | null = null;
        const { data: cExisting } = await supabaseAdmin
          .from("courses")
          .select("id")
          .eq("title", "Managing Volunteers")
          .maybeSingle();
        if (cExisting?.id) {
          courseId = cExisting.id;
          log.course = "existing";
        } else {
          const { data: cRow, error } = await supabaseAdmin
            .from("courses")
            .insert({
              title: "Managing Volunteers",
              description:
                "A three-part class for staff and community leads on recruiting, scheduling, and retaining great volunteers.",
              price: 0,
              department_id: deptId,
              created_by: userId,
            })
            .select("id")
            .single();
          if (error) return Response.json({ step: "course", error: error.message }, { status: 500 });
          courseId = cRow.id;
          log.course = "created";
        }

        const classDates: Array<[string, string]> = [
          ["2026-07-07T23:00:00.000Z", "2026-07-08T00:30:00.000Z"],
          ["2026-07-14T23:00:00.000Z", "2026-07-15T00:30:00.000Z"],
          ["2026-07-21T23:00:00.000Z", "2026-07-22T00:30:00.000Z"],
        ];
        const created: string[] = [];
        for (const [start, end] of classDates) {
          const { data: csExisting } = await supabaseAdmin
            .from("course_sessions")
            .select("id")
            .eq("course_id", courseId)
            .eq("start_time", start)
            .maybeSingle();
          if (csExisting?.id) {
            created.push("existing");
            continue;
          }
          const { error } = await supabaseAdmin.from("course_sessions").insert({
            course_id: courseId,
            room_id: roomId,
            instructor_name: "Beta Tester",
            start_time: start,
            end_time: end,
            capacity: 25,
          });
          if (error) return Response.json({ step: "course_session", start, error: error.message }, { status: 500 });
          created.push("created");
        }
        log.course_sessions = created;

        return Response.json({
          ok: true,
          userId,
          deptId,
          venueId,
          stageId,
          roomId,
          courseId,
          log,
        });
      },
    },
  },
});
