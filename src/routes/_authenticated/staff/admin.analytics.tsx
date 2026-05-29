import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ArrowDown, ArrowUp, Minus, TrendingUp } from "lucide-react";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import {
  getAnalyticsKpis,
  getDepartmentRevenue,
  getVenueUtilization,
  calculateEconomicImpact,
  listAllDepartmentsForAnalytics,
} from "@/lib/analytics.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/staff/admin/analytics")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  head: () => ({ meta: [{ title: "Executive Analytics" }] }),
  component: AnalyticsPage,
});

const STREAM_COLORS: Record<string, string> = {
  permits: "var(--primary)",
  vendors: "var(--secondary)",
  tickets: "var(--accent)",
  classes: "var(--muted-foreground)",
};
const STREAMS = ["permits", "vendors", "tickets", "classes"] as const;

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function Trend({ pct }: { pct: number | null }) {
  if (pct == null)
    return (
      <span className="inline-flex items-center text-xs text-muted-foreground">
        <Minus className="h-3 w-3 mr-1" /> n/a
      </span>
    );
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center text-xs font-medium ${
        up ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      {up ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function AnalyticsPage() {
  const [deptId, setDeptId] = useState<string | "all">("all");
  const deptParam = deptId === "all" ? null : deptId;

  const fetchDepts = useServerFn(listAllDepartmentsForAnalytics);
  const fetchKpis = useServerFn(getAnalyticsKpis);
  const fetchRevenue = useServerFn(getDepartmentRevenue);
  const fetchUtil = useServerFn(getVenueUtilization);
  const fetchImpact = useServerFn(calculateEconomicImpact);

  const { data: depts = [] } = useQuery({
    queryKey: ["analytics", "depts"],
    queryFn: () => fetchDepts(),
  });
  const { data: kpis } = useQuery({
    queryKey: ["analytics", "kpis", deptParam],
    queryFn: () => fetchKpis({ data: { departmentId: deptParam } }),
  });
  const { data: revRows = [] } = useQuery({
    queryKey: ["analytics", "revenue", deptParam],
    queryFn: () => fetchRevenue({ data: { departmentId: deptParam, monthsBack: 12 } }),
  });
  const { data: utilRows = [] } = useQuery({
    queryKey: ["analytics", "util", deptParam],
    queryFn: () => fetchUtil({ data: { departmentId: deptParam } }),
  });

  // Pivot revenue rows -> chart data: one row per month with per-stream amounts.
  const revenueChart = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    for (const r of revRows as any[]) {
      const m = (r.month as string).slice(0, 7); // YYYY-MM
      if (!map.has(m)) map.set(m, { month: m, permits: 0, vendors: 0, tickets: 0, classes: 0 });
      const row = map.get(m)!;
      const k = r.source as string;
      row[k] = Number(row[k] ?? 0) + Number(r.amount ?? 0);
    }
    // Ensure last 12 months present
    const out: Array<Record<string, number | string>> = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push(map.get(key) ?? { month: key, permits: 0, vendors: 0, tickets: 0, classes: 0 });
    }
    return out;
  }, [revRows]);

  const utilChart = useMemo(
    () =>
      (utilRows as any[])
        .map((r) => ({
          name: r.room_name ?? "Unnamed",
          utilization: Number(r.utilization_pct_30d ?? 0),
          booked: Number(r.booked_hours_30d ?? 0),
        }))
        .slice(0, 12),
    [utilRows],
  );

  // Economic Impact Projector — local interactive state, debounced via React Query key.
  const [attendance, setAttendance] = useState(250);
  const [headcount, setHeadcount] = useState(75); // average headcount per event
  const [multiplier, setMultiplier] = useState(1.8);
  // "Estimated attendance" for the RPC = events/month * avg headcount.
  // "Average ticket price" is treated as average local spend per attendee.
  const [spendPerAttendee, setSpendPerAttendee] = useState(45);

  const { data: impact } = useQuery({
    queryKey: ["analytics", "impact", attendance, headcount, multiplier, spendPerAttendee],
    queryFn: () =>
      fetchImpact({
        data: {
          estimatedAttendance: attendance * headcount,
          averageTicketPrice: spendPerAttendee,
          multiplier,
        },
      }),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header + global filter */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-primary" />
            Executive Analytics
          </h1>
          <p className="text-muted-foreground text-sm">
            Revenue, utilization & economic impact across the platform.
          </p>
        </div>
        <div className="min-w-[220px]">
          <Label className="text-xs text-muted-foreground">Department</Label>
          <Select value={deptId} onValueChange={(v) => setDeptId(v as string)}>
            <SelectTrigger>
              <SelectValue placeholder="City-Wide" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">City-Wide</SelectItem>
              {depts.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Platform Revenue (YTD)</CardDescription>
            <CardTitle className="text-3xl">{fmtUSD(kpis?.revenueYtd ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Trend pct={kpis?.revenueTrendPct ?? null} />
            <span className="text-xs text-muted-foreground ml-2">vs. prior year same period</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Venue Utilization</CardDescription>
            <CardTitle className="text-3xl">
              {(kpis?.avgUtilization30d ?? 0).toFixed(1)}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Trend pct={kpis?.utilTrendPct ?? null} />
            <span className="text-xs text-muted-foreground ml-2">last 30d vs. 365d avg</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Vendors</CardDescription>
            <CardTitle className="text-3xl">{kpis?.activeVendors ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">Approved or paid applications</span>
          </CardContent>
        </Card>
      </div>

      {/* Revenue trend */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Trends — Last 12 Months</CardTitle>
          <CardDescription>Stacked by revenue stream</CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueChart}>
              <defs>
                {STREAMS.map((s) => (
                  <linearGradient key={s} id={`grad-${s}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={STREAM_COLORS[s]} stopOpacity={0.7} />
                    <stop offset="95%" stopColor={STREAM_COLORS[s]} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickFormatter={(v) => `$${(v as number) / 1000}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
                formatter={(v: number) => fmtUSD(v)}
              />
              <Legend />
              {STREAMS.map((s) => (
                <Area
                  key={s}
                  type="monotone"
                  dataKey={s}
                  stackId="1"
                  stroke={STREAM_COLORS[s]}
                  fill={`url(#grad-${s})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Two-column: Utilization + Impact Projector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Venue Utilization</CardTitle>
            <CardDescription>Top venues by booked hours (last 30 days)</CardDescription>
          </CardHeader>
          <CardContent className="h-96">
            {utilChart.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reservations in the last 30 days.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utilChart} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                    formatter={(v: number, name) =>
                      name === "utilization" ? `${v.toFixed(1)}%` : `${v.toFixed(1)} hrs`
                    }
                  />
                  <Bar dataKey="utilization" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Economic Impact Projector</CardTitle>
            <CardDescription>
              Model the projected ROI of new capital investments (planetariums, MAGPIE, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex justify-between text-sm">
                <Label>Expected Monthly Field Trips / Events</Label>
                <span className="font-semibold">{attendance}</span>
              </div>
              <Slider
                value={[attendance]}
                min={0}
                max={2000}
                step={10}
                onValueChange={(v) => setAttendance(v[0] ?? 0)}
                className="mt-2"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <Label>Average Headcount per Event</Label>
                <span className="font-semibold">{headcount}</span>
              </div>
              <Slider
                value={[headcount]}
                min={1}
                max={500}
                step={1}
                onValueChange={(v) => setHeadcount(v[0] ?? 1)}
                className="mt-2"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <Label>Average Local Spend / Attendee</Label>
                <span className="font-semibold">${spendPerAttendee}</span>
              </div>
              <Slider
                value={[spendPerAttendee]}
                min={0}
                max={500}
                step={5}
                onValueChange={(v) => setSpendPerAttendee(v[0] ?? 0)}
                className="mt-2"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <Label>Local Spend Multiplier</Label>
                <span className="font-semibold">{multiplier.toFixed(2)}x</span>
              </div>
              <Slider
                value={[multiplier * 100]}
                min={100}
                max={500}
                step={5}
                onValueChange={(v) => setMultiplier((v[0] ?? 100) / 100)}
                className="mt-2"
              />
            </div>

            <div className="rounded-xl bg-primary/10 border border-primary/30 p-5 space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Direct Revenue / month
                </div>
                <div className="text-2xl font-bold">{fmtUSD(impact?.directRevenue ?? 0)}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-primary/20">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    1-Year Impact
                  </div>
                  <div className="text-2xl font-extrabold text-primary">
                    {fmtUSD(impact?.year1Impact ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    5-Year Impact
                  </div>
                  <div className="text-2xl font-extrabold text-primary">
                    {fmtUSD(impact?.year5Impact ?? 0)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground pt-2">
                Includes {((multiplier - 1) * 100).toFixed(0)}% secondary local-economy effect.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
