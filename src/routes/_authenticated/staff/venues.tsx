import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listVenues, getVenue, createVenue, updateVenue, deleteVenue,
  createStage, updateStage, deleteStage,
  createRoom, updateRoom, deleteRoom,
} from "@/lib/venues.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { OperatingHoursEditor } from "@/components/operating-hours-editor";
import { Trash2, Plus, ChevronRight } from "lucide-react";
import { RoomDetailsEditor } from "@/components/room-details-editor";

export const Route = createFileRoute("/_authenticated/staff/venues")({
  component: VenuesPage,
});

function VenuesPage() {
  const qc = useQueryClient();
  const { data: venues = [] } = useQuery({ queryKey: ["venues"], queryFn: () => listVenues() });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");

  const create = useMutation({
    mutationFn: () => createVenue({ data: { name: newName } }),
    onSuccess: (v: any) => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["venues"] });
      setSelectedId(v.id);
    },
  });

  return (
    <div className="p-8 max-w-[1400px]">
      <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase mb-2">
        Venues &amp; Stages
      </h1>
      <div className="h-px bg-slate-200 mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 mb-3">
              New Venue
            </h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate(); }}
            >
              <Input placeholder="Venue name" value={newName}
                onChange={(e) => setNewName(e.target.value)} />
              <Button type="submit" disabled={create.isPending || !newName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </div>

          <div className="bg-white rounded-lg border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Venues</h2>
            </div>
            {venues.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">No venues yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(venues as any[]).map((v) => (
                  <li key={v.id}>
                    <button
                      onClick={() => setSelectedId(v.id)}
                      className={`w-full px-4 py-3 text-left flex items-center justify-between hover:bg-slate-50 ${
                        selectedId === v.id ? "bg-slate-100 font-semibold" : ""
                      }`}
                    >
                      <div>
                        <div className="text-sm text-slate-900">{v.name}</div>
                        <div className="text-xs text-slate-500">
                          {[v.city, v.state].filter(Boolean).join(", ") || "—"}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          {selectedId == null ? (
            <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-sm text-slate-400">
              Select a venue to edit, or create a new one.
            </div>
          ) : (
            <VenueEditor venueId={selectedId} onDeleted={() => setSelectedId(null)} />
          )}
        </div>
      </div>
    </div>
  );
}

