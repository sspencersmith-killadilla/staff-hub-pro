import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listReservations,
  setReservationStatus,
  deleteReservation,
  createReservation,
  listBookableRooms,
} from "@/lib/room-reservations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Check, X, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";

type Status = "pending" | "approved" | "declined" | "cancelled" | "all";

const TABS: { key: Status; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "declined", label: "Declined" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  declined: "bg-rose-100 text-rose-800 border-rose-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute(
  "/_authenticated/staff/room-reservations",
)({
  beforeLoad: () => requireModule("room_reservations"),
  component: RoomReservationsPage,
});

function fmtDt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function RoomReservationsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("pending");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["reservations", status],
    queryFn: () => listReservations({ data: { status } }),
  });

  const counts = useMemo(() => {
    return { current: rows.length };
  }, [rows]);

  const decide = useMutation({
    mutationFn: (v: {
      id: string;
      status: "approved" | "declined" | "cancelled";
      decision_note?: string;
    }) => setReservationStatus({ data: v }),
    onSuccess: (_, v) => {
      toast.success(`Reservation ${v.status}`);
      qc.invalidateQueries({ queryKey: ["reservations"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteReservation({ data: { id } }),
    onSuccess: () => {
      toast.success("Reservation deleted");
      qc.invalidateQueries({ queryKey: ["reservations"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase">
          Room Reservations
        </h1>
        <NewReservationDialog />
      </div>
      <div className="h-px bg-slate-200 mb-6" />

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-4 py-2 text-sm font-bold uppercase tracking-wider border-b-2 -mb-px transition ${
              status === t.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label}
            {status === t.key && (
              <span className="ml-2 text-xs text-slate-400">
                ({counts.current})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No reservations.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Requester</th>
                <th className="text-left px-4 py-3 font-bold">Venue / Room</th>
                <th className="text-left px-4 py-3 font-bold">When</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                <th className="text-right px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(rows as any[]).map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">
                      {r.requester_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.requester_email}
                    </div>
                    {r.purpose && (
                      <div className="mt-1 text-xs text-slate-600">
                        {r.purpose}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {r.room_name}
                    </div>
                    <div className="text-xs text-slate-500">{r.venue_name}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-400" />
                      <span>{fmtDt(r.starts_at)}</span>
                    </div>
                    <div className="text-xs text-slate-500 ml-4">
                      → {fmtDt(r.ends_at)}
                    </div>
                    {r.party_size && (
                      <div className="text-xs text-slate-500 mt-1">
                        Party of {r.party_size}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${STATUS_STYLES[r.status]}`}
                    >
                      {r.status}
                    </span>
                    {r.decision_note && (
                      <div className="mt-1 text-xs text-slate-500">
                        {r.decision_note}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {r.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => {
                              const note =
                                prompt("Optional note for requester:") ??
                                undefined;
                              decide.mutate({
                                id: r.id,
                                status: "approved",
                                decision_note: note || undefined,
                              });
                            }}
                          >
                            <Check className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const note =
                                prompt("Reason for declining:") ?? "";
                              if (note === null) return;
                              decide.mutate({
                                id: r.id,
                                status: "declined",
                                decision_note: note,
                              });
                            }}
                          >
                            <X className="h-4 w-4 mr-1" /> Decline
                          </Button>
                        </>
                      )}
                      {r.status === "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            decide.mutate({ id: r.id, status: "cancelled" })
                          }
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          confirm("Delete this reservation?") &&
                          remove.mutate(r.id)
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NewReservationDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: rooms = [] } = useQuery({
    queryKey: ["bookable-rooms"],
    queryFn: () => listBookableRooms(),
    enabled: open,
  });

  const [form, setForm] = useState({
    room_id: "",
    requester_name: "",
    requester_email: "",
    starts_at: "",
    ends_at: "",
    party_size: "" as string | number,
    purpose: "",
    notes: "",
  });

  const create = useMutation({
    mutationFn: () =>
      createReservation({
        data: {
          room_id: form.room_id,
          requester_name: form.requester_name,
          requester_email: form.requester_email,
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: new Date(form.ends_at).toISOString(),
          party_size: form.party_size ? Number(form.party_size) : null,
          purpose: form.purpose || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Reservation created");
      qc.invalidateQueries({ queryKey: ["reservations"] });
      setOpen(false);
      setForm({
        room_id: "",
        requester_name: "",
        requester_email: "",
        starts_at: "",
        ends_at: "",
        party_size: "",
        purpose: "",
        notes: "",
      });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const set = (k: keyof typeof form, v: any) => setForm({ ...form, [k]: v });
  const canSubmit =
    form.room_id &&
    form.requester_name &&
    form.requester_email &&
    form.starts_at &&
    form.ends_at;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" /> New Reservation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Reservation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Room">
            <Select
              value={form.room_id}
              onValueChange={(v) => set("room_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a room" />
              </SelectTrigger>
              <SelectContent>
                {(rooms as any[]).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.venue_name} — {r.name}
                    {r.capacity ? ` (cap ${r.capacity})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Requester name">
              <Input
                value={form.requester_name}
                onChange={(e) => set("requester_name", e.target.value)}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.requester_email}
                onChange={(e) => set("requester_email", e.target.value)}
              />
            </Field>
            <Field label="Starts at">
              <Input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => set("starts_at", e.target.value)}
              />
            </Field>
            <Field label="Ends at">
              <Input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => set("ends_at", e.target.value)}
              />
            </Field>
            <Field label="Party size">
              <Input
                type="number"
                value={form.party_size}
                onChange={(e) => set("party_size", e.target.value)}
              />
            </Field>
            <Field label="Purpose">
              <Input
                value={form.purpose}
                onChange={(e) => set("purpose", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!canSubmit || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Saving…" : "Create & approve"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}
