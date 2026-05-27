import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getPublicGig } from "@/lib/artists-public.functions";

const LOGOS = {
  Spotify: "https://cdn.simpleicons.org/spotify/1DB954",
  YouTube: "https://cdn.simpleicons.org/youtube/FF0000",
  SoundCloud: "https://cdn.simpleicons.org/soundcloud/FF5500",
  Tip: "https://cdn.simpleicons.org/buymeacoffee/FFDD00",
};

const gigQuery = (id: string) =>
  queryOptions({
    queryKey: ["public-gig", id],
    queryFn: () => getPublicGig({ data: { id } }),
  });

export const Route = createFileRoute("/gigs/$id")({
  loader: async ({ context, params }) => {
    const gig = await context.queryClient.ensureQueryData(gigQuery(params.id));
    if (!gig) throw notFound();
    return gig;
  },
  head: ({ loaderData }) => {
    const title = loaderData?.title || loaderData?.notes || "Live Local Music";
    const artist = loaderData?.artist?.full_name || "Local Artist";
    const venue = loaderData?.stage?.name || loaderData?.venue?.name || "StreetBeats";
    const image = loaderData?.artist?.avatar_url ?? undefined;
    return {
      meta: [
        { title: `${title} – ${artist} at ${venue}` },
        {
          name: "description",
          content: `Free live music at ${venue}${loaderData?.stage?.address ? ", " + loaderData.stage.address : ""}`,
        },
        { property: "og:title", content: `${title} with ${artist}` },
        { property: "og:description", content: venue },
        ...(image
          ? [
              { property: "og:image", content: image },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
    };
  },
  component: GigFlyerPage,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center text-destructive">
      Gig not found.
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center text-destructive p-8">
      {error.message}
    </div>
  ),
});

function GigFlyerPage() {
  const { id } = Route.useParams();
  const { data: gig } = useSuspenseQuery(gigQuery(id));
  if (!gig) return null;
  const artist = gig.artist;
  const stage = gig.stage;
  const venue = gig.venue;
  const start = gig.start_time ? new Date(gig.start_time) : null;
  const title = gig.title || gig.notes || "Live Local Music";
  const dateStr = start
    ? start.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "TBA";
  const url = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `${title} with ${artist?.full_name || "Artist"} at ${stage?.name || venue?.name || "StreetBeats"}`;
  const addressQuery =
    stage?.address || venue?.address || venue?.name || stage?.name || "McKinney, TX";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`;

  const socials = [
    { name: "Spotify", url: artist?.spotify_link, logo: LOGOS.Spotify },
    { name: "YouTube", url: artist?.youtube_link, logo: LOGOS.YouTube },
    { name: "SoundCloud", url: artist?.soundcloud_link, logo: LOGOS.SoundCloud },
    { name: "Tip", url: artist?.tip_link, logo: LOGOS.Tip },
  ].filter((s) => s.url);

  const features = (stage?.features ?? {}) as Record<string, any>;

  return (
    <div className="min-h-screen bg-[#f9fafb] py-4 px-4 sm:py-6">
      <div className="w-full max-w-xl mx-auto space-y-3">
        <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
          <div className="relative bg-black aspect-square">
            {artist?.avatar_url && (
              <img
                src={artist.avatar_url}
                alt=""
                className="w-full h-full object-contain"
              />
            )}
            <div className="absolute top-3 left-3 bg-[#e91e63] text-white px-3 py-1.5 rounded-full text-xs font-bold">
              FREE MUSIC EVENT
            </div>
          </div>
          <div className="p-5">
            <div className="text-[#005ea2] text-sm font-semibold mb-2">{dateStr}</div>
            <div className="flex items-start gap-2 mb-1">
              <h1 className="text-xl font-bold flex-1">{title}</h1>
              <FavoriteButton itemType="gig" itemId={id} size="sm" />
            </div>
            <p className="text-sm text-gray-900 font-medium">
              {stage?.name || venue?.name}
            </p>
            {(stage?.address || venue?.address) && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#005ea2] underline flex items-center gap-1 mb-3"
              >
                📍 {stage?.address || venue?.address} →
              </a>
            )}

            <div className="flex flex-wrap gap-1.5 mb-3">
              {features?.power && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                  ⚡ Power
                </span>
              )}
              {features?.shade && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                  ⛱ Shade
                </span>
              )}
              {features?.seating && (
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                  🪑 Seating
                </span>
              )}
              {features?.bathrooms && (
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                  🚻 Bathrooms
                </span>
              )}
              {features?.backline && (
                <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                  🎸 Backline
                </span>
              )}
              {stage?.capacity && (
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                  👥 {stage.capacity}
                </span>
              )}
            </div>

            {stage?.load_in_notes && (
              <p className="text-xs text-gray-600 mb-3">Load-in: {stage.load_in_notes}</p>
            )}
            {artist?.genre && (
              <p className="text-sm text-gray-600 mb-4">🎵 {artist.genre}</p>
            )}
            {artist?.id && (
              <Link
                to="/artists/$id"
                params={{ id: artist.id }}
                className="block w-full bg-[#fce7f3] text-[#be185d] py-3 rounded-xl text-center font-semibold text-sm"
              >
                View Artist Profile
              </Link>
            )}
          </div>
        </div>

        {socials.length > 0 && (
          <div className="bg-white rounded-2xl border p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              Scan or Tap to Connect
            </h3>
            <div className="grid grid-cols-4 gap-3">
              {socials.map((s) => (
                <a
                  key={s.name}
                  href={s.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block text-center"
                >
                  <div className="relative aspect-square bg-white rounded-xl border border-gray-200 p-2 group-active:scale-95 transition">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(s.url!)}&margin=10`}
                      alt=""
                      className="w-full h-full"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-white rounded-full p-1.5 shadow-md border">
                        <img src={s.logo} alt="" className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs mt-1.5 font-medium text-gray-700">{s.name}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
            Share This Gig
          </p>
          <div className="grid grid-cols-5 gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText + " " + url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#25D366] text-white rounded-xl py-2.5 text-center text-xs font-semibold"
            >
              WhatsApp
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#1877F2] text-white rounded-xl py-2.5 text-center text-xs font-semibold"
            >
              Facebook
            </a>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-black text-white rounded-xl py-2.5 text-center text-xs font-semibold"
            >
              X
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(url);
                window.open("https://instagram.com", "_blank");
              }}
              className="bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white rounded-xl py-2.5 text-xs font-semibold"
            >
              Instagram
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(url)}
              className="bg-gray-100 text-gray-800 rounded-xl py-2.5 text-xs font-semibold"
            >
              Copy
            </button>
          </div>
        </div>

        {artist?.bio && (
          <div className="bg-white rounded-2xl border p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              About {artist.full_name}
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">{artist.bio}</p>
          </div>
        )}
      </div>
    </div>
  );
}
