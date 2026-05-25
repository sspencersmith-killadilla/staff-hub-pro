import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, CalendarDays, Download, MapPin, Ticket } from "lucide-react";
import {
  getPublicCityEvent,
  registerForCityEvent,
} from "@/lib/events-public.functions";
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

  const { data, isLoading, error } = useQuery({
    queryKey: ["city-event", id],
    queryFn: () => fetchEvent({ data: { id } }),
  });

  const [selectedTier, setSelectedTier] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const tiers = data?.tiers ?? [];
  const tierId = useMemo(() => {
    if (selectedTier) return selectedTier;
    return tiers[0]?.id ?? "";
  }, [selectedTier, tiers]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await register({
        data: {
          session_id: id,
          ticket_tier_id: tierId || null,
          full_name: String(fd.get("full_name") ?? ""),
          email: String(fd.get("email") ?? ""),
          quantity: Number(fd.get("quantity") ?? 1),
        },
      });
      setSuccess(res.id);
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

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          to="/events"
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> All events
        </Link>

        {event.image_url && (
          <div className="mt-6 aspect-[16/9] overflow-hidden rounded-xl bg-slate-100">
            <img src={event.image_url} alt="" className="h-full w-full object-cover" />
          </div>
        )}

        <div className="mt-6">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
            <Ticket className="h-3 w-3" /> City Event
          </span>
          <h1 className="mt-3 text-4xl font-black uppercase tracking-tight text-slate-900">
            {event.title}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <CalendarDays className="h-4 w-4" />
            {fmtWhen(event.start_time, event.end_time)}
          </div>
          {venue && (
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <MapPin className="h-4 w-4" />
              {venue.name}
              {venue.address && ` · ${venue.address}`}
              {venue.city && `, ${venue.city}`}
            </div>
          )}
          {event.speaker_name && (
            <p className="mt-3 text-sm text-slate-700">
              Featuring <span className="font-semibold">{event.speaker_name}</span>
            </p>
          )}
        </div>

        {success ? (
          <div className="mt-10 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="text-lg font-bold text-emerald-900">You're registered!</h2>
            <p className="mt-2 text-sm text-emerald-800">
              Confirmation reference: <span className="font-mono">{success}</span>
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              We've reserved your spot. Bring this reference (or the email you used)
              to check in at the door.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-10 rounded-xl border border-slate-200 bg-white p-6"
          >
            <h2 className="text-lg font-bold uppercase tracking-wider text-slate-900">
              Register
            </h2>

            {tiers.length > 0 && (
              <div className="mt-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Ticket tier
                </label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
                        <div className="font-semibold text-slate-900">{t.name}</div>
                        {t.description && (
                          <div className="text-xs text-slate-600">{t.description}</div>
                        )}
                        <div className="mt-1 text-sm font-bold text-slate-900">
                          {Number(t.price) > 0 ? `$${Number(t.price).toFixed(2)}` : "Free"}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Full name
                </label>
                <input
                  name="full_name"
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
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
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
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

            {formError && (
              <p className="mt-4 text-sm text-red-600">{formError}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white hover:bg-slate-700 disabled:opacity-50"
            >
              <Ticket className="h-4 w-4" />
              {submitting ? "Submitting…" : "Confirm registration"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
