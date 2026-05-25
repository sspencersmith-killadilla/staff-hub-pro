import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, Trash2, Plus, MapPin } from "lucide-react";
import {
  listArtistsStaff,
  setArtistStatus,
  listGigsStaff,
  createGig,
  updateGig,
  deleteGig,
  setGigStatus,
  listVenuesForGigs,
} from "@/lib/streetbeats.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute("/_authenticated/staff/community-music")({
  beforeLoad: () => requireModule("streetbeats"),
  component: CommunityMusicPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
  open: "bg-sky-100 text-sky-900",
  claimed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-slate-200 text-slate-700",
  completed: "bg-slate-100 text-slate-600",
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CommunityMusicPage() {
  const [tab, setTab] = useState<"gigs" | "artists">("gigs");
  return (
    <div className="p-8">
      <h1 className="text-4xl font-black uppercase tracking-tight text-slate-900">
        Community Music
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Streetbeats: open busking slots and the artists who can claim them.
      </p>
      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {(["gigs", "artists"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
              tab === k
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "gigs" ? <GigsTab /> : <ArtistsTab />}
      </div>
    </div>
  );
}

// ---------- Gigs ----------

function GigsTab() {
  const qc = useQueryClient();
  const fetchGigs = useServerFn(listGigsStaff);
  const fetchVenues = useServerFn(listVenuesForGigs);
  const create = useServerFn(createGig);
  const update = useServerFn(updateGig);
  const remove = useServerFn(deleteGig);
  const setStatus = useServerFn(setGigStatus);

  const { data: gigs, isLoading } = useQuery({
    queryKey: ["staff", "streetbeats", "gigs"],
    queryFn: () => fetchGigs(),
  });
  const { data: venues } = useQuery({
    queryKey: ["staff", "streetbeats", "venues"],
    queryFn: () => fetchVenues(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["staff", "streetbeats", "gigs"] });
    qc.invalidateQueries({ queryKey: ["streetbeats"] });
  }

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Gig deleted");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const statusMut = useMutation({
    mutationFn: (vars: { id: string; status: any }) =>
      setStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New gig
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit gig" : "Create open gig"}
              </DialogTitle>
            </DialogHeader>
            <GigForm
              venues={venues ?? []}
              initial={editing}
              onSubmit={async (values) => {
                try {
                  if (editing) {
                    await update({ data: { ...values, id: editing.id } });
                    toast.success("Gig updated");
                  } else {
                    await create({ data: values });
                    toast.success("Gig created");
                  }
                  setOpen(false);
                  setEditing(null);
                  invalidate();
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed");
                }
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !gigs || gigs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No gigs yet. Create the first open slot.
        </div>
      ) : (
        <ul className="space-y-2">
          {gigs.map((g: any) => (
            <li
              key={g.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">
                    {g.title}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      STATUS_STYLES[g.status] ?? "bg-slate-100"
                    }`}
                  >
                    {g.status}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {fmt(g.starts_at)} – {fmt(g.ends_at)}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3 w-3" />
                  {g.venue?.name ?? g.location_label ?? "—"}
                </div>
                {g.artist && (
                  <div className="mt-2 text-xs text-emerald-800">
                    Claimed by{" "}
                    <span className="font-semibold">
                      {g.artist.stage_name}
                    </span>{" "}
                    ({g.artist.contact_email})
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {g.status === "claimed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      statusMut.mutate({ id: g.id, status: "open" })
                    }
                  >
                    Unclaim
                  </Button>
                )}
                {g.status !== "cancelled" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      statusMut.mutate({ id: g.id, status: "cancelled" })
                    }
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(g);
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Delete this gig?")) deleteMut.mutate(g.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GigForm({
  venues,
  initial,
  onSubmit,
}: {
  venues: { id: number; name: string }[];
  initial: any | null;
  onSubmit: (values: any) => Promise<void> | void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [venueId, setVenueId] = useState<string>(
    initial?.venue_id ? String(initial.venue_id) : "none",
  );

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const starts = String(fd.get("starts_at"));
    const ends = String(fd.get("ends_at"));
    const values = {
      title: String(fd.get("title") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      location_label: String(fd.get("location_label") ?? "").trim() || null,
      venue_id: venueId === "none" ? null : Number(venueId),
      stage_id: null,
      event_id: null,
      starts_at: starts ? new Date(starts).toISOString() : "",
      ends_at: ends ? new Date(ends).toISOString() : "",
    };
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input
          name="title"
          required
          maxLength={200}
          defaultValue={initial?.title ?? ""}
          placeholder="Saturday afternoon set at Main Plaza"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Starts</Label>
          <Input
            type="datetime-local"
            name="starts_at"
            required
            defaultValue={toLocalInput(initial?.starts_at)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Ends</Label>
          <Input
            type="datetime-local"
            name="ends_at"
            required
            defaultValue={toLocalInput(initial?.ends_at)}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Venue</Label>
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a venue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {venues.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Location label (optional)</Label>
          <Input
            name="location_label"
            maxLength={200}
            defaultValue={initial?.location_label ?? ""}
            placeholder="Corner of 5th & Main"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={initial?.description ?? ""}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : initial ? "Save changes" : "Create gig"}
        </Button>
      </div>
    </form>
  );
}

// ---------- Artists ----------

function ArtistsTab() {
  const qc = useQueryClient();
  const fetchArtists = useServerFn(listArtistsStaff);
  const setStatus = useServerFn(setArtistStatus);

  const { data: artists, isLoading } = useQuery({
    queryKey: ["staff", "streetbeats", "artists"],
    queryFn: () => fetchArtists(),
  });

  const mutation = useMutation({
    mutationFn: (vars: { id: string; status: any; staff_notes?: string }) =>
      setStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["staff", "streetbeats", "artists"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!artists || artists.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        No artist applications yet.
      </div>
    );

  return (
    <ul className="space-y-3">
      {artists.map((a: any) => (
        <li
          key={a.id}
          className="rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">
                  {a.stage_name}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    STATUS_STYLES[a.status] ?? "bg-slate-100"
                  }`}
                >
                  {a.status}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {a.contact_email}
                {a.phone && <span> · {a.phone}</span>}
                {a.genre && <span> · {a.genre}</span>}
              </div>
              {a.website && (
                <a
                  href={a.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sky-700 underline"
                >
                  {a.website}
                </a>
              )}
              {a.bio && (
                <p className="mt-2 text-sm text-slate-700">{a.bio}</p>
              )}
              {a.staff_notes && (
                <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                  Staff note: {a.staff_notes}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                {a.status !== "approved" && (
                  <Button
                    size="sm"
                    onClick={() =>
                      mutation.mutate({ id: a.id, status: "approved" })
                    }
                  >
                    <Check className="mr-1 h-4 w-4" /> Approve
                  </Button>
                )}
                {a.status !== "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const note = prompt("Reason for rejection (optional)?");
                      mutation.mutate({
                        id: a.id,
                        status: "rejected",
                        staff_notes: note ?? undefined,
                      });
                    }}
                  >
                    <X className="mr-1 h-4 w-4" /> Reject
                  </Button>
                )}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
