import { useState, type FormEvent } from "react";
import { useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { submitReservationRequest } from "@/lib/room-reservations-public.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function RoomReservationForm({ roomId }: { roomId: string }) {
  const hydrated = useHydrated();
  const submit = useServerFn(submitReservationRequest);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const startDate = String(fd.get("date") ?? "");
    const startTime = String(fd.get("start_time") ?? "");
    const endTime = String(fd.get("end_time") ?? "");
    if (!startDate || !startTime || !endTime) {
      toast.error("Pick a date and times");
      return;
    }
    const starts_at = new Date(`${startDate}T${startTime}`).toISOString();
    const ends_at = new Date(`${startDate}T${endTime}`).toISOString();
    const partyRaw = String(fd.get("party_size") ?? "").trim();

    setSubmitting(true);
    try {
      await submit({
        data: {
          room_id: roomId,
          requester_name: String(fd.get("requester_name") ?? "").trim(),
          requester_email: String(fd.get("requester_email") ?? "").trim(),
          starts_at,
          ends_at,
          party_size: partyRaw ? Number(partyRaw) : null,
          purpose: String(fd.get("purpose") ?? "").trim() || null,
          notes: String(fd.get("notes") ?? "").trim() || null,
        },
      });
      toast.success("Request submitted — staff will review it shortly.");
      setDone(true);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        Your request has been submitted. You'll hear back by email once staff
        review it.
      </div>
    );
  }

  const today = hydrated ? new Date().toISOString().slice(0, 10) : undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="requester_name">Your name</Label>
          <Input id="requester_name" name="requester_name" required maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="requester_email">Email</Label>
          <Input id="requester_email" name="requester_email" type="email" required maxLength={255} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" min={today} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="start_time">Start</Label>
          <Input id="start_time" name="start_time" type="time" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_time">End</Label>
          <Input id="end_time" name="end_time" type="time" required />
        </div>
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
      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Submitting…" : "Submit request"}
      </Button>
      <p className="text-xs text-slate-500">
        Requests are reviewed by venue staff. Times must fall within operating
        hours and not overlap an approved booking.
      </p>
    </form>
  );
}
