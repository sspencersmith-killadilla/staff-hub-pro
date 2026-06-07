import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  staffListQuestStats,
  staffGetQuestFunnel,
  staffExportQuestActivityCsv,
} from "@/lib/quests.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Download, Compass } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/staff/quests-report",
)({
  component: QuestsReportPage,
});

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function QuestsReportPage() {
  const fetchStats = useServerFn(staffListQuestStats);
  const exportCsv = useServerFn(staffExportQuestActivityCsv);

  const { data, isLoading, error } = useQuery({
    queryKey: ["staff", "quest-stats"],
    queryFn: () => fetchStats(),
  });

  const [openQuestId, setOpenQuestId] = useState<string | null>(null);
  const [openQuestTitle, setOpenQuestTitle] = useState<string>("");

  async function downloadCsv(questId?: string, label?: string) {
    try {
      const res = await exportCsv({ data: questId ? { questId } : {} });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quest-activity-${label ?? "all"}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.count} rows`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (data?.disabled) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <Compass className="mx-auto h-12 w-12 text-stone-400" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">
          Civic Quests is disabled
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Enable the Civic Quests module in{" "}
          <Link
            to="/staff/settings"
            className="font-semibold text-primary underline"
          >
            Platform Settings
          </Link>{" "}
          to view reports.
        </p>
      </div>
    );
  }

  const totals = data?.totals;
  const rows = data?.rows ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            <BarChart3 className="h-4 w-4" />
            Reporting
          </div>
          <h1 className="mt-1 text-3xl font-black uppercase tracking-tight text-slate-900">
            Civic Quests Report
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Per-quest participation, completion rates, and waypoint funnel.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/staff"
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100"
          >
            ← Staff portal
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(undefined, "all")}
          >
            <Download className="mr-1 h-4 w-4" /> Export all (CSV)
          </Button>
        </div>
      </div>

      {totals && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard label="Active quests" value={totals.active_quests} />
          <SummaryCard label="Total quests" value={totals.total_quests} />
          <SummaryCard
            label="Participants"
            value={totals.total_participants}
          />
          <SummaryCard label="Completions" value={totals.total_completions} />
          <SummaryCard
            label="Points awarded"
            value={totals.total_points_awarded}
          />
        </div>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Per-quest breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-rose-700">
              Could not load: {(error as Error).message}
            </p>
          ) : isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">No quests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Quest</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Participants</th>
                    <th className="px-3 py-2 text-right">Completions</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Avg done</th>
                    <th className="px-3 py-2">Last completion</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        {r.title}
                      </td>
                      <td className="px-3 py-3">
                        {r.is_active ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                            Draft
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {r.participants}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {r.completions}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {pct(r.completion_rate)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {r.avg_waypoints_done.toFixed(1)} / {r.waypoint_count}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatDate(r.last_completion_at)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => {
                            setOpenQuestId(r.id);
                            setOpenQuestTitle(r.title);
                          }}
                          className="text-xs font-bold uppercase tracking-wider text-primary hover:underline"
                        >
                          Funnel →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {openQuestId && (
        <FunnelDialog
          questId={openQuestId}
          title={openQuestTitle}
          onClose={() => setOpenQuestId(null)}
          onExport={() => downloadCsv(openQuestId, openQuestTitle.slice(0, 16))}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-slate-900">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function FunnelDialog({
  questId,
  title,
  onClose,
  onExport,
}: {
  questId: string;
  title: string;
  onClose: () => void;
  onExport: () => void;
}) {
  const fetchFunnel = useServerFn(staffGetQuestFunnel);
  const { data, isLoading } = useQuery({
    queryKey: ["staff", "quest-funnel", questId],
    queryFn: () => fetchFunnel({ data: { questId } }),
  });

  const total = data?.total_starts ?? 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Funnel · {title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              {total} participants
            </p>
            <ol className="mt-3 space-y-2">
              {(data?.waypoints ?? []).map((w, i) => {
                const ratio = total ? w.users_reached / total : 0;
                return (
                  <li
                    key={w.id}
                    className="rounded-md border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-900">
                        {i + 1}. {w.title}
                      </span>
                      <span className="text-slate-700">
                        {w.users_reached} ({pct(ratio)})
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="mr-1 h-4 w-4" /> Export this quest (CSV)
              </Button>
              <Button size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
