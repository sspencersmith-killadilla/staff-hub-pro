import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  bulkUpsertEvents,
  listEventLocations,
  listAllStaffProfiles,
  listAssignableDepartments,
} from "@/lib/events.functions";
import { useDepartment } from "@/contexts/department-context";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, ExternalLink, Pencil, X, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { ImageFocalPicker } from "@/components/image-focal-picker";

export const Route = createFileRoute("/_authenticated/staff/")({
  component: EventsPage,
});

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = {
  title: "",
  event_type: "",
  featured_guest: "",
  department_id: "",
  staff_owner_name: "",
  location: "" as string, // "room:<uuid>" or "stage:<uuid>"
  start_time: "",
  end_time: "",
  image_url: "",
  focal_x: 50,
  focal_y: 50,
  open_to_vendors: false,
};

function locationValue(e: any) {
  if (e.room_id) return `room:${e.room_id}`;
  if (e.stage_id) return `stage:${e.stage_id}`;
  return "";
}

function parseLocation(v: string): { room_id: string | null; stage_id: string | null } {
  if (v.startsWith("room:")) return { room_id: v.slice(5), stage_id: null };
  if (v.startsWith("stage:")) return { room_id: null, stage_id: v.slice(6) };
  return { room_id: null, stage_id: null };
}

// ---------- CSV helpers ----------
const CSV_COLS = [
  "id",
  "title",
  "event_type",
  "featured_guest",
  "department_id",
  "staff_owner_name",
  "room_id",
  "stage_id",
  "start_time",
  "end_time",
  "image_url",
  "focal_x",
  "focal_y",
  "open_to_vendors",
] as const;

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: any[]): string {
  const header = CSV_COLS.join(",");
  const body = rows
    .map((r) =>
      CSV_COLS.map((c) => {
        if (c === "open_to_vendors") return csvEscape(!!r.open_to_vendors);
        return csvEscape(r[c] ?? "");
      }).join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") {
        cur.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (field.length || cur.length) {
          cur.push(field);
          rows.push(cur);
          cur = [];
          field = "";
        }
        if (ch === "\r" && text[i + 1] === "\n") i++;
      } else field += ch;
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

function csvRowToInput(r: Record<string, string>) {
  const toIso = (v: string) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toISOString();
  };
  const toIntOrUndef = (v: string) => {
    if (!v) return undefined;
    const n = parseInt(v, 10);
    return isNaN(n) ? undefined : Math.max(0, Math.min(100, n));
  };
  return {
    id: r.id || undefined,
    title: r.title || "",
    event_type: r.event_type || null,
    featured_guest: r.featured_guest || null,
    department_id: r.department_id || null,
    staff_owner_name: r.staff_owner_name || null,
    room_id: r.room_id || null,
    stage_id: r.stage_id || null,
    start_time: toIso(r.start_time),
    end_time: toIso(r.end_time),
    image_url: r.image_url || null,
    focal_x: toIntOrUndef(r.focal_x),
    focal_y: toIntOrUndef(r.focal_y),
    open_to_vendors: /^(1|true|yes)$/i.test(r.open_to_vendors ?? ""),
  };
}

