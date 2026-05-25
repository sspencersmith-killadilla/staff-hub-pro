import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { listOrgsStaff, setOrgStatus } from "@/lib/community.functions";
import { Button } from "@/components/ui/button";

import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute(
  "/_authenticated/staff/community-organizations",
)({
  beforeLoad: () => requireModule("community_orgs"),
  component: OrgsPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
};

function OrgsPage() {
  const qc = useQueryClient();
  const fetchOrgs = useServerFn(listOrgsStaff);
  const setStatus = useServerFn(setOrgStatus);
  const { data: orgs, isLoading } = useQuery({
    queryKey: ["staff", "community", "orgs"],
    queryFn: () => fetchOrgs(),
  });
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">(
    "pending",
  );

  const mutation = useMutation({
    mutationFn: (vars: { id: string; status: any; staff_notes?: string }) =>
      setStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["staff", "community", "orgs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const rows = (orgs ?? []).filter((o: any) =>
    filter === "all" ? true : o.status === filter,
  );

  return (
    <div className="p-8">
      <h1 className="text-4xl font-black uppercase tracking-tight text-slate-900">
        Community Organizations
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Approve community orgs so they can post their own events at their own
        venues.
      </p>
      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {(["pending", "approved", "rejected", "all"] as const).map((k) => (
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
        ))}
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
            {rows.map((o: any) => (
              <li
                key={o.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{o.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          STATUS_STYLES[o.status] ?? "bg-slate-100"
                        }`}
                      >
                        {o.status}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {o.contact_email}
                      {o.contact_phone && <span> · {o.contact_phone}</span>}
                      {o.org_type && <span> · {o.org_type}</span>}
                    </div>
                    {o.website && (
                      <a
                        href={o.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sky-700 underline"
                      >
                        {o.website}
                      </a>
                    )}
                    {o.description && (
                      <p className="mt-2 text-sm text-slate-700">{o.description}</p>
                    )}
                    {o.staff_notes && (
                      <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        Staff note: {o.staff_notes}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {o.status !== "approved" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          mutation.mutate({ id: o.id, status: "approved" })
                        }
                      >
                        <Check className="mr-1 h-4 w-4" /> Approve
                      </Button>
                    )}
                    {o.status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const note = prompt("Reason for rejection (optional)?");
                          mutation.mutate({
                            id: o.id,
                            status: "rejected",
                            staff_notes: note ?? undefined,
                          });
                        }}
                      >
                        <X className="mr-1 h-4 w-4" /> Reject
                      </Button>
                    )}
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
