import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Users, Building2 } from "lucide-react";
import { getRoomPublic } from "@/lib/venues-public.functions";
import { SiteHeader } from "@/components/site-header";
import { VenueHoursDisplay } from "@/components/venue-hours-display";

const roomQO = (id: string) =>
  queryOptions({
    queryKey: ["public", "room", id],
    queryFn: () => getRoomPublic({ data: { id } }),
  });

export const Route = createFileRoute("/rooms/$id")({
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
  errorComponent: ({ error }) => (
    <div className="p-12 text-center text-slate-500">{error.message}</div>
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
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 mb-3">
              Reserve this room
            </h2>
            <p className="text-sm text-slate-600">
              To request this room, contact the venue or use the staff reservation
              system. Bookings must fall within operating hours and outside any
              listed closures.
            </p>
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
