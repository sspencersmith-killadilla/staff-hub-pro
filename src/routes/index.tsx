import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { useModules } from "@/hooks/use-modules";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Community Event & Partnership Portal" },
      {
        name: "description",
        content:
          "Discover upcoming events, partner with us, join the StreetBeats roster, or reserve a meeting room.",
      },
      { property: "og:title", content: "Community Event & Partnership Portal" },
    ],
  }),
  component: Home,
});

const NAVY = "#002f49";

function Home() {
  const year = new Date().getFullYear();
  const { isEnabled } = useModules();
  const { isAuthenticated, me } = useAuth();

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans text-gray-800">
      <SiteHeader />

      {/* HERO */}
      <header
        className="text-white py-20 px-6 relative overflow-hidden"
        style={{ backgroundColor: NAVY }}
      >
        <div
          className="absolute top-0 right-0 w-96 h-96 bg-blue-500 opacity-20 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none"
          aria-hidden="true"
        />
        <div className="max-w-7xl mx-auto relative z-10 text-center md:text-left flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1">
            <span className="inline-block bg-amber-500 text-amber-950 font-black uppercase tracking-widest text-[10px] px-3 py-1 rounded-full mb-6">
              Proof of Concept Demo
            </span>
            <h1 className="text-5xl md:text-6xl text-white mb-6 leading-tight tracking-tight font-black">
              Community Event <br className="hidden md:block" /> &amp; Partnership Portal
            </h1>
            <p className="text-lg text-blue-100 mb-8 max-w-full leading-relaxed">
              Your central hub to discover local events, book municipal spaces, and partner with the city.
            </p>
            {isAuthenticated && (
              <div className="mb-8 rounded-xl border border-white/20 bg-white/10 p-5 backdrop-blur">
                <p className="text-xs font-black uppercase tracking-widest text-amber-300">
                  Signed in{me?.email ? ` as ${me.email}` : ""}
                </p>
                <p className="mt-1 text-white">
                  One account, every program — apply as a musician, register a
                  community org, book a room, and more.
                </p>
                <Link
                  to="/hub"
                  className="mt-3 inline-block bg-amber-400 hover:bg-amber-300 text-amber-950 font-black py-2.5 px-5 rounded-lg uppercase tracking-wider text-xs shadow"
                >
                  Go to My Hub →
                </Link>
              </div>
            )}
            {!isAuthenticated && (
              <div className="mb-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/signup"
                  className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-black py-2.5 px-5 rounded-lg uppercase tracking-wider text-xs shadow"
                >
                  Create one account for everything
                </Link>
                <Link
                  to="/login"
                  className="text-white/90 hover:text-white underline text-sm"
                >
                  Already have an account? Log in
                </Link>
              </div>
            )}
            <nav
              aria-label="Primary actions"
              className="flex flex-wrap gap-4 justify-center md:justify-start"
            >
              <Link
                to="/events"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg text-center uppercase tracking-wider text-sm w-full sm:w-auto"
              >
                Upcoming Events
              </Link>
              {isEnabled("vendors_sponsors") && (
                <Link
                  to="/vendor"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold py-3 px-6 rounded-lg transition-colors text-center uppercase tracking-wider text-sm w-full sm:w-auto"
                >
                  Businesses Hub
                </Link>
              )}
              {isEnabled("community_orgs") && (
                <Link
                  to="/community"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold py-3 px-6 rounded-lg transition-colors text-center uppercase tracking-wider text-sm w-full sm:w-auto"
                >
                  Organizations Portal
                </Link>
              )}
              {isEnabled("streetbeats") && (
                <Link
                  to="/streetbeats"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold py-3 px-6 rounded-lg transition-colors text-center uppercase tracking-wider text-sm w-full sm:w-auto"
                >
                  StreetBeats Portal
                </Link>
              )}
              {isEnabled("room_reservations") && (
                <Link
                  to="/rooms"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold py-3 px-6 rounded-lg transition-colors text-center uppercase tracking-wider text-sm w-full sm:w-auto"
                >
                  Room Reservations
                </Link>
              )}
              
                
            </nav>
          </div>
        </div>
      </header>

      {/* QUICK ACCESS PORTALS */}
      <section
        className="py-16 px-6 max-w-7xl mx-auto w-full -mt-12 relative z-20"
        aria-label="Quick access portals"
      >
        <div className="flex flex-wrap justify-center gap-6">
          <PortalCard
            iconBg="bg-emerald-50 border-emerald-200"
            iconColor="text-emerald-600"
            title="Community Members"
            description="Browse the public directory to find upcoming literary series, workshops, and symposiums. Select an event, complete registration, and your digital ticket is delivered instantly."
            linkColor="text-emerald-600"
            linkTo="/events"
            linkText="Event Directory →"
            icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            }
          />
          {isEnabled("vendors_sponsors") && (
            <PortalCard
              iconBg="bg-amber-50 border-amber-200"
              iconColor="text-amber-600"
              title="Businesses"
              description="Apply for vendor booths or purchase sponsorships. After city staff review, manage your logistics, booth assignment, and invoices from your partner dashboard."
              linkColor="text-amber-600"
              linkTo="/vendor"
              linkText="Partner Portal →"
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              }
            />
          )}
          {isEnabled("community_orgs") && (
            <PortalCard
              iconBg="bg-green-50 border-green-200"
              iconColor="text-green-700"
              title="Organizations"
              description="HOAs, nonprofits, and schools can submit events for the community calendar after city approval."
              linkColor="text-green-700"
              linkTo="/community"
              linkText="Apply to Post →"
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              }
            />
          )}
          {isEnabled("room_reservations") && (
            <PortalCard
              iconBg="bg-cyan-50 border-cyan-200"
              iconColor="text-cyan-600"
              title="Room Reservations"
              description="Browse available city meeting rooms. View the live 7-day availability grid, select your time, and submit a request. System validates instantly for conflicts."
              linkColor="text-cyan-600"
              linkTo="/rooms"
              linkText="Reserve a Room →"
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              }
            />
          )}
          {isEnabled("streetbeats") && (
            <PortalCard
              iconBg="bg-pink-50 border-pink-100"
              iconColor="text-pink-500"
              title="Musicians"
              description="Join the city's StreetBeats busking roster. Claim performance slots, build your profile, and connect your digital tip jar for direct fan support."
              linkColor="text-pink-500"
              linkTo="/streetbeats"
              linkText="Artist Portal →"
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              }
            />
          )}
          <PortalCard
            iconBg="bg-blue-50 border-blue-100"
            iconColor="text-blue-600"
            title="City Staff"
            description="Access the Command Center to manage rosters, review applications, build floorplans, and track talent schedules."
            linkColor="text-blue-600"
            linkTo="/staff"
            linkText="Staff Ops →"
            icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            }
          />
        </div>
      </section>

      {/* EXPLAINER */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2
              className="text-4xl font-black mb-4 tracking-tight"
              style={{ color: NAVY }}
            >
              How the System Works <Link
                  to="/manual"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold py-3 px-6 rounded-lg transition-colors text-center uppercase tracking-wider text-sm w-full sm:w-auto"
                >
                  User Manual
                </Link>
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto text-lg">
              Choose your portal below to understand your unique workflow and capabilities within the platform.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-center">
            <ExplainerCard
              borderColor="border-emerald-500"
              chipBg="bg-emerald-100"
              chipText="text-emerald-700"
              iconBg="bg-emerald-100 text-emerald-600"
              title="Public Attendees"
              steps={[
                "Browse the public calendar — no account needed.",
                "Click any event to see details, location, and ticket tiers.",
                "Create a free account to RSVP and generate tickets.",
                "Present your digital QR code at the door for entry.",
              ]}
            />
            <ExplainerCard
              borderColor="border-amber-500"
              chipBg="bg-amber-100"
              chipText="text-amber-700"
              iconBg="bg-amber-100 text-amber-600"
              title="Local Vendors"
              steps={[
                "Visit /vendor to create your business account.",
                "Upload your EIN, insurance, and menu/merch photos.",
                "Browse open city events and submit booth applications.",
                "Check your dashboard for approval and load-in times.",
              ]}
            />
            <ExplainerCard
              borderColor="border-indigo-500"
              chipBg="bg-indigo-100"
              chipText="text-indigo-700"
              iconBg="bg-indigo-100 text-indigo-600"
              title="Event Sponsors"
              steps={[
                "Visit /sponsors to view available sponsorship tiers.",
                "Select a tier for an upcoming event.",
                "Submit your company logo and marketing materials.",
                "Gain visibility on event pages, flyers, and digital maps.",
              ]}
            />
            <ExplainerCard
              borderColor="border-pink-500"
              chipBg="bg-pink-100"
              chipText="text-pink-700"
              iconBg="bg-pink-100 text-pink-600"
              title="Musicians"
              steps={[
                "Go to /streetbeats to apply for the StreetBeats program.",
                "City staff reviews your audition and approves your profile.",
                "Browse the Gig Pool and claim open public time slots.",
                "Play your set and receive tips directly via your digital tip jar.",
              ]}
            />
            <ExplainerCard
              borderColor="border-green-500"
              chipBg="bg-green-100"
              chipText="text-green-700"
              iconBg="bg-green-100 text-green-600"
              title="Community Orgs"
              steps={[
                "Register your HOA or Nonprofit at /community.",
                "City staff verifies your local community status (3-5 days).",
                "Submit your free, public events via the community portal.",
                "Events appear on the official city calendar once reviewed.",
              ]}
            />
            <ExplainerCard
              borderColor="border-cyan-500"
              chipBg="bg-cyan-100"
              chipText="text-cyan-700"
              iconBg="bg-cyan-100 text-cyan-600"
              title="Room Bookings"
              steps={[
                "Visit /rooms to view all bookable venues.",
                "Select a room and view real-time availability.",
                "Submit your request. The system instantly checks for overlaps and booking limits.",
                "When approved, you will receive an email confirmation.",
              ]}
            />
            <div
              className="rounded-2xl p-8 border-t-4 border-blue-400 shadow-lg hover:shadow-xl transition-shadow lg:col-span-3"
              style={{ backgroundColor: NAVY }}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-blue-200 bg-[#00476b]">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-black text-white">City Staff Ops</h3>
              </div>
              <ul className="space-y-4 text-sm text-blue-100">
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#00476b] text-white flex items-center justify-center font-bold text-xs mt-0.5">★</span>
                  <span>
                    Access{" "}
                    <Link to="/staff" className="text-blue-300 font-bold hover:underline">
                      /staff
                    </Link>{" "}
                    after signing in.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#00476b] text-white flex items-center justify-center font-bold text-xs mt-0.5">★</span>
                  <span>Manage vendors, approve musicians, review room reservations, and build floorplans.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#00476b] text-white flex items-center justify-center font-bold text-xs mt-0.5">★</span>
                  <span>Track live door rosters, manage sponsor invoices, and monitor room usage.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#001f2b] text-gray-400 py-12 text-center mt-auto border-t border-[#002f49]">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-xs font-black uppercase tracking-[0.3em] mb-4 text-gray-300">
            Proof of Concept Demonstration
          </p>
          <p className="text-sm text-gray-500 mb-6">
            This platform is a functional prototype. No real transactions are processed, and all data is for demonstration purposes only.
          </p>
          <p className="text-[10px] font-bold tracking-widest uppercase">
            Municipal Solutions Platform © {year}
          </p>
        </div>
      </footer>
    </div>
  );
}

