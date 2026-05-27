import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Clock,
  CreditCard,
  Download,
  Info,
  Lock,
  MapPin,
  Mic2,
  Ticket,
  Users,
} from "lucide-react";
import {
  getPublicCityEvent,
  joinTicketWaitlist,
  registerForCityEvent,
} from "@/lib/events-public.functions";
import {
  getPaymentsStatus,
  payAndRegisterForCityEvent,
} from "@/lib/payments.functions";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/events/$id")({
  head: () => ({
    meta: [
      { title: "Event Registration" },
      { name: "description", content: "Register and grab tickets for this city event." },
    ],
  }),
  component: EventDetail,
});

function fmtWhen(starts: string | null, ends: string | null) {
  if (!starts) return "TBA";
  const s = new Date(starts);
  const date = s.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date} · ${t(s)}${ends ? ` – ${t(new Date(ends))}` : ""}`;
}

function EventDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const fetchEvent = useServerFn(getPublicCityEvent);
  const register = useServerFn(registerForCityEvent);
  const joinWaitlist = useServerFn(joinTicketWaitlist);
  const fetchPaymentsStatus = useServerFn(getPaymentsStatus);
  const payAndRegister = useServerFn(payAndRegisterForCityEvent);

  const { data, isLoading, error } = useQuery({
    queryKey: ["city-event", id],
    queryFn: () => fetchEvent({ data: { id } }),
  });

  const { data: paymentsStatus } = useQuery({
    queryKey: ["payments-status"],
    queryFn: () => fetchPaymentsStatus(),
    staleTime: 60_000,
  });

  const [selectedTier, setSelectedTier] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [waitlistSuccess, setWaitlistSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const tiers = data?.tiers ?? [];
  const tierId = useMemo(() => {
    if (selectedTier) return selectedTier;
    return tiers[0]?.id ?? "";
  }, [selectedTier, tiers]);
  const activeTier = useMemo(
    () => tiers.find((t: any) => t.id === tierId) ?? null,
    [tiers, tierId],
  );
  const tierPrice = Number(activeTier?.price ?? 0);
  const isPaid = tierPrice > 0;
  const isSoldOut = !!activeTier?.sold_out;
  const paymentsReady = !!paymentsStatus?.configured;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get("full_name") ?? "");
    const email = String(fd.get("email") ?? "");
    const quantity = Number(fd.get("quantity") ?? 1);
    try {
      if (isSoldOut) {
        if (!tierId) throw new Error("Pick a ticket tier first.");
        await joinWaitlist({
          data: {
            session_id: id,
            ticket_tier_id: tierId,
            full_name,
            email,
            quantity,
          },
        });
        setWaitlistSuccess(activeTier?.name ?? "this tier");
      } else if (isPaid) {
        if (!paymentsReady) {
          throw new Error(
            "Payments are not yet configured for this site. Please contact the organizer.",
          );
        }
        const res = await payAndRegister({
          data: {
            session_id: id,
            ticket_tier_id: tierId,
            full_name,
            email,
            quantity,
            card: {
              number: String(fd.get("card_number") ?? ""),
              expiration: String(fd.get("card_exp") ?? ""),
              cvc: String(fd.get("card_cvc") ?? ""),
              avs_zip: String(fd.get("card_zip") ?? "") || undefined,
            },
          },
        });
        setSuccess(res.id);
      } else {
        const res = await register({
          data: {
            session_id: id,
            ticket_tier_id: tierId || null,
            full_name,
            email,
            quantity,
          },
        });
        setSuccess(res.id);
      }
    } catch (err: any) {
      setFormError(err?.message ?? "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-sm text-slate-500">Loading…</p>
        </main>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-sm text-red-600">
            {(error as Error | null)?.message ?? "Event not found."}
          </p>
          <button
            onClick={() => router.history.back()}
            className="mt-4 text-sm font-semibold text-slate-700 hover:underline"
          >
            ← Back
          </button>
        </main>
      </div>
    );
  }

  const event = data.event as any;
  const venue = data.venue as any;
  const stage = (data as any).stage;
  const room = (data as any).room;
  const talent = (data as any).talent ?? [];
  const sponsors: { id: string; company_name: string | null; logo_url: string | null }[] =
    (data as any).sponsors ?? [];

  const subLocation = stage
    ? { name: stage.name, type: "Stage" as const, extra: stage.description }
    : room
      ? {
          name: room.name,
          type: "Room" as const,
          extra: [room.building, room.capacity ? `Capacity ${room.capacity}` : null]
            .filter(Boolean)
            .join(" · "),
        }
      : null;

  const description: string | null = event.description ?? null;
  const heroImg = event.image_url as string | null;

  const fmtTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-slate-900 text-white">
        {heroImg && (
          <img
            src={heroImg}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/85 to-slate-900" />
        <div className="relative mx-auto max-w-5xl px-6 py-16">
          <Link
            to="/events"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> All events
          </Link>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-900">
              <Ticket className="h-3 w-3" /> City Event
            </span>
            {event.event_type && (
              <span className="rounded-full border border-white/30 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90">
                {event.event_type}
              </span>
            )}
          </div>
          <div className="mt-4 flex items-start gap-4 flex-wrap">
            <h1 className="text-4xl font-black uppercase tracking-tight sm:text-6xl">
              {event.title}
            </h1>
            <FavoriteButton itemType="session" itemId={id} label />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 text-sm">
              <CalendarDays className="mt-0.5 h-5 w-5 text-amber-300 shrink-0" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  When
                </div>
                <div className="font-semibold">
                  {fmtWhen(event.start_time, event.end_time)}
                </div>
              </div>
            </div>
            {(venue || subLocation) && (
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="mt-0.5 h-5 w-5 text-amber-300 shrink-0" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Where
                  </div>
                  <div className="font-semibold">
                    {venue?.name ?? subLocation?.name}
                  </div>
                  {subLocation && venue && (
                    <div className="text-xs text-slate-300">
                      {subLocation.type}: {subLocation.name}
                    </div>
                  )}
                  {venue && (venue.address || venue.city) && (
                    <div className="text-xs text-slate-400">
                      {[venue.address, venue.city, venue.state]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {sponsors.length > 0 && (
            <div className="mt-8 rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                Presented in partnership with
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                {sponsors.map((s) =>
                  s.logo_url ? (
                    <div
                      key={s.id}
                      className="flex h-12 items-center justify-center rounded-md bg-white px-3 py-1.5"
                      title={s.company_name ?? undefined}
                    >
                      <img
                        src={s.logo_url}
                        alt={s.company_name ?? "sponsor"}
                        className="h-full w-auto max-w-[120px] object-contain"
                        crossOrigin="anonymous"
                      />
                    </div>
                  ) : (
                    <span
                      key={s.id}
                      className="rounded-md bg-white px-3 py-1.5 text-sm font-bold text-slate-900"
                    >
                      {s.company_name}
                    </span>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* MAIN COLUMN */}
          <div className="space-y-8 lg:col-span-2">
            {/* About */}
            {(description || event.speaker_name) && (
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-slate-500" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                    About this event
                  </h2>
                </div>
                {event.speaker_name && (
                  <p className="mt-3 text-sm text-slate-700">
                    Featuring{" "}
                    <span className="font-semibold text-slate-900">
                      {event.speaker_name}
                    </span>
                  </p>
                )}
                {description && (
                  <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {description}
                  </div>
                )}
              </section>
            )}

            {/* Run of show */}
            {talent.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2">
                  <Mic2 className="h-4 w-4 text-slate-500" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                    Run of show
                  </h2>
                </div>
                <ol className="mt-4 divide-y divide-slate-100">
                  {talent.map((t: any) => {
                    const start = fmtTime(t.performance_start);
                    return (
                      <li
                        key={t.id}
                        className="flex items-start gap-4 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="w-20 shrink-0">
                          {start ? (
                            <div className="flex items-center gap-1 text-xs font-bold text-slate-900">
                              <Clock className="h-3 w-3 text-amber-500" />
                              {start}
                            </div>
                          ) : (
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              TBA
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-slate-900">
                            {t.name}
                          </div>
                          {t.role && (
                            <div className="text-xs text-slate-500">{t.role}</div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {/* Venue details */}
            {(venue || subLocation) && (
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                    Venue details
                  </h2>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  {venue?.name && (
                    <div className="font-semibold text-slate-900">{venue.name}</div>
                  )}
                  {venue?.address && <div>{venue.address}</div>}
                  {(venue?.city || venue?.state) && (
                    <div>
                      {[venue.city, venue.state].filter(Boolean).join(", ")}
                    </div>
                  )}
                  {subLocation && (
                    <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs">
                      <div className="font-bold uppercase tracking-wider text-slate-500">
                        {subLocation.type}
                      </div>
                      <div className="mt-0.5 font-semibold text-slate-900">
                        {subLocation.name}
                      </div>
                      {subLocation.extra && (
                        <div className="mt-1 text-slate-600">{subLocation.extra}</div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* SIDEBAR — register */}
          <aside className="lg:col-span-1">
            <div className="sticky top-6">
              {success ? (
                <TicketSuccess attendeeId={success} eventTitle={event.title} sponsors={sponsors} />
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-500" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                      Register
                    </h2>
                  </div>

                  {tiers.length > 0 && (
                    <div className="mt-4">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        Ticket tier
                      </label>
                      <div className="mt-2 space-y-2">
                        {tiers.map((t: any) => (
                          <label
                            key={t.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                              tierId === t.id
                                ? "border-slate-900 bg-slate-50"
                                : "border-slate-200 hover:border-slate-400"
                            }`}
                          >
                            <input
                              type="radio"
                              name="ticket_tier"
                              checked={tierId === t.id}
                              onChange={() => setSelectedTier(t.id)}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-slate-900">
                                {t.name}
                              </div>
                              {t.description && (
                                <div className="text-xs text-slate-600">
                                  {t.description}
                                </div>
                              )}
                              <div className="mt-1 flex items-center gap-2">
                                <div className="text-sm font-bold text-slate-900">
                                  {Number(t.price) > 0
                                    ? `$${Number(t.price).toFixed(2)}`
                                    : "Free"}
                                </div>
                                {t.sold_out && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                                    Sold out · waitlist
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        Full name
                      </label>
                      <input
                        name="full_name"
                        required
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        Email
                      </label>
                      <input
                        name="email"
                        type="email"
                        required
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        Quantity
                      </label>
                      <input
                        name="quantity"
                        type="number"
                        min={1}
                        max={20}
                        defaultValue={1}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  {isPaid && !isSoldOut && (
                    <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                          <CreditCard className="h-4 w-4" /> Payment
                        </div>
                        <div className="text-xs font-semibold text-slate-900">
                          ${tierPrice.toFixed(2)} / ticket
                        </div>
                      </div>

                      {!paymentsReady ? (
                        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <div className="font-bold uppercase tracking-wider">
                              Payments not yet configured
                            </div>
                            <div className="mt-1">
                              USAePay credentials haven't been set on this site.
                              Card processing is wired up and ready — the operator
                              just needs to add the API key &amp; PIN.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mt-3">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                              Card number
                            </label>
                            <input
                              name="card_number"
                              required
                              inputMode="numeric"
                              autoComplete="cc-number"
                              placeholder="4111 1111 1111 1111"
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                            />
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-3">
                            <div className="col-span-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                MM/YY
                              </label>
                              <input
                                name="card_exp"
                                required
                                autoComplete="cc-exp"
                                placeholder="12/27"
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                              />
                            </div>
                            <div className="col-span-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                CVC
                              </label>
                              <input
                                name="card_cvc"
                                required
                                inputMode="numeric"
                                autoComplete="cc-csc"
                                placeholder="123"
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                              />
                            </div>
                            <div className="col-span-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                ZIP
                              </label>
                              <input
                                name="card_zip"
                                inputMode="numeric"
                                autoComplete="postal-code"
                                placeholder="12345"
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                              />
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-1 text-[10px] text-slate-500">
                            <Lock className="h-3 w-3" />
                            Processed securely by USAePay
                            {paymentsStatus?.mode === "sandbox" &&
                              " · sandbox mode"}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {formError && (
                    <p className="mt-4 text-sm text-red-600">{formError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || (isPaid && !paymentsReady && !isSoldOut)}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {isSoldOut ? (
                      <Users className="h-4 w-4" />
                    ) : isPaid ? (
                      <CreditCard className="h-4 w-4" />
                    ) : (
                      <Ticket className="h-4 w-4" />
                    )}
                    {submitting
                      ? "Submitting…"
                      : isSoldOut
                        ? "Join waitlist"
                        : isPaid
                          ? `Pay $${tierPrice.toFixed(2)} & register`
                          : "Confirm registration"}
                  </button>
                  {waitlistSuccess && (
                    <div className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      You're on the waitlist for <b>{waitlistSuccess}</b>. We'll
                      reach out if a spot opens up.
                    </div>
                  )}
                </form>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function TicketSuccess({
  attendeeId,
  eventTitle,
  sponsors,
}: {
  attendeeId: string;
  eventTitle: string;
  sponsors: { id: string; company_name: string | null; logo_url: string | null }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(
      canvasRef.current,
      attendeeId,
      { width: 240, margin: 2, errorCorrectionLevel: "M" },
      (err) => {
        if (err) {
          console.error("QR generation failed", err);
          return;
        }
        // Compose a downloadable ticket image: title + QR + ticket ID + sponsors.
        composeTicketImage({ attendeeId, eventTitle, sponsors })
          .then(setDataUrl)
          .catch(() => {
            QRCode.toDataURL(
              attendeeId,
              { width: 720, margin: 2, errorCorrectionLevel: "M" },
              (e2, url) => {
                if (!e2) setDataUrl(url);
              },
            );
          });
      },
    );
  }, [attendeeId, eventTitle, sponsors]);

  const filename = `ticket-${eventTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)}.png`;

  return (
    <div className="mt-10 rounded-xl border border-emerald-200 bg-white p-6">
      <h2 className="text-lg font-bold uppercase tracking-wider text-emerald-900">
        You're registered!
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Save this ticket. Staff will scan the QR code at the door to check you in.
      </p>

      <div className="mt-6 flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {eventTitle}
        </div>
        <canvas ref={canvasRef} className="rounded bg-white p-2" />
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Ticket ID
          </div>
          <div className="font-mono text-xs text-slate-700">{attendeeId}</div>
        </div>
        {sponsors.length > 0 && (
          <div className="w-full border-t border-slate-200 pt-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Presented in partnership with
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              {sponsors.map((s) =>
                s.logo_url ? (
                  <img
                    key={s.id}
                    src={s.logo_url}
                    alt={s.company_name ?? "sponsor"}
                    className="h-8 w-auto max-w-[80px] object-contain"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <span
                    key={s.id}
                    className="text-xs font-semibold text-slate-700"
                  >
                    {s.company_name}
                  </span>
                ),
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {dataUrl && (
          <a
            href={dataUrl}
            download={filename}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-white hover:bg-slate-700"
          >
            <Download className="h-4 w-4" /> Download ticket
          </a>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-900 hover:bg-slate-100"
        >
          Print
        </button>
      </div>
    </div>
  );
}

async function composeTicketImage({
  attendeeId,
  eventTitle,
  sponsors,
}: {
  attendeeId: string;
  eventTitle: string;
  sponsors: { id: string; company_name: string | null; logo_url: string | null }[];
}): Promise<string> {
  const W = 800;
  const PAD = 40;
  const qrSize = 480;
  const sponsorBlockHeight = sponsors.length > 0 ? 140 : 0;
  const H = PAD + 60 + 24 + qrSize + 24 + 60 + sponsorBlockHeight + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  wrapText(ctx, eventTitle, W / 2, PAD + 30, W - PAD * 2, 36);

  // QR (re-render at high res into this canvas)
  const qrDataUrl = await QRCode.toDataURL(attendeeId, {
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const qrImg = await loadImg(qrDataUrl);
  const qrY = PAD + 60 + 24;
  ctx.drawImage(qrImg, (W - qrSize) / 2, qrY, qrSize, qrSize);

  // Ticket ID
  ctx.fillStyle = "#64748b";
  ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
  ctx.fillText("TICKET ID", W / 2, qrY + qrSize + 24);
  ctx.fillStyle = "#334155";
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(attendeeId, W / 2, qrY + qrSize + 42);

  // Sponsors
  if (sponsors.length > 0) {
    const sBlockY = qrY + qrSize + 60;
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(PAD, sBlockY);
    ctx.lineTo(W - PAD, sBlockY);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
    ctx.fillText("PRESENTED IN PARTNERSHIP WITH", W / 2, sBlockY + 22);

    const logoMaxH = 56;
    const gap = 24;
    const loaded = await Promise.all(
      sponsors.map(async (s) => {
        if (!s.logo_url) return { sponsor: s, img: null as HTMLImageElement | null };
        try {
          const img = await loadImg(s.logo_url, true);
          return { sponsor: s, img };
        } catch {
          return { sponsor: s, img: null };
        }
      }),
    );
    // Compute widths
    const items = loaded.map(({ sponsor, img }) => {
      if (img) {
        const ratio = img.width / img.height;
        const w = Math.min(140, logoMaxH * ratio);
        const h = w / ratio;
        return { type: "img" as const, img, w, h, label: sponsor.company_name };
      }
      const label = sponsor.company_name ?? "Sponsor";
      ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
      const w = Math.min(160, ctx.measureText(label).width + 16);
      return { type: "text" as const, w, h: logoMaxH, label };
    });
    const totalW = items.reduce((a, it) => a + it.w, 0) + gap * (items.length - 1);
    let x = (W - totalW) / 2;
    const y = sBlockY + 40;
    for (const it of items) {
      if (it.type === "img" && it.img) {
        ctx.drawImage(it.img, x, y + (logoMaxH - it.h) / 2, it.w, it.h);
      } else {
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(it.label ?? "", x + it.w / 2, y + logoMaxH / 2);
        ctx.textBaseline = "alphabetic";
      }
      x += it.w + gap;
    }
  }

  return canvas.toDataURL("image/png");
}

function loadImg(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = w;
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, curY);
}
