import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { PizzaTracker } from "@/components/tickets/PizzaTracker";
import { listMyTickets } from "@/lib/tickets.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { MapPin, Clock, Plus } from "lucide-react";

type Search = { new?: string };

export const Route = createFileRoute("/_authenticated/my-reports")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    new: typeof s.new === "string" ? s.new : undefined,
  }),
  head: () => ({
    meta: [
      { title: "My Reports" },
      { name: "description", content: "Track the status of your 311 reports." },
    ],
  }),
  component: MyReportsPage,
});

function MyReportsPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const fetchMine = useServerFn(listMyTickets);
  const { data, isLoading } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: () => fetchMine(),
  });

  useEffect(() => {
    if (!me?.userId) return;
    const channel = supabase
      .channel(`my-tickets-${me?.userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets", filter: `user_id=eq.${me?.userId}` },
        () => qc.invalidateQueries({ queryKey: ["my-tickets"] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_updates" },
        () => qc.invalidateQueries({ queryKey: ["my-tickets"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me?.userId, qc]);

  const tickets = data?.tickets ?? [];
  const updatesByTicket = data?.updates ?? {};

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-700">
              311 · Tracker
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#002f49]">
              My Reports
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Status updates land here in real time as the city works on your report.
            </p>
          </div>
          <Link
            to="/report"
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-amber-700"
          >
            <Plus className="h-4 w-4" /> New report
          </Link>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tickets.length === 0 ? (
          <div className="rounded-xl border bg-white p-10 text-center">
            <p className="text-muted-foreground">
              You haven't reported any issues yet.
            </p>
            <Link
              to="/report"
              className="mt-4 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-amber-700"
            >
              <Plus className="h-4 w-4" /> Report something
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {tickets.map((t) => {
              const updates = updatesByTicket[t.id] ?? [];
              const notes = updates.filter((u) => u.public_note);
              return (
                <li
                  key={t.id}
                  className="overflow-hidden rounded-xl border bg-white shadow-sm"
                >
                  <div className="flex gap-4 p-4">
                    {t.photo_url && (
                      <img
                        src={t.photo_url}
                        alt=""
                        className="h-20 w-20 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                          {t.category?.name ?? "Issue"}
                        </span>
                        {t.department?.name && (
                          <span className="text-xs text-muted-foreground">
                            · {t.department.name}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-foreground">
                        {t.description}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {t.location_address && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {t.location_address}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />{" "}
                          {new Date(t.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t bg-slate-50 px-4 py-4">
                    <PizzaTracker status={t.status} />
                  </div>
                  {notes.length > 0 && (
                    <div className="border-t px-4 py-3">
                      <h4 className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Updates from staff
                      </h4>
                      <ul className="space-y-2">
                        {notes.map((u) => (
                          <li
                            key={u.id}
                            className="rounded-md bg-amber-50 p-3 text-sm text-amber-900"
                          >
                            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                              {new Date(u.created_at).toLocaleString()}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap">{u.public_note}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
