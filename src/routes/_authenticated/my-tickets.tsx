import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { listMyTickets, type MyTicket } from "@/lib/attendees.functions";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/_authenticated/my-tickets")({
  head: () => ({
    meta: [
      { title: "My Tickets" },
      {
        name: "description",
        content: "Your registered tickets with QR codes for event check-in.",
      },
      { property: "og:title", content: "My Tickets" },
    ],
  }),
  component: MyTicketsPage,
});

function fmtWhen(starts: string | null, ends: string | null) {
  if (!starts) return "Date TBA";
  const s = new Date(starts);
  const date = s.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date} · ${t(s)}${ends ? ` – ${t(new Date(ends))}` : ""}`;
}

function MyTicketsPage() {
  const fetchMine = useServerFn(listMyTickets);
  const { data, isLoading } = useQuery({
    queryKey: ["me", "tickets"],
    queryFn: () => fetchMine(),
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">
          My tickets
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Show the QR code at the door — staff will scan to check you in.
        </p>

        {isLoading || !data ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : data.tickets.length === 0 ? (
          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">
              You haven't registered for any ticketed events yet.
            </p>
            <Link
              to="/events"
              className="mt-4 inline-block rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Browse events
            </Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {data.tickets.map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function TicketCard({ ticket }: { ticket: MyTicket }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, ticket.id, {
        width: 200,
        margin: 2,
        errorCorrectionLevel: "M",
      });
    }
    QRCode.toDataURL(
      ticket.id,
      { width: 720, margin: 2, errorCorrectionLevel: "M" },
      (e, url) => {
        if (!e) setDataUrl(url);
      },
    );
  }, [ticket.id]);

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-3">
          <canvas ref={canvasRef} className="block" aria-label="Ticket QR code" />
          {dataUrl && (
            <a
              href={dataUrl}
              download={`ticket-${ticket.id.slice(0, 8)}${ticket.seat_total > 1 ? `-seat${ticket.seat_index}of${ticket.seat_total}` : ""}.png`}
              className="text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:text-slate-900"
            >
              Download
            </a>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">
              {ticket.session_title ?? "Event"}
            </h2>
            <div className="flex flex-col items-end gap-1">
              {ticket.seat_total > 1 && (
                <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Ticket {ticket.seat_index} of {ticket.seat_total}
                </span>
              )}
              {ticket.checked_in ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                  Checked in
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                  Active
                </span>
              )}
            </div>
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {fmtWhen(ticket.session_start, ticket.session_end)}
          </div>
          {ticket.venue_name && (
            <div className="mt-0.5 text-xs text-slate-500">{ticket.venue_name}</div>
          )}
          <dl className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="inline font-semibold text-slate-700">Holder: </dt>
              <dd className="inline">{ticket.full_name}</dd>
            </div>
            {ticket.tier_name && (
              <div>
                <dt className="inline font-semibold text-slate-700">Tier: </dt>
                <dd className="inline">{ticket.tier_name}</dd>
              </div>
            )}
            {ticket.quantity && ticket.quantity > 1 && (
              <div>
                <dt className="inline font-semibold text-slate-700">Qty: </dt>
                <dd className="inline">{ticket.quantity}</dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="inline font-semibold text-slate-700">Ticket ID: </dt>
              <dd className="inline font-mono text-[11px]">{ticket.id}</dd>
            </div>
          </dl>
        </div>
      </div>
    </li>
  );
}