function VenueEditor({ venueId, onDeleted }: { venueId: number; onDeleted: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["venue", venueId],
    queryFn: () => getVenue({ data: { id: venueId } }),
  });

  const [patch, setPatch] = useState<Record<string, any>>({});
  const merged = { ...(data?.venue ?? {}), ...patch } as any;

  const save = useMutation({
    mutationFn: () => updateVenue({ data: { id: venueId, patch } }),
    onSuccess: () => {
      setPatch({});
      qc.invalidateQueries({ queryKey: ["venue", venueId] });
      qc.invalidateQueries({ queryKey: ["venues"] });
    },
  });
  const del = useMutation({
    mutationFn: () => deleteVenue({ data: { id: venueId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venues"] });
      onDeleted();
    },
  });

  if (isLoading || !data) return <div className="bg-white rounded-lg border p-6">Loading…</div>;

  const set = (k: string, v: any) => setPatch({ ...patch, [k]: v });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">{data.venue.name}</h2>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm"
              onClick={() => confirm(`Delete "${data.venue.name}"?`) && del.mutate()}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete venue
            </Button>
            <Button size="sm" disabled={Object.keys(patch).length === 0 || save.isPending}
              onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name"><Input value={merged.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Stage Type"><Input value={merged.stage_type ?? ""} onChange={(e) => set("stage_type", e.target.value)} /></Field>
          <Field label="Address"><Input value={merged.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="Capacity">
            <Input type="number" value={merged.capacity ?? ""}
              onChange={(e) => set("capacity", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="City"><Input value={merged.city ?? ""} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="State"><Input value={merged.state ?? ""} onChange={(e) => set("state", e.target.value)} /></Field>
          <Field label="Zip"><Input value={merged.zip ?? ""} onChange={(e) => set("zip", e.target.value)} /></Field>
          <Field label="Latitude">
            <Input type="number" step="any" value={merged.latitude ?? ""}
              onChange={(e) => set("latitude", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Longitude">
            <Input type="number" step="any" value={merged.longitude ?? ""}
              onChange={(e) => set("longitude", e.target.value ? Number(e.target.value) : null)} />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <Field label="Load-in notes">
            <Textarea value={merged.load_in_notes ?? ""}
              onChange={(e) => set("load_in_notes", e.target.value)} />
          </Field>
          <Field label="Rules">
            <Textarea value={merged.rules ?? ""}
              onChange={(e) => set("rules", e.target.value)} />
          </Field>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200">
          <OperatingHoursEditor
            hours={merged.open_hours}
            closures={merged.closures}
            onChange={({ open_hours, closures }) =>
              setPatch({ ...patch, open_hours, closures })
            }
          />
          <p className="mt-3 text-xs text-slate-500">
            Operating hours and closures are inherited by all stages and rooms at this venue.
          </p>
        </div>
      </div>

      <StagesPanel venueId={venueId} stages={data.stages} />
      <RoomsPanel venueId={venueId} rooms={data.rooms} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function StagesPanel({ venueId, stages }: { venueId: number; stages: any[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () => createStage({ data: { name, venue_id: venueId } }),
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: ["venue", venueId] }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteStage({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue", venueId] }),
  });
  const upd = useMutation({
    mutationFn: (v: { id: string; patch: any }) => updateStage({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue", venueId] }),
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 mb-3">Stages</h3>
      <form className="flex gap-2 mb-4"
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
        <Input placeholder="New stage name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!name.trim() || add.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
      {stages.length === 0 ? (
        <p className="text-sm text-slate-400">No stages at this venue.</p>
      ) : (
        <ul className="space-y-2">
          {stages.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <Input defaultValue={s.name} onBlur={(e) => {
                if (e.target.value !== s.name) upd.mutate({ id: s.id, patch: { name: e.target.value } });
              }} />
              <Input placeholder="Description" defaultValue={s.description ?? ""} onBlur={(e) => {
                if (e.target.value !== (s.description ?? "")) upd.mutate({ id: s.id, patch: { description: e.target.value } });
              }} />
              <Button size="icon" variant="ghost"
                onClick={() => confirm(`Delete stage "${s.name}"?`) && del.mutate(s.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoomsPanel({ venueId, rooms }: { venueId: number; rooms: any[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () => createRoom({ data: { name, venue_id: venueId } }),
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: ["venue", venueId] }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteRoom({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue", venueId] }),
  });
  const upd = useMutation({
    mutationFn: (v: { id: string; patch: any }) => updateRoom({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue", venueId] }),
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 mb-3">Rooms</h3>
      <form className="flex gap-2 mb-4"
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
        <Input placeholder="New room name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!name.trim() || add.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
      {rooms.length === 0 ? (
        <p className="text-sm text-slate-400">No rooms at this venue.</p>
      ) : (
        <ul className="space-y-2">
          {rooms.map((r) => (
            <li key={r.id} className="grid grid-cols-[1fr_140px_100px_auto_auto] gap-2 items-center">
              <Input defaultValue={r.name} onBlur={(e) => {
                if (e.target.value !== r.name) upd.mutate({ id: r.id, patch: { name: e.target.value } });
              }} />
              <Input placeholder="Building" defaultValue={r.building ?? ""} onBlur={(e) => {
                if (e.target.value !== (r.building ?? "")) upd.mutate({ id: r.id, patch: { building: e.target.value } });
              }} />
              <Input type="number" placeholder="Cap" defaultValue={r.capacity ?? ""} onBlur={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                if (v !== r.capacity) upd.mutate({ id: r.id, patch: { capacity: v } });
              }} />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <Checkbox defaultChecked={r.is_publicly_bookable}
                  onCheckedChange={(c) => upd.mutate({ id: r.id, patch: { is_publicly_bookable: c === true } })} />
                Public
              </label>
              <Button size="icon" variant="ghost"
                onClick={() => confirm(`Delete room "${r.name}"?`) && del.mutate(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
