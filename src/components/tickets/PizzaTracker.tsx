import { CheckCircle2, Circle, Loader2 } from "lucide-react";

const STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "received", label: "Received" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
] as const;

export function PizzaTracker({ status }: { status: string }) {
  const currentIdx = STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="flex w-full items-center gap-1 sm:gap-2">
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={s.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                  done
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : active
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-slate-300 bg-white text-slate-400"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-1 flex-1 ${
                    i < currentIdx ? "bg-emerald-500" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
            <span
              className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${
                active ? "text-amber-700" : done ? "text-emerald-700" : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
