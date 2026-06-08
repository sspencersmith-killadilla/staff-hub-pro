import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listDispatchTickets,
  listTicketsAssignedToMe,
  type TicketRow,
} from "@/lib/tickets.functions";
import { TicketDetailDrawer } from "@/components/tickets/TicketDetailDrawer";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Clock } from "lucide-react";
import { z } from "zod";

const COLUMNS = [
  { key: "submitted", label: "Submitted", tone: "border-slate-300 bg-slate-50" },
  { key: "received", label: "Received", tone: "border-blue-300 bg-blue-50" },
  { key: "in_progress", label: "In Progress", tone: "border-amber-300 bg-amber-50" },
  { key: "resolved", label: "Resolved", tone: "border-emerald-300 bg-emerald-50" },
] as const;

const dispatchSearchSchema = z.object({
  assignee: z.enum(["all", "me"]).optional(),
});

export const Route = createFileRoute("/_authenticated/staff/dispatch")({
  validateSearch: dispatchSearchSchema,
  head: () => ({
    meta: [{ title: "311 Dispatch · Staff" }],
  }),
  component: DispatchPage,
});

function DispatchPage() {
  const qc = useQueryClient();
  const search = useSearch({ from: "/_authenticated/staff/dispatch" });
  const assigneeFilter = search.assignee ?? "all";
  const fetchAll = useServerFn(listDispatchTickets);
  const fetchMine = useServerFn(listTicketsAssignedToMe);
  const { data, isLoading } = useQuery({
    queryKey: ["dispatch-tickets", assigneeFilter],
    queryFn: () =>
      assigneeFilter === "me" ? fetchMine() : fetchAll(),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const channel = supabase
      .channel("dispatch-tickets")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        () => qc.invalidateQueries({ queryKey: ["dispatch-tickets"] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_updates" },
        () => qc.invalidateQueries({ queryKey: ["dispatch-tickets"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const grouped = useMemo(() => {
    const out: Record<string, TicketRow[]> = {
      submitted: [],
      received: [],
      in_progress: [],
      resolved: [],
    };
    const q = query.trim().toLowerCase();
    for (const t of data?.tickets ?? []) {
      if (
        q &&
        !(
          t.description.toLowerCase().includes(q) ||
          (t.location_address ?? "").toLowerCase().includes(q) ||
          (t.category?.name ?? "").toLowerCase().includes(q)
        )
      )
        continue;
      out[t.status]?.push(t);
    }
    return out;
  }, [data, query]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-700">
              311 · Dispatch
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#002f49]">
              Issue Reports
            </h1>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search address, description, category…"
            className="w-72 rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </header>

      <div className="flex-1 overflow-x-auto bg-slate-100 p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid min-w-[1100px] grid-cols-4 gap-4">
            {COLUMNS.map((col) => (
              <section
                key={col.key}
                className={`rounded-xl border-2 ${col.tone} p-3`}
              >
                <h2 className="mb-3 flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-700">
                  <span>{col.label}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-slate-600">
                    {grouped[col.key].length}
                  </span>
                </h2>
                <ul className="space-y-2">
                  {grouped[col.key].map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => setSelectedId(t.id)}
                        className="w-full overflow-hidden rounded-lg border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                      >
                        {t.photo_url && (
                          <img
                            src={t.photo_url}
                            alt=""
                            className="h-24 w-full object-cover"
                          />
                        )}
                        <div className="p-3">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                            {t.category?.name ?? "Issue"}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm">{t.description}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                            {t.location_address && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span className="line-clamp-1">{t.location_address}</span>
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {timeAgo(t.created_at)}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                  {grouped[col.key].length === 0 && (
                    <li className="rounded-lg border border-dashed bg-white/60 p-4 text-center text-xs italic text-muted-foreground">
                      Nothing here
                    </li>
                  )}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <TicketDetailDrawer
        ticketId={selectedId}
        open={!!selectedId}
        onOpenChange={(v) => !v && setSelectedId(null)}
      />
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
