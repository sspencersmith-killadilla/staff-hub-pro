import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

// ─── Department revenue (monthly, by source) ─────────────────────────
export const getDepartmentRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        departmentId: z.string().uuid().nullable().optional(),
        monthsBack: z.number().int().min(1).max(60).default(12),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("vw_department_revenue")
      .select("department_id, month, source, amount");
    if (data.departmentId) q = q.eq("department_id", data.departmentId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - (data.monthsBack - 1));
    cutoff.setDate(1);
    cutoff.setHours(0, 0, 0, 0);
    return (rows ?? []).filter((r) => new Date(r.month as string) >= cutoff);
  });

// ─── Venue utilization ───────────────────────────────────────────────
export const getVenueUtilization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ departmentId: z.string().uuid().nullable().optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("vw_venue_utilization")
      .select("*")
      .order("utilization_pct_30d", { ascending: false });
    if (data.departmentId) q = q.eq("department_id", data.departmentId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ─── KPIs ────────────────────────────────────────────────────────────
export const getAnalyticsKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ departmentId: z.string().uuid().nullable().optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Revenue YTD + previous-year same-period (for trend)
    let revQ = supabaseAdmin
      .from("vw_department_revenue")
      .select("month, amount, department_id");
    if (data.departmentId) revQ = revQ.eq("department_id", data.departmentId);
    const { data: revRows, error: revErr } = await revQ;
    if (revErr) throw new Error(revErr.message);

    const now = new Date();
    const startYTD = new Date(now.getFullYear(), 0, 1);
    const prevStart = new Date(now.getFullYear() - 1, 0, 1);
    const prevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    let ytd = 0;
    let prev = 0;
    for (const r of revRows ?? []) {
      const d = new Date(r.month as string);
      const amt = Number(r.amount ?? 0);
      if (d >= startYTD) ytd += amt;
      else if (d >= prevStart && d < prevEnd) prev += amt;
    }

    // Avg utilization (30d)
    let utilQ = supabaseAdmin
      .from("vw_venue_utilization")
      .select("utilization_pct_30d, utilization_pct_365d, department_id");
    if (data.departmentId) utilQ = utilQ.eq("department_id", data.departmentId);
    const { data: utilRows } = await utilQ;
    const u30 =
      (utilRows ?? []).reduce(
        (s, r) => s + Number(r.utilization_pct_30d ?? 0),
        0,
      ) / Math.max(1, (utilRows ?? []).length);
    const u365 =
      (utilRows ?? []).reduce(
        (s, r) => s + Number(r.utilization_pct_365d ?? 0),
        0,
      ) / Math.max(1, (utilRows ?? []).length);

    // Active vendors (status approved or paid). Department filter via session.department_id.
    let vendQ = supabaseAdmin
      .from("vendors")
      .select("id, status, sessions!inner(department_id)", { count: "exact", head: true })
      .in("status", ["approved", "paid"]);
    if (data.departmentId)
      vendQ = vendQ.eq("sessions.department_id", data.departmentId);
    const { count: vendorsCount } = await vendQ;

    return {
      revenueYtd: +ytd.toFixed(2),
      revenuePrev: +prev.toFixed(2),
      revenueTrendPct: prev > 0 ? +(((ytd - prev) / prev) * 100).toFixed(1) : null,
      avgUtilization30d: +u30.toFixed(1),
      avgUtilization365d: +u365.toFixed(1),
      utilTrendPct: u365 > 0 ? +(((u30 - u365) / u365) * 100).toFixed(1) : null,
      activeVendors: vendorsCount ?? 0,
    };
  });

// ─── Economic Impact RPC ─────────────────────────────────────────────
export const calculateEconomicImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        estimatedAttendance: z.number().min(0).max(10_000_000),
        averageTicketPrice: z.number().min(0).max(100_000),
        multiplier: z.number().min(0.1).max(20),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin.rpc(
      "calculate_economic_impact",
      {
        estimated_attendance: data.estimatedAttendance,
        average_ticket_price: data.averageTicketPrice,
        multiplier: data.multiplier,
      },
    );
    if (error) throw new Error(error.message);
    const r = Array.isArray(rows) ? rows[0] : rows;
    return {
      directRevenue: Number(r?.direct_revenue ?? 0),
      secondaryImpact: Number(r?.secondary_impact ?? 0),
      totalImpact: Number(r?.total_impact ?? 0),
      year1Impact: Number(r?.year_1_impact ?? 0),
      year5Impact: Number(r?.year_5_impact ?? 0),
    };
  });

// ─── All departments (for filter dropdown) ───────────────────────────
export const listAllDepartmentsForAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("departments")
      .select("id, name")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
