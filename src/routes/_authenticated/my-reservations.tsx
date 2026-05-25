import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyReservations } from "@/lib/room-reservations-public.functions";
import { SiteHeader } from "@/components/site-header";

import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute("/_authenticated/my-reservations")({
  beforeLoad: () => requireModule("room_reservations"),
  head: () => ({
    meta: [
      { title: "My Reservations" },
      {
        name: "description",
        content: "Status of the room reservations you've requested.",
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
  const fetchMine = useServerFn(listMyReservations);
  const { data, isLoading } = useQuery({
    queryKey: ["me", "reservations"],
    queryFn: () => fetchMine(),
  });
  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-slate-50">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-sm text-slate-500">Loading…</p>
        </main>
      </div>
    );
  }
  const roomById = new Map((data.rooms ?? []).map((r: any) => [r.id, r]));
  const venueById = new Map((data.venues ?? []).map((v: any) => [v.id, v]));

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">
          My reservations
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Showing requests linked to {data.email ?? "your account"}.
        </p>

        {data.reservations.length === 0 ? (
          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">
              You haven't requested any rooms yet.
            </p>
            <Link
              to="/venues"
              className="mt-4 inline-block rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Browse venues
            </Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {data.reservations.map((r: any) => {
              const room: any = roomById.get(r.room_id);
              const venue: any = room ? venueById.get(room.venue_id) : null;
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
                          <span className="text-slate-500"> · {venue.name}</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-sm text-slate-600">
                        {fmtRange(r.starts_at, r.ends_at)}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                        STATUS_STYLES[r.status] ?? "bg-slate-100 text-slate-700"
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
      </main>
    </div>
  );
}
