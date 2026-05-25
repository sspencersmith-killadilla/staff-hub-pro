import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getPublicArtist } from "@/lib/artists-public.functions";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1000&auto=format&fit=crop";

const artistQuery = (id: string) =>
  queryOptions({
    queryKey: ["public-artist", id],
    queryFn: () => getPublicArtist({ data: { id } }),
  });

export const Route = createFileRoute("/artists/$id")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(artistQuery(params.id));
    if (!data.artist) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.artist?.full_name ?? "Artist"} — StreetBeats` },
      {
        name: "description",
        content:
          loaderData?.artist?.bio?.slice(0, 155) ??
          `See upcoming performances by ${loaderData?.artist?.full_name ?? "this artist"}.`,
      },
    ],
  }),
  component: ArtistProfilePage,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center text-destructive font-bold text-xl">
      Artist not found.
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center text-destructive p-8">
      {error.message}
    </div>
  ),
});

function ArtistProfilePage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(artistQuery(id));
  const profile = data.artist!;
  const gigs = data.gigs;
  const displayImage = profile.avatar_url || FALLBACK_IMG;
  const hasSocial =
    profile.spotify_link ||
    profile.youtube_link ||
    profile.soundcloud_link ||
    profile.other_link_url;

  return (
    <div className="min-h-screen bg-[#f8f9fa] py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="h-48 md:h-64 bg-gray-900 relative">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-30"
              style={{ backgroundImage: `url(${displayImage})` }}
            />
          </div>

          <div className="px-8 pb-8 relative">
            <div className="relative -mt-20 mb-4 flex justify-between items-end">
              <img
                src={displayImage}
                alt={`${profile.full_name ?? "Artist"} profile`}
                className="w-40 h-40 rounded-full border-4 border-white shadow-lg object-cover bg-white"
              />
              {profile.tip_link && (
                <a
                  href={profile.tip_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#10b981] hover:bg-[#059669] text-white px-6 py-3 rounded-full font-bold shadow-md transition-transform hover:scale-105 flex items-center gap-2"
                >
                  💰 Send a Tip
                </a>
              )}
            </div>

            <div className="mb-6">
              <p className="text-pink-600 font-bold tracking-widest uppercase text-sm mb-1">
                {profile.genre || "Local Artist"}
              </p>
              <h1 className="text-4xl font-extrabold text-[#112e51]">
                {profile.full_name ?? "Unknown Artist"}
              </h1>
            </div>

            <div className="flex flex-wrap gap-3 border-b border-gray-100 pb-6 mb-6">
              {profile.spotify_link && (
                <a
                  href={profile.spotify_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#1DB954]/10 text-[#1DB954] hover:bg-[#1DB954]/20 px-4 py-2 rounded-lg font-bold text-sm transition"
                >
                  🎧 Spotify
                </a>
              )}
              {profile.youtube_link && (
                <a
                  href={profile.youtube_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#FF0000]/10 text-[#FF0000] hover:bg-[#FF0000]/20 px-4 py-2 rounded-lg font-bold text-sm transition"
                >
                  ▶️ YouTube
                </a>
              )}
              {profile.soundcloud_link && (
                <a
                  href={profile.soundcloud_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#ff5500]/10 text-[#ff5500] hover:bg-[#ff5500]/20 px-4 py-2 rounded-lg font-bold text-sm transition"
                >
                  ☁️ SoundCloud
                </a>
              )}
              {profile.other_link_url && (
                <a
                  href={profile.other_link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-4 py-2 rounded-lg font-bold text-sm transition"
                >
                  🔗 {profile.other_link_name || "Website"}
                </a>
              )}
              {!hasSocial && (
                <span className="text-gray-400 text-sm italic">
                  Social links coming soon.
                </span>
              )}
            </div>

            <div className="prose max-w-none text-gray-600">
              <h3 className="text-xl font-bold text-gray-900 mb-2">About the Artist</h3>
              <p className="whitespace-pre-wrap">
                {profile.bio ||
                  `Come see ${profile.full_name ?? "this artist"} perform live at StreetBeats!`}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-[#112e51] mb-6 flex items-center gap-2">
            📅 Upcoming Performances
          </h2>

          {gigs.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl text-center text-gray-500 border border-gray-200">
              No upcoming gigs scheduled right now. Check back later!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {gigs.map((gig) => (
                <Link
                  key={gig.id}
                  to="/streetbeats"
                  className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition border border-gray-200 block group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-[#005ea2] font-bold text-sm mb-1">
                        {gig.start_time
                          ? new Date(gig.start_time).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })
                          : "TBA"}
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#005ea2] transition">
                        Live at {gig.venue_name || gig.stage_name || "StreetBeats Stage"}
                      </h3>
                    </div>
                    {gig.start_time && (
                      <div className="bg-pink-50 text-pink-600 px-3 py-1 rounded-full text-xs font-bold">
                        {new Date(gig.start_time).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 font-medium">
                    View digital flyer &rarr;
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
