import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getEventDashboard,
  toggleCheckIn,
  saveTicketTier,
  deleteTicketTier,
  createGig,
  unlinkGig,
  deleteGig,
  addCommercialTier,
  saveTalent,
  deleteTalent,
  saveFloorplan,
  removeFromWaitlist,
} from "@/lib/event-dashboard.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const RobustMap = lazy(() => import("@/components/RobustMap"));
const EventMarketingHub = lazy(() => import("@/components/EventMarketingHub"));

const CT_TZ = "America/Chicago";

function displayCT(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return (
    d.toLocaleTimeString("en-US", {
      timeZone: CT_TZ,
      hour: "numeric",
      minute: "2-digit",
    }) + " CT"
  );
}

function ctLocalToUtc(local: string | null | undefined): string | null {
  if (!local) return null;
  const [datePart, timePart] = local.split("T");
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  if ([y, m, d, hh, mm].some(isNaN)) return null;
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const ctStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: CT_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(guess);
  const [cd, ct] = ctStr.replace(",", "").trim().split(" ");
  const [cy, cmo, cda] = cd.split("-").map(Number);
  const [chh, cmm] = ct.split(":").map(Number);
  const ctAsUtc = new Date(Date.UTC(cy, cmo - 1, cda, chh === 24 ? 0 : chh, cmm));
  return new Date(guess.getTime() - (ctAsUtc.getTime() - guess.getTime())).toISOString();
}

export const Route = createFileRoute("/_authenticated/staff/events/$id")({
  component: EventDashboard,
});

type Toast = { type: "success" | "error" | "warning"; text: string } | null;

