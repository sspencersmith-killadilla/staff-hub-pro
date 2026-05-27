import { useEffect, useState } from "react";

type Props = {
  roomId: string;
  openHours?: any;
  closures?: any;
  initialStartHour?: number | null;
  initialEndHour?: number | null;
};

function toTimeInput(hour: number) {
  // converts 11 -> "11:00", 13 -> "13:00" for <input type="time">
  const h = String(hour).padStart(2, "0");
  return `${h}:00`;
}

function toDisplay(hour: number) {
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${ampm}`;
}

export function RoomReservationForm({ 
  roomId, 
  openHours, 
  closures,
  initialStartHour,
  initialEndHour 
}: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill when parent picks a slot
  useEffect(() => {
    if (initialStartHour != null) {
      setStartTime(toTimeInput(initialStartHour));
    }
    if (initialEndHour != null) {
      setEndTime(toTimeInput(initialEndHour));
    }
  }, [initialStartHour, initialEndHour]);

  const timesLocked = initialStartHour != null && initialEndHour != null;
  const canSubmit = date && startTime && endTime && name && email && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    
    setSubmitting(true);
    try {
      // replace with your actual mutation
      await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          date,
          startTime,
          endTime,
          name,
          email,
          purpose,
        }),
      });
      alert("Request sent!");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          required
        />
      </div>

      {/* Times - auto-filled from grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => !timesLocked && setStartTime(e.target.value)}
            readOnly={timesLocked}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${
              timesLocked 
                ? "bg-gray-50 border-gray-200 text-gray-700 cursor-not-allowed" 
                : "border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900"
            }`}
            required
          />
          {timesLocked && initialStartHour != null && (
            <p className="mt-1 text-xs text-gray-500">{toDisplay(initialStartHour)}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => !timesLocked && setEndTime(e.target.value)}
            readOnly={timesLocked}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${
              timesLocked 
                ? "bg-gray-50 border-gray-200 text-gray-700 cursor-not-allowed" 
                : "border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900"
            }`}
            required
          />
          {timesLocked && initialEndHour != null && (
            <p className="mt-1 text-xs text-gray-500">{toDisplay(initialEndHour)}</p>
          )}
        </div>
      </div>

      {timesLocked && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
          Time locked from your selection above. Pick a different slot to change.
        </div>
      )}

      {/* Contact */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Purpose (optional)</label>
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
      >
        {submitting ? "Sending..." : "Request booking"}
      </button>
    </form>
  );
}
