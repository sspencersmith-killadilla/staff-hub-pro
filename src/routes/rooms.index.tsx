import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { MapPin, Users, Building2 } from "lucide-react";
import { listRoomsPublic } from "@/lib/venues-public.functions";
import { SiteHeader } from "@/components/site-header";
import { requireModule } from "@/lib/require-module";

const roomsQO = queryOptions({
  queryKey: ["public", "rooms"],
  queryFn: () => listRoomsPublic(),
});

export const Route = createFileRoute("/rooms/")({
  beforeLoad: () => requireModule("room_reservations"),
  head: () => ({
    meta: [
      { title: "Reserve a Room — Total Event Systems" },
      {
        name: "description",
        content: "Browse and reserve publicly bookable rooms. Sign in to submit a booking request.",
      },
    ],
    links: [{ rel: "canonical", href: "/rooms" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(roomsQO),
  component: RoomsIndex,
});

function RoomsIndex() {
  const { data: rooms } = useSuspenseQuery(roomsQO);

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Room Reservations</h1>
          <p className="mt-2 text-gray-600 max-w-2xl">
            Browse rooms available for public booking. Pick a room, choose your time, and submit a request.
          </p>
        </div>

        {rooms.length === 0? (
          <div className="rounded-2xl border bg-white p-12 text-center">
            <p className="text-gray-500">No publicly bookable rooms available right now.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(rooms as any[]).map((room) => (
              <Link
                key={room.id}
                to="/rooms/$id"
                params={{ id: String(room.id) }}
                className="group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md"
              >
                {room.image_url? (
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
                      {[room.venue.city, room.venue.state].filter(Boolean).join(", ")}
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
                      <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
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
