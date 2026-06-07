import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { getStagePublic } from "@/lib/venues-public.functions";
import { SiteHeader } from "@/components/site-header";
import { VenueHoursDisplay } from "@/components/venue-hours-display";

const stageQO = (id: string) =>
  queryOptions({
    queryKey: ["public", "stage", id],
    queryFn: () => getStagePublic({ data: { id } }),
  });

export const Route = createFileRoute("/stages/$id")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(stageQO(params.id)),
  head: ({ loaderData }) => {
    const s: any = loaderData?.stage;
    const v: any = loaderData?.venue;
    const title = s ? `${s.name} — ${v?.name ?? "Stage"}` : "Stage";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: s ? `${s.name} at ${v?.name ?? "our venue"}.` : "Stage",
        },
        { property: "og:title", content: title },
      ],
    };
  },
  component: StageDetail,
  errorComponent: ({ error }) => (
    <div className="p-12 text-center text-slate-500">{error.message}</div>
  ),
});

function StageDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(stageQO(id));
  const s: any = data.stage;
  const v: any = data.venue;
  const address = s.address || [v?.address, v?.city, v?.state].filter(Boolean).join(", ");

  return (
    <div className="min-h-dvh bg-slate-50">
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
          {s.name}
        </h1>
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

        {s.description && (
          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              {s.description}
            </p>
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 mb-3">
              About this stage
            </h2>
            <p className="text-sm text-slate-600">
              Performances are scheduled by staff. Operating hours and closures are
              inherited from the parent venue.
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
