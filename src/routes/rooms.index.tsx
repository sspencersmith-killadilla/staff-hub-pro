import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import { MapPin, Users, Building2, X } from "lucide-react";
import { listRoomsPublic } from "@/lib/venues-public.functions";
import { SiteHeader } from "@/components/site-header";
import { requireModule } from "@/lib/require-module";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

const roomsQO = queryOptions({
  queryKey: ["public", "rooms"],
  queryFn: () => listRoomsPublic(),
});

const searchSchema = z.object({
  venue: fallback(z.string(), "").default(""),
  min_cap: fallback(z.number().int().min(0), 0).default(0),
  tags: fallback(z.array(z.string()), []).default([]),
});

export const Route = createFileRoute("/rooms/")({
  beforeLoad: () => requireModule("room_reservations"),
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Reserve a Room — Total Event Systems" },
      {
        name: "description",
        content:
          "Browse and reserve publicly bookable rooms. Sign in to submit a booking request.",
      },
    ],
    links: [{ rel: "canonical", href: "/rooms" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(roomsQO),
  component: RoomsIndex,
});

function RoomsIndex() {
  const { data: rooms } = useSuspenseQuery(roomsQO);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const allVenues = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rooms as any[]) {
      if (r.venue?.id) map.set(String(r.venue.id), r.venue.name);
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [rooms]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const r of rooms as any[]) for (const t of r.tags ?? []) s.add(t);
    return Array.from(s).sort();
  }, [rooms]);

  const filtered = useMemo(() => {
    return (rooms as any[]).filter((r) => {
      if (search.venue && String(r.venue?.id ?? "") !== search.venue) return false;
      if (search.min_cap > 0 && (r.capacity ?? 0) < search.min_cap) return false;
      if (search.tags.length > 0) {
        const tags = new Set<string>(r.tags ?? []);
        if (!search.tags.every((t: string) => tags.has(t))) return false;
      }
      return true;
    });
  }, [rooms, search]);

  const hasFilter =
    !!search.venue || search.min_cap > 0 || search.tags.length > 0;

  const toggleTag = (t: string) => {
    navigate({
      search: (prev: z.infer<typeof searchSchema>) => {
        const exists = prev.tags.includes(t);
        return {
          ...prev,
          tags: exists ? prev.tags.filter((x: string) => x !== t) : [...prev.tags, t],
        };
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Room Reservations</h1>
          <p className="mt-2 text-gray-600 max-w-2xl">
            Browse rooms available for public booking. Pick a room, choose your
            time, and submit a request.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-xl border bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Venue
              </label>
              <Select
                value={search.venue || "all"}
                onValueChange={(v) =>
                  navigate({
                    search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, venue: v === "all" ? "" : v }),
                  })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Any venue" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any venue</SelectItem>
                  {allVenues.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Min capacity
              </label>
              <Input
                type="number"
                min={0}
                className="mt-1"
                value={search.min_cap || ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  navigate({
                    search: (prev: z.infer<typeof searchSchema>) => ({
                      ...prev,
                      min_cap: Number.isFinite(n) && n > 0 ? n : 0,
                    }),
                  });
                }}
                placeholder="e.g. 20"
              />
            </div>
            <div className="flex items-end justify-end">
              {hasFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigate({
                      search: { venue: "", min_cap: 0, tags: [] },
                    })
                  }
                >
                  <X className="mr-1 h-4 w-4" /> Clear filters
                </Button>
              )}
            </div>
          </div>
          {allTags.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tags
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {allTags.map((t) => {
                  const active = search.tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        active
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-white p-12 text-center">
            <p className="text-gray-500">
              {hasFilter
                ? "No rooms match your filters."
                : "No publicly bookable rooms available right now."}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((room) => (
              <Link
                key={room.id}
                to="/rooms/$id"
                params={{ id: String(room.id) }}
                className="group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md"
              >
                {room.image_url ? (
                  <div className="h-48 w-full bg-gray-100">
                    <img
                      src={room.image_url}
                      alt={room.name}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="h-48 w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    <Building2 className="h-12 w-12 text-gray-400" />
                  </div>
                )}

                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700">
                    {room.name}
                  </h2>

                  {room.venue && (
                    <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-600">
                      <Building2 className="h-4 w-4" />
                      <span>{room.venue.name}</span>
                    </div>
                  )}

                  {room.venue && (room.venue.address || room.venue.city) && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {[room.venue.city, room.venue.state]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    {room.capacity && (
                      <div className="flex items-center gap-1 text-gray-700">
                        <Users className="h-4 w-4" />
                        <span>Up to {room.capacity}</span>
                      </div>
                    )}
                    {(room.tags ?? []).slice(0, 4).map((t: string) => (
                      <span
                        key={t}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto pt-4">
                    <span className="text-sm font-medium text-gray-900 group-hover:underline">
                      View details →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
