import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { getRoomAvailability } from "@/lib/room-reservations-public.functions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function RoomAvailabilityCalendar({ roomId }: { roomId: string }) {
  const hydrated = useHydrated();

  const { from, to, days } = useMemo(() => {
    if (!hydrated) return { from: "", to: "", days: [] as Date[] };
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    const days: Date[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return { from: start.toISOString(), to: end.toISOString(), days };
  }, [hydrated]);

  const { data, isLoading } = useQuery({
    queryKey: ["public", "room", roomId, "availability", from, to],
    queryFn: () => getRoomAvailability({ data: { room_id: roomId, from, to } }),
    enabled: hydrated && !!from,
  });

  if (!hydrated) return null;

  const byDay = new Map<string, { starts_at: string; ends_at: string }[]>();
  for (const r of data ?? []) {
    const key = new Date(r.starts_at).toISOString().slice(0, 10);
    const arr = byDay.get(key) ?? [];
    arr.push(r);
    byDay.set(key, arr);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
          Approved bookings
        </h2>
        <span className="text-xs text-slate-500">Next 14 days</span>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const items = byDay.get(key) ?? [];
            const busy = items.length > 0;
            return (
              <div
                key={key}
                className={`rounded-md border p-2 text-xs ${
                  busy
                    ? "border-amber-200 bg-amber-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <div className="font-semibold text-slate-700">
                  {DAYS[d.getDay()]} {d.getDate()}
                </div>
                {busy ? (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-amber-900">
                    {items.map((r, i) => (
                      <li key={i}>
                        {fmtTime(new Date(r.starts_at))}–
                        {fmtTime(new Date(r.ends_at))}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 text-[11px] text-emerald-700">Free</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Times shown are already booked. Pick a slot that doesn't conflict.
      </p>
    </div>
  );
}
