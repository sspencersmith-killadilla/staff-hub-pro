import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { toast } from "sonner";
import {
  staffLookupTicket,
  staffRedeemTicket,
} from "@/lib/quest-prizes.functions";

const Scanner = lazy(() =>
  import("@yudiel/react-qr-scanner").then((m) => ({ default: m.Scanner })),
);

export const Route = createFileRoute("/_authenticated/staff/redeem")({
  component: RedeemPage,
});

type LookupResult = Awaited<ReturnType<typeof staffLookupTicket>>;

function RedeemPage() {
  const lookup = useServerFn(staffLookupTicket);
  const redeem = useServerFn(staffRedeemTicket);
  const [ticket, setTicket] = useState<LookupResult | null>(null);
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(true);

  const lookupM = useMutation({
    mutationFn: (token: string) => lookup({ data: { token } }),
    onSuccess: (t) => {
      setTicket(t);
      setScanning(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const redeemM = useMutation({
    mutationFn: (id: string) => redeem({ data: { ticketId: id } }),
    onSuccess: () => {
      toast.success("Ticket redeemed");
      setTicket((t) => (t ? { ...t, status: "redeemed" } : t));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleScan = (codes: IDetectedBarcode[]) => {
    const raw = codes[0]?.rawValue?.trim();
    if (!raw) return;
    lookupM.mutate(raw);
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        to="/staff"
        className="text-xs font-bold uppercase tracking-wider text-slate-700 hover:underline"
      >
        ← Staff
      </Link>
      <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-900">
        Redeem prize ticket
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Scan a citizen's QR code or enter the ticket serial.
      </p>

      {scanning && (
        <div className="mt-6 overflow-hidden rounded-xl border-2 border-slate-300 bg-white">
          <ClientOnly fallback={<p className="p-6 text-sm">Loading camera…</p>}>
            <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
              <Scanner
                onScan={handleScan}
                onError={(err) =>
                  toast.error(err instanceof Error ? err.message : "Camera error")
                }
                constraints={{ facingMode: "environment" }}
                styles={{ container: { width: "100%" } }}
              />
            </Suspense>
          </ClientOnly>
        </div>
      )}

      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) lookupM.mutate(manual.trim());
        }}
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="TKT-XXXXXXXX or paste QR token"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white hover:bg-slate-700"
        >
          Look up
        </button>
      </form>

      {ticket && (
        <div className="mt-6 rounded-xl border-2 border-slate-900 bg-white p-6">
          <div className="flex items-start gap-4">
            {ticket.prize_image_url && (
              <img
                src={ticket.prize_image_url}
                alt=""
                className="h-24 w-24 rounded-md object-cover"
              />
            )}
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900">
                {ticket.prize_name}
              </h2>
              <p className="mt-1 font-mono text-sm text-slate-700">
                {ticket.serial}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Holder: {ticket.citizen_name ?? "—"}{" "}
                <span className="text-slate-500">
                  ({ticket.citizen_email ?? "no email"})
                </span>
              </p>
              {ticket.quest_title && (
                <p className="text-sm text-slate-600">
                  Earned via: {ticket.quest_title}
                </p>
              )}
              {ticket.prize_sponsor && (
                <p className="text-sm text-slate-600">
                  Fulfilled by {ticket.prize_sponsor} (sponsor)
                </p>
              )}
              {ticket.prize_pickup_location && (
                <p className="mt-2 text-sm">
                  Pickup: {ticket.prize_pickup_location}
                </p>
              )}
              <p className="mt-3 text-xs uppercase tracking-wider">
                Status:{" "}
                <span
                  className={
                    ticket.status === "issued"
                      ? "font-bold text-emerald-700"
                      : ticket.status === "redeemed"
                        ? "font-bold text-slate-500"
                        : "font-bold text-rose-700"
                  }
                >
                  {ticket.status}
                </span>
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => {
                setTicket(null);
                setScanning(true);
                setManual("");
              }}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
            >
              Scan another
            </button>
            <button
              onClick={() => redeemM.mutate(ticket.id)}
              disabled={ticket.status !== "issued" || redeemM.isPending}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {redeemM.isPending ? "Marking…" : "Mark redeemed"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