function EventDashboard() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["event-dashboard", id],
    queryFn: () => getEventDashboard({ data: { id } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["event-dashboard", id] });

  const [activeView, setActiveView] = useState<
    "reports" | "door" | "tickets" | "gigs" | "floorplan" | "marketing" | "commercial" | "vendors" | "sponsors" | "volunteers" | "talent"
  >("reports");
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string, type: NonNullable<Toast>["type"] = "success") => {
    setToast({ text, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Realtime: gig claimed
  useEffect(() => {
    const ch = supabase
      .channel(`gigs-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "slots", filter: `session_id=eq.${id}` },
        (p) => {
          const n = p.new as any, o = p.old as any;
          if (!o.is_booked && n.is_booked && n.busker_id) {
            showToast("✓ Gig claimed");
            invalidate();
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, showToast]);

  const session = data?.session;
  const attendees = data?.attendees ?? [];
  const talent = data?.talent ?? [];
  const volunteers = data?.volunteers ?? [];
  const ticketTiers = data?.ticketTiers ?? [];
  const vendorTiers = data?.vendorTiers ?? [];
  const sponsorTiers = data?.sponsorTiers ?? [];
  const vendors = data?.vendors ?? [];
  const sponsors = data?.sponsors ?? [];
  const gigs = data?.gigs ?? [];
  const stagesList = data?.stages ?? [];

  const ticketRev = useMemo(
    () => (attendees as any[]).reduce((a, x) => a + (x.ticket_tiers?.price || 0), 0),
    [attendees],
  );
  const vendorRev = (vendors as any[])
    .filter((v) => v.status === "paid")
    .reduce((a, x) => a + (x.vendor_tiers?.price || 0), 0);
  const sponsorRev = (sponsors as any[])
    .filter((s) => s.status === "paid")
    .reduce((a, x) => a + (x.sponsorship_tiers?.price || 0), 0);
  const totalRev = ticketRev + vendorRev + sponsorRev;
  const talentCost = (talent as any[]).reduce((a, t) => a + (t.cost || 0), 0);
  const netProfit = totalRev - talentCost;
  const ticketsRedeemed = (attendees as any[]).filter((a) => a.checked_in).length;

  // ─── Reports metrics ───────────────────────────────────────────────
  const ticketsSold = (attendees as any[]).reduce((a, x) => a + (x.quantity || 1), 0);
  const ticketCapacity = (ticketTiers as any[]).reduce((a, t) => a + (t.capacity || 0), 0);
  const ticketFillRate = ticketCapacity > 0 ? (ticketsSold / ticketCapacity) * 100 : null;
  const showRate = ticketsSold > 0 ? (ticketsRedeemed / ticketsSold) * 100 : null;

  const ticketTierBreakdown = useMemo(() => {
    return (ticketTiers as any[]).map((t) => {
      const tierAttendees = (attendees as any[]).filter((a) => a.ticket_tier_id === t.id);
      const sold = tierAttendees.reduce((a, x) => a + (x.quantity || 1), 0);
      const revenue = tierAttendees.reduce((a, x) => a + (x.ticket_tiers?.price || t.price || 0) * (x.quantity || 1), 0);
      const fill = t.capacity > 0 ? (sold / t.capacity) * 100 : null;
      const checkedIn = tierAttendees.filter((a) => a.checked_in).length;
      return { id: t.id, name: t.name, sold, capacity: t.capacity || 0, fill, revenue, checkedIn };
    });
  }, [ticketTiers, attendees]);

  const vendorApproved = (vendors as any[]).filter((v) => v.status === "approved" || v.status === "paid").length;
  const vendorPending = (vendors as any[]).filter((v) => v.status === "pending" || v.status === "submitted").length;
  const vendorCapacity = (vendorTiers as any[]).reduce((a, t) => a + (t.capacity || 0), 0);
  const vendorFillRate = vendorCapacity > 0 ? (vendorApproved / vendorCapacity) * 100 : null;

  const sponsorApproved = (sponsors as any[]).filter((s) => s.status === "approved" || s.status === "paid").length;
  const sponsorPending = (sponsors as any[]).filter((s) => s.status === "pending" || s.status === "submitted").length;
  const sponsorCapacity = (sponsorTiers as any[]).reduce((a, t) => a + (t.capacity || 0), 0);
  const sponsorFillRate = sponsorCapacity > 0 ? (sponsorApproved / sponsorCapacity) * 100 : null;

  const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

  // Mutations
  const mCheckIn = useMutation({
    mutationFn: (v: { id: string; table: "attendees" | "volunteers"; checked_in: boolean }) =>
      toggleCheckIn({ data: v }),
    onSuccess: invalidate,
  });
  const mSaveTicket = useMutation({
    mutationFn: (v: { id?: string; patch: any }) => saveTicketTier({ data: v }),
    onSuccess: () => { invalidate(); setEditingTicket(null); },
  });
  const mDelTicket = useMutation({
    mutationFn: (tid: string) => deleteTicketTier({ data: { id: tid } }),
    onSuccess: invalidate,
  });
  const mCreateGig = useMutation({
    mutationFn: (v: any) => createGig({ data: v }),
    onSuccess: () => { invalidate(); showToast("Gig created"); },
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const mUnlinkGig = useMutation({
    mutationFn: (gid: string | number) => unlinkGig({ data: { id: gid } }),
    onSuccess: () => { invalidate(); showToast("Unlinked"); },
  });
  const mDelGig = useMutation({
    mutationFn: (gid: string | number) => deleteGig({ data: { id: gid } }),
    onSuccess: invalidate,
  });
  const mAddTier = useMutation({
    mutationFn: (v: any) => addCommercialTier({ data: v }),
    onSuccess: invalidate,
  });
  const mSaveTalent = useMutation({
    mutationFn: (v: { id?: string; patch: any }) => saveTalent({ data: v }),
    onSuccess: () => { invalidate(); setEditingTalent(null); },
  });
  const mDelTalent = useMutation({
    mutationFn: (tid: string) => deleteTalent({ data: { id: tid } }),
    onSuccess: invalidate,
  });
  const mSaveFloorplan = useMutation({
    mutationFn: (payload: any) => saveFloorplan({ data: { session_id: id, data: payload } }),
    onSuccess: () => { invalidate(); showToast("Floorplan saved"); },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  // Local UI state
  const [editingTicket, setEditingTicket] = useState<any>(null);
  const [editingTalent, setEditingTalent] = useState<any>(null);
  const [inheritTime, setInheritTime] = useState(true);
  const [inheritLocation, setInheritLocation] = useState(true);

  // Door scanner
  const [scanInput, setScanInput] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [scanMessage, setScanMessage] = useState<Toast>(null);
  useEffect(() => { if (activeView === "door") scanInputRef.current?.focus(); }, [activeView]);
  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const aid = scanInput.trim();
    if (!aid) return;
    const a = (attendees as any[]).find((x) => x.id === aid);
    if (!a) setScanMessage({ type: "error", text: "Invalid Ticket ID." });
    else if (a.checked_in) setScanMessage({ type: "warning", text: `${a.full_name} already checked in.` });
    else {
      mCheckIn.mutate({ id: a.id, table: "attendees", checked_in: true });
      setScanMessage({ type: "success", text: `✓ ${a.full_name} checked in!` });
    }
    setScanInput("");
    scanInputRef.current?.focus();
  };

  if (isLoading) return <div className="p-8">Loading…</div>;
  if (!session) return <div className="p-8">Event not found.</div>;

  const navItems: { key: typeof activeView; label: string; badge?: number }[] = [
    { key: "reports", label: "Reports" },
    { key: "door", label: "Door", badge: ticketsRedeemed },
    { key: "tickets", label: "Tickets" },
    { key: "gigs", label: "Gigs", badge: gigs.length },
    { key: "floorplan", label: "Floorplan" },
    { key: "marketing", label: "Marketing" },
    { key: "commercial", label: "Commercial" },
    { key: "vendors", label: "Vendors", badge: vendors.length },
    { key: "sponsors", label: "Sponsors", badge: sponsors.length },
    { key: "volunteers", label: "Volunteers", badge: volunteers.length },
    { key: "talent", label: "Talent", badge: talent.length },
  ];

  const inputCls =
    "w-full p-2.5 border border-input bg-background rounded text-sm outline-none focus:border-primary font-medium";

  return (
    <div className="min-h-screen bg-background">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-sm text-white ${
            toast.type === "error" ? "bg-red-600" : toast.type === "warning" ? "bg-amber-600" : "bg-emerald-600"
          }`}
        >
          {toast.text}
        </div>
      )}

      <header className="bg-slate-900 text-white">
        <div className="px-8 py-6 flex items-center justify-between">
          <div>
            <Link to="/staff" className="text-xs text-blue-300 hover:underline">← Back to Ops</Link>
            <h1 className="text-3xl font-black tracking-tight">{session.title}</h1>
            {session.start_time && (
              <p className="text-xs text-blue-200 mt-1">
                {new Date(session.start_time).toLocaleDateString("en-US", {
                  timeZone: CT_TZ, weekday: "long", month: "long", day: "numeric",
                })} · {displayCT(session.start_time)}
              </p>
            )}
          </div>
          <button
            onClick={() => window.print()}
            className="text-xs font-bold uppercase tracking-widest px-3 py-2 border border-white/30 rounded hover:bg-white/10"
          >
            Print Run of Show
          </button>
        </div>
        <nav className="px-8 flex gap-1 overflow-x-auto">
          {navItems.map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setActiveView(key)}
              className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest whitespace-nowrap ${
                activeView === key ? "text-white border-b-4 border-white" : "text-blue-300 hover:text-white"
              }`}
            >
              {label}
              {badge ? <span className="ml-1.5 inline-block bg-blue-500 px-1.5 rounded text-[10px]">{badge}</span> : null}
            </button>
          ))}
        </nav>
      </header>

      <main className="p-8 max-w-[1400px]">
        {activeView === "reports" && (
          <div className="space-y-6">
            <Section title="Financial">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat label="Gross Revenue" value={`$${totalRev.toLocaleString()}`} />
                <Stat label="Talent Costs" value={`$${talentCost.toLocaleString()}`} />
                <Stat
                  label="Net"
                  value={`$${netProfit.toLocaleString()}`}
                  valueClass={netProfit >= 0 ? "text-emerald-600" : "text-red-600"}
                />
                <Stat label="Ticket Revenue" value={`$${ticketRev.toLocaleString()}`} />
                <Stat label="Vendor Revenue" value={`$${vendorRev.toLocaleString()}`} />
                <Stat label="Sponsor Revenue" value={`$${sponsorRev.toLocaleString()}`} />
              </div>
            </Section>

            <Section title="Tickets">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Stat label="Tickets Sold" value={ticketsSold.toLocaleString()} />
                <Stat label="Capacity" value={ticketCapacity.toLocaleString()} />
                <Stat label="Fill Rate" value={pct(ticketFillRate)} />
                <Stat label="Checked In" value={ticketsRedeemed.toLocaleString()} />
                <Stat label="Show Rate" value={pct(showRate)} />
              </div>
              {ticketTierBreakdown.length > 0 && (
                <div className="mt-4 bg-card rounded-xl border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase">
                      <tr>
                        <th className="text-left px-4 py-2">Tier</th>
                        <th className="text-right px-4 py-2">Sold</th>
                        <th className="text-right px-4 py-2">Capacity</th>
                        <th className="text-right px-4 py-2">Fill</th>
                        <th className="text-right px-4 py-2">Checked In</th>
                        <th className="text-right px-4 py-2">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ticketTierBreakdown.map((t) => (
                        <tr key={t.id}>
                          <td className="px-4 py-2 font-medium">{t.name}</td>
                          <td className="px-4 py-2 text-right">{t.sold}</td>
                          <td className="px-4 py-2 text-right">{t.capacity || "—"}</td>
                          <td className="px-4 py-2 text-right">{pct(t.fill)}</td>
                          <td className="px-4 py-2 text-right">{t.checkedIn}</td>
                          <td className="px-4 py-2 text-right">${t.revenue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section title="Vendors">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Approved" value={vendorApproved.toLocaleString()} />
                <Stat label="Capacity" value={vendorCapacity.toLocaleString()} />
                <Stat label="Fill Rate" value={pct(vendorFillRate)} />
                <Stat label="Pending" value={vendorPending.toLocaleString()} />
              </div>
            </Section>

            <Section title="Sponsors">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Approved" value={sponsorApproved.toLocaleString()} />
                <Stat label="Slot Capacity" value={sponsorCapacity.toLocaleString()} />
                <Stat label="Fill Rate" value={pct(sponsorFillRate)} />
                <Stat label="Pending" value={sponsorPending.toLocaleString()} />
              </div>
            </Section>
          </div>
        )}

        {activeView === "tickets" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border p-6">
              <h3 className="font-black mb-4 uppercase text-sm">
                {editingTicket ? "Edit" : "Add"} Ticket
              </h3>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  mSaveTicket.mutate({
                    id: editingTicket?.id,
                    patch: {
                      session_id: id,
                      name: String(fd.get("name") || ""),
                      price: parseFloat(String(fd.get("price") || "0")) || 0,
                      capacity: parseInt(String(fd.get("capacity") || "0")) || 0,
                    },
                  });
                  (e.target as HTMLFormElement).reset();
                }}
              >
                <input name="name" placeholder="Tier Name" defaultValue={editingTicket?.name} className={inputCls} required />
                <div className="grid grid-cols-2 gap-3">
                  <input name="price" type="number" step="0.01" placeholder="Price" defaultValue={editingTicket?.price} className={inputCls} />
                  <input name="capacity" type="number" placeholder="Capacity" defaultValue={editingTicket?.capacity} className={inputCls} />
                </div>
                <Button type="submit" className="w-full">{editingTicket ? "Save" : "Create"}</Button>
              </form>
            </div>
            <div className="bg-card rounded-xl border">
              <div className="divide-y">
                {(ticketTiers as any[]).map((t) => (
                  <div key={t.id} className="p-4 flex justify-between items-center">
                    <div>
                      <div className="font-bold">{t.name}</div>
                      <div className="text-xs text-muted-foreground">${t.price} · cap {t.capacity}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingTicket(t)} className="text-xs px-2 py-1 border rounded">Edit</button>
                      <button onClick={() => confirm("Delete?") && mDelTicket.mutate(t.id)} className="text-xs px-2 py-1 border rounded text-red-600">Del</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeView === "door" && (
          <div className="space-y-4 max-w-xl">
            <form onSubmit={handleScan} className="flex gap-2">
              <Input
                ref={scanInputRef}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Scan ID"
                className="flex-1"
              />
              <Button type="submit">Check In</Button>
            </form>
            {scanMessage && (
              <div
                className={`px-3 py-2 rounded text-sm ${
                  scanMessage.type === "error"
                    ? "bg-red-100 text-red-700"
                    : scanMessage.type === "warning"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {scanMessage.text}
              </div>
            )}
            <div className="bg-card rounded-xl border divide-y">
              {(attendees as any[]).map((a) => (
                <div key={a.id} className="p-3 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{a.full_name}</div>
                    <div className="text-xs text-muted-foreground">{a.ticket_tiers?.name}</div>
                  </div>
                  <button
                    onClick={() =>
                      mCheckIn.mutate({ id: a.id, table: "attendees", checked_in: !a.checked_in })
                    }
                    className={`px-3 py-1 rounded text-xs ${a.checked_in ? "bg-muted" : "bg-primary text-primary-foreground"}`}
                  >
                    {a.checked_in ? "Undo" : "Check In"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === "gigs" && (
          <div className="space-y-6">
            <div className="bg-card rounded-xl border p-6">
              <h3 className="font-black mb-4 uppercase text-sm">Add Gig to Event</h3>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const start = inheritTime ? session.start_time : ctLocalToUtc(String(fd.get("startTime") || ""));
                  const end = inheritTime ? session.end_time : ctLocalToUtc(String(fd.get("endTime") || ""));
                  mCreateGig.mutate({
                    session_id: id,
                    title: String(fd.get("title") || "") || null,
                    stage_id: inheritLocation ? session.stage_id : String(fd.get("stageId") || "") || null,
                    start_time: start,
                    end_time: end,
                    inherit_time: inheritTime,
                  });
                  (e.target as HTMLFormElement).reset();
                  setInheritTime(true);
                  setInheritLocation(true);
                }}
              >
                <input name="title" placeholder="Gig title" className={inputCls} />

                <div className="border rounded p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={inheritLocation} onChange={(e) => setInheritLocation(e.target.checked)} />
                    Inherit event venue ({(session as any).stages?.name || "TBA"})
                  </label>
                  {!inheritLocation && (
                    <select name="stageId" className={inputCls} required>
                      <option value="">Select venue/stage *</option>
                      {(stagesList as any[]).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="border rounded p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={inheritTime} onChange={(e) => setInheritTime(e.target.checked)} />
                    Inherit event time ({displayCT(session.start_time)} - {displayCT(session.end_time)})
                  </label>
                  {!inheritTime && (
                    <div className="grid grid-cols-2 gap-3">
                      <input name="startTime" type="datetime-local" className={inputCls} required />
                      <input name="endTime" type="datetime-local" className={inputCls} required />
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full">Create Gig & Add to Run of Show</Button>
              </form>
            </div>

            <div className="bg-card rounded-xl border">
              <div className="p-4 border-b flex justify-between">
                <span className="font-bold">Linked Gigs</span>
                <span className="text-xs text-muted-foreground">{gigs.length} Total</span>
              </div>
              <div className="divide-y">
                {gigs.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No gigs attached to this event yet.</p>
                ) : (
                  (gigs as any[]).map((g) => (
                    <div key={g.id} className="p-4 flex justify-between items-center">
                      <div>
                        <div className="font-semibold">
                          {g.title || g.notes}
                          {g.inherit_time && (
                            <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase font-bold">
                              Inherited Time
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {g.stage_id ? g.stages?.name : ((session as any).stages?.name || "Event Venue")}
                          {" · "}
                          {displayCT(g.start_time)}
                          {" · "}
                          {g.is_booked ? <span className="text-emerald-600 font-semibold">✓ {g.profiles?.full_name}</span> : <span className="text-amber-600 font-semibold">OPEN</span>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => mUnlinkGig.mutate(g.id)} className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 border rounded">Unlink</button>
                        <button onClick={() => confirm("Delete?") && mDelGig.mutate(g.id)} className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 border border-red-200 rounded text-red-600">Delete</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeView === "floorplan" && (
          <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading floorplan editor…</div>}>
            <RobustMap
              session={session}
              availableVendors={(vendors as any[]).filter((v) => v.status === "approved" || v.status === "paid")}
              onSave={(payload) => mSaveFloorplan.mutate(payload)}
            />
          </Suspense>
        )}

        {activeView === "marketing" && (
          <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading marketing hub…</div>}>
            <EventMarketingHub
              event={session}
              sponsors={(sponsors as any[]).filter((s) => s.status === "approved" || s.status === "paid")}
              talent={talent as any[]}
            />
          </Suspense>
        )}





        {activeView === "commercial" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border p-6">
              <h3 className="font-black mb-4 uppercase text-sm">Vendor Tiers</h3>
              {(vendorTiers as any[]).map((vt) => (
                <div key={vt.id} className="flex justify-between text-sm py-1">
                  <span>{vt.name}</span><span>${vt.price}</span>
                </div>
              ))}
              <form
                className="mt-4 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  mAddTier.mutate({
                    kind: "vendor",
                    session_id: id,
                    name: String(fd.get("name") || ""),
                    price: parseFloat(String(fd.get("price") || "0")) || 0,
                    capacity: parseInt(String(fd.get("capacity") || "1")) || 1,
                  });
                  (e.target as HTMLFormElement).reset();
                }}
              >
                <input name="name" placeholder="Tier name" className={inputCls} required />
                <div className="grid grid-cols-2 gap-2">
                  <input name="price" type="number" step="0.01" placeholder="Price" className={inputCls} />
                  <input name="capacity" type="number" placeholder="Capacity" className={inputCls} />
                </div>
                <Button type="submit" className="w-full">Add Vendor Tier</Button>
              </form>
            </div>

            <div className="bg-card rounded-xl border p-6">
              <h3 className="font-black mb-4 uppercase text-sm">Sponsorships</h3>
              {(sponsorTiers as any[]).map((st) => (
                <div key={st.id} className="text-sm py-1">
                  <div className="flex justify-between font-semibold"><span>{st.name}</span><span>${st.price}</span></div>
                  <div className="text-xs text-muted-foreground">{st.perks_description}</div>
                </div>
              ))}
              <form
                className="mt-4 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  mAddTier.mutate({
                    kind: "sponsor",
                    session_id: id,
                    name: String(fd.get("name") || ""),
                    price: parseFloat(String(fd.get("price") || "0")) || 0,
                    capacity: parseInt(String(fd.get("capacity") || "1")) || 1,
                    perks_description: String(fd.get("perks") || "") || null,
                  });
                  (e.target as HTMLFormElement).reset();
                }}
              >
                <input name="name" placeholder="Tier name" className={inputCls} required />
                <div className="grid grid-cols-2 gap-2">
                  <input name="price" type="number" step="0.01" placeholder="Price" className={inputCls} />
                  <input name="capacity" type="number" placeholder="Capacity" className={inputCls} />
                </div>
                <input name="perks" placeholder="Perks description" className={inputCls} />
                <Button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-700">Add Sponsorship</Button>
              </form>
            </div>
          </div>
        )}

        {activeView === "vendors" && (
          <div className="bg-card rounded-xl border">
            <div className="p-4 border-b font-bold">Vendors ({vendors.length})</div>
            {(vendors as any[]).map((v) => (
              <div key={v.id} className="p-4 border-b flex justify-between">
                <div>
                  <div className="font-bold">{v.business_name}</div>
                  <div className="text-xs text-muted-foreground">{v.contact_email}</div>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${v.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {v.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeView === "sponsors" && (
          <div className="bg-card rounded-xl border">
            <div className="p-4 border-b font-bold">Sponsors ({sponsors.length})</div>
            {(sponsors as any[]).map((s) => (
              <div key={s.id} className="p-4 border-b flex justify-between">
                <div>
                  <div className="font-bold">{s.company_name}</div>
                  <div className="text-xs text-muted-foreground">{s.contact_email}</div>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${s.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeView === "volunteers" && (
          <div className="bg-card rounded-xl border">
            <div className="p-4 border-b font-bold">Volunteers ({volunteers.length})</div>
            {(volunteers as any[]).map((v) => (
              <div key={v.id} className="p-3 border-b flex justify-between">
                <div>
                  {v.name}{" "}
                  <span className="text-xs text-muted-foreground">{v.shift_role}</span>
                </div>
                <button
                  onClick={() => mCheckIn.mutate({ id: v.id, table: "volunteers", checked_in: !v.checked_in })}
                  className={`px-3 py-1 rounded text-xs ${v.checked_in ? "bg-muted" : "bg-primary text-primary-foreground"}`}
                >
                  {v.checked_in ? "Out" : "In"}
                </button>
              </div>
            ))}
          </div>
        )}

        {activeView === "talent" && (
          <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
            <div className="bg-card rounded-xl border">
              <div className="p-4 border-b font-bold">Run of Show ({talent.length})</div>
              <div className="divide-y">
                {(talent as any[]).map((t) => (
                  <div key={t.id} className="p-4 hover:bg-muted/40 flex justify-between">
                    <div>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded mr-2">{displayCT(t.performance_start)}</span>
                      <span className="font-bold">{t.name}</span>
                      {t.role === "Community Gig" && (
                        <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase font-bold">GIG</span>
                      )}
                      <div className="text-xs text-muted-foreground">{t.role} · ${t.cost}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingTalent(t)} className="text-xs px-2 py-1 border rounded">Edit</button>
                      <button onClick={() => confirm("Remove?") && mDelTalent.mutate(t.id)} className="text-xs px-2 py-1 border rounded text-red-600">Del</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card rounded-xl border p-6 h-fit sticky top-8">
              <h3 className="font-black mb-4 uppercase text-sm">{editingTalent ? "Edit" : "Add"} Talent</h3>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  mSaveTalent.mutate({
                    id: editingTalent?.id,
                    patch: {
                      session_id: id,
                      name: String(fd.get("name") || ""),
                      role: String(fd.get("role") || "") || null,
                      cost: parseFloat(String(fd.get("cost") || "0")) || 0,
                      performance_start: ctLocalToUtc(String(fd.get("perfStart") || "")) || null,
                      load_in_time: ctLocalToUtc(String(fd.get("loadIn") || "")) || null,
                      contact_name: String(fd.get("contactName") || "") || null,
                      contact_phone: String(fd.get("contactPhone") || "") || null,
                      rider_notes: String(fd.get("riderNotes") || "") || null,
                      status: "contracted",
                    },
                  });
                  if (!editingTalent) (e.target as HTMLFormElement).reset();
                }}
              >
                <input name="name" placeholder="Name" defaultValue={editingTalent?.name} className={inputCls} required />
                <input name="role" placeholder="Role" defaultValue={editingTalent?.role} className={inputCls} />
                <input name="cost" type="number" step="0.01" placeholder="Cost" defaultValue={editingTalent?.cost} className={inputCls} />
                <input name="perfStart" type="datetime-local" className={inputCls} />
                <input name="loadIn" type="datetime-local" className={inputCls} />
                <input name="contactName" placeholder="Contact name" defaultValue={editingTalent?.contact_name} className={inputCls} />
                <input name="contactPhone" placeholder="Contact phone" defaultValue={editingTalent?.contact_phone} className={inputCls} />
                <textarea name="riderNotes" placeholder="Rider notes" defaultValue={editingTalent?.rider_notes} className={inputCls} rows={3} />
                <Button type="submit" className="w-full">{editingTalent ? "Save" : "Add"}</Button>
                {editingTalent && (
                  <button type="button" onClick={() => setEditingTalent(null)} className="w-full text-xs text-muted-foreground">
                    Cancel
                  </button>
                )}
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-card rounded-xl border p-6">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-3xl font-black mt-2 ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-black uppercase text-sm tracking-widest text-muted-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}