function EventsPage() {
  const qc = useQueryClient();
  const { activeDepartment } = useDepartment();
  const { isAdmin } = useAuth();
  const deptId = activeDepartment?.id ?? null;
  const [form, setForm] = useState(emptyForm);
  const selectedDepartmentId = form.department_id || deptId;
  const { data: events = [] } = useQuery({
    queryKey: ["events", deptId, isAdmin],
    queryFn: () => listEvents({ data: { departmentId: deptId, includeAll: isAdmin } }),
  });
  const { data: locations } = useQuery({
    queryKey: ["event-locations", selectedDepartmentId],
    queryFn: () => listEventLocations({ data: { departmentId: selectedDepartmentId } }),
  });
  const { data: staffProfiles = [] } = useQuery({
    queryKey: ["assignable-staff-profiles"],
    queryFn: () => listAllStaffProfiles(),
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["assignable-departments"],
    queryFn: () => listAssignableDepartments(),
  });
  const rooms = locations?.rooms ?? [];
  const stages = locations?.stages ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<"closest" | "farthest">("closest");
  const [showPast, setShowPast] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setForm({ ...emptyForm, department_id: deptId ?? "" });
    setEditingId(null);
  };

  const startEdit = (e: any) => {
    setEditingId(String(e.id));
    setForm({
      title: e.title ?? "",
      event_type: e.event_type ?? "",
      featured_guest: e.featured_guest ?? "",
      department_id: e.department_id ?? deptId ?? "",
      staff_owner_name: e.staff_owner_name ?? "",
      location: locationValue(e),
      start_time: toLocalInput(e.start_time),
      end_time: toLocalInput(e.end_time),
      image_url: e.image_url ?? "",
      focal_x: typeof e.focal_x === "number" ? e.focal_x : 50,
      focal_y: typeof e.focal_y === "number" ? e.focal_y : 50,
      open_to_vendors: !!e.open_to_vendors,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = useMutation({
    mutationFn: () => {
      const loc = parseLocation(form.location);
      const patch = {
        title: form.title,
        event_type: form.event_type || null,
        featured_guest: form.featured_guest || null,
        room_id: loc.room_id,
        stage_id: loc.stage_id,
        start_time: form.start_time ? new Date(form.start_time).toISOString() : null,
        end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
        image_url: form.image_url || null,
        focal_x: form.focal_x,
        focal_y: form.focal_y,
        open_to_vendors: form.open_to_vendors,
        department_id: form.department_id || deptId,
        staff_owner_id: null,
        staff_owner_name: form.staff_owner_name || null,
      };
      return editingId
        ? updateEvent({ data: { id: editingId, patch } })
        : createEvent({ data: patch });
    },
    onSuccess: () => {
      resetForm();
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["public", "room"] });
      toast.success("Event saved");
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to save"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteEvent({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });

  const bulk = useMutation({
    mutationFn: (rows: any[]) => bulkUpsertEvents({ data: { rows } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["public", "room"] });
      const msg = `${res.updated} updated, ${res.created} created`;
      if (res.errors.length) {
        toast.error(`${msg}. ${res.errors.length} failed`);
        console.error(res.errors);
      } else {
        toast.success(msg);
      }
    },
    onError: (err: any) => toast.error(err?.message ?? "Import failed"),
  });

  const filtered = useMemo(() => {
    let rows = events as any[];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (e) =>
          e.title?.toLowerCase().includes(q) ||
          e.featured_guest?.toLowerCase().includes(q),
      );
    }
    if (filter !== "all") rows = rows.filter((e) => e.event_type === filter);
    if (fromDate) rows = rows.filter((e) => !e.start_time || e.start_time >= fromDate);
    if (toDate) rows = rows.filter((e) => !e.start_time || e.start_time <= toDate + "T23:59:59");
    if (!showPast) {
      const now = Date.now();
      rows = rows.filter((e) => {
        const ref = e.end_time ?? e.start_time;
        if (!ref) return true;
        const t = new Date(ref).getTime();
        return isNaN(t) || t >= now;
      });
    }
    rows = [...rows].sort((a, b) => {
      const ta = a.start_time ? new Date(a.start_time).getTime() : Infinity;
      const tb = b.start_time ? new Date(b.start_time).getTime() : Infinity;
      return sort === "closest" ? ta - tb : tb - ta;
    });
    return rows;
  }, [events, search, filter, fromDate, toDate, sort, showPast]);

  const eventTypes = useMemo(
    () => Array.from(new Set((events as any[]).map((e) => e.event_type).filter(Boolean))),
    [events],
  );

  const toggleSelect = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e.id)));
  };

  function locationLabelFor(e: any) {
    if (e.rooms?.name) return `Room: ${e.rooms.name}`;
    if (e.stages?.name) return `Stage: ${e.stages.name}`;
    return "—";
  }

  function exportSelectedCsv() {
    const rows = selected.size
      ? filtered.filter((e) => selected.has(e.id))
      : filtered;
    if (!rows.length) {
      toast.error("Nothing to export");
      return;
    }
    const csv = rowsToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length) {
      toast.error("CSV is empty");
      return;
    }
    const rows = parsed.map(csvRowToInput).filter((r) => r.title);
    if (!rows.length) {
      toast.error("No rows with a title");
      return;
    }
    bulk.mutate(rows);
  }

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-end justify-between gap-4 mb-2">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase">
          Master Schedule
        </h1>
        {activeDepartment && (
          <Link
            to="/departments/$id"
            params={{ id: activeDepartment.id }}
            className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
          >
            View {activeDepartment.name} hub →
          </Link>
        )}
      </div>
      <div className="h-px bg-slate-200 mb-6" />


      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                {editingId ? "Edit Event" : "New Event"}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              )}
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <Input placeholder="Event Title" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <Input placeholder="Event Type (e.g. City Concert)" value={form.event_type}
                onChange={(e) => setForm({ ...form, event_type: e.target.value })} />
              <Input placeholder="Featured Guest" value={form.featured_guest}
                onChange={(e) => setForm({ ...form, featured_guest: e.target.value })} />
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase text-slate-600">
                    Department
                  </label>
                  <select
                    value={form.department_id || deptId || ""}
                    onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="">— Unassigned —</option>
                    {(departments as any[]).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase text-slate-600">
                    Staff Owner
                  </label>
                  <Input
                    list="staff-owner-options"
                    placeholder="Type staff member name"
                    value={form.staff_owner_name}
                    onChange={(e) => setForm({ ...form, staff_owner_name: e.target.value })}
                  />
                  <datalist id="staff-owner-options">
                    {(staffProfiles as any[]).map((s) => (
                      <option key={s.id} value={s.full_name || s.email || ""} />
                    ))}
                  </datalist>
                </div>
              </div>
              <select
                required
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-semibold text-slate-700"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              >
                <option value="">Select Room or Stage *</option>
                {rooms.length > 0 && (
                  <optgroup label="Rooms">
                    {rooms.map((r) => (
                      <option key={r.id} value={`room:${r.id}`}>
                        {r.name}
                        {r.venue_name ? ` — ${r.venue_name}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {stages.length > 0 && (
                  <optgroup label="Stages">
                    {stages.map((s) => (
                      <option key={s.id} value={`stage:${s.id}`}>
                        {s.name}
                        {s.venue_name ? ` — ${s.venue_name}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="text-[11px] text-slate-500">
                Booking this room or stage blocks other room reservations and busking gigs at the same time.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input type="datetime-local" value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                <Input type="datetime-local" value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
              <Input placeholder="Image URL (Poster)" value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
              {form.image_url && (
                <ImageFocalPicker
                  src={form.image_url}
                  x={form.focal_x}
                  y={form.focal_y}
                  onChange={({ x, y }) => setForm({ ...form, focal_x: x, focal_y: y })}
                />
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox checked={form.open_to_vendors}
                  onCheckedChange={(c) => setForm({ ...form, open_to_vendors: c === true })} />
                Open to Vendors
              </label>
              <Button type="submit" className="w-full bg-[hsl(220_90%_55%)] hover:bg-[hsl(220_90%_48%)]"
                disabled={save.isPending}>
                {save.isPending ? "Saving…" : editingId ? "Update Event" : "Save Event"}
              </Button>
            </form>
          </div>

          <div className="bg-white rounded-lg border-2 border-dashed border-slate-300 p-5 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-center text-slate-900">
              Batch CSV
            </h2>
            <p className="text-xs text-slate-500 text-center">
              Export selected events, edit in a spreadsheet, then re-upload to overwrite. Keep the <code>id</code> column to update; clear it to create a new event.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileRef.current?.click()}
              disabled={bulk.isPending}
            >
              <Upload className="h-4 w-4 mr-2" />
              {bulk.isPending ? "Importing…" : "Upload Events CSV"}
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-700">
                <Checkbox
                  checked={selected.size > 0 && selected.size === filtered.length}
                  onCheckedChange={toggleAll}
                />
                {selected.size} Selected
              </label>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportSelectedCsv}
                  disabled={filtered.length === 0}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  {selected.size ? "Export Selected" : "Export All"}
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => fileRef.current?.click()}
                  disabled={bulk.isPending}
                >
                  <Upload className="h-4 w-4 mr-1.5" />
                  Import Updates
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Input placeholder="Search events or speakers..." value={search}
                onChange={(e) => setSearch(e.target.value)} />
              <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All</option>
                {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>

          <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200 gap-3 flex-wrap">
            <span className="text-sm text-slate-600">Showing {filtered.length} of {events.length} events</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <Checkbox checked={showPast} onCheckedChange={(c) => setShowPast(c === true)} />
                Show Past (Archived)
              </label>
              <select className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                value={sort} onChange={(e) => setSort(e.target.value as any)}>
                <option value="closest">Date: Closest First</option>
                <option value="farthest">Date: Farthest First</option>
              </select>
            </div>
          </div>

          <div className="px-4 py-2 grid grid-cols-[1fr_220px_120px] gap-3 text-xs font-bold uppercase tracking-wider text-slate-500">
            <div>Event</div>
            <div>Type / Location</div>
            <div className="text-right">Actions</div>
          </div>

          <div className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">No events found.</div>
            ) : (
              filtered.map((e: any) => (
                <div key={e.id} className="px-4 py-3 grid grid-cols-[1fr_220px_120px] gap-3 items-center hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggleSelect(e.id)} />
                    <div>
                      <div className="font-semibold text-slate-900">{e.title}</div>
                      <div className="text-xs text-slate-500">
                        {e.start_time ? new Date(e.start_time).toLocaleString() : "No date"}
                        {e.featured_guest && ` • ${e.featured_guest}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-600">
                    <div>{e.event_type || "—"}</div>
                    <div className="text-xs text-slate-400">{locationLabelFor(e)}</div>
                    {(e.staff_owner_name || e.staff_owner_id) && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        Owner: {e.staff_owner_name || "Assigned staff"}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="Edit" onClick={() => startEdit(e)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/staff/events/$id" params={{ id: String(e.id) }}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Manage
                      </Link>
                    </Button>
                    <Button size="icon" variant="ghost"
                      onClick={() => confirm(`Delete "${e.title}"?`) && del.mutate(e.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
