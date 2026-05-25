import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import {
  checkInAttendee,
  listAllAttendees,
  type StaffAttendee,
} from "@/lib/attendees.functions";

const Scanner = lazy(() =>
  import("@yudiel/react-qr-scanner").then((m) => ({ default: m.Scanner })),
);

export const Route = createFileRoute("/_authenticated/staff/attendees")({
  component: AttendeesPage,
});

type ScanMsg = { type: "success" | "warning" | "error"; text: string } | null;

function fmtWhen(starts: string | null) {
  if (!starts) return "—";
  return new Date(starts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function AttendeesPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listAllAttendees);
  const doCheckIn = useServerFn(checkInAttendee);

  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [manualId, setManualId] = useState("");
  const [scanMsg, setScanMsg] = useState<ScanMsg>(null);
  const cooldown = useRef<Map<string, number>>(new Map());

  const { data, isLoading } = useQuery({
    queryKey: ["staff", "attendees", sessionFilter],
    queryFn: () =>
      fetchAll({
        data: { session_id: sessionFilter === "all" ? null : sessionFilter },
      }),
  });

  const attendees: StaffAttendee[] = data?.attendees ?? [];
  const sessions = data?.sessions ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return attendees;
    return attendees.filter((a) =>
      [a.full_name, a.email, a.session_title, a.tier_name, a.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [attendees, search]);

  const totals = useMemo(() => {
    const checked = attendees.filter((a) => a.checked_in).length;
    return { total: attendees.length, checked, remaining: attendees.length - checked };
  }, [attendees]);

  const mCheck = useMutation({
    mutationFn: (id: string) => doCheckIn({ data: { id, checked_in: true } }),
    onSuccess: (res, id) => {
      qc.invalidateQueries({ queryKey: ["staff", "attendees"] });
      if (!res.ok && res.reason === "not_found") {
        setScanMsg({ type: "error", text: `No ticket matches "${id.slice(0, 12)}…"` });
      } else if (!res.ok && res.reason === "already_checked_in") {
        setScanMsg({
          type: "warning",
          text: `${res.full_name} already checked in${res.session_title ? ` for ${res.session_title}` : ""}.`,
        });
      } else if (res.ok) {
        setScanMsg({
          type: "success",
          text: `✓ ${res.full_name} checked in${res.session_title ? ` — ${res.session_title}` : ""}`,
        });
      }
    },
    onError: (e: Error) => setScanMsg({ type: "error", text: e.message }),
  });

  const mToggle = useMutation({
    mutationFn: (v: { id: string; checked_in: boolean }) =>
      doCheckIn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff", "attendees"] }),
  });

  const handleScan = (codes: IDetectedBarcode[]) => {
    for (const c of codes) {
      const raw = c.rawValue?.trim();
      if (!raw) continue;
      const now = Date.now();
      const last = cooldown.current.get(raw) ?? 0;
      if (now - last < 3000) continue;
      cooldown.current.set(raw, now);
      mCheck.mutate(raw);
      break;
    }
  };

  const handleManual = (e: React.FormEvent) => {
    e.preventDefault();
    const id = manualId.trim();
    if (!id) return;
    mCheck.mutate(id);
    setManualId("");
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">
            Attendees
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            All ticketed registrations across city events. Scan or look up to check in.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="font-bold uppercase tracking-wider text-slate-500">Total</div>
            <div className="text-lg font-black text-slate-900">{totals.total}</div>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="font-bold uppercase tracking-wider text-emerald-700">In</div>
            <div className="text-lg font-black text-emerald-900">{totals.checked}</div>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="font-bold uppercase tracking-wider text-amber-700">Left</div>
            <div className="text-lg font-black text-amber-900">{totals.remaining}</div>
          </div>
        </div>
      </div>

      {/* Scanner */}
      <div className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              QR Scanner
            </h2>
            <button
              onClick={() => {
                setScanOpen((v) => !v);
                setScanMsg(null);
              }}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-700"
            >
              {scanOpen ? "Stop camera" : "Start camera"}
            </button>
          </div>
          {scanOpen ? (
            <div className="overflow-hidden rounded-lg border border-slate-300">
              <ClientOnly fallback={<div className="p-8 text-center text-xs text-slate-500">Loading camera…</div>}>
                <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading camera…</div>}>
                  <Scanner
                    onScan={handleScan}
                    onError={(err) =>
                      setScanMsg({
                        type: "error",
                        text: err instanceof Error ? err.message : "Camera error",
                      })
                    }
                    constraints={{ facingMode: "environment" }}
                    styles={{ container: { width: "100%" } }}
                  />
                </Suspense>
              </ClientOnly>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
              Click "Start camera" to scan attendee QR codes.
            </div>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-700">
            Manual / Hardware Scanner
          </h2>
          <form onSubmit={handleManual} className="flex gap-2">
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="Paste or scan ticket ID…"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
              autoComplete="off"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white hover:bg-slate-700"
            >
              Check in
            </button>
          </form>
          {scanMsg && (
            <div
              className={`mt-3 rounded-md px-3 py-2 text-sm font-semibold ${
                scanMsg.type === "success"
                  ? "bg-emerald-100 text-emerald-900"
                  : scanMsg.type === "warning"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-rose-100 text-rose-900"
              }`}
            >
              {scanMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Search
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, event, ticket ID…"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Event
          </label>
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All events</option>
            {sessions.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            No attendees match your filters.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Attendee</th>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{a.full_name}</div>
                    <div className="text-xs text-slate-500">{a.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {a.session_title ?? "—"}
                    {a.venue_name && (
                      <div className="text-xs text-slate-500">{a.venue_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {fmtWhen(a.session_start)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.tier_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {a.checked_in ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                        Checked in
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() =>
                        mToggle.mutate({ id: a.id, checked_in: !a.checked_in })
                      }
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100"
                    >
                      {a.checked_in ? "Undo" : "Check in"}
                    </button>
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
