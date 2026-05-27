import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { submitReservationRequest } from "@/lib/room-reservations-public.functions";
import { useAuth } from "@/hooks/use-auth";

type Props = {
  roomId: string;
  openHours?: any;
  closures?: any;
  initialDate?: string | null;
  initialStartHour?: number | null;
  initialEndHour?: number | null;
};

function toTimeInput(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}
function toDisplay(hour: number) {
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${ampm}`;
}

export function RoomReservationForm({
  roomId,
  initialDate,
  initialStartHour,
  initialEndHour,
}: Props) {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading, me } = useAuth();
  const submit = useServerFn(submitReservationRequest);

  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");

  useEffect(() => { if (initialDate) setDate(initialDate); }, [initialDate]);
  useEffect(() => {
    if (initialStartHour != null) setStartTime(toTimeInput(initialStartHour));
    if (initialEndHour != null) setEndTime(toTimeInput(initialEndHour));
  }, [initialStartHour, initialEndHour]);

  const mutation = useMutation({
    mutationFn: async () => {
      const starts_at = new Date(`${date}T${startTime}:00`).toISOString();
      const ends_at = new Date(`${date}T${endTime}:00`).toISOString();
      return submit({
        data: {
          room_id: roomId,
          requester_name: name.trim(),
          starts_at,
          ends_at,
          purpose: purpose.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Request sent — staff will review shortly.");
      setName("");
      setPurpose("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not submit request"),
  });

  const timesLocked = initialStartHour != null && initialEndHour != null;
  const dateLocked = !!initialDate;
  const canSubmit = !!(date && startTime && endTime && name.trim()) && !mutation.isPending;

  if (authLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="text-amber-900 mb-2">Sign in to request this room.</p>
        <button
          onClick={() =>
            navigate({ to: "/login", search: { redirect: window.location.pathname } })
          }
          className="rounded-md bg-amber-900 px-3 py-1.5 text-white text-xs font-medium hover:bg-amber-800"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate(); }}
      className="space-y-4"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => !dateLocked && setDate(e.target.value)}
          readOnly={dateLocked}
          className={`w-full rounded-lg border px-3 py-2 text-sm ${dateLocked ? "bg-gray-50 border-gray-200 text-gray-700" : "border-gray-300 focus:ring-2 focus:ring-gray-900 focus:outline-none"}`}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
          <input
            type="time" value={startTime}
            onChange={(e) => !timesLocked && setStartTime(e.target.value)}
            readOnly={timesLocked}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${timesLocked ? "bg-gray-50 border-gray-200" : "border-gray-300 focus:ring-2 focus:ring-gray-900 focus:outline-none"}`}
            required
          />
          {timesLocked && initialStartHour != null && (
            <p className="mt-1 text-xs text-gray-500">{toDisplay(initialStartHour)}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
          <input
            type="time" value={endTime}
            onChange={(e) => !timesLocked && setEndTime(e.target.value)}
            readOnly={timesLocked}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${timesLocked ? "bg-gray-50 border-gray-200" : "border-gray-300 focus:ring-2 focus:ring-gray-900 focus:outline-none"}`}
            required
          />
          {timesLocked && initialEndHour != null && (
            <p className="mt-1 text-xs text-gray-500">{toDisplay(initialEndHour)}</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-xs text-gray-500">(from your account)</span>
        </label>
        <input
          type="email" value={me?.email ?? ""} readOnly
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Purpose (optional)</label>
        <textarea
          value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none"
        />
      </div>

      <button
        type="submit" disabled={!canSubmit}
        className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {mutation.isPending ? "Sending…" : "Request booking"}
      </button>
    </form>
  );
}
