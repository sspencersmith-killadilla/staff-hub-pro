import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import {
  listMyArtists,
  createArtist,
  updateArtist,
  deleteArtist,
} from "@/lib/streetbeats-public.functions";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requireModule } from "@/lib/require-module";
import { ImageFocalPicker } from "@/components/image-focal-picker";

export const Route = createFileRoute("/_authenticated/streetbeats/apply")({
  beforeLoad: () => requireModule("streetbeats"),
  head: () => ({
    meta: [
      { title: "My artist profiles — Streetbeats" },
      { property: "og:title", content: "My artist profiles — Streetbeats" },
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
  avatar_focal_x: number;
  avatar_focal_y: number;
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
  avatar_focal_x: 50,
  avatar_focal_y: 50,
  spotify_link: "",
  youtube_link: "",
  soundcloud_link: "",
  tip_link: "",
  other_link_url: "",
  other_link_name: "",
};

function ApplyPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listMyArtists);
  const create = useServerFn(createArtist);
  const update = useServerFn(updateArtist);
  const remove = useServerFn(deleteArtist);

  const { data, isLoading } = useQuery({
    queryKey: ["streetbeats", "me", "artists"],
    queryFn: () => fetchList(),
  });

  const artists = data?.artists ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingArtist = editingId
    ? artists.find((a: any) => a.id === editingId) ?? null
    : null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["streetbeats", "me", "artists"] });
    qc.invalidateQueries({ queryKey: ["streetbeats", "me", "gigs"] });
    qc.invalidateQueries({ queryKey: ["public-artist"] });
  };

  const createMut = useMutation({
    mutationFn: (vars: ProfileForm) => create({ data: vars }),
    onSuccess: () => {
      toast.success("Artist profile submitted — staff will review it shortly.");
      setDialogOpen(false);
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to save"),
  });

  const updateMut = useMutation({
    mutationFn: (vars: ProfileForm & { id: string }) => update({ data: vars }),
    onSuccess: () => {
      toast.success("Profile updated.");
      setDialogOpen(false);
      setEditingId(null);
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to save"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Artist profile removed.");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to delete"),
  });

  function openCreate() {
    setEditingId(null);
    setDialogOpen(true);
  }
  function openEdit(id: string) {
    setEditingId(id);
    setDialogOpen(true);
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
        <div className="flex items-center justify-between">
          <Link
            to="/streetbeats"
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← Streetbeats
          </Link>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New artist profile
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">
            My artist profiles
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            One account can hold multiple performer identities. Create a
            separate profile for each act you perform under — staff reviews each
            one individually, and you choose which profile to use when claiming
            a gig.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : artists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-sm text-slate-500">
              You haven't created any artist profiles yet.
            </p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Create your first profile
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {artists.map((a: any) => (
              <ArtistCard
                key={a.id}
                artist={a}
                onEdit={() => openEdit(a.id)}
                onDelete={() => {
                  if (
                    confirm(
                      `Delete artist profile "${a.full_name}"? This will also release any future gigs claimed under it.`,
                    )
                  ) {
                    deleteMut.mutate(a.id);
                  }
                }}
              />
            ))}
          </div>
        )}

        <Dialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) setEditingId(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingArtist ? "Edit artist profile" : "New artist profile"}
              </DialogTitle>
            </DialogHeader>
            <ArtistForm
              initial={editingArtist}
              submitting={createMut.isPending || updateMut.isPending}
              onSubmit={(form) => {
                if (editingArtist) {
                  updateMut.mutate({ ...form, id: editingArtist.id });
                } else {
                  createMut.mutate(form);
                }
              }}
            />
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function ArtistCard({
  artist,
  onEdit,
  onDelete,
}: {
  artist: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const img = artist.avatar_url || FALLBACK_IMG;
  const gigs = artist.gigs ?? [];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="h-28 bg-gray-900 relative">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${img})` }}
        />
      </div>
      <div className="px-5 pb-5">
        <div className="relative -mt-10 mb-3 flex items-end justify-between">
          <img
            src={img}
            alt={artist.full_name}
            className="w-20 h-20 rounded-full border-4 border-white shadow-lg object-cover bg-white"
          />
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              STATUS_STYLES[artist.status] ?? "bg-slate-100 text-slate-700"
            }`}
          >
            {artist.status}
          </span>
        </div>
        <p className="text-pink-600 font-bold tracking-widest uppercase text-[11px]">
          {artist.genre || "Local Artist"}
        </p>
        <h2 className="text-lg font-extrabold text-[#112e51]">
          {artist.full_name}
        </h2>
        {artist.bio && (
          <p className="mt-2 text-xs text-gray-600 line-clamp-3 whitespace-pre-wrap">
            {artist.bio}
          </p>
        )}
        {gigs.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {gigs.length} upcoming gig{gigs.length === 1 ? "" : "s"}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
          {artist.status === "approved" && (
            <Link
              to="/artists/$id"
              params={{ id: artist.id }}
              target="_blank"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              View public ↗
            </Link>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-600 hover:text-rose-700 ml-auto"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ArtistForm({
  initial,
  submitting,
  onSubmit,
}: {
  initial: any | null;
  submitting: boolean;
  onSubmit: (values: ProfileForm) => void;
}) {
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  useEffect(() => {
    if (initial) {
      setForm({
        full_name: initial.full_name ?? "",
        email: initial.email ?? "",
        genre: initial.genre ?? "",
        bio: initial.bio ?? "",
        avatar_url: initial.avatar_url ?? "",
        avatar_focal_x: initial.avatar_focal_x ?? 50,
        avatar_focal_y: initial.avatar_focal_y ?? 50,
        spotify_link: initial.spotify_link ?? "",
        youtube_link: initial.youtube_link ?? "",
        soundcloud_link: initial.soundcloud_link ?? "",
        tip_link: initial.tip_link ?? "",
        other_link_url: initial.other_link_url ?? "",
        other_link_name: initial.other_link_name ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [initial]);

  function set<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="space-y-3">
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
        {form.avatar_url && (
          <ImageFocalPicker
            src={form.avatar_url}
            x={form.avatar_focal_x}
            y={form.avatar_focal_y}
            onChange={({ x, y }) => {
              set("avatar_focal_x", x);
              set("avatar_focal_y", y);
            }}
          />
        )}
        <Field label="Bio / about your act">
          <Textarea
            rows={4}
            maxLength={4000}
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
          />
        </Field>
      </section>

      <section className="space-y-3 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-bold text-slate-900">Music & links</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Spotify">
            <Input
              type="url"
              maxLength={500}
              value={form.spotify_link}
              onChange={(e) => set("spotify_link", e.target.value)}
            />
          </Field>
          <Field label="YouTube">
            <Input
              type="url"
              maxLength={500}
              value={form.youtube_link}
              onChange={(e) => set("youtube_link", e.target.value)}
            />
          </Field>
          <Field label="SoundCloud">
            <Input
              type="url"
              maxLength={500}
              value={form.soundcloud_link}
              onChange={(e) => set("soundcloud_link", e.target.value)}
            />
          </Field>
          <Field label="Tip / donation link">
            <Input
              type="url"
              maxLength={500}
              value={form.tip_link}
              onChange={(e) => set("tip_link", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Other link label">
            <Input
              maxLength={120}
              value={form.other_link_name}
              onChange={(e) => set("other_link_name", e.target.value)}
            />
          </Field>
          <Field label="Other link URL">
            <Input
              type="url"
              maxLength={500}
              value={form.other_link_url}
              onChange={(e) => set("other_link_url", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : initial ? "Save changes" : "Submit profile"}
        </Button>
      </div>
    </form>
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
