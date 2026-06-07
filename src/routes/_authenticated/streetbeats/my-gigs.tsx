import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import {
  listMyClaimedGigs,
  releaseMyGig,
} from "@/lib/streetbeats-public.functions";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute("/_authenticated/streetbeats/my-gigs")({
  beforeLoad: () => requireModule("streetbeats"),
  head: () => ({
    meta: [{ title: "My Gigs — Streetbeats" }],
  }),
  component: MyGigsPage,
});

function fmt(starts: string, ends: string) {
  const s = new Date(starts);
  const e = new Date(ends);
  const date = s.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date} · ${t(s)} – ${t(e)}`;
}

function MyGigsPage() {
  const qc = useQueryClient();
  const fetchMine = useServerFn(listMyClaimedGigs);
  const release = useServerFn(releaseMyGig);

  const { data, isLoading } = useQuery({
    queryKey: ["streetbeats", "me", "gigs"],
    queryFn: () => fetchMine(),
  });

  const mutation = useMutation({
    mutationFn: (gig_id: string) => release({ data: { gig_id } }),
    onSuccess: () => {
      toast.success("Gig released — it's open for someone else to claim.");
      qc.invalidateQueries({ queryKey: ["streetbeats", "me", "gigs"] });
      qc.invalidateQueries({ queryKey: ["streetbeats"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to release"),
  });

  const artists = data?.artists ?? [];
  const hasAnyArtist = artists.length > 0;
  const hasApproved = artists.some((a: any) => a.status === "approved");

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          to="/streetbeats"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Streetbeats
        </Link>
        <h1 className="mt-3 text-4xl font-black uppercase tracking-tight text-slate-900">
          My gigs
        </h1>

        {isLoading ? (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        ) : !hasAnyArtist ? (
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            You haven't created an artist profile yet.{" "}
            <Link
              to="/streetbeats/apply"
              className="font-semibold text-slate-900 underline"
            >
              Create one
            </Link>
            .
          </div>
        ) : !hasApproved ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            None of your artist profiles are approved yet. Once staff approve
            one, you'll be able to claim open gigs.
          </div>
        ) : data!.gigs.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            You haven't claimed any gigs yet.{" "}
            <Link
              to="/streetbeats"
              className="font-semibold text-slate-900 underline"
            >
              Browse open slots
            </Link>
            .
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {data!.gigs.map((g: any) => {
              const upcoming = new Date(g.ends_at) > new Date();
              return (
                <li
                  key={g.id}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">{g.title}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {fmt(g.starts_at, g.ends_at)}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        {g.venue?.name ?? g.location_label ?? "Location TBA"}
                      </div>
                      {g.artist && artists.length > 1 && (
                        <div className="mt-1 text-xs text-slate-500">
                          As <span className="font-semibold">{g.artist.stage_name}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                          g.status === "claimed"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {g.status}
                      </span>
                      {upcoming && g.status === "claimed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => mutation.mutate(g.id)}
                          disabled={mutation.isPending}
                        >
                          Release
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
