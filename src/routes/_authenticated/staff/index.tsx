import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listEvents, createEvent, deleteEvent } from "@/lib/events.functions";
import { listVenues } from "@/lib/venues.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/")({
  component: EventsPage,
});

function EventsPage() {
  const qc = useQueryClient();
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: () => listEvents() });
  const { data: venues = [] } = useQuery({ queryKey: ["venues"], queryFn: () => listVenues() });

  const [form, setForm] = useState({
    title: "",
    event_type: "",
    featured_guest: "",
    venue_id: "" as string,
    start_time: "",
    end_time: "",
    image_url: "",
    open_to_vendors: false,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<"closest" | "farthest">("closest");

  const create = useMutation({
    mutationFn: () =>
      createEvent({
        data: {
          title: form.title,
          event_type: form.event_type || null,
          featured_guest: form.featured_guest || null,
          venue_id: form.venue_id ? Number(form.venue_id) : null,
          start_time: form.start_time ? new Date(form.start_time).toISOString() : null,
          end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
          image_url: form.image_url || null,
          open_to_vendors: form.open_to_vendors,
        },
      }),
    onSuccess: () => {
      setForm({
        title: "", event_type: "", featured_guest: "", venue_id: "",
        start_time: "", end_time: "", image_url: "", open_to_vendors: false,
      });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteEvent({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
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
    rows = [...rows].sort((a, b) => {
      const ta = a.start_time ? new Date(a.start_time).getTime() : Infinity;
      const tb = b.start_time ? new Date(b.start_time).getTime() : Infinity;
      return sort === "closest" ? ta - tb : tb - ta;
    });
    return rows;
  }, [events, search, filter, fromDate, toDate, sort]);

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

  return (
    <div className="p-8 max-w-[1400px]">
      <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase mb-2">
        Master Schedule
      </h1>
      <div className="h-px bg-slate-200 mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* Left: New Event + Batch Import */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 mb-4">
              New Event
            </h2>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <Input placeholder="Event Title" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <Input placeholder="Event Type (e.g. City Concert)" value={form.event_type}
                onChange={(e) => setForm({ ...form, event_type: e.target.value })} />
              <Input placeholder="Featured Guest" value={form.featured_guest}
                onChange={(e) => setForm({ ...form, featured_guest: e.target.value })} />
              <select
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-semibold text-slate-700"
                value={form.venue_id}
                onChange={(e) => setForm({ ...form, venue_id: e.target.value })}
              >
                <option value="">Select Venue</option>
                {(venues as any[]).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <Input type="datetime-local" value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                <Input type="datetime-local" value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
              <Input placeholder="Image URL (Poster)" value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox checked={form.open_to_vendors}
                  onCheckedChange={(c) => setForm({ ...form, open_to_vendors: c === true })} />
                Open to Vendors
              </label>
              {create.error && (
                <p className="text-xs text-destructive">{(create.error as Error).message}</p>
              )}
              <Button type="submit" className="w-full bg-[hsl(220_90%_55%)] hover:bg-[hsl(220_90%_48%)]"
                disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Save Event"}
              </Button>
            </form>
          </div>

          <div className="bg-white rounded-lg border-2 border-dashed border-slate-300 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-center text-slate-900 mb-4">
              Batch Import
            </h2>
            <Button variant="outline" className="w-full" disabled>
              Upload Events CSV
            </Button>
            <p className="mt-2 text-xs text-slate-500 text-center">Coming soon</p>
          </div>
        </div>

        {/* Right: Master Schedule list */}
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
                <Button variant="secondary" size="sm" disabled={selected.size === 0}>
                  Export Selected
                </Button>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled>
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

          <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200">
            <span className="text-sm text-slate-600">Showing {filtered.length} of {events.length} events</span>
            <select className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={sort} onChange={(e) => setSort(e.target.value as any)}>
              <option value="closest">Date: Closest First</option>
              <option value="farthest">Date: Farthest First</option>
            </select>
          </div>

          <div className="px-4 py-2 grid grid-cols-[1fr_200px_80px] gap-3 text-xs font-bold uppercase tracking-wider text-slate-500">
            <div>Event</div>
            <div>Type / Venue</div>
            <div className="text-right">Actions</div>
          </div>

          <div className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">No events found.</div>
            ) : (
              filtered.map((e: any) => (
                <div key={e.id} className="px-4 py-3 grid grid-cols-[1fr_200px_80px] gap-3 items-center hover:bg-slate-50">
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
                    <div className="text-xs text-slate-400">{e.venues?.name || e.location || "—"}</div>
                  </div>
                  <div className="flex justify-end">
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
