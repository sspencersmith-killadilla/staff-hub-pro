import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CalendarDays, MapPin, Music2, Ticket, Users } from "lucide-react";
import { listPublicAllEvents, type UnifiedEvent } from "@/lib/events-public.functions";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/events/")({
  head: () => ({
    meta: [
      { title: "Upcoming Events" },
      {
        name: "description",
        content:
          "All city events, community gatherings, and live music in one place. Filter, sort, and grab tickets.",
      },
      { property: "og:title", content: "Upcoming Events" },
      {
        property: "og:description",
        content:
          "All city events, community gatherings, and live music in one place.",
      },
    ],
  }),
  component: EventsPage,
});

type SourceFilter = "all" | "city" | "community" | "music";
type SortKey = "date_asc" | "date_desc" | "title_asc";

function fmtWhen(starts: string | null, ends: string | null) {
  if (!starts) return "TBA";
  const s = new Date(starts);
  const date = s.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const startT = t(s);
  const endT = ends ? t(new Date(ends)) : null;
  return `${date} · ${startT}${endT ? ` – ${endT}` : ""}`;
}

const SOURCE_META: Record<
  Exclude<SourceFilter, "all">,
  { label: string; icon: typeof CalendarDays; chip: string; outline: string }
> = {
  city: {
    label: "City Event",
    icon: Ticket,
    chip: "bg-yellow-100 text-yellow-900",
    outline: "border-2 border-yellow-400",
  },
  community: {
    label: "Community",
    icon: Users,
    chip: "bg-purple-100 text-purple-900",
    outline: "border-2 border-purple-500",
  },
  music: {
    label: "Live Music",
    icon: Music2,
    chip: "bg-pink-100 text-pink-900",
    outline: "border-2 border-pink-500",
  },
};

function EventsPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [source, setSource] = useState<SourceFilter>("all");
  const [venue, setVenue] = useState<string>("all");
  const [subLocation, setSubLocation] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [sort, setSort] = useState<SortKey>("date_asc");

  const fetchEvents = useServerFn(listPublicAllEvents);
  const { data, isLoading } = useQuery({
    queryKey: ["events", "all", includeArchived],
    queryFn: () => fetchEvents({ data: { includeArchived } }),
  });

  const all: UnifiedEvent[] = (data as UnifiedEvent[] | undefined) ?? [];

  const venues = useMemo(() => {
    const set = new Set<string>();
    for (const e of all) if (e.venue_name) set.add(e.venue_name);
    return Array.from(set).sort();
  }, [all]);

  // Sub-locations (stages/rooms) scoped to the chosen venue
  const subLocations = useMemo(() => {
    const map = new Map<string, "stage" | "room">();
    for (const e of all) {
      if (!e.sub_location_name || !e.sub_location_type) continue;
      if (venue !== "all" && e.venue_name !== venue) continue;
      map.set(e.sub_location_name, e.sub_location_type);
    }
    return Array.from(map.entries())
      .map(([name, type]) => ({ name, type }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all, venue]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startTs = start ? new Date(start).getTime() : null;
    const endTs = end ? new Date(end).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    let list = all.filter((e) => {
      if (source !== "all" && e.source !== source) return false;
      if (venue !== "all" && e.venue_name !== venue) return false;
      if (subLocation !== "all" && e.sub_location_name !== subLocation) return false;
      if (q) {
        const blob = [e.title, e.description, e.venue_name, e.sub_location_name, e.org_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (e.starts_at) {
        const ts = new Date(e.starts_at).getTime();
        if (startTs && ts < startTs) return false;
        if (endTs && ts > endTs) return false;
      }
      return true;
    });
    list = list.sort((a, b) => {
      if (sort === "title_asc") return a.title.localeCompare(b.title);
      const at = a.starts_at ? new Date(a.starts_at).getTime() : 0;
      const bt = b.starts_at ? new Date(b.starts_at).getTime() : 0;
      return sort === "date_asc" ? at - bt : bt - at;
    });
    return list;
  }, [all, source, venue, subLocation, search, start, end, sort]);

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
              <CalendarDays className="h-3.5 w-3.5" /> What's on
            </div>
            <h1 className="mt-3 text-5xl font-black uppercase tracking-tight text-slate-900">
              Upcoming events
              <br />
              around town.
            </h1>
            <p className="mt-4 max-w-2xl text-slate-600">
              City-run events, community gatherings, and live music — all in one
              feed. Filter by type or venue, search, or jump to a date range.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-500">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Show past events
          </label>
        </div>

        {/* Filters */}
        <div className="mt-8 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Search
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Event, venue, organizer…"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Type
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as SourceFilter)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All types</option>
              <option value="city">City events (ticketed)</option>
              <option value="community">Community</option>
              <option value="music">Live music</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Venue
            </label>
            <select
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All venues</option>
              {venues.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              From
            </label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              To
            </label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="lg:col-span-6 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              {filtered.length} event{filtered.length === 1 ? "" : "s"}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Sort
              </span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="date_asc">Date — soonest</option>
                <option value="date_desc">Date — latest</option>
                <option value="title_asc">Title — A→Z</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results */}
        <section className="mt-8">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
              No events match your filters.
              {!includeArchived && " Try enabling 'Show past events'."}
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((e) => {
                const meta = SOURCE_META[e.source];
                const Icon = meta.icon;
                const isPast = e.ends_at
                  ? new Date(e.ends_at).getTime() < Date.now()
                  : false;
                return (
                  <li
                    key={`${e.source}-${e.id}`}
                    className={`flex flex-col overflow-hidden rounded-xl bg-white ${meta.outline}`}
                  >
                    {e.image_url ? (
                      <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100">
                        <img
                          src={e.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="aspect-[16/9] w-full bg-gradient-to-br from-slate-900 to-slate-700" />
                    )}
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.chip}`}
                        >
                          <Icon className="h-3 w-3" /> {meta.label}
                        </span>
                        {isPast && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                            Past
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 text-lg font-bold text-slate-900">
                        {e.title}
                      </h3>
                      <div className="mt-1 text-sm text-slate-600">
                        {fmtWhen(e.starts_at, e.ends_at)}
                      </div>
                      {(e.venue_name || e.venue_city) && (
                        <div className="mt-2 flex items-start gap-1 text-xs text-slate-500">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            {e.venue_name}
                            {e.venue_city && `, ${e.venue_city}`}
                          </span>
                        </div>
                      )}
                      {e.org_name && (
                        <div className="mt-2 text-xs text-slate-500">
                          Hosted by {e.org_name}
                        </div>
                      )}
                      {e.description && (
                        <p className="mt-3 line-clamp-3 text-sm text-slate-700">
                          {e.description}
                        </p>
                      )}
                      <div className="mt-4 flex-1" />
                      {e.ticketed ? (
                        <Link
                          to="/events/$id"
                          params={{ id: e.id }}
                          className="mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white hover:bg-slate-700"
                        >
                          <Ticket className="h-4 w-4" /> Get tickets
                        </Link>
                      ) : e.source === "community" && e.image_url ? (
                        <a
                          href={e.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-900 hover:bg-slate-100"
                        >
                          More info
                        </a>
                      ) : e.detail_href ? (
                        <a
                          href={e.detail_href}
                          className="mt-3 inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-900 hover:bg-slate-100"
                        >
                          More info
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
