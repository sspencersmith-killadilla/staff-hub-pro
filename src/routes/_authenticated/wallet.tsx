import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { SiteHeader } from "@/components/site-header";
import { listMyTickets, type PrizeTicket } from "@/lib/quest-prizes.functions";
import { listMyRaffles } from "@/lib/raffles.functions";
import { Ticket, Gift, Sparkles, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wallet")({
  component: WalletPage,
});

function WalletPage() {
  const fetchTickets = useServerFn(listMyTickets);
  const fetchRaffles = useServerFn(listMyRaffles);

  const { data: tdata } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: () => fetchTickets(),
  });
  const { data: rdata } = useQuery({
    queryKey: ["my-raffles"],
    queryFn: () => fetchRaffles(),
  });

  const tickets = tdata?.tickets ?? [];
  const raffles = rdata?.raffles ?? [];
  const [openTicket, setOpenTicket] = useState<PrizeTicket | null>(null);

  return (
    <div className="min-h-dvh bg-amber-50">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex items-center gap-3">
          <Ticket className="h-9 w-9 text-amber-700" />
          <div>
            <h1 className="font-serif text-3xl font-black text-stone-900">
              My Wallet
            </h1>
            <p className="text-sm text-stone-600">
              Prize tickets earned from completing quests, plus your raffle
              entries.
            </p>
          </div>
        </header>

        <section className="mb-10">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-stone-700">
            <Gift className="h-4 w-4" /> Prize tickets ({tickets.length})
          </h2>
          {tickets.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-600">
              No tickets yet. Complete a quest at{" "}
              <Link to="/explore" className="font-bold underline">
                Civic Quests
              </Link>{" "}
              to earn one.
            </div>
          ) : (
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
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-stone-700">
            <Trophy className="h-4 w-4" /> Raffle entries ({raffles.length})
          </h2>
          {raffles.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-600">
              No raffle entries yet. Complete quests linked to active raffles to
              earn entries.
            </div>
          ) : (
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
                        <p className="text-xs text-stone-700">
                          Prize: {r.prize_name}
                        </p>
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
          )}
        </section>
      </main>

      {openTicket && (
        <TicketModal
          ticket={openTicket}
          onClose={() => setOpenTicket(null)}
        />
      )}
    </div>
  );
}

function TicketModal({
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
