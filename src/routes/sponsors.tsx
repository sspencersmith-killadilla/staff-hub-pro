import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPublicSponsors } from "@/lib/vendor-portal.functions";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/sponsors")({
  head: () => ({
    meta: [
      { title: "Community Partners — Sponsors" },
      {
        name: "description",
        content:
          "Thank you to the generous sponsors supporting our community events.",
      },
      { property: "og:title", content: "Community Partners — Sponsors" },
      {
        property: "og:description",
        content:
          "Thank you to the generous sponsors supporting our community events.",
      },
    ],
  }),
  component: SponsorsDirectory,
});

function SponsorsDirectory() {
  const fetchSponsors = useServerFn(listPublicSponsors);
  const { data, isLoading } = useQuery({
    queryKey: ["public", "sponsors"],
    queryFn: () => fetchSponsors(),
  });
  const grouped = data ?? {};
  const keys = Object.keys(grouped);

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <SiteHeader />
      <main className="py-12 px-6 md:px-12 font-sans text-[#1b1b1b]">
        <div className="max-w-6xl mx-auto">
          <header className="mb-12 border-b-4 border-[#e8c872] pb-6 flex flex-col md:flex-row justify-between md:items-end gap-6">
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-[#112e51] mb-2 tracking-tight">
                Community Partners
              </h1>
              <p className="text-gray-600 text-lg">
                Thank you to the generous sponsors supporting our community events.
              </p>
            </div>
            <Link
              to="/vendor"
              className="bg-[#112e51] text-white px-6 py-3 rounded-lg font-bold shadow-md hover:bg-[#1a4480] transition-colors shrink-0"
            >
              Become a Sponsor
            </Link>
          </header>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="animate-pulse flex flex-col items-center">
                <div className="w-12 h-12 border-4 border-[#e8c872] border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">
                  Loading Partners…
                </p>
              </div>
            </div>
          ) : keys.length > 0 ? (
            <div className="space-y-16">
              {keys.map((eventTitle) => (
                <section key={eventTitle}>
                  <div className="mb-8 pl-4 border-l-4 border-[#005ea2]">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                      Proud Sponsors Of
                    </p>
                    <h2 className="text-3xl font-black text-[#112e51] leading-tight">
                      {eventTitle}
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {grouped[eventTitle].map((sponsor) => (
                      <div
                        key={sponsor.id}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
                      >
                        <div className="h-40 bg-gray-50 flex items-center justify-center p-6 border-b border-gray-100">
                          {sponsor.logo_url ? (
                            <img
                              src={sponsor.logo_url}
                              alt={sponsor.company_name}
                              className="max-w-full max-h-full object-contain drop-shadow-sm"
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-[#112e51] rounded-full flex items-center justify-center text-white text-2xl font-black shadow-inner">
                              {sponsor.company_name?.charAt(0).toUpperCase() ?? "?"}
                            </div>
                          )}
                        </div>
                        <div className="p-5 flex-1 flex flex-col text-center justify-center">
                          <h3 className="text-lg font-black text-[#112e51] mb-1">
                            {sponsor.company_name}
                          </h3>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="bg-white p-12 text-center rounded-xl border border-gray-200 shadow-sm">
              <p className="text-gray-500 font-bold text-lg">
                No active sponsors currently found.
              </p>
              <Link
                to="/vendor"
                className="text-[#a57914] font-bold hover:underline mt-2 inline-block"
              >
                Click here to view B2B opportunities.
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
