import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import QRCode from "qrcode";
import { SiteHeader } from "@/components/site-header";
import {
  listMyTickets as listMyPrizeTickets,
  type PrizeTicket,
} from "@/lib/quest-prizes.functions";
import { listMyRaffles } from "@/lib/raffles.functions";
import {
  listMyTickets as listMyEventTickets,
  type MyTicket,
} from "@/lib/attendees.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Ticket, Gift, Sparkles, Trophy, CalendarDays } from "lucide-react";

const walletSearchSchema = z.object({
  tab: fallback(z.enum(["events", "prizes", "raffles"]), "events").default("events"),
});

export const Route = createFileRoute("/_authenticated/wallet")({
  validateSearch: zodValidator(walletSearchSchema),
  head: () => ({
    meta: [
      { title: "My Wallet" },
      {
        name: "description",
        content:
          "Your event tickets, quest prize tickets, and raffle entries — all in one place.",
      },
      { property: "og:title", content: "My Wallet" },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const { tab } = Route.useSearch();
  const fetchPrizeTickets = useServerFn(listMyPrizeTickets);
  const fetchRaffles = useServerFn(listMyRaffles);
  const fetchEventTickets = useServerFn(listMyEventTickets);

  const { data: pdata } = useQuery({
    queryKey: ["wallet", "prize-tickets"],
    queryFn: () => fetchPrizeTickets(),
  });
  const { data: rdata } = useQuery({
    queryKey: ["wallet", "raffles"],
    queryFn: () => fetchRaffles(),
  });
  const { data: edata } = useQuery({
    queryKey: ["wallet", "event-tickets"],
    queryFn: () => fetchEventTickets(),
  });

  const prizeTickets = pdata?.tickets ?? [];
  const raffles = rdata?.raffles ?? [];
  const eventTickets = edata?.tickets ?? [];

  return (
    <div className="min-h-dvh bg-amber-50">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-6 flex items-center gap-3">
          <Ticket className="h-9 w-9 text-amber-700" />
          <div>
            <h1 className="font-serif text-3xl font-black text-stone-900">
              My Wallet
            </h1>
            <p className="text-sm text-stone-600">
              Event tickets, prize tickets, and raffle entries — all in one
              place.
            </p>
          </div>
        </header>

        <div className="mb-6 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider">
          <span className="rounded-full border-2 border-stone-900 bg-white px-3 py-1 text-stone-900">
            {eventTickets.length} event ticket{eventTickets.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border-2 border-stone-900 bg-white px-3 py-1 text-stone-900">
            {prizeTickets.length} prize{prizeTickets.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border-2 border-stone-900 bg-white px-3 py-1 text-stone-900">
            {raffles.length} raffle entr{raffles.length === 1 ? "y" : "ies"}
          </span>
        </div>

        <Tabs defaultValue={tab} className="w-full">
          <TabsList className="mb-6 grid w-full grid-cols-3">
            <TabsTrigger value="events">
              <CalendarDays className="mr-1.5 h-4 w-4" /> Events
            </TabsTrigger>
            <TabsTrigger value="prizes">
              <Gift className="mr-1.5 h-4 w-4" /> Prizes
            </TabsTrigger>
            <TabsTrigger value="raffles">
              <Trophy className="mr-1.5 h-4 w-4" /> Raffles
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events">
            <EventTicketsSection tickets={eventTickets} loading={!edata} />
          </TabsContent>

          <TabsContent value="prizes">
            <PrizeTicketsSection tickets={prizeTickets} loading={!pdata} />
          </TabsContent>

          <TabsContent value="raffles">
            <RafflesSection raffles={raffles} loading={!rdata} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ─────────────────────────── Event Tickets ────────────────────────────

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

function EventTicketsSection({
  tickets,
  loading,
}: {
  tickets: MyTicket[];
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (tickets.length === 0) {
    return (
      <EmptyState
        message="You haven't registered for any ticketed events yet."
        ctaTo="/events"
        ctaLabel="Browse events"
      />
    );
  }
  return (
    <ul className="space-y-4">
      {tickets.map((t) => (
        <EventTicketCard key={t.id} ticket={t} />
      ))}
    </ul>
  );
}

function EventTicketCard({ ticket }: { ticket: MyTicket }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const payload = `ticket_${ticket.id}`;
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, payload, {
        width: 200,
        margin: 2,
        errorCorrectionLevel: "M",
      });
    }
    QRCode.toDataURL(
      payload,
      { width: 720, margin: 2, errorCorrectionLevel: "M" },
      (e, url) => {
        if (!e) setDataUrl(url);
      },
    );
  }, [ticket.id]);

  return (
    <li className="overflow-hidden rounded-xl border-2 border-stone-900 bg-white shadow-[6px_6px_0_0_rgba(0,0,0,0.9)]">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-stone-300 p-3">
          <canvas ref={canvasRef} className="block" aria-label="Ticket QR code" />
          {dataUrl && (
            <a
              href={dataUrl}
              download={`ticket-${ticket.id.slice(0, 8)}${ticket.seat_total > 1 ? `-seat${ticket.seat_index}of${ticket.seat_total}` : ""}.png`}
              className="text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:text-stone-900"
            >
              Download
            </a>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-bold text-stone-900">
              {ticket.session_title ?? "Event"}
            </h2>
            <div className="flex flex-col items-end gap-1">
              {ticket.seat_total > 1 && (
                <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-100">
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
          <div className="mt-1 text-sm text-stone-600">
            {fmtWhen(ticket.session_start, ticket.session_end)}
          </div>
          {ticket.venue_name && (
            <div className="mt-0.5 text-xs text-stone-500">{ticket.venue_name}</div>
          )}
          <dl className="mt-3 grid gap-1 text-xs text-stone-600 sm:grid-cols-2">
            <div>
              <dt className="inline font-semibold text-stone-700">Holder: </dt>
              <dd className="inline">{ticket.full_name}</dd>
            </div>
            {ticket.tier_name && (
              <div>
                <dt className="inline font-semibold text-stone-700">Tier: </dt>
                <dd className="inline">{ticket.tier_name}</dd>
              </div>
            )}
            {ticket.quantity && ticket.quantity > 1 && (
              <div>
                <dt className="inline font-semibold text-stone-700">Qty: </dt>
                <dd className="inline">{ticket.quantity}</dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="inline font-semibold text-stone-700">Ticket ID: </dt>
              <dd className="inline font-mono text-[11px]">{ticket.id}</dd>
            </div>
          </dl>
        </div>
      </div>
    </li>
  );
}

// ─────────────────────────── Prize Tickets ────────────────────────────

function PrizeTicketsSection({
  tickets,
  loading,
}: {
  tickets: PrizeTicket[];
  loading: boolean;
}) {
  const [openTicket, setOpenTicket] = useState<PrizeTicket | null>(null);

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (tickets.length === 0) {
    return (
      <EmptyState
        message="No prize tickets yet. Complete a Civic Quest to earn one."
        ctaTo="/explore"
        ctaLabel="Start a quest"
      />
    );
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tickets.map((t) => (
          <li
            key={t.id}
            className={`overflow-hidden rounded-xl border-2 border-stone-900 bg-white shadow-[6px_6px_0_0_rgba(0,0,0,0.9)] ${
              t.status === "redeemed" ? "opacity-60" : ""
            }`}
          >
            {t.prize?.image_url && (
              <img
                src={t.prize.image_url}
                alt=""
                className="h-32 w-full object-cover"
              />
            )}
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-stone-900">
                  {t.prize?.name ?? "Prize"}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    t.status === "issued"
                      ? "bg-emerald-100 text-emerald-900"
                      : t.status === "redeemed"
                        ? "bg-stone-200 text-stone-600"
                        : "bg-rose-100 text-rose-900"
                  }`}
                >
                  {t.status}
                </span>
              </div>
              {t.quest_title && (
                <p className="mt-1 text-xs text-stone-600">
                  From: {t.quest_title}
                </p>
              )}
              {t.prize?.pickup_location && (
                <p className="mt-2 text-xs text-stone-700">
                  Pickup: {t.prize.pickup_location}
                </p>
              )}
              {t.prize?.sponsor_name && (
                <p className="mt-1 text-xs text-stone-500">
                  Sponsored by {t.prize.sponsor_name}
                </p>
              )}
              <p className="mt-2 font-mono text-xs text-stone-500">
                {t.serial}
              </p>
              {t.status === "issued" && (
                <button
                  onClick={() => setOpenTicket(t)}
                  className="mt-3 w-full rounded-md bg-stone-900 px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-100 hover:bg-stone-700"
                >
                  Show QR to redeem
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {openTicket && (
        <PrizeTicketModal
          ticket={openTicket}
          onClose={() => setOpenTicket(null)}
        />
      )}
    </>
  );
}

function PrizeTicketModal({
  ticket,
  onClose,
}: {
  ticket: PrizeTicket;
  onClose: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, ticket.qr_token, { width: 280, margin: 2 });
    }
  }, [ticket.qr_token]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border-2 border-stone-900 bg-white p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-xl font-black text-stone-900">
          {ticket.prize?.name}
        </h3>
        <p className="mt-1 text-xs text-stone-600">
          Show this QR at the pickup location
        </p>
        <div className="my-4 flex justify-center">
          <canvas ref={ref} aria-label="Ticket QR" />
        </div>
        <p className="font-mono text-sm font-bold text-stone-900">
          {ticket.serial}
        </p>
        {ticket.prize?.pickup_location && (
          <p className="mt-3 rounded-md bg-amber-100 p-3 text-sm text-stone-900">
            📍 {ticket.prize.pickup_location}
          </p>
        )}
        <button
          onClick={onClose}
          className="mt-4 rounded-md border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-100"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── Raffles ────────────────────────────

function RafflesSection({
  raffles,
  loading,
}: {
  raffles: NonNullable<Awaited<ReturnType<typeof listMyRaffles>>["raffles"]>;
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (raffles.length === 0) {
    return (
      <EmptyState
        message="No raffle entries yet. Complete quests linked to active raffles to earn entries."
        ctaTo="/explore"
        ctaLabel="Find quests"
      />
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {raffles.map((r) => (
        <li
          key={r.raffle_id}
          className="rounded-xl border-2 border-stone-900 bg-indigo-50 p-4 shadow-[6px_6px_0_0_rgba(0,0,0,0.9)]"
        >
          <div className="flex items-start gap-3">
            {r.image_url && (
              <img
                src={r.image_url}
                alt=""
                className="h-16 w-16 rounded-md border border-stone-900 object-cover"
              />
            )}
            <div className="flex-1">
              <h3 className="font-bold text-stone-900">{r.title}</h3>
              {r.prize_name && (
                <p className="text-xs text-stone-700">Prize: {r.prize_name}</p>
              )}
              {r.draw_date && (
                <p className="mt-1 text-xs text-stone-600">
                  Draws {new Date(r.draw_date).toLocaleString()}
                </p>
              )}
              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-indigo-900">
                <Sparkles className="mr-1 inline h-3 w-3" />
                {r.my_entries} entry{r.my_entries === 1 ? "" : "ies"}
              </p>
              {r.is_winner && (
                <p className="mt-2 rounded-md bg-emerald-200 px-2 py-1 text-xs font-bold uppercase text-emerald-900">
                  🎉 You won!
                </p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────── Shared ────────────────────────────

function EmptyState({
  message,
  ctaTo,
  ctaLabel,
}: {
  message: string;
  ctaTo: string;
  ctaLabel: string;
}) {
  return (
    <div className="rounded-xl border-2 border-dashed border-stone-300 bg-white/60 p-8 text-center">
      <p className="text-sm text-stone-600">{message}</p>
      <Link
        to={ctaTo}
        className="mt-4 inline-block rounded-md bg-stone-900 px-5 py-2 text-sm font-bold uppercase tracking-wider text-amber-100 hover:bg-stone-700"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
