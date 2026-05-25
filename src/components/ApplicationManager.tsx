import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, DollarSign, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  paid: "bg-sky-100 text-sky-900",
  rejected: "bg-rose-100 text-rose-900",
  cancelled: "bg-slate-200 text-slate-700",
};

export type ApplicationKind = "vendor" | "sponsor";

interface Props {
  kind: ApplicationKind;
  listFn: any;
  setStatusFn: any;
  title: string;
  blurb: string;
}

export function ApplicationManager({ kind, listFn, setStatusFn, title, blurb }: Props) {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listFn);
  const setStatus = useServerFn(setStatusFn);

  const key = ["staff", kind, "applications"];
  const { data: rows, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetchAll(),
  });

  const mut = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      setStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {
      pending: [],
      approved: [],
      paid: [],
      rejected: [],
      cancelled: [],
    };
    for (const r of rows ?? []) {
      const s = (r as any).status ?? "pending";
      if (!groups[s]) groups[s] = [];
      groups[s].push(r);
    }
    return groups;
  }, [rows]);

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  const order: Array<keyof typeof grouped> = [
    "pending",
    "approved",
    "paid",
    "rejected",
    "cancelled",
  ];

  return (
    <div className="p-8">
      <h1 className="text-4xl font-black uppercase tracking-tight text-slate-900">
        {title}
      </h1>
      <p className="mt-1 text-sm text-slate-600">{blurb}</p>

      <div className="mt-8 space-y-10">
        {order.map((status) => {
          const list = grouped[status] ?? [];
          if (list.length === 0) return null;
          return (
            <section key={status}>
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${STATUS_STYLES[status]}`}
                >
                  {status}
                </span>
                <span>{list.length}</span>
              </h2>
              <ul className="mt-3 space-y-2">
                {list.map((r: any) => {
                  const name =
                    kind === "vendor" ? r.business_name : r.company_name;
                  const tier =
                    kind === "vendor"
                      ? r.vendor_tiers?.name
                      : r.sponsorship_tiers?.name;
                  const price =
                    kind === "vendor"
                      ? r.vendor_tiers?.price
                      : r.sponsorship_tiers?.price;
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {r.logo_url && (
                            <img
                              src={r.logo_url}
                              alt=""
                              className="h-8 w-8 rounded object-cover"
                            />
                          )}
                          <span className="font-semibold text-slate-900">
                            {name}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[r.status] ?? "bg-slate-100"}`}
                          >
                            {r.status}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {r.contact_name}
                          {r.contact_email && <span> · {r.contact_email}</span>}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Event:{" "}
                          <span className="font-medium text-slate-700">
                            {r.sessions?.title ?? "—"}
                          </span>
                          {tier && (
                            <>
                              {" "}
                              · Slot:{" "}
                              <span className="font-medium text-slate-700">
                                {tier}
                                {price != null && ` ($${price})`}
                              </span>
                            </>
                          )}
                        </div>
                        {r.application_notes && (
                          <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                            {r.application_notes}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {r.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                mut.mutate({ id: r.id, status: "approved" })
                              }
                            >
                              <Check className="mr-1 h-4 w-4" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                mut.mutate({ id: r.id, status: "rejected" })
                              }
                            >
                              <X className="mr-1 h-4 w-4" /> Reject
                            </Button>
                          </>
                        )}
                        {r.status === "approved" && (
                          <Button
                            size="sm"
                            onClick={() =>
                              mut.mutate({ id: r.id, status: "paid" })
                            }
                          >
                            <DollarSign className="mr-1 h-4 w-4" /> Mark paid
                          </Button>
                        )}
                        {r.status === "paid" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              mut.mutate({ id: r.id, status: "approved" })
                            }
                          >
                            <RotateCcw className="mr-1 h-4 w-4" /> Unpay
                          </Button>
                        )}
                        {(r.status === "rejected" ||
                          r.status === "cancelled") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              mut.mutate({ id: r.id, status: "pending" })
                            }
                          >
                            Re-open
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {(!rows || rows.length === 0) && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No applications yet.
          </div>
        )}
      </div>
    </div>
  );
}
