import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { MapPin, Users, Music, DoorOpen } from "lucide-react";
import { getVenuePublic } from "@/lib/venues-public.functions";
import { SiteHeader } from "@/components/site-header";
import { VenueHoursDisplay } from "@/components/venue-hours-display";

const venueQO = (id: number) =>
  queryOptions({
    queryKey: ["public", "venue", id],
    queryFn: () => getVenuePublic({ data: { id } }),
  });

export const Route = createFileRoute("/venues/$id")({
  loader: async ({ params, context }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id)) throw notFound();
    return context.queryClient.ensureQueryData(venueQO(id));
  },
  head: ({ loaderData }) => {
    const v: any = loaderData?.venue;
    const title = v ? `${v.name} — Total Event Systems` : "Venue";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: v
            ? `${v.name} in ${[v.city, v.state].filter(Boolean).join(", ") || "—"}. Hours, stages, and rooms.`
            : "Venue details",
        },
        { property: "og:title", content: title },
      ],
      links: v ? [{ rel: "canonical", href: `/venues/${v.id}` }] : [],
    };
  },
  component: VenueDetail,
  notFoundComponent: () => (
    <div className="p-12 text-center text-slate-500">Venue not found.</div>
  ),
  errorComponent: ({ error }) => (
    <div className="p-12 text-center text-slate-500">{error.message}</div>
  ),
});

function VenueDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(venueQO(Number(id)));
  const v: any = data.venue;
  const stages: any[] = data.stages;
  const rooms: any[] = data.rooms;
  const address = [v.address, v.city, v.state, v.zip].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <Link to="/venues" className="text-sm text-slate-500 hover:text-slate-900">
          ← All venues
        </Link>
        <div className="mt-3 flex items-start gap-3 flex-wrap">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase">
            {v.name}
          </h1>
          <FavoriteButton itemType="venue" itemId={id} label />
        </div>
        {address && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <MapPin className="h-4 w-4" /> {address}
          </a>
        )}

        <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-600">
          {v.capacity != null && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-4 w-4" /> Capacity {v.capacity}
            </span>
          )}
          {v.stage_type && <span>Type: {v.stage_type}</span>}
        </div>

        {v.rules && (
          <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 mb-2">
              Rules
            </h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{v.rules}</p>
          </section>
        )}

        {v.load_in_notes && (
          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 mb-2">
              Load-in Notes
            </h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              {v.load_in_notes}
            </p>
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Music className="h-4 w-4 text-slate-700" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Stages
                </h2>
              </div>
              {stages.length === 0 ? (
                <p className="text-sm text-slate-500">No stages listed.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {stages.map((s) => (
                    <li key={s.id}>
                      <Link
                        to="/stages/$id"
                        params={{ id: s.id }}
                        className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-900 transition"
                      >
                        <div className="font-semibold text-slate-900">{s.name}</div>
                        {s.description && (
                          <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                            {s.description}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="flex items-center gap-2 mb-3">
                <DoorOpen className="h-4 w-4 text-slate-700" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Bookable Rooms
                </h2>
              </div>
              {rooms.length === 0 ? (
                <p className="text-sm text-slate-500">No bookable rooms.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {rooms.map((r) => (
                    <li key={r.id}>
                      <Link
                        to="/rooms/$id"
                        params={{ id: r.id }}
                        className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-900 transition"
                      >
                        <div className="font-semibold text-slate-900">{r.name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {[r.building, r.capacity && `Cap. ${r.capacity}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside>
            <VenueHoursDisplay openHours={v.open_hours} closures={v.closures} />
          </aside>
        </div>
      </main>
    </div>
  );
}
