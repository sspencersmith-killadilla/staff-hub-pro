import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff, isAdmin } from "./staff-guard";
import { loadUsaepayConfig, buildUsaepayAuthHeader } from "./usaepay.server";

// ─── COURSES ────────────────────────────────────────────────────────────

const courseInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  price: z.number().min(0).max(99999),
  department_id: z.string().uuid().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
});

export const upsertCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => courseInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const payload = {
      title: data.title,
      description: data.description ?? null,
      price: data.price,
      department_id: data.department_id ?? null,
      image_url: data.image_url ?? null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("courses")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabaseAdmin
      .from("courses")
      .insert({ ...payload, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("courses")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCoursesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ departmentId: z.string().uuid().nullable().optional() })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const admin = await isAdmin(context.userId);
    let q = supabaseAdmin
      .from("courses")
      .select("id,title,description,price,department_id,image_url,created_at")
      .order("created_at", { ascending: false });
    if (!admin && data.departmentId) q = q.eq("department_id", data.departmentId);
    else if (data.departmentId) q = q.eq("department_id", data.departmentId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ─── SCHEDULING (BLOCKS ROOM) ───────────────────────────────────────────

const scheduleInput = z.object({
  course_id: z.string().uuid(),
  room_id: z.string().uuid(),
  instructor_id: z.string().uuid().optional().nullable(),
  instructor_name: z.string().trim().max(200).optional().nullable(),
  start_time: z.string(),
  end_time: z.string(),
  capacity: z.number().int().min(1).max(10000),
});

export const scheduleCourseSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => scheduleInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    if (new Date(data.end_time) <= new Date(data.start_time)) {
      throw new Error("End must be after start");
    }
    // Check room conflicts against approved reservations
    const { data: overlaps } = await supabaseAdmin
      .from("room_reservations")
      .select("id")
      .eq("room_id", data.room_id)
      .eq("status", "approved")
      .lt("starts_at", data.end_time)
      .gt("ends_at", data.start_time);
    if ((overlaps ?? []).length > 0) {
      throw new Error("Room is already booked during that time");
    }

    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("title")
      .eq("id", data.course_id)
      .maybeSingle();

    const { data: row, error } = await supabaseAdmin
      .from("course_sessions")
      .insert({
        course_id: data.course_id,
        room_id: data.room_id,
        instructor_id: data.instructor_id ?? null,
        instructor_name: data.instructor_name ?? null,
        start_time: data.start_time,
        end_time: data.end_time,
        capacity: data.capacity,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Create blocking reservation
    const { error: rErr } = await supabaseAdmin
      .from("room_reservations")
      .insert({
        room_id: data.room_id,
        requester_name: `Class: ${course?.title ?? "Course"}`,
        requester_email: "classes@platform.local",
        starts_at: data.start_time,
        ends_at: data.end_time,
        purpose: `Class session for ${course?.title ?? "course"}`,
        status: "approved",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        course_session_id: row.id,
      });
    if (rErr) {
      // Roll back the session if reservation failed
      await supabaseAdmin.from("course_sessions").delete().eq("id", row.id);
      throw new Error(`Could not block room: ${rErr.message}`);
    }
    return row;
  });

export const deleteCourseSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    // ON DELETE CASCADE on room_reservations.course_session_id clears the block
    const { error } = await supabaseAdmin
      .from("course_sessions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── ENROLLMENT + PAYMENT (USAePay) ─────────────────────────────────────

const enrollInput = z.object({
  session_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255),
  card: z
    .object({
      number: z.string().trim().min(12).max(25),
      expiration: z.string().trim().regex(/^\d{2}\/?\d{2}$/),
      cvc: z.string().trim().regex(/^\d{3,4}$/),
      avs_zip: z.string().trim().min(3).max(10).optional(),
    })
    .optional(),
});

export const enrollInSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => enrollInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: session, error: sErr } = await supabaseAdmin
      .from("course_sessions")
      .select("id, capacity, course_id, courses(title, price)")
      .eq("id", data.session_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!session) throw new Error("Session not found");

    const price = Number((session as any).courses?.price ?? 0);
    const courseTitle = (session as any).courses?.title ?? "Class";

    // Capacity check
    const { count } = await supabaseAdmin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("session_id", data.session_id)
      .in("payment_status", ["paid", "free", "pending"]);
    if ((count ?? 0) >= (session as any).capacity) {
      throw new Error("This session is full");
    }

    // Already enrolled?
    const { data: existing } = await supabaseAdmin
      .from("enrollments")
      .select("id, payment_status")
      .eq("session_id", data.session_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      return { id: existing.id, already_enrolled: true as const };
    }

    // Free
    if (price <= 0) {
      const { data: row, error } = await supabaseAdmin
        .from("enrollments")
        .insert({
          session_id: data.session_id,
          user_id: userId,
          full_name: data.full_name,
          email: data.email,
          payment_status: "free",
          amount_cents: 0,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id, payment_status: "free" as const };
    }

    // Paid → USAePay
    if (!data.card) throw new Error("Payment details required");
    const cfg = loadUsaepayConfig();
    if (!cfg) {
      throw new Error(
        "Payments are not yet configured. The site operator needs to add USAEPAY_API_KEY and USAEPAY_API_PIN.",
      );
    }
    const amountCents = Math.round(price * 100);
    const expRaw = data.card.expiration.replace(/\D/g, "");
    if (expRaw.length !== 4) throw new Error("Invalid card expiration");

    let providerJson: any = null;
    try {
      const res = await fetch(`${cfg.baseUrl}/transactions`, {
        method: "POST",
        headers: {
          Authorization: buildAuthHeader(cfg),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          command: "sale",
          amount: price.toFixed(2),
          invoice: `cls-${data.session_id.slice(0, 8)}`,
          description: `Class: ${courseTitle}`,
          creditcard: {
            number: data.card.number.replace(/\s+/g, ""),
            expiration: expRaw,
            cvc: data.card.cvc,
            cardholder: data.full_name,
            avs_zip: data.card.avs_zip ?? undefined,
          },
          billing_address: { email: data.email },
        }),
      });
      providerJson = await res.json().catch(() => ({}));
      const approved =
        providerJson?.result_code === "A" ||
        providerJson?.result === "Approved";
      if (!res.ok || !approved) {
        throw new Error(
          String(
            providerJson?.error ??
              providerJson?.result ??
              `Payment declined (${res.status})`,
          ),
        );
      }
      const { data: row, error } = await supabaseAdmin
        .from("enrollments")
        .insert({
          session_id: data.session_id,
          user_id: userId,
          full_name: data.full_name,
          email: data.email,
          payment_status: "paid",
          amount_cents: amountCents,
          transaction_ref: providerJson?.refnum ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return {
        id: row.id,
        payment_status: "paid" as const,
        transaction_ref: providerJson?.refnum ?? null,
      };
    } catch (err: any) {
      throw new Error(err?.message ?? "Payment failed");
    }
  });

// ─── ROSTER + ATTENDANCE ────────────────────────────────────────────────

export const listMyTeachingSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const admin = await isAdmin(userId);
    let q = supabaseAdmin
      .from("course_sessions")
      .select(
        "id, course_id, room_id, instructor_id, instructor_name, start_time, end_time, capacity, courses(title, department_id), rooms(name)",
      )
      .order("start_time", { ascending: true });
    if (!admin) q = q.eq("instructor_id", userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((s: any) => ({
      id: s.id,
      course_id: s.course_id,
      course_title: s.courses?.title ?? "Class",
      room_name: s.rooms?.name ?? null,
      instructor_name: s.instructor_name ?? null,
      start_time: s.start_time,
      end_time: s.end_time,
      capacity: s.capacity,
    }));
  });

export const getRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ session_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = await isAdmin(userId);
    const { data: session } = await supabaseAdmin
      .from("course_sessions")
      .select("id, instructor_id")
      .eq("id", data.session_id)
      .maybeSingle();
    if (!session) throw new Error("Session not found");
    if (!admin && session.instructor_id !== userId) {
      await assertStaff(userId);
    }
    const { data: rows, error } = await supabaseAdmin
      .from("enrollments")
      .select("id, full_name, email, payment_status, attended, created_at")
      .eq("session_id", data.session_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        enrollment_id: z.string().uuid(),
        attended: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = await isAdmin(userId);
    const { data: row } = await supabaseAdmin
      .from("enrollments")
      .select("session_id")
      .eq("id", data.enrollment_id)
      .maybeSingle();
    if (!row) throw new Error("Enrollment not found");
    if (!admin) {
      const { data: cs } = await supabaseAdmin
        .from("course_sessions")
        .select("instructor_id")
        .eq("id", row.session_id)
        .maybeSingle();
      if (cs?.instructor_id !== userId) await assertStaff(userId);
    }
    const { error } = await supabaseAdmin
      .from("enrollments")
      .update({ attended: data.attended })
      .eq("id", data.enrollment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
