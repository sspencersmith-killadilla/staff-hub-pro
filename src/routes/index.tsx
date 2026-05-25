import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { useModules } from "@/hooks/use-modules";
import { useAuth } from "@/hooks/use-auth";
// Recommend using lucide-react for cleaner icon management
import { Calendar, Store, Users, Mic, Building, ShieldCheck } from "lucide-react"; 

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Community Event & Partnership Portal" },
      { name: "description", content: "Your central hub to discover local events, book municipal spaces, and partner with the city." },
    ],
  }),
  component: Home,
});

function Home() {
  const year = new Date().getFullYear();
  const { isEnabled } = useModules();
  const { isAuthenticated, me } = useAuth();
  
  // State for the interactive Explainer Tabs
  const [activeExplainerTab, setActiveExplainerTab] = useState("residents");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-gray-800">
      <SiteHeader />

      {/* HERO SECTION */}
      <header className="bg-slate-900 text-white py-20 px-6 relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 opacity-20 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none" />
        
        <div className="max-w-7xl mx-auto relative z-10 text-center md:text-left flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1">
            <span className="inline-block bg-amber-500 text-amber-950 font-black uppercase tracking-widest text-[10px] px-3 py-1 rounded-full mb-6">
              Proof of Concept Demo
            </span>
            <h1 className="text-5xl md:text-6xl text-white mb-6 leading-tight tracking-tight font-black">
              Community Event <br className="hidden md:block" /> &amp; Partnership Portal
            </h1>
            <p className="text-lg text-blue-100 mb-8 max-w-2xl leading-relaxed">
              Your central hub to discover local events, book municipal spaces, and partner with the city.
            </p>

            {/* AUTH STATE HANDLING */}
            {isAuthenticated ? (
              <div className="mb-8 rounded-xl border border-white/20 bg-white/10 p-5 backdrop-blur inline-block">
                <p className="text-xs font-black uppercase tracking-widest text-amber-300">
                  Signed in{me?.email ? ` as ${me.email}` : ""}
                </p>
                <p className="mt-1 text-white text-sm mb-4">
                  One account, every program. Access your dashboard below.
                </p>
                <Link to="/hub" className="inline-block bg-amber-400 hover:bg-amber-300 text-amber-950 font-black py-2.5 px-6 rounded-lg uppercase tracking-wider text-xs shadow transition-colors">
                  Go to My Hub &rarr;
                </Link>
              </div>
            ) : (
              <div className="mb-8 flex flex-wrap items-center justify-center md:justify-start gap-4">
                <Link to="/signup" className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-black py-3 px-6 rounded-lg uppercase tracking-wider text-sm shadow transition-colors">
                  Create Account
                </Link>
                <Link to="/login" className="text-white/80 hover:text-white underline text-sm font-medium transition-colors">
                  Already have an account? Log in
                </Link>
              </div>
            )}

            {/* DYNAMIC MODULE NAVIGATION */}
            <nav aria-label="Primary actions" className="flex flex-wrap gap-3 justify-center md:justify-start">
              <Link to="/events" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-5 rounded-lg transition-colors shadow text-sm w-full sm:w-auto">
                Event Directory
              </Link>
              {isEnabled("vendors_sponsors") && (
                <Link to="/vendor" className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold py-2.5 px-5 rounded-lg transition-colors text-sm w-full sm:w-auto">
                  Partner Portal
                </Link>
              )}
              {isEnabled("streetbeats") && (
                <Link to="/streetbeats" className="bg-pink-600/20 hover:bg-pink-600/40 border border-pink-500/50 text-pink-100 font-bold py-2.5 px-5 rounded-lg transition-colors text-sm w-full sm:w-auto">
                  StreetBeats
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* QUICK ACCESS PORTALS */}
      <section className="py-16 px-6 max-w-7xl mx-auto w-full -mt-12 relative z-20" aria-label="Quick access portals">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 justify-center">
          <PortalCard
            colorTheme="emerald"
            icon={<Calendar />}
            title="Residents"
            description="Browse the public directory to find upcoming literary series, workshops, and symposiums. Instant digital tickets."
            linkTo="/events"
            linkText="Event Directory &rarr;"
          />
          {isEnabled("vendors_sponsors") && (
             <PortalCard colorTheme="amber" icon={<Store />} title="Businesses" description="Apply for vendor booths or purchase sponsorships. Manage logistics and invoices from your dashboard." linkTo="/vendor" linkText="Partner Portal &rarr;" />
          )}
          {isEnabled("community_orgs") && (
             <PortalCard colorTheme="green" icon={<Users />} title="Organizations" description="HOAs, nonprofits, and schools can submit events for the community calendar after city approval." linkTo="/community" linkText="Apply to Post &rarr;" />
          )}
          {isEnabled("room_reservations") && (
             <PortalCard colorTheme="cyan" icon={<Building />} title="Room Reservations" description="Browse available city meeting rooms. View live 7-day availability and submit conflict-free requests." linkTo="/rooms" linkText="Reserve a Room &rarr;" />
          )}
          {isEnabled("streetbeats") && (
             <PortalCard colorTheme="pink" icon={<Mic />} title="Musicians" description="Join the StreetBeats busking roster. Claim slots, build your profile, and connect your digital tip jar." linkTo="/streetbeats" linkText="Artist Portal &rarr;" />
          )}
          <PortalCard
            colorTheme="blue"
            icon={<ShieldCheck />}
            title="City Staff"
            description="Access the Command Center to manage rosters, review applications, and track talent schedules."
            linkTo="/staff"
            linkText="Staff Ops &rarr;"
          />
        </div>
      </section>

      {/* REFACTORED EXPLAINER: INTERACTIVE TABS */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black mb-4 tracking-tight text-slate-900">
              How the System Works
            </h2>
            <p className="text-gray-500 text-lg">
              Select your role below to see how this portal streamlines your experience.
            </p>
          </div>

          {/* TAB NAVIGATION */}
          <div className="flex flex-wrap justify-center gap-2 mb-8 border-b border-gray-200 pb-4">
            <button onClick={() => setActiveExplainerTab('residents')} className={`px-4 py-2 rounded-full font-bold text-sm transition-colors ${activeExplainerTab === 'residents' ? 'bg-emerald-100 text-emerald-800' : 'text-gray-500 hover:bg-gray-100'}`}>Residents</button>
            {isEnabled("vendors_sponsors") && <button onClick={() => setActiveExplainerTab('vendors')} className={`px-4 py-2 rounded-full font-bold text-sm transition-colors ${activeExplainerTab === 'vendors' ? 'bg-amber-100 text-amber-800' : 'text-gray-500 hover:bg-gray-100'}`}>Vendors</button>}
            {isEnabled("streetbeats") && <button onClick={() => setActiveExplainerTab('musicians')} className={`px-4 py-2 rounded-full font-bold text-sm transition-colors ${activeExplainerTab === 'musicians' ? 'bg-pink-100 text-pink-800' : 'text-gray-500 hover:bg-gray-100'}`}>Musicians</button>}
            <button onClick={() => setActiveExplainerTab('staff')} className={`px-4 py-2 rounded-full font-bold text-sm transition-colors ${activeExplainerTab === 'staff' ? 'bg-slate-800 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>City Staff</button>
          </div>

          {/* TAB CONTENT PANELS */}
          <div className="bg-slate-50 rounded-2xl p-8 border border-gray-100 shadow-sm min-h-[250px]">
             {activeExplainerTab === 'residents' && (
                <ExplainerSteps theme="emerald" steps={["Browse the public calendar — no account needed.", "Click any event to see details, location, and ticket tiers.", "Create a free account to RSVP and generate tickets.", "Present your digital QR code at the door for entry."]} />
             )}
             {activeExplainerTab === 'vendors' && (
                <ExplainerSteps theme="amber" steps={["Visit the portal to create your business account.", "Upload your EIN, insurance, and menu/merch photos.", "Browse open city events and submit booth applications.", "Check your dashboard for approval and load-in times."]} />
             )}
             {activeExplainerTab === 'musicians' && (
                <ExplainerSteps theme="pink" steps={["Apply for the StreetBeats program online.", "City staff reviews your audition and approves your profile.", "Browse the Gig Pool and claim open public time slots.", "Play your set and receive tips directly via your digital tip jar."]} />
             )}
             {activeExplainerTab === 'staff' && (
                <ExplainerSteps theme="slate" steps={["Log into the secure Staff Command Center.", "Manage vendors, approve musicians, and review room reservations.", "Track live door rosters and manage sponsor invoices.", "Build and publish interactive event floorplans."]} />
             )}
          </div>
        </div>
      </section>

      {/* FOOTER remains similar */}
    </div>
  );
}

// Reusable Portal Card with dynamic Tailwind classes mapped by theme prop
function PortalCard({ colorTheme, title, description, linkTo, linkText, icon }: any) {
  // Map themes to safe Tailwind classes...
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 flex flex-col hover:-translate-y-1 transition-transform duration-300">
       {/* Card Layout Here */}
    </div>
  )
}

function ExplainerSteps({ steps, theme }: any) {
  return (
    <ul className="space-y-6">
      {steps.map((step: string, i: number) => (
        <li key={i} className="flex items-start gap-4 text-gray-700">
           <span className="shrink-0 w-8 h-8 rounded-full bg-white shadow flex items-center justify-center font-bold text-sm">
             {i + 1}
           </span>
           <span className="pt-1">{step}</span>
        </li>
      ))}
    </ul>
  )
}
