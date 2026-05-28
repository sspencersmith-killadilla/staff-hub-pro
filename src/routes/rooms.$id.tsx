import { createFileRoute, Link } from "@tanstack/react-router";
import { FavoriteButton } from "@/components/favorite-button";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { MapPin, Share2, Clock, Users, Check, Calendar, ArrowLeft, Info } from "lucide-react";
import { useState, useMemo } from "react";
import { getRoomPublic } from "@/lib/venues-public.functions";
import { getRoomAvailability } from "@/lib/room-reservations-public.functions";
import { SiteHeader } from "@/components/site-header";
import { RoomReservationForm } from "@/components/room-reservation-form";
import { VenueHoursDisplay } from "@/components/venue-hours-display";
import { requireModule } from "@/lib/require-module";

const roomQO = (id: string) =>
  queryOptions({
    queryKey: ["public", "room", id],
    queryFn: () => getRoomPublic({ data: { id } }),
  });

export const Route = createFileRoute("/rooms/$id")({
  beforeLoad: () => requireModule("room_reservations"),
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(roomQO(params.id)),
  component: RoomDetail,
});

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function formatHour(h: number) {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${ampm}`;
}

function parseHourFromTime(t?: string | null): number | null {
  if (!t) return null;
  const [h] = t.split(":");
  const n = parseInt(h, 10);
  return Number.isNaN(n) ? null : n;
}

function RoomDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(roomQO(id));
  const r: any = data.room;
  const v: any = data.venue;
  const dept: any = (data as any).department ?? null;

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Determine venue day-of-week info for the selected date
  const dayInfo = useMemo(() => {
    // Parse YYYY-MM-DD as local date (not UTC) to avoid off-by-one
    const [y, m, d] = selectedDate.split("-").map((s) => parseInt(s, 10));
    const date = new Date(y, (m || 1) - 1, d || 1);
    const dayKey = DAY_KEYS[date.getDay()];
    const hours = v?.open_hours?.[dayKey] ?? null;
    const closures = Array.isArray(v?.closures) ? v.closures : [];
    const closure = closures.find((c: any) => c?.date === selectedDate);
    const closed = !hours || hours.closed || !!closure;
    const openHour = parseHourFromTime(hours?.open);
    const closeHour = parseHourFromTime(hours?.close);
    return { date, dayKey, hours, closed, closure, openHour, closeHour };
  }, [selectedDate, v]);

  const slots = useMemo(() => {
    if (dayInfo.closed || dayInfo.openHour == null || dayInfo.closeHour == null) return [];
    // 2-hour blocks. Latest start must allow a 2-hour booking ending by close.
    const list: number[] = [];
    for (let h = dayInfo.openHour; h <= dayInfo.closeHour - 2; h++) list.push(h);
    return list;
  }, [dayInfo]);

  // Fetch existing reservations + sessions for the date
  const dayStartIso = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map((s) => parseInt(s, 10));
    return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0).toISOString();
  }, [selectedDate]);
  const dayEndIso = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map((s) => parseInt(s, 10));
    return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59).toISOString();
  }, [selectedDate]);

  const availabilityQuery = useQuery({
    queryKey: ["room-availability", id, selectedDate],
    queryFn: () =>
      getRoomAvailability({
        data: { room_id: id, from: dayStartIso, to: dayEndIso },
      }),
    enabled: !dayInfo.closed,
  });

  const busyRanges = useMemo(
    () =>
      (availabilityQuery.data ?? []).map((b: any) => ({
        start: new Date(b.starts_at),
        end: new Date(b.ends_at),
        status: b.status,
      })),
    [availabilityQuery.data],
  );

  // Determine if a 2-hour block starting at hour `h` overlaps anything busy or is in the past
  function slotState(h: number) {
    const [y, mo, d] = selectedDate.split("-").map((s) => parseInt(s, 10));
    const start = new Date(y, (mo || 1) - 1, d || 1, h, 0, 0);
    const end = new Date(y, (mo || 1) - 1, d || 1, h + 2, 0, 0);
    if (start.getTime() < Date.now()) return "past" as const;
    for (const b of busyRanges) {
      if (start < b.end && end > b.start) {
        return b.status === "event" ? ("event" as const) : ("booked" as const);
      }
    }
    return "free" as const;
  }

  const selectedEnd = selectedHour !== null ? selectedHour + 2 : null;

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // When date changes, reset selection if no longer valid
  function changeDate(next: string) {
    setSelectedDate(next);
    setSelectedHour(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        <Link
          to="/rooms"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> All rooms
        </Link>

        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border bg-slate-900 shadow-sm">
          {r.image_url ? (
            <div className="relative h-72 md:h-96 w-full">
              <img src={r.image_url} alt={r.name} className="h-full w-full object-cover opacity-90" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            </div>
          ) : (
            <div className="h-56 md:h-72 w-full bg-gradient-to-br from-slate-700 to-slate-900" />
          )}
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-8 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex items-start gap-3 flex-wrap">
                <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">{r.name}</h1>
                <FavoriteButton itemType="room" itemId={id} label />
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-white/85 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {v?.name}
                  {r.building ? ` • ${r.building}` : ""}
                </span>
                {r.capacity && (
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4" /> Up to {r.capacity}
                  </span>
                )}
              </p>
              {(r.tags ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(r.tags as string[]).slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-white/15 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-white border border-white/20"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 backdrop-blur border border-white/20 px-3 py-1.5 text-white text-sm hover:bg-white/25"
            >
              {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              {copied ? "Copied" : "Share"}
            </button>
          </div>
        </section>

        {/* Booking */}
        <section className="rounded-3xl border bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b bg-slate-50/60 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-slate-700" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Reserve this room</h2>
              <p className="text-xs text-slate-500">
                Bookings are 2-hour blocks within venue operating hours.
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-[280px_1fr_340px] gap-6 p-6">
            {/* Step 1 — Date */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                1. Date
              </label>
              <input
                type="date"
                value={selectedDate}
                min={today}
                onChange={(e) => changeDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                {dayInfo.closed ? (
                  <div className="flex items-start gap-2 text-amber-800">
                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      {dayInfo.closure
                        ? `Closed: ${dayInfo.closure.reason || "Venue closure"}`
                        : "Venue is closed this day"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Open {formatHour(dayInfo.openHour!)} – {formatHour(dayInfo.closeHour!)}
                  </div>
                )}
              </div>
            </div>

            {/* Step 2 — Time slots */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                2. Start time (2-hour block)
              </label>

              {dayInfo.closed ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  No availability — pick another date.
                </div>
              ) : slots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  Operating window is too short for a 2-hour block.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {slots.map((h) => {
                      const state = slotState(h);
                      const isSelected = selectedHour === h;
                      const disabled = state !== "free";
                      const label = formatHour(h);
                      const stateLabel =
                        state === "past"
                          ? "Past"
                          : state === "booked"
                            ? "Booked"
                            : state === "event"
                              ? "Event"
                              : "";
                      return (
                        <button
                          key={h}
                          type="button"
                          disabled={disabled}
                          onClick={() => setSelectedHour(h)}
                          className={[
                            "group relative rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                            isSelected
                              ? "bg-slate-900 text-white border-slate-900 shadow"
                              : disabled
                                ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                                : "bg-white text-slate-800 border-slate-300 hover:border-slate-900 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <div>{label}</div>
                          {disabled && (
                            <div className="text-[10px] font-normal mt-0.5 opacity-80">
                              {stateLabel}
                            </div>
                          )}
                          {!disabled && !isSelected && (
                            <div className="text-[10px] font-normal mt-0.5 text-slate-400">
                              → {formatHour(h + 2)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-white border border-slate-300" /> Free
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-slate-300" /> Booked
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-slate-900" /> Selected
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Step 3 — Form */}
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                3. Your details
              </label>
              {selectedHour !== null ? (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900 font-medium">
                  {dayInfo.date.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  • {formatHour(selectedHour)} – {formatHour(selectedEnd!)}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 italic">
                  Pick a start time to continue.
                </div>
              )}

              {selectedHour !== null && (
                <RoomReservationForm
                  roomId={String(r.id)}
                  openHours={v?.open_hours}
                  closures={v?.closures}
                  initialDate={selectedDate}
                  initialStartHour={selectedHour}
                  initialEndHour={selectedEnd}
                  instantBookable={!!r.instant_bookable}
                  departmentName={dept?.name ?? null}
                  roomPolicyText={dept?.room_policy_text ?? null}
                  key={`${selectedDate}-${selectedHour}`}
                />

              )}
            </div>
          </div>
        </section>

        {/* About + Hours */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {r.description && (
              <div className="rounded-2xl bg-white border p-6 shadow-sm">
                <h2 className="text-lg font-semibold mb-3 text-slate-900">About this room</h2>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {r.description}
                </p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {r.capacity && (
                <div className="rounded-2xl bg-white border p-4 shadow-sm flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-slate-700" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Capacity</div>
                    <div className="text-sm font-semibold text-slate-900">
                      Up to {r.capacity} people
                    </div>
                  </div>
                </div>
              )}
              <div className="rounded-2xl bg-white border p-4 shadow-sm flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-slate-700" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Block length</div>
                  <div className="text-sm font-semibold text-slate-900">2-hour reservations</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white border p-6 shadow-sm">
            <VenueHoursDisplay
              openHours={v?.open_hours}
              closures={v?.closures}
              inheritedFrom={v?.name}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
