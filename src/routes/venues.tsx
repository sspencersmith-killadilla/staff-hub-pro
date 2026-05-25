import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { listVenuesPublic } from "@/lib/venues-public.functions";
import { SiteHeader } from "@/components/site-header";

const venuesQO = queryOptions({
  queryKey: ["public", "venues"],
  queryFn: () => listVenuesPublic(),
});

export const Route = createFileRoute("/venues")({
  head: () => ({
    meta: [
      { title: "Venues — Total Event Systems" },
      {
        name: "description",
        content: "Browse our venues, stages, and bookable rooms.",
      },
      { property: "og:title", content: "Venues — Total Event Systems" },
      { property: "og:url", content: "/venues" },
    ],
    links: [{ rel: "canonical", href: "/venues" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(venuesQO),
  component: VenuesIndex,
});

function VenuesIndex() {
  const { data: venues } = useSuspenseQuery(venuesQO);
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase">
          Venues
        </h1>
        <p className="mt-2 text-slate-600">
          Locations, stages, and rooms across our network.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {(venues as any[]).map((v) => (
            <Link
              key={v.id}
              to="/venues/$id"
              params={{ id: String(v.id) }}
              className="group rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-900 hover:shadow-sm transition"
            >
              <h2 className="text-lg font-bold text-slate-900 group-hover:underline">
                {v.name}
              </h2>
              <div className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                <MapPin className="h-3.5 w-3.5" />
                {[v.address, v.city, v.state].filter(Boolean).join(", ") || "Address TBA"}
              </div>
              {v.capacity && (
                <div className="mt-2 text-xs text-slate-500">
                  Capacity: {v.capacity}
                </div>
              )}
            </Link>
          ))}
          {venues.length === 0 && (
            <p className="text-slate-500">No venues published yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
