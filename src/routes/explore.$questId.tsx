import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import {
  getPublicQuest,
  getMyQuestProgress,
  completeWaypoint,
  type PublicWaypoint,
} from "@/lib/quests.functions";
import { CheckCircle2, MapPin, QrCode, HandHeart } from "lucide-react";

const Scanner = lazy(() =>
  import("@yudiel/react-qr-scanner").then((m) => ({ default: m.Scanner })),
);

export const Route = createFileRoute("/explore/$questId")({
  component: QuestDetailPage,
});

function QuestDetailPage() {
  const { questId } = Route.useParams();
  const qc = useQueryClient();
  const { me } = useAuth();
  const isAuthed = !!me;

  const fetchQuest = useServerFn(getPublicQuest);
  const fetchProgress = useServerFn(getMyQuestProgress);
  const doComplete = useServerFn(completeWaypoint);

  const { data, isLoading } = useQuery({
    queryKey: ["public", "quest", questId],
    queryFn: () => fetchQuest({ data: { id: questId } }),
  });

  const { data: progress } = useQuery({
    queryKey: ["my-quest-progress", questId],
    queryFn: () => fetchProgress({ data: { questId } }),
    enabled: isAuthed,
  });

  const completedSet = new Set(progress?.completed ?? []);
  const [scannerOpenFor, setScannerOpenFor] = useState<string | null>(null);

  const complete = useMutation({
    mutationFn: (vars: {
      waypointId?: string;
      raw?: string;
      coords?: { lat: number; lng: number };
    }) => doComplete({ data: { questId, ...vars } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["my-quest-progress", questId] });
      qc.invalidateQueries({ queryKey: ["my-earned-quests"] });
      setScannerOpenFor(null);
      if ((res as any).already) {
        toast.info("Already checked in here");
        return;
      }
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });
      if ((res as any).just_completed_quest) {
        toast.success("Quest complete! Badge earned 🏅");
        confetti({ particleCount: 200, spread: 120, origin: { y: 0.4 } });
      } else {
        toast.success("Waypoint checked in!");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleScan = (codes: IDetectedBarcode[]) => {
    const raw = codes[0]?.rawValue?.trim();
    if (!raw) return;
    complete.mutate({ raw });
  };

  const handleHonor = (wp: PublicWaypoint) => {
    if (!confirm(`Check in at "${wp.title}"?`)) return;
    complete.mutate({ waypointId: wp.id });
  };

  const handleGeo = (wp: PublicWaypoint) => {
    if (!navigator.geolocation) {
      toast.error("Location not available on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        complete.mutate({
          waypointId: wp.id,
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        }),
      () => toast.error("Couldn't read your location. Allow access and retry."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-dvh bg-amber-50">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-sm text-stone-500">Loading quest…</p>
        </main>
      </div>
    );
  }

  const { quest, waypoints } = data;
  const total = waypoints.length;
  const done = waypoints.filter((w) => completedSet.has(w.id)).length;
  const isComplete = !!progress?.is_completed;

  return (
    <div className="min-h-dvh bg-amber-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/explore"
          className="text-xs font-bold uppercase tracking-wider text-stone-700 hover:underline"
        >
          ← All quests
        </Link>

        <header className="mt-4 rounded-xl border-2 border-stone-900 bg-amber-100 p-6 shadow-[6px_6px_0_0_rgba(0,0,0,0.9)]">
          <div className="flex items-start gap-4">
            {quest.badge_image_url && (
              <img
                src={quest.badge_image_url}
                alt=""
                className={`h-24 w-24 rounded-full border-2 border-stone-900 object-cover ${
                  isComplete ? "" : "grayscale opacity-60"
                }`}
              />
            )}
            <div className="flex-1">
              <h1 className="font-serif text-3xl font-black text-stone-900">
                {quest.title}
              </h1>
              {quest.description && (
                <p className="mt-2 text-sm text-stone-700">{quest.description}</p>
              )}
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-700">
                {done} / {total} waypoints · +{quest.points_reward} pts
              </p>
              {data.stats && (data.stats.completion_count + data.stats.in_progress_count) > 0 && (
                <p className="mt-1 text-xs text-stone-600">
                  {data.stats.completion_count} explorer
                  {data.stats.completion_count === 1 ? "" : "s"} completed this
                  {data.stats.in_progress_count > 0 && (
                    <> · {data.stats.in_progress_count} in progress</>
                  )}
                </p>
              )}
            </div>
          </div>
        </header>

        {!isAuthed && (
          <div className="mt-6 rounded-md border border-stone-300 bg-white p-4 text-sm text-stone-700">
            <Link to="/login" className="font-bold underline">
              Sign in
            </Link>{" "}
            to track your progress and earn badges.
          </div>
        )}

        <ol className="mt-6 space-y-3">
          {waypoints.map((wp, i) => {
            const completed = completedSet.has(wp.id);
            return (
              <li
                key={wp.id}
                className={`rounded-lg border-2 p-4 ${
                  completed
                    ? "border-emerald-700 bg-emerald-50"
                    : "border-stone-900 bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-stone-900 bg-amber-100 font-black text-stone-900">
                    {completed ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="flex-1">
                    <h3 className="font-bold text-stone-900">{wp.title}</h3>
                    {wp.description && (
                      <p className="mt-1 text-sm text-stone-700">
                        {wp.description}
                      </p>
                    )}
                    {isAuthed && !completed && (
                      <div className="mt-3">
                        {wp.completion_type === "qr_scan" && (
                          <button
                            onClick={() => setScannerOpenFor(wp.id)}
                            className="inline-flex items-center gap-2 rounded-md bg-stone-900 px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-100 hover:bg-stone-700"
                          >
                            <QrCode className="h-4 w-4" /> Scan waypoint
                          </button>
                        )}
                        {wp.completion_type === "geo_location" && (
                          <button
                            onClick={() => handleGeo(wp)}
                            className="inline-flex items-center gap-2 rounded-md bg-stone-900 px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-100 hover:bg-stone-700"
                          >
                            <MapPin className="h-4 w-4" /> Check in here
                          </button>
                        )}
                        {wp.completion_type === "honor_system_button" && (
                          <button
                            onClick={() => handleHonor(wp)}
                            className="inline-flex items-center gap-2 rounded-md bg-stone-900 px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-100 hover:bg-stone-700"
                          >
                            <HandHeart className="h-4 w-4" /> Mark complete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {scannerOpenFor && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 p-4"
            onClick={() => setScannerOpenFor(null)}
          >
            <div
              className="w-full max-w-md rounded-xl bg-white p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-stone-900">Scan waypoint QR</h3>
                <button
                  onClick={() => setScannerOpenFor(null)}
                  className="text-sm text-stone-600 hover:text-stone-900"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 overflow-hidden rounded-md border border-stone-300">
                <ClientOnly fallback={<p className="p-6 text-sm">Loading…</p>}>
                  <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
                    <Scanner
                      onScan={handleScan}
                      onError={(err) =>
                        toast.error(
                          err instanceof Error ? err.message : "Camera error",
                        )
                      }
                      constraints={{ facingMode: "environment" }}
                      styles={{ container: { width: "100%" } }}
                    />
                  </Suspense>
                </ClientOnly>
              </div>
              <p className="mt-2 text-xs text-stone-500">
                Hold your camera up to the printed QR at the waypoint.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
