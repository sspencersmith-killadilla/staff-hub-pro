import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Music, MapPin, Calendar, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  listOpenGigs,
  listScheduledGigs,
  claimGig,
  listMyArtists,
} from "@/lib/streetbeats-public.functions";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute("/streetbeats")({
  beforeLoad: () => requireModule("streetbeats"),
  head: () => ({
    meta: [
      { title: "Streetbeats — Community Music" },
      {
        name: "description",
        content:
          "Open busking gigs around the city. Browse the lineup or apply to perform.",
      },
      { property: "og:title", content: "Streetbeats — Community Music" },
      {
        property: "og:description",
        content: "Open busking gigs. Browse the lineup or apply to perform.",
      },
    ],
  }),
  component: StreetbeatsPage,
});

function fmtWhen(starts: string, ends: string) {
  const s = new Date(starts);
  const e = new Date(ends);
  const date = s.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date} · ${t(s)} – ${t(e)}`;
}

function StreetbeatsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const fetchOpen = useServerFn(listOpenGigs);
  const fetchScheduled = useServerFn(listScheduledGigs);
  const fetchMyArtists = useServerFn(listMyArtists);
  const doClaim = useServerFn(claimGig);

  const open = useQuery({
    queryKey: ["streetbeats", "open"],
    queryFn: () => fetchOpen(),
  });
  const scheduled = useQuery({
    queryKey: ["streetbeats", "scheduled"],
    queryFn: () => fetchScheduled(),
  });
  const me = useQuery({
    queryKey: ["streetbeats", "me", "artists"],
    queryFn: () => fetchMyArtists(),
    enabled: isAuthenticated,
  });

  const myArtists = me.data?.artists ?? [];
  const approvedArtists = myArtists.filter((a: any) => a.status === "approved");

  const [pickerGigId, setPickerGigId] = useState<string | null>(null);

  const claim = useMutation({
    mutationFn: (vars: { gig_id: string; artist_id: string }) =>
      doClaim({ data: vars }),
    onSuccess: () => {
      toast.success("Gig claimed! See it under My Gigs.");
      setPickerGigId(null);
      qc.invalidateQueries({ queryKey: ["streetbeats"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to claim"),
  });

  const handleClaim = (gigId: string) => {
    if (!isAuthenticated) {
      navigate({ to: "/login", search: { redirect: "/streetbeats" } });
      return;
    }
    if (approvedArtists.length === 0) {
      navigate({ to: "/streetbeats/apply" });
      return;
    }
    if (approvedArtists.length === 1) {
      claim.mutate({ gig_id: gigId, artist_id: approvedArtists[0].id });
      return;
    }
    setPickerGigId(gigId);
  };

  const ctaLabel = !isAuthenticated
    ? "Log in to claim"
    : approvedArtists.length === 0
      ? me.isLoading
        ? "Loading…"
        : "Apply to claim"
      : "Claim this slot";

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-900">
              <Music className="h-3.5 w-3.5" /> Streetbeats
            </div>
            <h1 className="mt-3 text-5xl font-black uppercase tracking-tight text-slate-900">
              Community music,
              <br />
              live on the street.
            </h1>
            <p className="mt-4 max-w-2xl text-slate-600">
              The city posts open busking slots at venues and corners around
              town. Approved performers claim a slot — visitors see the lineup
              and show up to listen.
            </p>
          </div>
          <Link
            to="/streetbeats/apply"
            className="hidden shrink-0 rounded-md bg-slate-900 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white hover:bg-slate-700 sm:inline-block"
          >
            My artist profiles
          </Link>
        </div>

        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
            <Sparkles className="h-4 w-4" /> Open slots — claim one
          </h2>
          <GigList
            isLoading={open.isLoading}
            gigs={open.data ?? []}
            emptyMessage="No open slots right now. Check back soon."
            ctaLabel={authLoading ? "Loading…" : ctaLabel}
            onClaim={handleClaim}
            claimingId={
              claim.isPending ? (claim.variables?.gig_id as string) : null
            }
          />
        </section>

        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
            <Calendar className="h-4 w-4" /> Upcoming lineup
          </h2>
          <GigList
            isLoading={scheduled.isLoading}
            gigs={scheduled.data ?? []}
            emptyMessage="No performances scheduled yet."
            showArtist
          />
        </section>
      </main>

      <Dialog
        open={!!pickerGigId}
        onOpenChange={(o) => !o && setPickerGigId(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Claim as which artist?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {approvedArtists.map((a: any) => (
              <button
                key={a.id}
                type="button"
                disabled={claim.isPending}
                onClick={() =>
                  pickerGigId &&
                  claim.mutate({ gig_id: pickerGigId, artist_id: a.id })
                }
                className="w-full flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-slate-50 disabled:opacity-50"
              >
                {a.avatar_url ? (
                  <img
                    src={a.avatar_url}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-slate-200" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 truncate">
                    {a.full_name}
                  </div>
                  {a.genre && (
                    <div className="text-xs text-slate-500 truncate">
                      {a.genre}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setPickerGigId(null)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GigList({
  isLoading,
  gigs,
  emptyMessage,
  showArtist,
  ctaLabel,
  onClaim,
  claimingId,
}: {
  isLoading: boolean;
  gigs: any[];
  emptyMessage: string;
  showArtist?: boolean;
  ctaLabel?: string;
  onClaim?: (id: string) => void;
  claimingId?: string | null;
}) {
  if (isLoading) {
    return <p className="mt-4 text-sm text-slate-500">Loading…</p>;
  }
  if (gigs.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {gigs.map((g) => (
        <li
          key={g.id}
          className="rounded-lg border border-slate-200 bg-white p-5"
        >
          <div className="font-bold text-slate-900">{g.title}</div>
          <div className="mt-1 text-sm text-slate-600">
            {fmtWhen(g.starts_at, g.ends_at)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5" />
            {g.venue?.name ?? g.location_label ?? "Location TBA"}
          </div>
          {showArtist && g.artist && (
            <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm">
              <span className="font-semibold text-amber-900">
                {g.artist.stage_name}
              </span>
              {g.artist.genre && (
                <span className="ml-1 text-amber-700">· {g.artist.genre}</span>
              )}
            </div>
          )}
          {ctaLabel && onClaim && (
            <button
              type="button"
              onClick={() => onClaim(String(g.id))}
              disabled={claimingId === String(g.id)}
              className="mt-3 inline-block text-xs font-bold uppercase tracking-wider text-slate-900 underline-offset-4 hover:underline disabled:opacity-50"
            >
              {claimingId === String(g.id) ? "Claiming…" : `${ctaLabel} →`}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
