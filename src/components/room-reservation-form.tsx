import { useMemo, useState, type FormEvent } from "react";
import { Link, useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMyReservationStats,
  getRoomAvailability,
  submitReservationRequest,
} from "@/lib/room-reservations-public.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const SLOT_MINUTES = 120; // 2 hours
const MAX_MIN_PER_DAY = 120;

type OpenHours = Record<string, { open?: string; close?: string; closed?: boolean } | undefined> | null | undefined;
type Closures = Array<{ date?: string }> | null | undefined;

function parseHM(t?: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dayKey(d: Date) {
  // local date key
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildSlots(
  day: Date,
  openHours: OpenHours,
  closures: Closures,
): { start: Date; end: Date }[] {
  const dKey = ymd(day);
  if ((closures ?? []).some((c) => c?.date === dKey)) return [];
  const cfg = openHours?.[DAY_KEYS[day.getDay()]];
  if (!cfg || cfg.closed) return [];
  const openMin = parseHM(cfg.open);
  const closeMin = parseHM(cfg.close);
  if (openMin == null || closeMin == null || closeMin <= openMin) return [];
  const slots: { start: Date; end: Date }[] = [];
  for (let m = openMin; m + SLOT_MINUTES <= closeMin; m += SLOT_MINUTES) {
    const s = new Date(day);
    s.setHours(0, 0, 0, 0);
    s.setMinutes(m);
    const e = new Date(s);
    e.setMinutes(s.getMinutes() + SLOT_MINUTES);
    slots.push({ start: s, end: e });
  }
  return slots;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function RoomReservationForm({
  roomId,
  openHours,
  closures,
}: {
  roomId: string;
  openHours?: OpenHours;
  closures?: Closures;
}) {
  const hydrated = useHydrated();
  const { isAuthenticated, me, loading } = useAuth();
  const qc = useQueryClient();
  const submit = useServerFn(submitReservationRequest);
  const fetchAvail = useServerFn(getRoomAvailability);
  const fetchStats = useServerFn(getMyReservationStats);

  const [picked, setPicked] = useState<{ start: string; end: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { from, to, days } = useMemo(() => {
    if (!hydrated) return { from: "", to: "", days: [] as Date[] };
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return { from: start.toISOString(), to: end.toISOString(), days };
  }, [hydrated]);

  const availQ = useQuery({
    queryKey: ["public", "room", roomId, "avail-slots", from, to],
    queryFn: () => fetchAvail({ data: { room_id: roomId, from, to } }),
    enabled: hydrated && !!from,
  });

  const statsQ = useQuery({
    queryKey: ["me", "reservation-stats"],
    queryFn: () => fetchStats(),
    enabled: hydrated && isAuthenticated,
  });

  const reservedRanges = useMemo(
    () => (availQ.data ?? []).map((r) => ({ start: new Date(r.starts_at), end: new Date(r.ends_at) })),
    [availQ.data],
  );
  const myBookings = statsQ.data?.bookings ?? [];
  const activeCount = statsQ.data?.activeCount ?? 0;
  const maxActive = statsQ.data?.maxActive ?? 3;
  const minutesByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of myBookings) {
      const s = new Date(b.starts_at);
      const e = new Date(b.ends_at);
      const k = dayKey(s);
      const mins = Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000));
      m.set(k, (m.get(k) ?? 0) + mins);
    }
    return m;
  }, [myBookings]);

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  if (!isAuthenticated) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-medium">Log in to request this room.</p>
        <Link
          to="/login"
          search={{ redirect: typeof window !== "undefined" ? window.location.pathname : "/" }}
          className="mt-3 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Log in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        Your request has been submitted. Track it in{" "}
        <Link to="/my-reservations" className="font-semibold underline">My reservations</Link>.
      </div>
    );
  }

  const now = new Date();
  const atMaxActive = activeCount >= maxActive;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    if (!picked) {
      setSubmitError("Pick a time slot first.");
      toast.error("Pick a time slot first");
      return;
    }
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      await submit({
        data: {
          room_id: roomId,
          requester_name: String(fd.get("requester_name") ?? "").trim(),
          starts_at: picked.start,
          ends_at: picked.end,
          party_size: (() => {
            const raw = String(fd.get("party_size") ?? "").trim();
            return raw ? Number(raw) : null;
          })(),
          purpose: String(fd.get("purpose") ?? "").trim() || null,
          notes: String(fd.get("notes") ?? "").trim() || null,
        },
      });
      toast.success("Request submitted — staff will review it shortly.");
      qc.invalidateQueries({ queryKey: ["me", "reservation-stats"] });
      qc.invalidateQueries({ queryKey: ["public", "room", roomId] });
      setDone(true);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to submit request";
      console.error("Reservation submit failed:", err);
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Pick a 2-hour slot
          </h3>
          <span className="text-xs text-slate-500">
            {activeCount}/{maxActive} active bookings
          </span>
        </div>

        {atMaxActive && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            You're at the limit of {maxActive} active bookings. Cancel one in{" "}
            <Link to="/my-reservations" className="font-semibold underline">My reservations</Link>{" "}
            to book another.
          </div>
        )}

        {availQ.isLoading || statsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading availability…</p>
        ) : (
          <div className="space-y-3">
            {days.map((day) => {
              const slots = buildSlots(day, openHours, closures);
              const k = dayKey(day);
              const minsBooked = minutesByDay.get(k) ?? 0;
              const dayFullForUser = minsBooked + SLOT_MINUTES > MAX_MIN_PER_DAY;
              const label = day.toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              return (
                <div key={k}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                      {label}
                    </div>
                    {minsBooked > 0 && (
                      <div className="text-[11px] text-slate-500">
                        {minsBooked}m booked today
                      </div>
                    )}
                  </div>
                  {slots.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                      Closed
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {slots.map((s) => {
                        const past = s.start <= now;
                        const conflict = reservedRanges.some(
                          (r) => r.start < s.end && r.end > s.start,
                        );
                        const startIso = s.start.toISOString();
                        const isPicked = picked?.start === startIso;
                        const blocked =
                          past || conflict || atMaxActive || dayFullForUser;
                        const title = past
                          ? "Past"
                          : conflict
                            ? "Already reserved"
                            : atMaxActive
                              ? "Booking limit reached"
                              : dayFullForUser
                                ? "Daily 2h limit reached"
                                : "Available";
                        return (
                          <button
                            key={startIso}
                            type="button"
                            disabled={blocked}
                            onClick={() =>
                              setPicked({
                                start: startIso,
                                end: s.end.toISOString(),
                              })
                            }
                            title={title}
                            className={[
                              "rounded-md border px-3 py-1.5 text-xs font-medium transition",
                              isPicked
                                ? "border-slate-900 bg-slate-900 text-white"
                                : blocked
                                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-400",
                            ].join(" ")}
                          >
                            {fmtTime(s.start)}–{fmtTime(s.end)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4 border-t border-slate-200 pt-5">
        {picked && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Selected:{" "}
            <span className="font-semibold">
              {new Date(picked.start).toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
              , {fmtTime(new Date(picked.start))}–{fmtTime(new Date(picked.end))}
            </span>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="requester_name">Your name</Label>
          <Input id="requester_name" name="requester_name" required maxLength={200} />
          <p className="text-xs text-slate-500">Sending as {me?.email}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="party_size">Party size (optional)</Label>
            <Input id="party_size" name="party_size" type="number" min={1} max={10000} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purpose">Purpose (optional)</Label>
            <Input id="purpose" name="purpose" maxLength={500} placeholder="Rehearsal, meeting…" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" name="notes" rows={3} maxLength={2000} />
        </div>
        {submitError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            {submitError}
          </div>
        )}
        <Button
          type="submit"
          disabled={submitting || !picked || atMaxActive}
          className="w-full sm:w-auto"
        >
          {submitting ? "Submitting…" : "Submit request"}
        </Button>
        <p className="text-xs text-slate-500">
          Limits: up to 3 active bookings, and up to 2 hours per day.
        </p>
      </form>
    </div>
  );
}
