import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus } from "lucide-react";

const DAYS = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"],
  ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
] as const;

type DayHours = { closed?: boolean; open?: string | null; close?: string | null };
type OpenHours = Record<string, DayHours>;
type Closure = { date: string; reason?: string };

const defaultHours: OpenHours = Object.fromEntries(
  DAYS.map(([k]) => [k, { closed: false, open: "09:00", close: "17:00" }]),
);

export function OperatingHoursEditor({
  hours, closures, onChange,
}: {
  hours: OpenHours | null | undefined;
  closures: Closure[] | null | undefined;
  onChange: (next: { open_hours: OpenHours; closures: Closure[] }) => void;
}) {
  const h: OpenHours = { ...defaultHours, ...(hours ?? {}) };
  const c: Closure[] = Array.isArray(closures) ? closures : [];

  const setDay = (day: string, patch: Partial<DayHours>) => {
    onChange({ open_hours: { ...h, [day]: { ...h[day], ...patch } }, closures: c });
  };
  const addClosure = () =>
    onChange({ open_hours: h, closures: [...c, { date: "", reason: "" }] });
  const setClosure = (i: number, patch: Partial<Closure>) =>
    onChange({ open_hours: h, closures: c.map((x, idx) => idx === i ? { ...x, ...patch } : x) });
  const removeClosure = (i: number) =>
    onChange({ open_hours: h, closures: c.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 mb-2">
          Operating Hours
        </h3>
        <div className="space-y-2">
          {DAYS.map(([k, label]) => (
            <div key={k} className="flex items-center gap-3">
              <div className="w-24 text-sm font-medium text-slate-700">{label}</div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={h[k].closed === true}
                  onCheckedChange={(v) => setDay(k, { closed: v === true })}
                />
                Closed
              </label>
              {!h[k].closed && (
                <>
                  <Input type="time" className="w-28" value={h[k].open ?? ""}
                    onChange={(e) => setDay(k, { open: e.target.value })} />
                  <span className="text-slate-400">–</span>
                  <Input type="time" className="w-28" value={h[k].close ?? ""}
                    onChange={(e) => setDay(k, { close: e.target.value })} />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Closures
          </h3>
          <Button size="sm" variant="outline" onClick={addClosure} type="button">
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {c.length === 0 ? (
          <p className="text-sm text-slate-400">No closures scheduled.</p>
        ) : (
          <div className="space-y-2">
            {c.map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input type="date" className="w-44" value={x.date}
                  onChange={(e) => setClosure(i, { date: e.target.value })} />
                <Input placeholder="Reason (optional)" value={x.reason ?? ""}
                  onChange={(e) => setClosure(i, { reason: e.target.value })} />
                <Button size="icon" variant="ghost" type="button"
                  onClick={() => removeClosure(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
