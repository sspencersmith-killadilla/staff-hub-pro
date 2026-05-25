import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { lookupReservationsByEmail } from "@/lib/room-reservations-public.functions";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/my-reservations")({
  head: () => ({
    meta: [
      { title: "My Reservations" },
      {
        name: "description",
        content: "Look up the status of room reservations you've requested.",
      },
      { property: "og:title", content: "My Reservations" },
    ],
  }),
  component: MyReservationsPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  declined: "bg-rose-100 text-rose-900",
  cancelled: "bg-slate-200 text-slate-700",
};

function fmtRange(starts: string, ends: string) {
  const s = new Date(starts);
  const e = new Date(ends);
  const date = s.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date} · ${t(s)} – ${t(e)}`;
}

function MyReservationsPage() {
  const lookup = useServerFn(lookupReservationsByEmail);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof lookupReservationsByEmail>
  > | null>(null);
  const [searched, setSearched] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    if (!email) return;
    setLoading(true);
    try {
      const r = await lookup({ data: { email } });
      setResult(r);
      setSearched(email);
    } catch (err: any) {
      toast.error(err?.message ?? "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  const roomById = new Map((result?.rooms ?? []).map((r: any) => [r.id, r]));
  const venueById = new Map((result?.venues ?? []).map((v: any) => [v.id, v]));

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">
          My reservations
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter the email you used when submitting a request to see its status.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              maxLength={255}
              placeholder="you@example.com"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Looking up…" : "Look up"}
          </Button>
        </form>

        {result && (
          <section className="mt-10">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              {result.reservations.length} request
              {result.reservations.length === 1 ? "" : "s"} for {searched}
            </h2>
            {result.reservations.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                No requests found for that email.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {result.reservations.map((r: any) => {
                  const room: any = roomById.get(r.room_id);
                  const venue: any = room
                    ? venueById.get(room.venue_id)
                    : null;
                  return (
                    <li
                      key={r.id}
                      className="rounded-lg border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {room?.name ?? "Room"}
                            {venue ? (
                              <span className="text-slate-500">
                                {" "}
                                · {venue.name}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-sm text-slate-600">
                            {fmtRange(r.starts_at, r.ends_at)}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                            STATUS_STYLES[r.status] ??
                            "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                      {(r.purpose || r.party_size || r.notes) && (
                        <dl className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                          {r.purpose && (
                            <div>
                              <dt className="inline font-semibold text-slate-700">
                                Purpose:{" "}
                              </dt>
                              <dd className="inline">{r.purpose}</dd>
                            </div>
                          )}
                          {r.party_size != null && (
                            <div>
                              <dt className="inline font-semibold text-slate-700">
                                Party:{" "}
                              </dt>
                              <dd className="inline">{r.party_size}</dd>
                            </div>
                          )}
                          {r.notes && (
                            <div className="sm:col-span-2">
                              <dt className="inline font-semibold text-slate-700">
                                Notes:{" "}
                              </dt>
                              <dd className="inline">{r.notes}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
