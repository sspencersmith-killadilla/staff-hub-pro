import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import {
  Home,
  Ticket,
  Calendar,
  BedDouble,
  Music,
  HeartHandshake,
  Sparkles,
  Store,
  User,
  LogIn,
  Shield,
  Users,
  Settings,
  KeyRound,
  Building2,
  BookOpen,
  ChevronRight,
} from "lucide-react";

import homeImg from "@/assets/manual/home.png";
import eventsImg from "@/assets/manual/events.png";
import roomsImg from "@/assets/manual/rooms.png";
import streetbeatsImg from "@/assets/manual/streetbeats.png";
import communityImg from "@/assets/manual/community.png";
import sponsorsImg from "@/assets/manual/sponsors.png";
import vendorImg from "@/assets/manual/vendor.png";
import hubImg from "@/assets/manual/hub.png";
import loginImg from "@/assets/manual/login.png";
import staffImg from "@/assets/manual/staff.png";
import adminImg from "@/assets/manual/admin.png";
import venuesImg from "@/assets/manual/venues.png";
import forgotPasswordImg from "@/assets/manual/forgot-password.png";

export const Route = createFileRoute("/manual")({
  head: () => ({
    meta: [
      { title: "User Manual — Community Event & Partnership Portal" },
      {
        name: "description",
        content:
          "Complete visual guide for community members, staff, and admins using the city's event and partnership platform.",
      },
      { property: "og:title", content: "Platform User Manual" },
      {
        property: "og:description",
        content:
          "Step-by-step guide to every feature: events, rooms, StreetBeats, applications, staff tools, and admin controls.",
      },
    ],
  }),
  component: ManualPage,
});

type Section = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  audience: "community" | "staff" | "admin";
  render: () => React.ReactNode;
};

const audienceLabels: Record<Section["audience"], { label: string; color: string }> = {
  community: { label: "Community", color: "bg-emerald-100 text-emerald-800" },
  staff: { label: "Staff", color: "bg-sky-100 text-sky-800" },
  admin: { label: "Admin", color: "bg-rose-100 text-rose-800" },
};

const groups: { label: string; sectionIds: string[] }[] = [
  { label: "Getting Started", sectionIds: ["overview", "accounts", "hub"] },
  {
    label: "For Community Members",
    sectionIds: [
      "events",
      "tickets",
      "rooms",
      "streetbeats",
      "community-orgs",
      "vendor-apply",
      "sponsor",
      "venues",
    ],
  },
  {
    label: "For Staff",
    sectionIds: ["staff-portal", "staff-events", "staff-attendees", "staff-approvals"],
  },
  {
    label: "For Admins",
    sectionIds: ["admin-staff", "admin-permissions", "admin-modules"],
  },
];

function Figure({
  src,
  caption,
}: {
  src: string;
  caption: string;
}) {
  return (
    <figure className="my-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <img src={src} alt={caption} className="block w-full" loading="lazy" />
      <figcaption className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#002f49] text-sm font-bold text-white">
        {n}
      </div>
      <div className="flex-1 pb-2">
        <h4 className="font-semibold text-[#002f49]">{title}</h4>
        <div className="mt-1 text-sm text-gray-700">{children}</div>
      </div>
    </li>
  );
}

