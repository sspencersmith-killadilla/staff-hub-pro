import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import {
  getLeaderboard,
  getMyLeaderboardRank,
} from "@/lib/leaderboard.functions";
import { Trophy, Medal, Compass } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Quest Leaderboard" },
      {
        name: "description",
        content:
          "Top explorers ranked by points earned completing civic quests around the city.",
      },
      { property: "og:title", content: "Quest Leaderboard" },
      {
        property: "og:description",
        content: "See the top explorers earning points on civic quests.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-rose-700" role="alert">
      Could not load the leaderboard: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-10">Leaderboard not found.</div>,
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { me } = useAuth();
  const fetchBoard = useServerFn(getLeaderboard);
  const fetchMyRank = useServerFn(getMyLeaderboardRank);

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetchBoard({ data: { limit: 100 } }),
  });

  const { data: mine } = useQuery({
    queryKey: ["my-leaderboard-rank"],
    queryFn: () => fetchMyRank(),
    enabled: !!me,
  });

  if (data?.disabled) {
    return (
      <div className="min-h-dvh bg-amber-50">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-6 py-20 text-center">
          <Compass className="mx-auto h-12 w-12 text-stone-400" />
          <h1 className="mt-4 font-serif text-3xl font-black text-stone-900">
            Civic Quests is offline
          </h1>
          <p className="mt-2 text-stone-600">
            An admin has turned off the Civic Quests module. Check back later.
          </p>
        </main>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="min-h-dvh bg-amber-50">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <header className="flex items-center gap-3">
          <Trophy className="h-10 w-10 text-amber-600" aria-hidden="true" />
          <div>
            <h1 className="font-serif text-4xl font-black tracking-tight text-stone-900">
              Quest Leaderboard
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              {data?.total_players ?? 0} explorers earning points across the city.{" "}
              <Link
                to="/explore"
                className="font-bold underline hover:text-stone-900"
              >
                Browse quests →
              </Link>
            </p>
          </div>
        </header>

        {mine && mine.rank != null && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border-2 border-stone-900 bg-amber-100 px-4 py-2 text-sm font-bold text-stone-900 shadow-[3px_3px_0_0_rgba(0,0,0,0.9)]">
            You are <span className="text-amber-700">#{mine.rank}</span> ·{" "}
            {mine.points} pts
          </div>
        )}

        {isLoading ? (
          <p className="mt-10 text-sm text-stone-500">Loading leaderboard…</p>
        ) : rows.length === 0 ? (
          <div className="mt-10 rounded-xl border-2 border-dashed border-stone-300 bg-white/60 p-12 text-center">
            <p className="text-stone-600">
              No explorers yet — be the first to earn points on a quest!
            </p>
            <Link
              to="/explore"
              className="mt-4 inline-block rounded-md bg-stone-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-100 hover:bg-stone-700"
            >
              Start exploring
            </Link>
          </div>
        ) : (
          <>
            {top3.length > 0 && (
              <ol className="mt-8 grid gap-4 sm:grid-cols-3">
                {top3.map((r) => (
                  <li
                    key={r.user_id}
                    className={`rounded-xl border-2 border-stone-900 p-5 text-center shadow-[6px_6px_0_0_rgba(0,0,0,0.9)] ${
                      r.rank === 1
                        ? "bg-amber-200"
                        : r.rank === 2
                          ? "bg-stone-100"
                          : "bg-orange-100"
                    }`}
                  >
                    <Medal
                      className={`mx-auto h-8 w-8 ${
                        r.rank === 1
                          ? "text-amber-700"
                          : r.rank === 2
                            ? "text-stone-500"
                            : "text-orange-700"
                      }`}
                    />
                    <p className="mt-2 text-xs font-bold uppercase tracking-wider text-stone-600">
                      #{r.rank}
                    </p>
                    {r.avatar_url ? (
                      <img
                        src={r.avatar_url}
                        alt=""
                        className="mx-auto mt-2 h-16 w-16 rounded-full border-2 border-stone-900 object-cover"
                      />
                    ) : (
                      <div className="mx-auto mt-2 grid h-16 w-16 place-items-center rounded-full border-2 border-stone-900 bg-white text-2xl font-black text-stone-700">
                        {r.display_name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <p className="mt-3 font-bold text-stone-900">
                      {r.display_name}
                    </p>
                    <p className="text-sm text-stone-700">{r.points} pts</p>
                  </li>
                ))}
              </ol>
            )}

            {rest.length > 0 && (
              <ol className="mt-8 overflow-hidden rounded-xl border-2 border-stone-900 bg-white">
                {rest.map((r) => (
                  <li
                    key={r.user_id}
                    className="flex items-center gap-4 border-b border-stone-200 px-4 py-3 last:border-b-0"
                  >
                    <span className="w-10 text-xs font-bold uppercase tracking-wider text-stone-500">
                      #{r.rank}
                    </span>
                    {r.avatar_url ? (
                      <img
                        src={r.avatar_url}
                        alt=""
                        className="h-9 w-9 rounded-full border border-stone-300 object-cover"
                      />
                    ) : (
                      <div className="grid h-9 w-9 place-items-center rounded-full border border-stone-300 bg-stone-50 font-bold text-stone-700">
                        {r.display_name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 font-medium text-stone-900">
                      {r.display_name}
                    </span>
                    <span className="font-bold text-stone-900">
                      {r.points} pts
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </main>
    </div>
  );
}
