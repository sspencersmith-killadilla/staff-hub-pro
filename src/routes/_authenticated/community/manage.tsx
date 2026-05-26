import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, CalendarDays } from "lucide-react";
import {
  listMyOrgs,
  listMyLocations,
  createMyLocation,
  updateMyLocation,
  deleteMyLocation,
  listMyCommunityEvents,
  createMyCommunityEvent,
  updateMyCommunityEvent,
  cancelMyCommunityEvent,
} from "@/lib/community-public.functions";
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
import { ImageFocalPicker } from "@/components/image-focal-picker";


export const Route = createFileRoute("/_authenticated/community/manage")({
  beforeLoad: () => requireModule("community_orgs"),
  validateSearch: (s) => ({ org: typeof s.org === "string" ? s.org : undefined }),
  component: ManagePage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
  cancelled: "bg-slate-200 text-slate-700",
};

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ManagePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const fetchOrgs = useServerFn(listMyOrgs);
  const { data: orgs, isLoading } = useQuery({
    queryKey: ["community", "my-orgs"],
    queryFn: () => fetchOrgs(),
  });
  const [tab, setTab] = useState<"events" | "locations">("events");

  const orgList: any[] = (orgs as any[]) ?? [];
  const approved = orgList.filter((o) => o.status === "approved");

  const activeOrgId = search.org ?? approved[0]?.id ?? orgList[0]?.id;
  const activeOrg = orgList.find((o) => o.id === activeOrgId);

  // Auto-set the search param so deep links work and the switcher always
  // reflects state.
  useEffect(() => {
    if (activeOrgId && search.org !== activeOrgId) {
      navigate({
        to: "/community/manage",
        search: { org: activeOrgId },
        replace: true,
      });
    }
  }, [activeOrgId, search.org, navigate]);

  if (isLoading)
    return <div className="p-8 text-sm text-slate-500">Loading…</div>;

  if (orgList.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12 text-center">
        <p className="text-slate-700">
          You don't have any community organizations yet.
        </p>
        <Link
          to="/community/apply"
          className="mt-3 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white hover:bg-slate-700"
        >
          Register one
        </Link>
      </div>
    );
  }

  if (!activeOrg) return null;

  if (activeOrg.status !== "approved") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <OrgSwitcher orgs={orgList} activeId={activeOrg.id} />
        <div className="mt-6 text-center">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              STATUS_STYLES[activeOrg.status] ?? "bg-slate-100"
            }`}
          >
            {activeOrg.status}
          </span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">
            {activeOrg.name}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            This organization isn't approved yet, so you can't add locations or
            submit events for it. We'll email{" "}
            <strong>{activeOrg.contact_email}</strong> once a decision is made.
          </p>
          {activeOrg.staff_notes && (
            <p className="mt-3 rounded bg-slate-50 px-3 py-2 text-left text-xs text-slate-600">
              Staff note: {activeOrg.staff_notes}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <OrgSwitcher orgs={orgList} activeId={activeOrg.id} />
      <h1 className="mt-6 text-3xl font-black uppercase tracking-tight text-slate-900">
        {activeOrg.name}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Manage venues and events for this organization. Switch organizations
        above or{" "}
        <Link to="/community/apply" className="font-semibold underline">
          register another
        </Link>
        .
      </p>
      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {(["events", "locations"] as const).map((k) => (
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
        {tab === "events" ? (
          <EventsTab orgId={activeOrg.id} />
        ) : (
          <LocationsTab orgId={activeOrg.id} />
        )}
      </div>
    </div>
  );
}

function OrgSwitcher({
  orgs,
  activeId,
}: {
  orgs: any[];
  activeId: string;
}) {
  const navigate = useNavigate();
  if (orgs.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
        Organization
      </Label>
      <Select
        value={activeId}
        onValueChange={(v) =>
          navigate({ to: "/community/manage", search: { org: v }, replace: true })
        }
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {orgs.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name} · {o.status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Link
        to="/community/apply"
        className="ml-auto text-xs font-semibold text-slate-700 underline-offset-4 hover:underline"
      >
        + Register another organization
      </Link>
    </div>
  );
}

// ---------- Locations ----------

function LocationsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const fetchLocs = useServerFn(listMyLocations);
  const create = useServerFn(createMyLocation);
  const update = useServerFn(updateMyLocation);
  const remove = useServerFn(deleteMyLocation);

  const { data: locs, isLoading } = useQuery({
    queryKey: ["community", "my-locations", orgId],
    queryFn: () => fetchLocs({ data: { org_id: orgId } }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["community", "my-locations", orgId] });
  }

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id, org_id: orgId } }),
    onSuccess: () => {
      toast.success("Location removed");
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
              <Plus className="mr-2 h-4 w-4" /> Add location
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit location" : "Add a venue"}
              </DialogTitle>
            </DialogHeader>
            <LocationForm
              initial={editing}
              onSubmit={async (values) => {
                try {
                  if (editing) {
                    await update({
                      data: { ...values, id: editing.id, org_id: orgId },
                    });
                    toast.success("Location updated");
                  } else {
                    await create({ data: { ...values, org_id: orgId } });
                    toast.success("Location added");
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
      ) : !locs || locs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No locations yet. Add the venues where this organization hosts events.
        </div>
      ) : (
        <ul className="space-y-2">
          {locs.map((l: any) => (
            <li
              key={l.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
            >
              <div>
                <div className="font-semibold text-slate-900">{l.name}</div>
                <div className="mt-1 flex items-start gap-1 text-xs text-slate-500">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    {l.address}
                    {l.city && `, ${l.city}`}
                  </span>
                </div>
                {l.notes && (
                  <p className="mt-2 text-sm text-slate-700">{l.notes}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(l);
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Remove this location?"))
                      deleteMut.mutate(l.id);
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

function LocationForm({
  initial,
  onSubmit,
}: {
  initial: any | null;
  onSubmit: (values: any) => Promise<void> | void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const lat = String(fd.get("latitude") ?? "").trim();
    const lng = String(fd.get("longitude") ?? "").trim();
    const values = {
      name: String(fd.get("name") ?? "").trim(),
      address: String(fd.get("address") ?? "").trim() || null,
      city: String(fd.get("city") ?? "").trim() || null,
      latitude: lat ? Number(lat) : null,
      longitude: lng ? Number(lng) : null,
      notes: String(fd.get("notes") ?? "").trim() || null,
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
        <Label>Venue name</Label>
        <Input name="name" required maxLength={200} defaultValue={initial?.name ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label>Address</Label>
        <Input name="address" maxLength={300} defaultValue={initial?.address ?? ""} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input name="city" maxLength={120} defaultValue={initial?.city ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label>Latitude</Label>
          <Input
            name="latitude"
            type="number"
            step="any"
            defaultValue={initial?.latitude ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Longitude</Label>
          <Input
            name="longitude"
            type="number"
            step="any"
            defaultValue={initial?.longitude ?? ""}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          name="notes"
          rows={2}
          maxLength={1000}
          defaultValue={initial?.notes ?? ""}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : initial ? "Save" : "Add location"}
        </Button>
      </div>
    </form>
  );
}

// ---------- Events ----------

function EventsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const fetchEvents = useServerFn(listMyCommunityEvents);
  const fetchLocs = useServerFn(listMyLocations);
  const create = useServerFn(createMyCommunityEvent);
  const update = useServerFn(updateMyCommunityEvent);
  const cancel = useServerFn(cancelMyCommunityEvent);

  const { data, isLoading } = useQuery({
    queryKey: ["community", "my-events", orgId],
    queryFn: () => fetchEvents({ data: { org_id: orgId } }),
  });
  const { data: locs } = useQuery({
    queryKey: ["community", "my-locations", orgId],
    queryFn: () => fetchLocs({ data: { org_id: orgId } }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["community", "my-events", orgId] });
    qc.invalidateQueries({ queryKey: ["community", "events"] });
  }

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancel({ data: { id, org_id: orgId } }),
    onSuccess: () => {
      toast.success("Event cancelled");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const events = (data as any)?.events ?? [];

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
            <Button disabled={(locs ?? []).length === 0}>
              <Plus className="mr-2 h-4 w-4" /> Submit event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit event" : "Submit an event"}
              </DialogTitle>
            </DialogHeader>
            <EventForm
              locations={locs ?? []}
              initial={editing}
              onSubmit={async (values) => {
                try {
                  if (editing) {
                    await update({
                      data: { ...values, id: editing.id, org_id: orgId },
                    });
                    toast.success("Event updated — pending review");
                  } else {
                    await create({ data: { ...values, org_id: orgId } });
                    toast.success("Event submitted for review");
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

      {(locs ?? []).length === 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Add at least one location before submitting an event.
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No events yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((e: any) => (
            <li
              key={e.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{e.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      STATUS_STYLES[e.status] ?? "bg-slate-100"
                    }`}
                  >
                    {e.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                  <CalendarDays className="h-3.5 w-3.5" /> {fmt(e.starts_at)} – {fmt(e.ends_at)}
                </div>
                {e.location && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="h-3 w-3" /> {e.location.name}
                  </div>
                )}
                {e.staff_notes && (
                  <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                    Staff note: {e.staff_notes}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {e.status !== "cancelled" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(e);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                )}
                {e.status !== "cancelled" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Cancel this event?")) cancelMut.mutate(e.id);
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventForm({
  locations,
  initial,
  onSubmit,
}: {
  locations: { id: string; name: string }[];
  initial: any | null;
  onSubmit: (values: any) => Promise<void> | void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [locId, setLocId] = useState<string>(
    initial?.location_id ?? (locations[0]?.id ?? ""),
  );
  const [imageUrl, setImageUrl] = useState<string>(initial?.image_url ?? "");
  const [focal, setFocal] = useState<{ x: number; y: number }>({
    x: typeof initial?.image_focal_x === "number" ? initial.image_focal_x : 50,
    y: typeof initial?.image_focal_y === "number" ? initial.image_focal_y : 50,
  });

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const starts = String(fd.get("starts_at"));
    const ends = String(fd.get("ends_at"));
    const values = {
      title: String(fd.get("title") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      location_id: locId || null,
      starts_at: starts ? new Date(starts).toISOString() : "",
      ends_at: ends ? new Date(ends).toISOString() : "",
      cost_text: String(fd.get("cost_text") ?? "").trim() || null,
      contact_info: String(fd.get("contact_info") ?? "").trim() || null,
      image_url: imageUrl.trim() || null,
      image_focal_x: focal.x,
      image_focal_y: focal.y,
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
        <Input name="title" required maxLength={200} defaultValue={initial?.title ?? ""} />
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
      <div className="space-y-1.5">
        <Label>Location</Label>
        <Select value={locId} onValueChange={setLocId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a location" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Cost (optional)</Label>
          <Input
            name="cost_text"
            maxLength={120}
            defaultValue={initial?.cost_text ?? ""}
            placeholder="Free, $10, donations welcome…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Public contact (optional)</Label>
          <Input
            name="contact_info"
            maxLength={300}
            defaultValue={initial?.contact_info ?? ""}
            placeholder="info@example.org"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Event flyer image URL (optional)</Label>
        <Input
          value={imageUrl}
          onChange={(ev) => setImageUrl(ev.target.value)}
          placeholder="https://…/flyer.jpg"
          maxLength={500}
        />
        <p className="text-[11px] text-slate-500">
          Used as the hero on your event flyer page and the cover image in the
          public events feed.
        </p>
      </div>
      {imageUrl.trim() && (
        <ImageFocalPicker
          src={imageUrl.trim()}
          x={focal.x}
          y={focal.y}
          onChange={setFocal}
        />
      )}
      <p className="text-xs text-slate-500">
        Submissions and edits go back to <em>pending</em> for staff review.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : initial ? "Save changes" : "Submit for review"}
        </Button>
      </div>

    </form>
  );
}
