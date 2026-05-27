import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { 
  Users, Building2, MapPin, Share2, Calendar as CalendarIcon, 
  Clock, Info, Phone, Mail, Check, ArrowLeft 
} from "lucide-react";
import { useState } from "react";
import { getRoomPublic } from "@/lib/venues-public.functions";
import { SiteHeader } from "@/components/site-header";
import { VenueHoursDisplay } from "@/components/venue-hours-display";
import { RoomReservationForm } from "@/components/room-reservation-form";
import { RoomAvailabilityCalendar } from "@/components/room-availability-calendar";
import { requireModule } from "@/lib/require-module";

const roomQO = (id: string) =>
  queryOptions({
    queryKey: ["public", "room", id],
    queryFn: () => getRoomPublic({ data: { id } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/rooms/$id")({
  beforeLoad: () => requireModule("room_reservations"),
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(roomQO(params.id)),
  head: ({ loaderData }) => {
    const r: any = loaderData?.room;
    const v: any = loaderData?.venue;
    const title = r ? `${r.name} at ${v?.name ?? "Our Venue"}` : "Room Details";
    const description = r?.description ?? 
      (r ? `Book ${r.name} at ${v?.name ?? "our venue"}. Check availability and request a reservation.` : "Room booking");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(r?.image_url ? [{ property: "og:image", content: r.image_url }] : []),
      ],
    };
  },
  component: RoomDetail,
  errorComponent: () => (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <Info className="h-6 w-6 text-red-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Room not found</h1>
        <p className="mt-3 text-gray-600">
          This link is invalid or the room is no longer available for public viewing.
        </p>
        <Link
          to="/venues"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Browse all venues
        </Link>
      </main>
    </div>
  ),
});

function RoomDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(roomQO(id));
  const r: any = data.room;
  const v: any = data.venue;
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: r.name, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const amenities: string[] = r.amenities ?? [];
  const isBookable = r.is_publicly_bookable;

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm">
          {v && (
            <>
              <Link to="/venues" className="text-gray-500 hover:text-gray-900">Venues</Link>
              <span className="text-gray-300">/</span>
              <Link 
                to="/venues/$id" 
                params={{ id: String(v.id) }}
                className="text-gray-500 hover:text-gray-900"
              >
                {v.name}
              </Link>
              <span className="text-gray-300">/</span>
            </>
          )}
          <span className="text-gray-900 font-medium truncate">{r.name}</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
              {r.name}
            </h1>
            {v && (
              <p className="mt-2 text-gray-600 flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {v.name}{r.building ? ` • ${r.building}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
            aria-label="Share this room"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Share2 className="h-4 w-4" />}
            {copied ? "Copied" : "Share"}
          </button>
        </div>

        {/* Quick facts */}
        <div className="flex flex-wrap gap-2 mb-10">
          {r.capacity != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-3 py-1.5 text-sm text-gray-700">
              <Users className="h-4 w-4 text-gray-500" />
              Up to {r.capacity} people
            </span>
          )}
          {r.building && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-3 py-1.5 text-sm text-gray-700">
              <Building2 className="h-4 w-4 text-gray-500" />
              {r.building}{r.floor ? `, ${r.floor}` : ""}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${isBookable ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
            <Clock className="h-4 w-4" />
            {isBookable ? "Instant request" : "Contact venue"}
          </span>
        </div>

        <div className="grid gap-8 lg:gap-12 lg:grid-cols-[1fr_380px] items-start">
          {/* Left content */}
          <div className="space-y-8 min-w-0">
            {r.image_url && (
              <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-gray-100">
                <img src={r.image_url} alt={r.name} className="h-full w-full object-cover" />
              </div>
            )}

            {r.description && (
              <section aria-labelledby="about-heading" className="rounded-2xl bg-white border border-gray-200 p-6">
                <h2 id="about-heading" className="text-lg font-semibold text-gray-900 mb-3">About this room</h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{r.description}</p>
              </section>
            )}

            {amenities.length > 0 && (
              <section aria-labelledby="amenities-heading" className="rounded-2xl bg-white border border-gray-200 p-6">
                <h2 id="amenities-heading" className="text-lg font-semibold text-gray-900 mb-4">Amenities</h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {amenities.map((a) => (
                    <li key={a} className="flex items-center gap-2 text-gray-700">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="availability-heading" className="rounded-2xl bg-white border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <CalendarIcon className="h-5 w-5 text-gray-500" />
                <h2 id="availability-heading" className="text-lg font-semibold text-gray-900">Availability</h2>
              </div>
              {isBookable ? (
                <RoomAvailabilityCalendar roomId={String(r.id)} />
              ) : (
                <p className="text-gray-600">Availability calendar is hidden for rooms that require direct booking.</p>
              )}
            </section>

            {v && (
              <section aria-labelledby="venue-heading" className="rounded-2xl bg-white border border-gray-200 p-6">
                <h2 id="venue-heading" className="text-lg font-semibold text-gray-900 mb-3">Venue information</h2>
                <VenueHoursDisplay
                  openHours={v?.open_hours}
                  closures={v?.closures}
                  inheritedFrom={v?.name}
                />
              </section>
            )}
          </div>

          {/* Right sticky booking */}
          <aside className="lg:sticky lg:top-24">
            <div className="rounded-2xl bg-white border border-gray-200 shadow-sm">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">
                  {isBookable ? "Request this room" : "Inquire about this room"}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {isBookable 
                    ? "Select a time and submit your request. You'll get a confirmation email." 
                    : "This room requires staff approval."}
                </p>
              </div>
              
              <div className="p-6">
                {isBookable ? (
                  <RoomReservationForm
                    roomId={String(r.id)}
                    openHours={v?.open_hours}
                    closures={v?.closures}
                  />
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-700">
                      Contact {v?.name ?? "the venue"} directly to check availability and pricing.
                    </p>
                    <div className="space-y-2">
                      {v?.phone && (
                        <a href={`tel:${v.phone}`} className="flex items-center gap-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium hover:bg-gray-50">
                          <Phone className="h-4 w-4" /> Call {v.phone}
                        </a>
                      )}
                      {v?.email && (
                        <a href={`mailto:${v.email}?subject=Inquiry about ${r.name}`} className="flex items-center gap-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium hover:bg-gray-50">
                          <Mail className="h-4 w-4" /> Email venue
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 pb-6 pt-0">
                <div className="flex items-start gap-2 text-xs text-gray-500">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Requests are subject to venue approval. You will not be charged until confirmed.</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
