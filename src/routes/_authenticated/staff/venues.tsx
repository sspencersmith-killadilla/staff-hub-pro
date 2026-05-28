import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listVenues, getVenue, createVenue, updateVenue, deleteVenue,
  createStage, updateStage, deleteStage,
  createRoom, updateRoom, deleteRoom,
  listLocationDepartments,
} from "@/lib/venues.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { OperatingHoursEditor } from "@/components/operating-hours-editor";
import { Trash2, Plus, ChevronRight } from "lucide-react";
import { RoomDetailsEditor } from "@/components/room-details-editor";

import { useDepartment } from "@/contexts/department-context";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/staff/venues")({
  component: VenuesPage,
});

function VenuesPage() {
  const qc = useQueryClient();
  const { activeDepartment } = useDepartment();
  const { isAdmin } = useAuth();
  const departmentId = activeDepartment?.id ?? null;
  const { data: venues = [] } = useQuery({
    queryKey: ["venues", departmentId, isAdmin],
    queryFn: () => listVenues({ data: { departmentId, includeAll: isAdmin } }),
  });

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
  const { data: depts = [] } = useQuery({
    queryKey: ["location-departments"],
    queryFn: () => listLocationDepartments(),
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
          <Field label="Department">
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={merged.department_id ?? ""}
              onChange={(e) => set("department_id", e.target.value || null)}
            >
              <option value="">— Unassigned —</option>
              {(depts as any[]).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
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
            <StageRow key={s.id} venueId={venueId} stage={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StageRow({ venueId, stage }: { venueId: number; stage: any }) {
  const qc = useQueryClient();
  const [name, setName] = useState(stage.name ?? "");
  const [description, setDescription] = useState(stage.description ?? "");
  const dirty = name !== (stage.name ?? "") || description !== (stage.description ?? "");

  const save = useMutation({
    mutationFn: () => updateStage({ data: { id: stage.id, patch: { name, description } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue", venueId] }),
  });
  const del = useMutation({
    mutationFn: () => deleteStage({ data: { id: stage.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue", venueId] }),
  });

  return (
    <li className="flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save"}
      </Button>
      <Button size="icon" variant="ghost"
        onClick={() => confirm(`Delete stage "${stage.name}"?`) && del.mutate()}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

function RoomsPanel({ venueId, rooms }: { venueId: number; rooms: any[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () => createRoom({ data: { name, venue_id: venueId } }),
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: ["venue", venueId] }); },
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
        <ul className="space-y-4">
          {rooms.map((r) => (
            <RoomRow key={r.id} venueId={venueId} room={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RoomRow({ venueId, room }: { venueId: number; room: any }) {
  const qc = useQueryClient();
  const [name, setName] = useState(room.name ?? "");
  const [building, setBuilding] = useState(room.building ?? "");
  const [capacity, setCapacity] = useState<string>(room.capacity != null ? String(room.capacity) : "");
  const [isPublic, setIsPublic] = useState<boolean>(!!room.is_publicly_bookable);

  const capNum = capacity ? Number(capacity) : null;
  const dirty =
    name !== (room.name ?? "") ||
    building !== (room.building ?? "") ||
    capNum !== (room.capacity ?? null) ||
    isPublic !== !!room.is_publicly_bookable;

  const save = useMutation({
    mutationFn: () =>
      updateRoom({
        data: {
          id: room.id,
          patch: { name, building, capacity: capNum, is_publicly_bookable: isPublic },
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue", venueId] }),
  });
  const del = useMutation({
    mutationFn: () => deleteRoom({ data: { id: room.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue", venueId] }),
  });

  return (
    <li className="rounded-md border border-slate-200 bg-white p-2">
      <div className="grid grid-cols-[1fr_140px_100px_auto_auto_auto] gap-2 items-center">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Building" value={building} onChange={(e) => setBuilding(e.target.value)} />
        <Input type="number" placeholder="Cap" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <Checkbox checked={isPublic} onCheckedChange={(c) => setIsPublic(c === true)} />
          Public
        </label>
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button size="icon" variant="ghost"
          onClick={() => confirm(`Delete room "${room.name}"?`) && del.mutate()}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <RoomDetailsEditor
        room={room}
        onChanged={() => qc.invalidateQueries({ queryKey: ["venue", venueId] })}
      />
    </li>
  );
}