function Callout({
  kind = "tip",
  children,
}: {
  kind?: "tip" | "warn" | "note";
  children: React.ReactNode;
}) {
  const styles = {
    tip: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    note: "border-blue-200 bg-blue-50 text-blue-900",
  } as const;
  const labels = { tip: "Tip", warn: "Heads up", note: "Note" } as const;
  return (
    <div className={`my-4 rounded-lg border-l-4 px-4 py-3 text-sm ${styles[kind]}`}>
      <span className="font-bold uppercase tracking-wider text-xs">{labels[kind]}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const sections: Section[] = [
  {
    id: "overview",
    title: "Platform Overview",
    icon: BookOpen,
    audience: "community",
    render: () => (
      <>
        <p>
          The Community Event &amp; Partnership Portal is the city's one-stop
          platform for discovering events, booking municipal rooms, applying as a
          performer, vendor, sponsor, or community organization, and (for city
          staff) running every operational side of the program.
        </p>
        <Figure src={homeImg} caption="Public home page with the four community portals" />
        <p>
          Everyone starts at the same landing page. From there, your view of the
          app depends on your role:
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>
            <strong>Community members</strong> browse events, buy tickets, book
            rooms, and apply to programs.
          </li>
          <li>
            <strong>Staff</strong> get an Event Ops sidebar to manage events,
            attendees, vendors, music, and reservations.
          </li>
          <li>
            <strong>Admins</strong> additionally manage user roles, granular
            permissions, and which platform modules are turned on.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts &amp; Logging In",
    icon: LogIn,
    audience: "community",
    render: () => (
      <>
        <p>
          One account works across every program. You can be a ticket-buyer,
          musician, org admin, and vendor under the same login.
        </p>
        <Figure src={loginImg} caption="Login screen — sign up if you don't have an account yet" />
        <ol className="my-6 space-y-4">
          <Step n={1} title="Sign up or log in">
            Click <strong>Log in</strong> in the top-right corner. New users can
            tap <em>Sign up</em> to create an account with email and password.
          </Step>
          <Step n={2} title="Land on your Hub">
            After signing in you'll arrive at your personal hub showing
            everything you can do.
          </Step>
          <Step n={3} title="Add roles as you go">
            Need to apply as a musician later? Just open your hub and tap{" "}
            <em>Apply as a Musician</em>. Same login, more capabilities.
          </Step>
        </ol>
        <Callout kind="note">
          City staff are invited (or promoted) by an admin — see the Admin
          section. You'll get an email invitation to set your password.
        </Callout>
      </>
    ),
  },
  {
    id: "hub",
    title: "Your Personal Hub",
    icon: User,
    audience: "community",
    render: () => (
      <>
        <p>
          Your hub at <code>/hub</code> is mission control for everything you do
          with the city. It groups actions into three rows:{" "}
          <strong>Apply / Add a role</strong>, <strong>Do something</strong>, and{" "}
          <strong>Manage your stuff</strong>.
        </p>
        <Figure src={hubImg} caption="The Hub — every program reachable from one screen" />
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>Apply as musician, community org, vendor, or sponsor.</li>
          <li>Book a room or browse events.</li>
          <li>Review your tickets, room reservations, gigs, and orgs.</li>
          <li>Staff and admins see extra "Staff Portal" / "Admin" tiles.</li>
        </ul>
      </>
    ),
  },
  {
    id: "events",
    title: "Browsing Events",
    icon: Calendar,
    audience: "community",
    render: () => (
      <>
        <p>
          The <code>/events</code> feed combines city-run events, community
          gatherings, and live music.
        </p>
        <Figure src={eventsImg} caption="Events feed with filters and sort options" />
        <ol className="my-6 space-y-4">
          <Step n={1} title="Filter and search">
            Use the search box plus type, venue, and stage/room dropdowns. Date
            range narrows the feed to a specific window.
          </Step>
          <Step n={2} title="Open an event">
            Click any card to see full details, sessions, sponsors, and the
            ticket button.
          </Step>
          <Step n={3} title="Look for waitlist callouts">
            Sold-out events show a "Sold out — join the waitlist" badge directly
            on the card image.
          </Step>
        </ol>
      </>
    ),
  },
  {
    id: "tickets",
    title: "Buying &amp; Managing Tickets",
    icon: Ticket,
    audience: "community",
    render: () => (
      <>
        <p>
          From any event page, choose a ticket tier and check out. Your tickets
          live at <code>/my-tickets</code> as scannable QR codes.
        </p>
        <ol className="my-6 space-y-4">
          <Step n={1} title="Pick a tier and quantity">
            Free tickets reserve a seat. Paid tiers route through secure
            checkout.
          </Step>
          <Step n={2} title="Show the QR at the door">
            Staff scan it on arrival. Each seat gets its own QR for groups.
          </Step>
          <Step n={3} title="Join a waitlist if sold out">
            You'll get notified automatically if a seat opens.
          </Step>
        </ol>
      </>
    ),
  },
  {
    id: "rooms",
    title: "Booking a Room",
    icon: BedDouble,
    audience: "community",
    render: () => (
      <>
        <Figure src={roomsImg} caption="Room reservations — pick a room, time, and submit" />
        <ol className="my-6 space-y-4">
          <Step n={1} title="Pick a room">
            Browse <code>/rooms</code>. Each card shows capacity, building, and
            address.
          </Step>
          <Step n={2} title="Choose a time">
            The detail page shows a live 7-day availability calendar. Booked or
            blocked-by-event windows are greyed out.
          </Step>
          <Step n={3} title="Submit your request">
            Sign in if prompted. Staff review and email you a confirmation.
          </Step>
        </ol>
        <Callout kind="warn">
          Submitting a request does <strong>not</strong> guarantee the booking
          until staff approve it.
        </Callout>
      </>
    ),
  },
  {
    id: "streetbeats",
    title: "StreetBeats (Musicians)",
    icon: Music,
    audience: "community",
    render: () => (
      <>
        <Figure src={streetbeatsImg} caption="Public StreetBeats lineup and open slots" />
        <p>
          StreetBeats lets approved musicians claim open busking slots at city
          venues.
        </p>
        <ol className="my-6 space-y-4">
          <Step n={1} title="Apply to perform">
            Click <em>Apply to Perform</em> and tell us about your act.
          </Step>
          <Step n={2} title="Wait for approval">
            Staff review your application and notify you by email.
          </Step>
          <Step n={3} title="Claim slots">
            Once approved, head to <em>My Gigs</em> in your hub to claim
            available slots.
          </Step>
        </ol>
      </>
    ),
  },
  {
    id: "community-orgs",
    title: "Community Organizations",
    icon: HeartHandshake,
    audience: "community",
    render: () => (
      <>
        <Figure src={communityImg} caption="Community-hosted events show up alongside official ones" />
        <p>
          HOAs, nonprofits, churches, and schools can register as a Community
          Org and submit events for the city calendar.
        </p>
        <ol className="my-6 space-y-4">
          <Step n={1} title="Register your org">
            Tap <em>Register Your Org</em>. You can have multiple orgs under one
            account.
          </Step>
          <Step n={2} title="Submit events">
            Once approved, submit events from <em>My Organizations</em>. Staff
            approve before they go live.
          </Step>
        </ol>
      </>
    ),
  },
  {
    id: "vendor-apply",
    title: "Vendor Applications",
    icon: Store,
    audience: "community",
    render: () => (
      <>
        <Figure src={vendorImg} caption="Vendor portal — sign in to manage your booth" />
        <ol className="my-6 space-y-4">
          <Step n={1} title="Sign in to the vendor portal">
            Go to <code>/vendor</code> and create an account if needed.
          </Step>
          <Step n={2} title="Apply for events open to vendors">
            Pick an event and submit your booth application.
          </Step>
          <Step n={3} title="Track status and invoices">
            Once approved, you'll see booth placement and payment requests.
          </Step>
        </ol>
      </>
    ),
  },
  {
    id: "sponsor",
    title: "Becoming a Sponsor",
    icon: Sparkles,
    audience: "community",
    render: () => (
      <>
        <Figure src={sponsorsImg} caption="Sponsor logos appear on event pages and flyers" />
        <p>
          Browse current partners at <code>/sponsors</code> and click{" "}
          <em>Become a Sponsor</em> to start a conversation about tiers and
          placement.
        </p>
      </>
    ),
  },
  {
    id: "venues",
    title: "Exploring Venues",
    icon: Building2,
    audience: "community",
    render: () => (
      <>
        <Figure src={venuesImg} caption="The public venues directory" />
        <p>
          The <code>/venues</code> page lists every location, stage, and room in
          the network with addresses and capacities.
        </p>
      </>
    ),
  },
  {
    id: "staff-portal",
    title: "Staff Portal Overview",
    icon: Shield,
    audience: "staff",
    render: () => (
      <>
        <p>
          The staff portal at <code>/staff</code> has a dark sidebar (Event Ops)
          listing every operational area you can access. Items only appear if
          you have permission for them.
        </p>
        <Figure src={staffImg} caption="Staff Master Schedule with the Event Ops sidebar" />
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li><strong>Events</strong> — Master Schedule: create, edit, and CSV-import events.</li>
          <li><strong>Venues &amp; Stages</strong> — manage locations, stages, and rooms.</li>
          <li><strong>Box Office</strong> — attendees, check-ins, and ticket sales.</li>
          <li><strong>Vendors / Sponsors</strong> — review applications and assign booths.</li>
          <li><strong>Community Music / Orgs / Events</strong> — approve and schedule.</li>
          <li><strong>Room Reservations</strong> — approve, decline, or reschedule requests.</li>
          <li><strong>Platform Settings</strong> — your profile and operational settings.</li>
        </ul>
      </>
    ),
  },
  {
    id: "staff-events",
    title: "Managing an Event",
    icon: Calendar,
    audience: "staff",
    render: () => (
      <>
        <p>
          Click any event from the Master Schedule to open its dashboard. Each
          event has tabs for Overview, Box Office, Marketing, Ticketing,
          Vendors, Volunteers, Reports, Attendees, Waitlist, Scanner, and
          Settings.
        </p>
        <ol className="my-6 space-y-4">
          <Step n={1} title="Create the event">
            Use the <strong>New Event</strong> form on the Master Schedule.
            Required fields: title, type, room/stage, start time.
          </Step>
          <Step n={2} title="Add tickets and tiers">
            On the Ticketing tab, define tiers, capacity, and pricing.
          </Step>
          <Step n={3} title="Manage attendees and waitlist">
            Live counts update as people buy. Move waitlisters into open seats
            with one click.
          </Step>
          <Step n={4} title="Run the door">
            Open the Scanner tab on a tablet at the entrance to scan ticket
            QRs.
          </Step>
        </ol>
        <Callout kind="tip">
          Use <strong>Batch CSV</strong> on the Master Schedule to export
          selected events, edit in a spreadsheet, and re-upload changes.
        </Callout>
      </>
    ),
  },
  {
    id: "staff-attendees",
    title: "Box Office &amp; Attendees",
    icon: Users,
    audience: "staff",
    render: () => (
      <>
        <p>
          The Box Office page (<code>/staff/attendees</code>) is the cross-event
          view of every ticket holder. Filter by event, status, or search by
          name and email.
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>Issue comp tickets, refund, or reassign seats.</li>
          <li>Resend QR codes by email.</li>
          <li>Check arrival status against scans.</li>
        </ul>
      </>
    ),
  },
  {
    id: "staff-approvals",
    title: "Approvals (Music, Orgs, Vendors, Rooms)",
    icon: HeartHandshake,
    audience: "staff",
    render: () => (
      <>
        <p>
          Each application type lives in its own sidebar page. They share the
          same review pattern: see the queue, open a submission, then approve,
          reject, or request changes.
        </p>
        <ol className="my-6 space-y-4">
          <Step n={1} title="Open the queue">
            Pick Community Music, Community Orgs, Vendors, Sponsors, or Room
            Reservations from the sidebar.
          </Step>
          <Step n={2} title="Review the submission">
            Applicant info, attachments, and history appear in the right pane.
          </Step>
          <Step n={3} title="Decide">
            Approve to publish / activate, decline with an optional note (sent
            by email), or leave a comment and come back later.
          </Step>
        </ol>
      </>
    ),
  },
  {
    id: "admin-staff",
    title: "Managing Staff Accounts",
    icon: Users,
    audience: "admin",
    render: () => (
      <>
        <Figure src={adminImg} caption="Admin > Manage staff: invite, promote, or bulk-invite" />
        <p>
          Admins manage staff from <code>/staff/admin</code>. You can:
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>
            <strong>Invite a new user</strong> — sends an email with sign-up
            link and assigns the chosen role (staff or admin).
          </li>
          <li>
            <strong>Promote existing user</strong> — grant staff or admin to
            someone who already has a community account. No email is sent.
          </li>
          <li>
            <strong>Bulk invite</strong> — paste a list of emails to onboard
            multiple staff at once.
          </li>
        </ul>
        <Callout kind="warn">
          Be careful with the <strong>admin</strong> role — admins can change
          permissions, modules, and other admins.
        </Callout>
      </>
    ),
  },
  {
    id: "admin-permissions",
    title: "Granular Permissions",
    icon: KeyRound,
    audience: "admin",
    render: () => (
      <>
        <p>
          Open <em>Manage permissions</em> from the admin page header. Each
          staff member has a row; click to open a drawer with two tabs:
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>
            <strong>Global</strong> — checkbox grid of every permission
            (sidebar pages and event-dashboard tabs). What's checked applies to
            all events.
          </li>
          <li>
            <strong>Per-event</strong> — pick an event and override permissions
            with grant, revoke, or inherit.
          </li>
        </ul>
        <Callout kind="note">
          Admins implicitly have every permission. Plain staff users get only
          what you grant. Permission changes take effect on the user's next
          page load.
        </Callout>
      </>
    ),
  },
  {
    id: "admin-modules",
    title: "Platform Modules &amp; Settings",
    icon: Settings,
    audience: "admin",
    render: () => (
      <>
        <p>
          Turn entire features on or off across the platform from the
          settings/modules area. Modules include StreetBeats, Community Orgs,
          Room Reservations, and Vendors / Sponsors.
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>Disabled modules disappear from public nav, the hub, and the staff sidebar.</li>
          <li>Existing data is preserved — modules can be re-enabled at any time.</li>
          <li>Use this to phase rollouts or pilot a single program.</li>
        </ul>
      </>
    ),
  },
];

function ManualPage() {
  const sectionMap = useMemo(
    () => Object.fromEntries(sections.map((s) => [s.id, s])),
    [],
  );
  const [active, setActive] = useState<string>(() => {
    if (typeof window === "undefined") return "overview";
    return window.location.hash.replace("#", "") || "overview";
  });

  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.replace("#", "");
      if (id && sectionMap[id]) {
        setActive(id);
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, [sectionMap]);

  const select = (id: string) => {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <SiteHeader />

      <div className="border-b bg-gradient-to-br from-[#002f49] to-[#01456b] text-white">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">
            User Manual
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">
            Everything you can do on the platform.
          </h1>
          <p className="mt-3 max-w-2xl text-white/80">
            A visual, step-by-step guide for community members, city staff, and
            admins. Use the sidebar to jump to a section.
          </p>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-2">
            {groups.map((g) => (
              <div key={g.label} className="mb-6">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-[#002f49]">
                  {g.label}
                </h3>
                <ul className="space-y-1">
                  {g.sectionIds.map((id) => {
                    const s = sectionMap[id];
                    if (!s) return null;
                    const Icon = s.icon;
                    const isActive = active === id;
                    return (
                      <li key={id}>
                        <button
                          onClick={() => select(id)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                            isActive
                              ? "bg-[#002f49] text-white"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span
                            className="flex-1 truncate"
                            dangerouslySetInnerHTML={{ __html: s.title }}
                          />
                          {isActive && <ChevronRight className="h-3 w-3" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">
          {sections.map((s) => {
            const Icon = s.icon;
            const a = audienceLabels[s.audience];
            return (
              <section
                key={s.id}
                id={s.id}
                className="mb-16 scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
              >
                <div className="mb-6 flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#002f49] text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${a.color}`}
                    >
                      {a.label}
                    </span>
                    <h2
                      className="mt-1 text-3xl font-black text-[#002f49]"
                      dangerouslySetInnerHTML={{ __html: s.title }}
                    />
                  </div>
                </div>
                <div className="prose prose-sm max-w-none text-gray-800">
                  {s.render()}
                </div>
              </section>
            );
          })}

          <footer className="mb-10 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-muted-foreground">
            That's the whole platform. Bookmark this page — it updates as new
            features ship.
          </footer>
        </main>
      </div>
    </div>
  );
}
