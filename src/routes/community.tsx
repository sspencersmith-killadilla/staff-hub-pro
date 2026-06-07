import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, MapPin, Building2 } from "lucide-react";
import { listPublicCommunityEvents } from "@/lib/community-public.functions";
import { SiteHeader } from "@/components/site-header";

import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute("/community")({
  beforeLoad: () => requireModule("community_orgs"),
  head: () => ({
    meta: [
      { title: "Community Events" },
      {
        name: "description",
        content:
          "Events hosted by community organizations — churches, clubs, schools and nonprofits — at their own venues around town.",
      },
      { property: "og:title", content: "Community Events" },
      {
        property: "og:description",
        content:
          "Events hosted by community organizations at their own venues around town.",
      },
    ],
  }),
  component: CommunityPage,
});

function fmtWhen(starts: string, ends: string) {
  const s = new Date(starts);
  const e = new Date(ends);
  const date = s.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date} · ${t(s)} – ${t(e)}`;
}

function CommunityPage() {
  const fetchEvents = useServerFn(listPublicCommunityEvents);
  const { data, isLoading } = useQuery({
    queryKey: ["community", "events"],
    queryFn: () => fetchEvents(),
  });
  const events = data ?? [];
  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-900">
              <Building2 className="h-3.5 w-3.5" /> Community
            </div>
            <h1 className="mt-3 text-5xl font-black uppercase tracking-tight text-slate-900">
              Community events,
              <br />
              hosted around town.
            </h1>
            <p className="mt-4 max-w-2xl text-slate-600">
              Churches, clubs, schools and nonprofits run their own events at
              their own venues. Once approved by the city, they show up here
              alongside the official lineup.
            </p>
          </div>
          <Link
            to="/community/apply"
            className="hidden shrink-0 rounded-md bg-slate-900 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white hover:bg-slate-700 sm:inline-block"
          >
            Register your org
          </Link>
        </div>

        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
            <CalendarDays className="h-4 w-4" /> Upcoming
          </h2>
          {isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          ) : events.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No community events approved yet. Check back soon.
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {events.map((e: any) => (
                <li
                  key={e.id}
                  className="rounded-lg border border-slate-200 bg-white p-5"
                >
                  <div className="font-bold text-slate-900">{e.title}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {fmtWhen(e.starts_at, e.ends_at)}
                  </div>
                  {e.location && (
                    <div className="mt-1 flex items-start gap-1 text-xs text-slate-500">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {e.location.name}
                        {e.location.address && ` · ${e.location.address}`}
                        {e.location.city && `, ${e.location.city}`}
                      </span>
                    </div>
                  )}
                  {e.org && (
                    <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm">
                      <span className="font-semibold text-emerald-900">
                        {e.org.name}
                      </span>
                      {e.org.org_type && (
                        <span className="ml-1 text-emerald-700">
                          · {e.org.org_type}
                        </span>
                      )}
                    </div>
                  )}
                  {e.description && (
                    <p className="mt-3 text-sm text-slate-700">
                      {e.description}
                    </p>
                  )}
                  {e.cost_text && (
                    <p className="mt-2 text-xs text-slate-500">
                      Cost: {e.cost_text}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
