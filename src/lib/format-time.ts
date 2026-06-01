// Centralized date/time helpers.
//
// Policy (set by user): all times render in the viewer's browser/device
// timezone. Storage is always UTC (ISO 8601). Form inputs use the
// `<input type="datetime-local">` or split `<input type="date">` +
// `<input type="time">` pattern — both are interpreted as the user's local
// wall-clock time, then converted to UTC ISO before being sent to the server.

const pad = (n: number) => String(n).padStart(2, "0");

function safeDate(iso: string | Date | null | undefined): Date | null {
  if (iso == null || iso === "") return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Long date+time string in viewer's local TZ, e.g. "Aug 15, 2025, 7:00 PM". */
export function formatDateTime(
  iso: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  const d = safeDate(iso);
  if (!d) return "";
  return d.toLocaleString(undefined, opts);
}

/** Date only in viewer's local TZ, e.g. "Aug 15, 2025". */
export function formatDate(
  iso: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  const d = safeDate(iso);
  if (!d) return "";
  return d.toLocaleDateString(undefined, opts);
}

/** Time only in viewer's local TZ, e.g. "7:00 PM". */
export function formatTime(
  iso: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { timeStyle: "short" },
): string {
  const d = safeDate(iso);
  if (!d) return "";
  return d.toLocaleTimeString(undefined, opts);
}

/** Compact day+time used in many lists, e.g. "Fri Aug 15, 7:00 PM". */
export function formatDateTimeShort(iso: string | Date | null | undefined): string {
  return formatDateTime(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Convert a stored UTC ISO string into the value expected by
 * `<input type="datetime-local">` (local wall-clock, no timezone suffix).
 */
export function toDateTimeLocalInput(
  iso: string | Date | null | undefined,
): string {
  const d = safeDate(iso);
  if (!d) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert a `<input type="datetime-local">` value (interpreted as local
 * time) into a UTC ISO string suitable for storage. Returns `null` when
 * the input is empty or cannot be parsed.
 */
export function localInputToIso(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  // `new Date("YYYY-MM-DDTHH:MM")` is parsed as local time by every modern
  // browser, which is exactly what we want before normalizing to UTC.
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Split a UTC ISO string into the viewer's local date + time parts,
 * suitable for the separate `<input type="date">` / `<input type="time">`
 * fields used in CSV exports.
 */
export function splitIsoToLocalParts(
  iso: string | Date | null | undefined,
): { date: string; time: string } {
  const d = safeDate(iso);
  if (!d) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * Combine a local date (`YYYY-MM-DD`) and local time (`HH:mm` or `HH:mm:ss`)
 * into a UTC ISO string. Either part may be omitted; if both are empty the
 * function returns `null`. The combined value is interpreted in the viewer's
 * local timezone.
 *
 * Designed for CSV import where authors enter dates and times the way they
 * naturally read them in a spreadsheet.
 */
export function combineLocalDateTimeToIso(
  date: string | null | undefined,
  time: string | null | undefined,
): string | null {
  const datePart = (date ?? "").trim();
  const timePart = (time ?? "").trim();
  if (!datePart && !timePart) return null;
  if (!datePart) return null; // date is required to be meaningful
  const t = timePart || "00:00";
  // Normalize HH:mm — accept also H:mm, HH:mm:ss
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  const hh = m ? pad(parseInt(m[1], 10)) : "00";
  const mm = m ? m[2] : "00";
  const ss = m && m[3] ? m[3] : "00";
  const d = new Date(`${datePart}T${hh}:${mm}:${ss}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Best-effort: accept either a full datetime string or a date-only string. */
export function parseFlexibleToIso(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
