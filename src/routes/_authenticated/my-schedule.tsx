import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarHeart, MapPin, Download, Trash2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { getMyItinerary, type ItineraryItem } from "@/lib/favorites.functions";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/favorite-button";

export const Route = createFileRoute("/_authenticated/my-schedule")({
  head: () => ({
    meta: [
      { title: "My Favorites" },
      {
        name: "description",
        content:
          "Your personalized festival itinerary — events, artists, vendors, rooms and venues you've saved.",
      },
    ],
  }),
  component: MySchedulePage,
});

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function detectConflicts(items: ItineraryItem[]) {
  const conflicts = new Set<string>();
  const timed = items.filter((i) => i.starts_at && i.ends_at);
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (a.starts_at! < b.ends_at! && b.starts_at! < a.ends_at!) {
        conflicts.add(a.key);
        conflicts.add(b.key);
      }
    }
  }
  return conflicts;
}

function buildIcs(items: ItineraryItem[]) {
  const fmt = (iso: string) =>
    iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lovable//My Schedule//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const item of items) {
    if (!item.starts_at || !item.ends_at) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.key}@itinerary`,
      `DTSTAMP:${fmt(new Date().toISOString())}`,
      `DTSTART:${fmt(item.starts_at)}`,
      `DTEND:${fmt(item.ends_at)}`,
      `SUMMARY:${item.title.replace(/[\n,;]/g, " ")}`,
      item.location
        ? `LOCATION:${item.location.replace(/[\n,;]/g, " ")}`
        : "",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

function MySchedulePage() {
  const fetchItin = useServerFn(getMyItinerary);
  const { data, isLoading } = useQuery({
    queryKey: ["itinerary"],
    queryFn: () => fetchItin(),
  });

  const items = data?.items ?? [];
  const conflicts = detectConflicts(items);
  const timed = items.filter((i) => i.starts_at);
  const untimed = items.filter((i) => !i.starts_at);

  // Group timed items by day
  const byDay = new Map<string, ItineraryItem[]>();
  for (const it of timed) {
    const k = dayKey(it.starts_at!);
    const list = byDay.get(k) ?? [];
    list.push(it);
    byDay.set(k, list);
  }

  const downloadIcs = () => {
    const ics = buildIcs(timed);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-schedule.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-rose-900">
              <CalendarHeart className="h-3.5 w-3.5" /> My Favorites
            </div>
            <h1 className="mt-3 text-4xl font-black uppercase tracking-tight text-slate-900">
              Your personalized favorites
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Everything you've saved — sessions, community programs,
              streetbeats gigs, artists, vendors, rooms, and venues.
            </p>
          </div>
          {timed.length > 0 && (
            <Button onClick={downloadIcs} variant="outline">
              <Download className="h-4 w-4" /> Add to calendar (.ics)
            </Button>
          )}
        </div>

        {isLoading && (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        )}

        {!isLoading && items.length === 0 && (
          <div className="mt-10 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-slate-700 font-semibold">
              No favorites yet.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Tap the heart on any event, artist, vendor, room, or venue to
              add it here.
            </p>
            <div className="mt-4 flex justify-center gap-3 flex-wrap">
              <Link
                to="/events"
                className="text-sm font-bold uppercase tracking-wider text-slate-900 underline-offset-4 hover:underline"
              >
                Browse events →
              </Link>
              <Link
                to="/streetbeats"
                className="text-sm font-bold uppercase tracking-wider text-slate-900 underline-offset-4 hover:underline"
              >
                Streetbeats →
              </Link>
            </div>
          </div>
        )}

        {byDay.size > 0 && (
          <section className="mt-10 space-y-10">
            {Array.from(byDay.entries()).map(([day, list]) => (
              <div key={day}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {day}
                </h2>
                <ul className="mt-3 space-y-3">
                  {list.map((it) => (
                    <ItineraryRow
                      key={it.key}
                      item={it}
                      conflict={conflicts.has(it.key)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {untimed.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Saved places & people
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {untimed.map((it) => (
                <ItineraryRow key={it.key} item={it} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function ItineraryRow({
  item,
  conflict,
}: {
  item: ItineraryItem;
  conflict?: boolean;
}) {
  return (
    <li
      className={
        "flex items-start gap-4 rounded-lg border bg-white p-4 " +
        (conflict ? "border-amber-400" : "border-slate-200")
      }
    >
      {item.image_url ? (
        <img
          src={item.image_url}
          alt=""
          className="h-14 w-14 rounded object-cover shrink-0"
        />
      ) : (
        <div className="h-14 w-14 rounded bg-slate-100 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <Link
          to={item.href}
          className="font-semibold text-slate-900 hover:underline"
        >
          {item.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {item.starts_at && (
            <span className="font-semibold text-slate-700">
              {fmtTime(item.starts_at)}
              {item.ends_at && ` – ${fmtTime(item.ends_at)}`}
            </span>
          )}
          {item.subtitle && <span>{item.subtitle}</span>}
          {item.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {item.location}
            </span>
          )}
          {conflict && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
              Overlaps another favorite
            </span>
          )}
        </div>
      </div>
      <FavoriteButton
        itemType={item.item_type}
        itemId={item.item_id}
        size="sm"
        className="shrink-0"
      />
      <Link
        to={item.href}
        aria-label="Open"
        className="hidden sm:inline-flex shrink-0 items-center justify-center rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
      >
        →
      </Link>
      {/* spacer to align the trash icon area visually on small screens */}
      <span className="sr-only">
        <Trash2 className="h-4 w-4" />
      </span>
    </li>
  );
}
