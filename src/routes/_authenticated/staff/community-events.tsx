import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, Trash2, MapPin, CalendarDays, Send } from "lucide-react";
import {
  listCommunityEventsStaff,
  setCommunityEventStatus,
  deleteCommunityEventStaff,
} from "@/lib/community.functions";
import { resendWpoEvent } from "@/lib/wpo-dispatch.functions";
import { Button } from "@/components/ui/button";

import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute("/_authenticated/staff/community-events")({
  beforeLoad: () => requireModule("community_orgs"),
  component: CommunityEventsPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
  cancelled: "bg-slate-200 text-slate-700",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CommunityEventsPage() {
  const qc = useQueryClient();
  const fetchEvents = useServerFn(listCommunityEventsStaff);
  const setStatus = useServerFn(setCommunityEventStatus);
  const remove = useServerFn(deleteCommunityEventStaff);
  const resend = useServerFn(resendWpoEvent);
  const { data: events, isLoading } = useQuery({
    queryKey: ["staff", "community", "events"],
    queryFn: () => fetchEvents(),
  });
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "rejected" | "cancelled"
  >("pending");

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["staff", "community", "events"] });
    qc.invalidateQueries({ queryKey: ["community", "events"] });
  }

  const statusMut = useMutation({
    mutationFn: (vars: { id: string; status: any; staff_notes?: string }) =>
      setStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const resendMut = useMutation({
    mutationFn: (id: string) =>
      resend({ data: { eventId: id, type: "event.updated" } }),
    onSuccess: (res: any) => {
      if (res?.skipped) toast.message(`Skipped: ${res.reason}`);
      else if (res?.ok) toast.success("Sent to WorkPlanOS");
      else toast.error(`WPO error: ${res?.error ?? "unknown"}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const rows = (events ?? []).filter((e: any) =>
    filter === "all" ? true : e.status === filter,
  );

  return (
    <div className="p-8">
      <h1 className="text-4xl font-black uppercase tracking-tight text-slate-900">
        Community Events
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Review events submitted by community organizations.
      </p>
      <div className="mt-6 flex flex-wrap gap-1 border-b border-slate-200">
        {(["pending", "approved", "rejected", "cancelled", "all"] as const).map(
          (k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                filter === k
                  ? "border-b-2 border-slate-900 text-slate-900"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {k}
            </button>
          ),
        )}
      </div>
      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            Nothing here.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((e: any) => (
              <li
                key={e.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {e.title}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          STATUS_STYLES[e.status] ?? "bg-slate-100"
                        }`}
                      >
                        {e.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                      <CalendarDays className="h-3.5 w-3.5" /> {fmt(e.starts_at)} –{" "}
                      {fmt(e.ends_at)}
                    </div>
                    {e.location && (
                      <div className="mt-1 flex items-start gap-1 text-xs text-slate-500">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          {e.location.name}
                          {e.location.address && ` · ${e.location.address}`}
                          {e.location.city && `, ${e.location.city}`}
                        </span>
                      </div>
                    )}
                    {e.org && (
                      <div className="mt-2 text-xs text-emerald-800">
                        From{" "}
                        <span className="font-semibold">{e.org.name}</span> (
                        {e.org.contact_email})
                      </div>
                    )}
                    {e.description && (
                      <p className="mt-2 text-sm text-slate-700">
                        {e.description}
                      </p>
                    )}
                    {e.staff_notes && (
                      <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        Staff note: {e.staff_notes}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {e.status !== "approved" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          statusMut.mutate({ id: e.id, status: "approved" })
                        }
                      >
                        <Check className="mr-1 h-4 w-4" /> Approve
                      </Button>
                    )}
                    {e.status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const note = prompt(
                            "Reason for rejection (optional)?",
                          );
                          statusMut.mutate({
                            id: e.id,
                            status: "rejected",
                            staff_notes: note ?? undefined,
                          });
                        }}
                      >
                        <X className="mr-1 h-4 w-4" /> Reject
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resendMut.mutate(e.id)}
                      disabled={resendMut.isPending}
                      title="Resend this event to WorkPlanOS"
                    >
                      <Send className="mr-1 h-4 w-4" /> Resend to WPO
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this event?"))
                          deleteMut.mutate(e.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
