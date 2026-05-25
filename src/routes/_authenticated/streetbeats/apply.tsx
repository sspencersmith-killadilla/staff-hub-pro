import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  getMyArtistProfile,
  upsertMyArtistProfile,
} from "@/lib/streetbeats-public.functions";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute("/_authenticated/streetbeats/apply")({
  beforeLoad: () => requireModule("streetbeats"),
  head: () => ({
    meta: [
      { title: "My artist profile — Streetbeats" },
      { property: "og:title", content: "My artist profile — Streetbeats" },
    ],
  }),
  component: ApplyPage,
});

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1000&auto=format&fit=crop";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
};

type ProfileForm = {
  full_name: string;
  email: string;
  genre: string;
  bio: string;
  avatar_url: string;
  spotify_link: string;
  youtube_link: string;
  soundcloud_link: string;
  tip_link: string;
  other_link_url: string;
  other_link_name: string;
};

const EMPTY: ProfileForm = {
  full_name: "",
  email: "",
  genre: "",
  bio: "",
  avatar_url: "",
  spotify_link: "",
  youtube_link: "",
  soundcloud_link: "",
  tip_link: "",
  other_link_url: "",
  other_link_name: "",
};

function ApplyPage() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyArtistProfile);
  const save = useServerFn(upsertMyArtistProfile);

  const { data, isLoading } = useQuery({
    queryKey: ["streetbeats", "me", "artist"],
    queryFn: () => fetchProfile(),
  });

  const artist = data?.artist ?? null;
  const gigs = data?.gigs ?? [];
  const hasProfile = !!artist;

  const [form, setForm] = useState<ProfileForm>(EMPTY);

  useEffect(() => {
    if (artist) {
      setForm({
        full_name: artist.full_name ?? "",
        email: artist.email ?? "",
        genre: artist.genre ?? "",
        bio: artist.bio ?? "",
        avatar_url: artist.avatar_url ?? "",
        spotify_link: artist.spotify_link ?? "",
        youtube_link: artist.youtube_link ?? "",
        soundcloud_link: artist.soundcloud_link ?? "",
        tip_link: artist.tip_link ?? "",
        other_link_url: artist.other_link_url ?? "",
        other_link_name: artist.other_link_name ?? "",
      });
    }
  }, [artist]);

  const mutation = useMutation({
    mutationFn: (vars: ProfileForm) => save({ data: vars }),
    onSuccess: () => {
      toast.success(
        hasProfile
          ? "Profile updated."
          : "Application submitted — staff will review it shortly.",
      );
      qc.invalidateQueries({ queryKey: ["streetbeats", "me", "artist"] });
      qc.invalidateQueries({ queryKey: ["public-artist"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to save"),
  });

  function set<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate(form);
  }

  const displayImage = form.avatar_url || FALLBACK_IMG;

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
        <div className="flex items-center justify-between">
          <Link
            to="/streetbeats"
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← Streetbeats
          </Link>
          {artist && (
            <Link
              to="/artists/$id"
              params={{ id: artist.id }}
              className="text-sm font-semibold text-[#005ea2] hover:underline"
              target="_blank"
            >
              View public profile ↗
            </Link>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            {/* Status banner */}
            {artist && (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Approval status
                  </div>
                  <span
                    className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                      STATUS_STYLES[artist.status] ??
                      "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {artist.status}
                  </span>
                  <p className="mt-2 text-xs text-slate-500">
                    Only staff can change approval status.
                  </p>
                </div>
                {artist.status === "approved" && (
                  <Link
                    to="/streetbeats/my-gigs"
                    className="rounded-md bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-700"
                  >
                    My gigs
                  </Link>
                )}
              </div>
            )}

            {/* Live preview card — mirrors the public profile */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="h-40 md:h-56 bg-gray-900 relative">
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-30"
                  style={{ backgroundImage: `url(${displayImage})` }}
                />
              </div>
              <div className="px-8 pb-8 relative">
                <div className="relative -mt-16 mb-4 flex justify-between items-end">
                  <img
                    src={displayImage}
                    alt={`${form.full_name || "Artist"} profile`}
                    className="w-32 h-32 rounded-full border-4 border-white shadow-lg object-cover bg-white"
                  />
                  {form.tip_link && (
                    <span className="bg-[#10b981] text-white px-5 py-2.5 rounded-full font-bold shadow-md text-sm">
                      💰 Send a Tip
                    </span>
                  )}
                </div>
                <p className="text-pink-600 font-bold tracking-widest uppercase text-xs mb-1">
                  {form.genre || "Local Artist"}
                </p>
                <h1 className="text-3xl font-extrabold text-[#112e51]">
                  {form.full_name || "Your stage name"}
                </h1>
                {form.bio && (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600">
                    {form.bio}
                  </p>
                )}
              </div>
            </div>

            {/* Editable form */}
            <form
              onSubmit={onSubmit}
              className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6"
            >
              <section className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Basics</h2>
                <Field label="Stage name" required>
                  <Input
                    required
                    maxLength={120}
                    value={form.full_name}
                    onChange={(e) => set("full_name", e.target.value)}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Contact email">
                    <Input
                      type="email"
                      maxLength={255}
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                    />
                  </Field>
                  <Field label="Genre">
                    <Input
                      maxLength={120}
                      placeholder="Folk, jazz, hip-hop…"
                      value={form.genre}
                      onChange={(e) => set("genre", e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Profile photo URL">
                  <Input
                    type="url"
                    maxLength={1000}
                    placeholder="https://…"
                    value={form.avatar_url}
                    onChange={(e) => set("avatar_url", e.target.value)}
                  />
                </Field>
                <Field label="Bio / about your act">
                  <Textarea
                    rows={5}
                    maxLength={4000}
                    value={form.bio}
                    onChange={(e) => set("bio", e.target.value)}
                  />
                </Field>
              </section>

              <section className="space-y-4 border-t border-slate-100 pt-6">
                <h2 className="text-lg font-bold text-slate-900">Music & links</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Spotify link">
                    <Input
                      type="url"
                      maxLength={500}
                      placeholder="https://open.spotify.com/…"
                      value={form.spotify_link}
                      onChange={(e) => set("spotify_link", e.target.value)}
                    />
                  </Field>
                  <Field label="YouTube link">
                    <Input
                      type="url"
                      maxLength={500}
                      placeholder="https://youtube.com/…"
                      value={form.youtube_link}
                      onChange={(e) => set("youtube_link", e.target.value)}
                    />
                  </Field>
                  <Field label="SoundCloud link">
                    <Input
                      type="url"
                      maxLength={500}
                      placeholder="https://soundcloud.com/…"
                      value={form.soundcloud_link}
                      onChange={(e) => set("soundcloud_link", e.target.value)}
                    />
                  </Field>
                  <Field label="Tip / donation link">
                    <Input
                      type="url"
                      maxLength={500}
                      placeholder="https://venmo.com/…"
                      value={form.tip_link}
                      onChange={(e) => set("tip_link", e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Other link label">
                    <Input
                      maxLength={120}
                      placeholder="Website, Instagram, etc."
                      value={form.other_link_name}
                      onChange={(e) => set("other_link_name", e.target.value)}
                    />
                  </Field>
                  <Field label="Other link URL">
                    <Input
                      type="url"
                      maxLength={500}
                      placeholder="https://…"
                      value={form.other_link_url}
                      onChange={(e) => set("other_link_url", e.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <div className="flex justify-end">
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending
                    ? "Saving…"
                    : hasProfile
                      ? "Save changes"
                      : "Submit application"}
                </Button>
              </div>
            </form>

            {/* Upcoming gigs with flyer links (mirrors public profile) */}
            {hasProfile && (
              <div>
                <h2 className="text-2xl font-bold text-[#112e51] mb-6 flex items-center gap-2">
                  📅 Upcoming performances
                </h2>
                {gigs.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl text-center text-gray-500 border border-gray-200">
                    No upcoming gigs scheduled.{" "}
                    {artist?.status === "approved" ? (
                      <Link
                        to="/streetbeats"
                        className="font-semibold text-slate-900 underline"
                      >
                        Browse open slots
                      </Link>
                    ) : (
                      "Once approved, you can claim open slots."
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {gigs.map((gig) => (
                      <Link
                        key={gig.id}
                        to="/gigs/$id"
                        params={{ id: String(gig.id) }}
                        className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition border border-gray-200 block group"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="text-[#005ea2] font-bold text-sm mb-1">
                              {gig.start_time
                                ? new Date(gig.start_time).toLocaleDateString(
                                    "en-US",
                                    {
                                      weekday: "short",
                                      month: "short",
                                      day: "numeric",
                                    },
                                  )
                                : "TBA"}
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#005ea2] transition">
                              Live at{" "}
                              {gig.venue_name ||
                                gig.stage_name ||
                                "StreetBeats Stage"}
                            </h3>
                          </div>
                          {gig.start_time && (
                            <div className="bg-pink-50 text-pink-600 px-3 py-1 rounded-full text-xs font-bold">
                              {new Date(gig.start_time).toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 font-medium">
                          View digital flyer →
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </Label>
      {children}
    </div>
  );
}