type PortalCardProps = {
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  linkColor: string;
  linkTo: string;
  linkText: string;
  icon: React.ReactNode;
};

function PortalCard({
  iconBg,
  iconColor,
  title,
  description,
  linkColor,
  linkTo,
  linkText,
  icon,
}: PortalCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 flex flex-col hover:-translate-y-1 transition-transform duration-300 flex-1 min-w-[280px] max-w-[340px]">
      <div
        className={`w-12 h-12 ${iconBg} border rounded-lg flex items-center justify-center mb-6`}
        aria-hidden="true"
      >
        <svg className={`w-6 h-6 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {icon}
        </svg>
      </div>
      <h2 className="text-2xl font-black mb-3" style={{ color: NAVY }}>
        {title}
      </h2>
      <p className="text-gray-600 mb-6 flex-1 text-sm leading-relaxed">{description}</p>
      <Link
        to={linkTo}
        className={`${linkColor} font-bold hover:underline uppercase tracking-wider text-xs flex items-center gap-2 mt-auto`}
      >
        {linkText}
      </Link>
    </div>
  );
}

type ExplainerCardProps = {
  borderColor: string;
  chipBg: string;
  chipText: string;
  iconBg: string;
  title: string;
  steps: string[];
};

function ExplainerCard({
  borderColor,
  chipBg,
  chipText,
  iconBg,
  title,
  steps,
}: ExplainerCardProps) {
  return (
    <div
      className={`bg-[#f8fafc] rounded-2xl p-8 border-t-4 ${borderColor} shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-black" style={{ color: NAVY }}>
          {title}
        </h3>
      </div>
      <ul className="space-y-4 text-sm text-gray-600">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={`shrink-0 w-6 h-6 rounded-full ${chipBg} ${chipText} flex items-center justify-center font-bold text-xs mt-0.5`}
            >
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
