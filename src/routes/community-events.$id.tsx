import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { FavoriteButton } from "@/components/favorite-button";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Mail, Globe, ArrowLeft } from "lucide-react";
import { getPublicCommunityEvent } from "@/lib/community-public.functions";
import { SiteHeader } from "@/components/site-header";

const eventQuery = (id: string) =>
  queryOptions({
    queryKey: ["public-community-event", id],
    queryFn: () => getPublicCommunityEvent({ data: { id } }),
  });

export const Route = createFileRoute("/community-events/$id")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(eventQuery(params.id));
    if (!data.event) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const e = loaderData?.event;
    const title = e ? `${e.title} — Community Event` : "Community Event";
    const desc =
      e?.description?.slice(0, 155) ??
      `Community event hosted by ${e?.org?.name ?? "a local organization"}.`;
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
    ];
    if (e?.image_url) {
      meta.push({ property: "og:image", content: e.image_url });
      meta.push({ name: "twitter:image", content: e.image_url });
    }
    return { meta };
  },
  component: CommunityEventFlyer,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center text-slate-700 font-bold text-xl">
      Community event not found, or not yet approved.
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center text-destructive p-8">
      {error.message}
    </div>
  ),
});

function fmtRange(starts: string | null, ends: string | null) {
  if (!starts) return "Date TBA";
  const s = new Date(starts);
  const e = ends ? new Date(ends) : null;
  const sameDay = e && s.toDateString() === e.toDateString();
  const dateStr = s.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = s.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (!e) return `${dateStr} · ${timeStr}`;
  const endTimeStr = e.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `${dateStr} · ${timeStr} – ${endTimeStr}`;
  const endDateStr = e.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${dateStr} ${timeStr} – ${endDateStr} ${endTimeStr}`;
}

function CommunityEventFlyer() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(eventQuery(id));
  const event = data.event!;
  const org = event.org;
  const locationLabel =
    typeof event.location === "string"
      ? event.location
      : event.location?.name ?? null;

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      <SiteHeader />
      <div className="py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/events"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> All events
        </Link>

        <article className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          {event.image_url ? (
            <div className="aspect-[16/9] w-full bg-slate-100">
              <img
                src={event.image_url}
                alt={event.title}
                className="h-full w-full object-cover"
                style={{
                  objectPosition: `${event.image_focal_x ?? 50}% ${
                    event.image_focal_y ?? 50
                  }%`,
                }}
              />
            </div>
          ) : (
            <div className="aspect-[16/9] w-full bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center text-white text-2xl font-black uppercase tracking-widest px-6 text-center">
              {event.title}
            </div>
          )}

          <div className="p-8 space-y-6">
            <div>
              <p className="text-xs font-bold tracking-widest uppercase text-emerald-700 mb-2">
                Community Event
              </p>
              <div className="flex items-start gap-3 flex-wrap">
                <h1 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
                  {event.title}
                </h1>
                <FavoriteButton itemType="community_event" itemId={id} label />
              </div>
              {org?.name && (
                <p className="mt-2 text-sm text-slate-600">
                  Hosted by <span className="font-semibold">{org.name}</span>
                  {org.org_type ? ` · ${org.org_type}` : ""}
                </p>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4 border-y border-slate-100 py-4">
              <div className="flex items-start gap-2 text-sm text-slate-700">
                <CalendarDays className="h-4 w-4 mt-0.5 shrink-0 text-slate-500" />
                <span>{fmtRange(event.starts_at, event.ends_at)}</span>
              </div>
              {locationLabel && (
                <div className="flex items-start gap-2 text-sm text-slate-700">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-slate-500" />
                  <span>{locationLabel}</span>
                </div>
              )}
            </div>

            {event.description && (
              <div className="prose max-w-none text-slate-700">
                <p className="whitespace-pre-wrap">{event.description}</p>
              </div>
            )}

            {org && (org.website || org.contact_email) && (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  About the organizer
                </p>
                <p className="text-sm font-semibold text-slate-900">{org.name}</p>
                {org.description && (
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">
                    {org.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {org.website && (
                    <a
                      href={org.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <Globe className="h-3.5 w-3.5" /> Website
                    </a>
                  )}
                  {org.contact_email && (
                    <a
                      href={`mailto:${org.contact_email}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <Mail className="h-3.5 w-3.5" /> {org.contact_email}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
