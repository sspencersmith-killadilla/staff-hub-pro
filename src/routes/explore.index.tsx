import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { listPublicQuests } from "@/lib/quests.functions";
import { Compass } from "lucide-react";

export const Route = createFileRoute("/explore/")({
  head: () => ({
    meta: [
      { title: "Civic Quests & Discovery" },
      {
        name: "description",
        content:
          "Explore self-guided adventures around the city. Earn badges by scanning, visiting, and discovering.",
      },
      { property: "og:title", content: "Civic Quests & Discovery" },
      {
        property: "og:description",
        content: "Self-guided city quests. Scan, visit, and earn badges.",
      },
    ],
  }),
  component: ExploreIndexPage,
});

function ExploreIndexPage() {
  const fetchAll = useServerFn(listPublicQuests);
  const { data, isLoading } = useQuery({
    queryKey: ["public", "quests"],
    queryFn: () => fetchAll(),
  });

  const quests = data?.quests ?? [];

  return (
    <div className="min-h-dvh bg-amber-50">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 flex items-center gap-3">
          <Compass className="h-10 w-10 text-amber-700" aria-hidden="true" />
          <div>
            <h1 className="font-serif text-4xl font-black tracking-tight text-stone-900">
              Civic Quests
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Self-guided adventures. Scan, visit, discover — earn badges and
              points along the way.
            </p>
          </div>
        </header>

        {isLoading ? (
          <p className="text-sm text-stone-500">Loading quests…</p>
        ) : quests.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-stone-300 bg-white/60 p-12 text-center">
            <p className="text-stone-600">
              No active quests yet. Check back soon!
            </p>
          </div>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {quests.map((q) => (
              <li
                key={q.id}
                className="group relative overflow-hidden rounded-xl border-2 border-stone-900 bg-amber-100 shadow-[6px_6px_0_0_rgba(0,0,0,0.9)] transition hover:-translate-y-1 hover:shadow-[8px_8px_0_0_rgba(0,0,0,0.9)]"
              >
                <Link
                  to="/explore/$questId"
                  params={{ questId: q.id }}
                  className="block p-5"
                >
                  {q.badge_image_url && (
                    <img
                      src={q.badge_image_url}
                      alt=""
                      className="mb-3 h-20 w-20 rounded-full border-2 border-stone-900 object-cover"
                    />
                  )}
                  <h2 className="font-serif text-xl font-black text-stone-900">
                    {q.title}
                  </h2>
                  {q.description && (
                    <p className="mt-2 text-sm text-stone-700 line-clamp-3">
                      {q.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-stone-700">
                    <span>{q.waypoint_count} waypoints</span>
                    <span className="rounded-full bg-stone-900 px-2 py-0.5 text-amber-100">
                      +{q.points_reward} pts
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
