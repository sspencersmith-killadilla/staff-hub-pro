import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Users, Building2 } from "lucide-react";
import { getRoomPublic } from "@/lib/venues-public.functions";
import { SiteHeader } from "@/components/site-header";
import { VenueHoursDisplay } from "@/components/venue-hours-display";
import { RoomReservationForm } from "@/components/room-reservation-form";
import { RoomAvailabilityCalendar } from "@/components/room-availability-calendar";

const roomQO = (id: string) =>
  queryOptions({
    queryKey: ["public", "room", id],
    queryFn: () => getRoomPublic({ data: { id } }),
  });

import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute("/rooms/$id")({
  beforeLoad: () => requireModule("room_reservations"),
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(roomQO(params.id)),
  head: ({ loaderData }) => {
    const r: any = loaderData?.room;
    const v: any = loaderData?.venue;
    const title = r ? `${r.name} — ${v?.name ?? "Room"}` : "Room";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: r ? `Book ${r.name} at ${v?.name ?? "our venue"}.` : "Room",
        },
        { property: "og:title", content: title },
      ],
    };
  },
  component: RoomDetail,
  errorComponent: () => (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-3xl font-black uppercase text-slate-900">Room not found</h1>
        <p className="mt-3 text-slate-600">
          This room link is invalid or the room is no longer available.
        </p>
        <Link
          to="/venues"
          className="mt-6 inline-block rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Browse venues
        </Link>
      </main>
    </div>
  ),
});

function RoomDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(roomQO(id));
  const r: any = data.room;
  const v: any = data.venue;

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-12">
        {v && (
          <Link
            to="/venues/$id"
            params={{ id: String(v.id) }}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← {v.name}
          </Link>
        )}
        <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900 uppercase">
          {r.name}
        </h1>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
          {r.building && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-4 w-4" /> {r.building}
            </span>
          )}
          {r.capacity != null && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-4 w-4" /> Capacity {r.capacity}
            </span>
          )}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {r.is_publicly_bookable && (
              <RoomAvailabilityCalendar roomId={String(r.id)} />
            )}
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 mb-4">
                Request this room
              </h2>
              {r.is_publicly_bookable ? (
                <RoomReservationForm
                  roomId={String(r.id)}
                  openHours={v?.open_hours}
                  closures={v?.closures}
                />
              ) : (
                <p className="text-sm text-slate-600">
                  This room isn't available for public booking. Contact the venue
                  directly to inquire.
                </p>
              )}
            </div>
          </div>
          <aside>
            <VenueHoursDisplay
              openHours={v?.open_hours}
              closures={v?.closures}
              inheritedFrom={v?.name}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}
