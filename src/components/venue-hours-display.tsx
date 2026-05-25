import { Clock, CalendarX } from "lucide-react";

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

function fmt(t?: string | null) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hh = parseInt(h, 10);
  const suf = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${m} ${suf}`;
}

export function VenueHoursDisplay({
  openHours,
  closures,
  inheritedFrom,
}: {
  openHours: any;
  closures: any;
  inheritedFrom?: string;
}) {
  const hours = openHours ?? {};
  const closureList = Array.isArray(closures) ? closures : [];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-slate-700" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Operating Hours
          </h3>
        </div>
        {inheritedFrom && (
          <p className="text-xs text-slate-500 mb-3">
            Inherited from {inheritedFrom}
          </p>
        )}
        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden">
          {DAYS.map((d) => {
            const day = hours[d.key] ?? { closed: true };
            return (
              <div
                key={d.key}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <dt className="font-medium text-slate-700">{d.label}</dt>
                <dd className="text-slate-600">
                  {day.closed ? (
                    <span className="text-slate-400">Closed</span>
                  ) : (
                    <>
                      {fmt(day.open)} – {fmt(day.close)}
                    </>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {closureList.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CalendarX className="h-4 w-4 text-slate-700" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Upcoming Closures
            </h3>
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden">
            {closureList.map((c: any, i: number) => (
              <li
                key={i}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-slate-700">{c.date}</span>
                <span className="text-slate-500">{c.reason || "Closed"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
