import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { MapPin, Users, Building2 } from "lucide-react";
import { listRoomsPublic } from "@/lib/venues-public.functions";
import { SiteHeader } from "@/components/site-header";

const roomsQO = queryOptions({
  queryKey: ["public", "rooms"],
  queryFn: () => listRoomsPublic(),
});

export const Route = createFileRoute("/rooms/")({
  head: () => ({
    meta: [
      { title: "Reserve a Room — Total Event Systems" },
      {
        name: "description",
        content:
          "Browse and reserve publicly bookable rooms. Sign in or create an account to submit a booking request.",
      },
      { property: "og:title", content: "Reserve a Room" },
      {
        property: "og:description",
        content: "Browse and reserve publicly bookable rooms.",
      },
      { property: "og:url", content: "/rooms" },
    ],
    links: [{ rel: "canonical", href: "/rooms" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(roomsQO),
  component: RoomsIndex,
});

function RoomsIndex() {
  const { data: rooms } = useSuspenseQuery(roomsQO);

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h1 className="text-4xl font-black uppercase tracking-tight md:text-5xl">
            Room Reservations
          </h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Browse rooms available for public booking. Pick a room, choose your
            time, and submit a request — staff will review and confirm by email.
          </p>
          <div className="mt-6 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded border border-slate-700 bg-slate-800/50 px-4 py-3">
              <div className="font-bold text-white">1. Pick a room</div>
              <div>Choose from the list below.</div>
            </div>
            <div className="rounded border border-slate-700 bg-slate-800/50 px-4 py-3">
              <div className="font-bold text-white">2. Sign in</div>
              <div>Create an account or log in.</div>
            </div>
            <div className="rounded border border-slate-700 bg-slate-800/50 px-4 py-3">
              <div className="font-bold text-white">3. Submit</div>
              <div>Get email confirmation when approved.</div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {rooms.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
            <p className="text-slate-500">
              No publicly bookable rooms available right now. Check back soon.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(rooms as any[]).map((room) => (
              <Link
                key={room.id}
                to="/rooms/$id"
                params={{ id: String(room.id) }}
                className="group flex flex-col rounded-lg border border-slate-200 bg-white p-6 transition hover:border-slate-900 hover:shadow-md"
              >
                <h2 className="text-xl font-black uppercase text-slate-900 group-hover:underline">
                  {room.name}
                </h2>
                {room.venue && (
                  <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                    <Building2 className="h-4 w-4" />
                    <span>{room.venue.name}</span>
                  </div>
                )}
                {room.venue && (room.venue.address || room.venue.city) && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <MapPin className="h-3.5 w-3.5" />
                    {[room.venue.address, room.venue.city, room.venue.state]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                )}
                {room.capacity != null && (
                  <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-700">
                    <Users className="h-4 w-4" />
                    Capacity: {room.capacity}
                  </div>
                )}
                {room.building && (
                  <div className="mt-1 text-xs text-slate-500">
                    Building: {room.building}
                  </div>
                )}
                <div className="mt-auto pt-5">
                  <span className="inline-block rounded bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white group-hover:bg-slate-700">
                    Reserve →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
