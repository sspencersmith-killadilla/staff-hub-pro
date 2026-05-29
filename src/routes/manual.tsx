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
  Network,
  Repeat,
  Palette,
  FileText,
  Share2,
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
    label: "Multi-Department Model",
    sectionIds: ["departments-overview", "dept-hub", "dept-theming"],
  },
  {
    label: "For Community Members",
    sectionIds: [
      "events",
      "tickets",
      "rooms",
      "streetbeats",
      "gig-flyers",
      "community-orgs",
      "vendor-apply",
      "sponsor",
      "permits",
      "my-permits",
      "venues",
    ],
  },
  {
    label: "For Staff",
    sectionIds: [
      "staff-portal",
      "staff-active-dept",
      "staff-events",
      "staff-attendees",
      "staff-approvals",
      "staff-cross-dept",
    ],
  },
  {
    label: "For Admins",
    sectionIds: [
      "admin-staff",
      "admin-permissions",
      "admin-departments",
      "admin-dept-roles",
      "admin-modules",
      "admin-permits",
      "admin-guidebook",
      "admin-social",
    ],
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

function Diagram({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="my-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        {children}
      </div>
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
          app depends on your role <strong>and</strong> which{" "}
          <em>department</em> you're currently acting in:
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>
            <strong>Community members</strong> browse events, buy tickets, book
            rooms, and apply to programs across every department.
          </li>
          <li>
            <strong>Staff</strong> see an Event Ops sidebar scoped to their{" "}
            <em>active department</em> — events, venues, approvals, and box
            office only show records belonging to that department.
          </li>
          <li>
            <strong>Dept admins &amp; Super admins</strong> additionally manage
            department settings, branding, room policies, user roles, and which
            platform modules are turned on.
          </li>
        </ul>
        <Callout kind="note">
          The platform is multi-tenant by department (City Hall, Fire, Parks,
          etc.). The same login can belong to several departments — see{" "}
          <a href="#departments-overview" className="underline">
            Multi-Department Model
          </a>
          .
        </Callout>
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
          <Step n={4} title="Forgot your password?">
            On the login screen, click <em>Forgot password?</em> and enter your
            email. We'll send a one-time reset link — open it to choose a new
            password.
          </Step>
        </ol>
        <Figure src={forgotPasswordImg} caption="Password reset — enter your email and we send a secure link" />
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
        <Figure src={roomsImg} caption="Rooms page with venue, capacity, and tag filters at the top" />
        <ol className="my-6 space-y-4">
          <Step n={1} title="Filter to the right room">
            Use the filter bar to narrow down by <strong>venue</strong>,{" "}
            <strong>minimum capacity</strong>, and{" "}
            <strong>tags</strong> (Power, Projector, TV, etc.). Filters update
            the list instantly and are remembered in the URL — share the link
            and the recipient sees the same filtered view.
          </Step>
          <Step n={2} title="Pick a room">
            Each card shows the photo, capacity, building, and address. Click
            for full details.
          </Step>
          <Step n={3} title="Choose a time">
            The detail page shows a live 7-day availability calendar. Booked or
            blocked-by-event windows are greyed out.
          </Step>
          <Step n={4} title="Read and accept the departmental room policy">
            Before the request is submitted, a modal shows the{" "}
            <strong>room policy</strong> set by the department that owns the
            room (rules, fees, cleanup, alcohol, etc.). You must tick{" "}
            <em>"I agree to this departmental policy"</em> to continue. Each
            department writes its own policy, so the wording changes with the
            room.
          </Step>
          <Step n={5} title="Instant-bookable rooms confirm immediately">
            If the room is marked <strong>instant-bookable</strong>, your
            reservation is approved on submit and you receive a confirmation
            email right away — no staff review needed. Otherwise it joins the{" "}
            <em>pending</em> queue for that department's staff to review.
          </Step>
        </ol>
        <Callout kind="warn">
          For non-instant rooms, submitting does <strong>not</strong> guarantee
          the booking until the owning department's staff approve it. The
          policy you agreed to is recorded with your request.
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
          venues. One account can hold <strong>up to 10 separate artist
          profiles</strong> — perfect for solo acts who also play in bands, or
          for managers handling several performers.
        </p>
        <Diagram caption="One account, many artist identities — each approved separately">
          <div className="flex items-center justify-center gap-4 text-xs">
            <div className="rounded-lg border-2 border-[#002f49] bg-white px-4 py-3 text-center font-semibold">
              Your Account
              <div className="mt-1 text-[10px] font-normal text-gray-500">
                one email + password
              </div>
            </div>
            <div className="text-2xl text-gray-400">→</div>
            <div className="grid grid-cols-1 gap-2">
              <div className="rounded-md bg-emerald-100 px-3 py-1.5 text-center font-semibold text-emerald-900">
                🎸 Solo Acoustic <span className="text-[10px]">(approved)</span>
              </div>
              <div className="rounded-md bg-emerald-100 px-3 py-1.5 text-center font-semibold text-emerald-900">
                🎺 Jazz Quartet <span className="text-[10px]">(approved)</span>
              </div>
              <div className="rounded-md bg-amber-100 px-3 py-1.5 text-center font-semibold text-amber-900">
                🎤 DJ Set <span className="text-[10px]">(pending)</span>
              </div>
            </div>
          </div>
        </Diagram>
        <ol className="my-6 space-y-4">
          <Step n={1} title="Create your first artist profile">
            From <em>My Artist Profiles</em> on the StreetBeats page (or{" "}
            <em>Apply as a Musician</em> in the Hub), fill in stage name, genre,
            bio, photo, and social/tip links.
          </Step>
          <Step n={2} title="Add more profiles if you wear multiple hats">
            Tap <em>Add another artist</em> to register an additional persona.
            Each one is reviewed and approved independently.
          </Step>
          <Step n={3} title="Wait for approval">
            Staff review each artist and notify you by email. Pending profiles
            can't claim slots yet.
          </Step>
          <Step n={4} title="Claim a slot — and pick which artist">
            On the StreetBeats page or <em>My Gigs</em>, hit <em>Claim</em>. If
            you have more than one approved profile, a dialog asks which artist
            is performing this gig. The slot is locked to that artist and
            appears on their public profile.
          </Step>
          <Step n={5} title="Release if your plans change">
            From <em>My Gigs</em>, hit <em>Release</em> on an upcoming gig to
            open the slot back up for other performers.
          </Step>
        </ol>
        <Callout kind="tip">
          Each artist profile gets its own shareable page at{" "}
          <code>/artists/&lt;id&gt;</code> showing upcoming gigs, social links,
          and tip jar.
        </Callout>
      </>
    ),
  },
  {
    id: "gig-flyers",
    title: "Gig Flyers &amp; Sharing",
    icon: Sparkles,
    audience: "community",
    render: () => (
      <>
        <p>
          Every claimed StreetBeats gig has its own public flyer page at{" "}
          <code>/gigs/&lt;id&gt;</code> — designed for sharing on phones,
          printing as a QR poster, or dropping into social posts. The "More
          info" button on each music card on the events page links straight to
          it.
        </p>
        <Diagram caption="Anatomy of a gig flyer">
          <div className="mx-auto max-w-sm space-y-2 rounded-2xl border bg-white p-4 text-xs">
            <div className="rounded-lg bg-gradient-to-br from-pink-200 to-purple-300 p-4 text-center font-bold text-white">
              [ Artist photo ]
              <div className="mt-1 inline-block rounded-full bg-pink-600 px-2 py-0.5 text-[10px]">
                FREE MUSIC EVENT
              </div>
            </div>
            <div className="font-bold">Sat, Jun 7 · 6:00 PM</div>
            <div className="text-sm">Solo Acoustic at Town Square Stage</div>
            <div className="text-blue-700 underline">📍 123 Main St →</div>
            <div className="flex gap-1.5">
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-800">⚡ Power</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-800">⛱ Shade</span>
            </div>
            <div className="grid grid-cols-4 gap-1 pt-2">
              {["Spotify", "YouTube", "SoundCloud", "Tip"].map((s) => (
                <div key={s} className="rounded-md border bg-gray-50 p-1 text-center text-[9px]">
                  <div className="mx-auto mb-0.5 h-8 w-8 bg-gray-200" />
                  {s}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1 pt-1">
              {["WhatsApp", "Facebook", "X", "IG", "Copy"].map((s) => (
                <div key={s} className="rounded-md bg-gray-900 py-1 text-center text-[9px] text-white">
                  {s}
                </div>
              ))}
            </div>
          </div>
        </Diagram>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>
            <strong>Date, venue, address</strong> — the address links straight
            to Google Maps so listeners can navigate.
          </li>
          <li>
            <strong>Stage features</strong> — power, shade, seating, bathrooms,
            and backline are shown as colored chips.
          </li>
          <li>
            <strong>Scan-or-tap QR grid</strong> — each social/tip link becomes
            a QR code that doubles as a tap target on mobile.
          </li>
          <li>
            <strong>One-tap share row</strong> — WhatsApp, Facebook, X,
            Instagram (copy + open), and copy-link.
          </li>
        </ul>
        <Callout kind="tip">
          Performers: open your flyer, hit <em>Copy</em>, and paste into your
          own stories. The page renders rich Open Graph previews so it looks
          great in iMessage, WhatsApp, and Facebook.
        </Callout>
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
            Pick an event, choose a booth tier, and submit your application
            with your business profile.
          </Step>
          <Step n={3} title="Tell us about your sales & licensing">
            The application now asks four extra questions used by staff to
            triage your booth:
            <ul className="my-2 list-disc space-y-1 pl-6">
              <li>
                <strong>Will you be selling items?</strong> If yes, describe
                the products or services (menu, merchandise, services
                offered, price range).
              </li>
              <li>
                <strong>Are you licensed to do business and sell items?</strong>
                {" "}If yes, upload one or more proofs (sales-tax permit,
                health/cottage-food permit, business license, food handler
                cards, etc.) — multi-file upload is supported.
              </li>
              <li>
                <strong>Special requirements</strong> — electrical needs,
                water access, vehicle drop-off, allergens, accessibility,
                anything staff should know before assigning your spot.
              </li>
            </ul>
          </Step>
          <Step n={4} title="Wait for staff approval">
            City staff review your application and supporting documents
            before any payment is collected.
          </Step>
          <Step n={5} title="Review the contract and pay">
            Once approved, an in-app payment panel opens showing your tier,
            the exact amount due, and the full <strong>Vendor Agreement</strong>{" "}
            (event rules, cancellation/refund policy, indemnification, and
            insurance requirements). You must tick{" "}
            <em>"I have read and agree to the contract terms"</em> before the{" "}
            <strong>Submit Payment</strong> button enables. Card details are
            captured on the same screen and charged on submit; you'll receive
            a confirmation with a transaction reference and invoice number.
          </Step>
          <Step n={6} title="Manage booth placement">
            After payment clears, your booth assignment and event-day
            logistics appear in the same vendor dashboard.
          </Step>
        </ol>
        <Callout kind="tip">
          Uploaded permits are stored privately in the{" "}
          <code>vendor-permits</code> bucket and are only visible to you and
          the reviewing staff.
        </Callout>
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
          placement. Sponsorship applications are submitted through the same{" "}
          <code>/vendor</code> portal — pick the event, choose a sponsorship
          tier (which controls logo placement, mentions, and benefits), and
          submit for staff review.
        </p>
        <p className="mt-3">
          After approval, the portal opens the same payment + contract panel
          used for vendors. You'll see your tier and price, the full{" "}
          <strong>Sponsorship Agreement</strong>, and must check{" "}
          <em>"I have read and agree to the contract terms"</em> to authorize
          the charge. Payment is processed in-app and a confirmation with
          transaction reference and invoice number is issued immediately —
          your logo then appears on the event page and flyers.
        </p>
      </>
    ),
  },
  {
    id: "permits",
    title: "Special Event Permits",
    icon: FileText,
    audience: "community",
    render: () => (
      <>
        <p>
          Anyone planning a public event that needs city approval (parades,
          festivals, runs, block parties, etc.) applies online at{" "}
          <code>/events/permits/apply</code>. The form is a guided 5-step
          wizard with dynamic pricing and in-app payment.
        </p>
        <ol className="my-6 space-y-4">
          <Step n={1} title="Applicant & Event Basics">
            Primary contact, organization, event name, estimated participants,
            and event type. The event type is pulled from the city's current
            fee schedule and contributes to your total.
          </Step>
          <Step n={2} title="Dates, Times & Logistics">
            Setup, main, and teardown windows; whether you'll serve alcohol
            (with TABC license number), have food vendors, need electrical
            service, or are including a parade route.
          </Step>
          <Step n={3} title="Operations & Safety">
            Narrative answers for traffic control, litter control, and how
            you'll notify nearby residents and businesses.
          </Step>
          <Step n={4} title="Document Uploads">
            Required: certificate of insurance, site plan, and traffic
            management plan. Files are stored privately in the{" "}
            <code>permit-docs</code> bucket and are only visible to you and
            staff reviewers.
          </Step>
          <Step n={5} title="Fees, Signature & Payment">
            The wizard adds the active base fee + your chosen route/trail
            option fee in real time. After typing your name to certify, the
            same USAePay checkout used for vendor booths opens. On a
            successful charge the permit is marked <strong>paid</strong> and
            sent to the staff review queue.
          </Step>
        </ol>
        <Callout kind="tip">
          Hit <strong>Save Draft</strong> at any time. Drafts are kept in
          your account and can be resumed from <code>/my-permits</code> or
          the <em>My Permits</em> card on your Hub.
        </Callout>
      </>
    ),
  },
  {
    id: "my-permits",
    title: "My Permits",
    icon: FileText,
    audience: "community",
    render: () => (
      <>
        <p>
          The <code>/my-permits</code> page lists every Special Event Permit
          you've started or submitted, along with its current status:
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li><strong>Draft</strong> — saved but not yet submitted. Click{" "}
            <em>Resume</em> to reopen the wizard or the trash icon to delete.
          </li>
          <li><strong>Pending review</strong> — sent to staff; you can still
            view your answers and the calculated fee.
          </li>
          <li><strong>Approved</strong> — staff have approved; the wizard
            will let you complete payment.
          </li>
          <li><strong>Paid</strong> — payment captured; the city has your
            certificate on file.
          </li>
          <li><strong>Rejected</strong> — see staff notes for why; start a
            new application if needed.
          </li>
        </ul>
        <Callout kind="note">
          You can also reach this page from <em>My Permits</em> in the
          "Manage your stuff" section of your Hub.
        </Callout>
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
          settings/modules area. Every major feature has its own toggle so
          you can phase rollouts or pilot a single program. Current modules:
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li><strong>Events</strong> — the public events directory &amp; ticketing.</li>
          <li><strong>Venues &amp; Stages</strong> — venue/stage directory and editor.</li>
          <li><strong>Box Office</strong> — attendee management and check-in.</li>
          <li><strong>Vendors / Sponsors</strong> — applications, contracts, payments.</li>
          <li><strong>StreetBeats</strong> — musician roster and gig claiming.</li>
          <li><strong>Community Orgs &amp; Events</strong> — HOA / nonprofit submissions.</li>
          <li><strong>Room Reservations</strong> — booking flow and instant-book toggle.</li>
          <li><strong>Classes</strong> — class catalog and registration.</li>
          <li><strong>Social Command</strong> — multi-channel social publishing.</li>
          <li><strong>Special Event Permits</strong> — the 5-step permit wizard,{" "}
            <em>My Permits</em>, and the staff review queue.</li>
        </ul>
        <Callout kind="note">
          Disabling a module hides it from public nav, the Hub, and the staff
          sidebar. Existing data is preserved — modules can be re-enabled at
          any time without data loss.
        </Callout>
      </>
    ),
  },
  {
    id: "admin-permits",
    title: "Permit Settings &amp; Fee Schedule",
    icon: FileText,
    audience: "admin",
    render: () => (
      <>
        <p>
          The <em>Permit settings</em> link on <code>/staff/admin</code>{" "}
          opens the Special Event Permit configuration page at{" "}
          <code>/staff/admin/permits</code>. Admins control two things here:
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>
            <strong>Fee schedule</strong> — manage three categories of
            configurations:
            <ul className="mt-1 list-disc space-y-1 pl-6">
              <li>
                <em>Event types</em> — the radio choices applicants pick in
                step 1 (e.g., "5K Run", "Block Party", "Parade").
              </li>
              <li>
                <em>Route / Trail fees</em> — the route or trail options
                shown in step 5 (e.g., "River Walk Trail — $150").
              </li>
              <li>
                <em>Base fees</em> — flat fees added to every permit (sum of
                all active base fees, e.g., a $50 application fee).
              </li>
            </ul>
            Each row has a label, cost, sort order, and an Active toggle.
            Deactivating a fee hides it from the public wizard without
            deleting historical data.
          </li>
          <li>
            <strong>Permit review queue</strong> — every non-draft
            application appears here with applicant, event details, calculated
            fee, status, and uploaded documents. Staff can mark a permit{" "}
            <em>Pending review → Approved / Rejected</em>, and attach internal
            notes. Approving a permit unlocks the applicant's payment panel;
            payment moves the status to <em>Paid</em>.
          </li>
        </ul>
        <Callout kind="warn">
          Changing the cost of an existing fee only affects{" "}
          <strong>new</strong> applications. Submitted permits keep the
          calculated fee that was active when they were submitted.
        </Callout>
      </>
    ),
  },
  {
    id: "departments-overview",
    title: "Departments &amp; Active Context",
    icon: Network,
    audience: "community",
    render: () => (
      <>
        <p>
          The platform is organized into <strong>departments</strong> (City
          Hall, Fire, Parks &amp; Rec, Library, etc.). Every event, venue,
          room, vendor application, and reservation belongs to exactly one
          department. This keeps each team's queue, calendar, and box office
          focused on their own work — while still letting the public see and
          book across the whole city from one site.
        </p>
        <Diagram caption="One platform, many departments — each owns its events, rooms, and approvals">
          <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            {["City Hall", "Fire Dept.", "Parks &amp; Rec", "Library"].map(
              (d) => (
                <div
                  key={d}
                  className="rounded-lg border-2 border-[#002f49] bg-white p-3 text-center"
                >
                  <div
                    className="font-bold text-[#002f49]"
                    dangerouslySetInnerHTML={{ __html: d }}
                  />
                  <div className="mt-1 text-[10px] text-gray-500">
                    own logo · own brand · own policy · own staff
                  </div>
                </div>
              ),
            )}
          </div>
        </Diagram>
        <p>
          A single staff login can belong to <strong>multiple</strong>{" "}
          departments (for example, the city clerk who supports both City Hall
          and the Library). When that's the case, a department picker appears
          in the top-right of the site header. Whatever you pick is your{" "}
          <strong>Active Department</strong> — every staff page, sidebar count,
          and "new event / new booking" form fills in that department until you
          switch.
        </p>
        <Callout kind="tip">
          Staff: glance at the badge in the Event Ops sidebar to confirm which
          department you're acting in. Switch in the header before creating
          anything important.
        </Callout>
      </>
    ),
  },
  {
    id: "dept-hub",
    title: "Department Hub Pages",
    icon: Building2,
    audience: "community",
    render: () => (
      <>
        <p>
          Each department has a public landing page at{" "}
          <code>/departments/&lt;id&gt;</code> that shows its logo, name, and a
          curated grid of <strong>upcoming events</strong> and{" "}
          <strong>bookable rooms</strong> scoped to that department only.
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>
            Great for sharing — link the Fire Department's page to send people
            straight to their open houses and training rooms.
          </li>
          <li>
            Theming (colors, logo) on the hub matches the department's brand,
            so it doesn't feel like a generic listing.
          </li>
          <li>
            Public visitors can click straight from the hub into ticketing or
            room booking, with the department's policy applied automatically.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "dept-theming",
    title: "Department Branding &amp; Theming",
    icon: Palette,
    audience: "community",
    render: () => (
      <>
        <p>
          When you're viewing a department's hub — or when staff have a
          department selected as active — the site automatically adopts that
          department's <strong>brand colors</strong>. Behind the scenes, each
          department stores a small block of CSS variables (primary color,
          accent, etc.) that override the default theme globally for the
          current view.
        </p>
        <Callout kind="note">
          Departments can swap their look without code changes. Admins paste
          updated CSS variables in the department editor and the new theme
          applies on the next page load.
        </Callout>
      </>
    ),
  },
  {
    id: "staff-active-dept",
    title: "Working in Your Active Department",
    icon: Repeat,
    audience: "staff",
    render: () => (
      <>
        <p>
          Almost every page in the Staff Portal is filtered by your{" "}
          <strong>active department</strong>:
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>
            <strong>Master Schedule</strong> only lists events whose{" "}
            <em>department_id</em> matches.
          </li>
          <li>
            <strong>Venues &amp; Stages</strong> shows only the rooms/venues
            owned by that department.
          </li>
          <li>
            <strong>Box Office</strong> &amp; <strong>Attendees</strong> only
            show tickets for that department's events.
          </li>
          <li>
            <strong>Approvals</strong> (vendors, sponsors, room reservations)
            only show requests for things this department owns.
          </li>
          <li>
            <strong>New Event</strong> auto-fills the department, and the{" "}
            <em>Staff Owner</em> dropdown only lists users who belong to that
            same department.
          </li>
        </ul>
        <Callout kind="tip">
          If you swap departments mid-task, your forms and lists update
          immediately. The active department is shown as a badge in the Event
          Ops sidebar, with a count of how many departments you belong to.
        </Callout>
      </>
    ),
  },
  {
    id: "staff-cross-dept",
    title: "Cross-Department Room Requests",
    icon: Repeat,
    audience: "staff",
    render: () => (
      <>
        <p>
          Staff frequently need to book a room that belongs to{" "}
          <em>another</em> department (e.g., the Fire Dept. wants a City Hall
          conference room). The <code>/staff/room-reservations</code> page now
          has two tabs to keep this clear:
        </p>
        <Diagram caption="Inbound vs. Outbound — two sides of every cross-department booking">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3">
              <div className="font-bold text-emerald-900">Inbound</div>
              <div className="mt-1 text-emerald-900">
                Bookings against rooms <strong>your</strong> department owns,
                including requests from other departments. Approve / decline
                here.
              </div>
            </div>
            <div className="rounded-lg border-2 border-sky-500 bg-sky-50 p-3">
              <div className="font-bold text-sky-900">Outbound</div>
              <div className="mt-1 text-sky-900">
                Requests <strong>your</strong> department has sent out to
                other departments. Read-only — track status while you wait.
              </div>
            </div>
          </div>
        </Diagram>
        <ol className="my-6 space-y-4">
          <Step n={1} title="Submit a request">
            Use the <em>New reservation</em> dialog. If the room is owned by a
            different department, a banner warns you it's a cross-department
            request; your active department is stamped as the requester.
          </Step>
          <Step n={2} title="Track it under Outbound">
            Your request appears in your <strong>Outbound</strong> tab with a
            "to {"{owning department}"}" badge. You'll see status updates
            (pending → approved / declined) as the other team reviews it.
          </Step>
          <Step n={3} title="Review incoming requests under Inbound">
            When another department asks for one of <em>your</em> rooms, it
            shows up in your <strong>Inbound</strong> tab with a "from{" "}
            {"{requester department}"}" badge. Approve or decline — only the
            inbound side shows action buttons.
          </Step>
        </ol>
        <Callout kind="note">
          Instant-bookable rooms still apply: a public user (or staff) booking
          an instant room is auto-approved regardless of department.
        </Callout>
      </>
    ),
  },
  {
    id: "admin-departments",
    title: "Managing Departments",
    icon: Building2,
    audience: "admin",
    render: () => (
      <>
        <p>
          Super admins manage departments from{" "}
          <code>/staff/admin/departments</code>. The page has a datatable of
          every department and full CRUD via a dialog editor.
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>
            <strong>Department Name</strong> — shown on the public hub, in the
            staff sidebar badge, and on cross-department badges.
          </li>
          <li>
            <strong>Logo upload</strong> — stored in the{" "}
            <code>department-logos</code> bucket and rendered on the
            department hub and header.
          </li>
          <li>
            <strong>Room Policy Text</strong> — the agreement the public must
            accept before booking any room owned by this department.
          </li>
          <li>
            <strong>Brand CSS</strong> — a small JSON block of CSS variables
            (e.g.{" "}
            <code>{`{ "--primary": "262 83% 58%" }`}</code>) applied
            globally when this department is active or being viewed.
          </li>
        </ul>
        <Callout kind="warn">
          Deleting a department is destructive: events, rooms, and approvals
          tied to it lose their owner. Re-assign first, then delete.
        </Callout>
      </>
    ),
  },
  {
    id: "admin-dept-roles",
    title: "Assigning Users to Departments",
    icon: KeyRound,
    audience: "admin",
    render: () => (
      <>
        <p>
          Open <em>Manage permissions</em> from the admin page and pick a user.
          The drawer now has a <strong>Departments</strong> tab where you can
          attach the user to one or more departments and grant them either:
        </p>
        <ul className="my-4 list-disc space-y-2 pl-6 text-sm">
          <li>
            <strong>staff</strong> — works inside that department's queues
            (events, approvals, box office) with whatever global/per-event
            permissions you've granted.
          </li>
          <li>
            <strong>dept_admin</strong> — same as staff plus can edit that
            department's branding, room policy, and assignments.
          </li>
        </ul>
        <Callout kind="tip">
          Users with multiple memberships get the department picker in the
          header — see{" "}
          <a href="#departments-overview" className="underline">
            Departments &amp; Active Context
          </a>
          .
        </Callout>
      </>
    ),
  },
  {
    id: "admin-guidebook",
    title: "Program Guidebook Generator",
    icon: FileText,
    audience: "admin",
    render: () => (
      <>
        <p>
          Admins can compile every approved event, StreetBeats performance, and
          class within a date range into a print-ready PDF program guide, with
          sponsor ads automatically interleaved. Open it from{" "}
          <em>Admin → Generate Guidebook</em>.
        </p>

        <h4 className="mt-6 font-semibold text-[#002f49]">Quick generate</h4>
        <ol className="my-3 space-y-3">
          <Step n={1} title="Pick a date range">
            Set a start and end date. Click <em>Preview counts</em> to see how
            many events, gigs, classes, and sponsor ads will land in the PDF.
          </Step>
          <Step n={2} title="Generate PDF">
            Click <em>Generate PDF</em> for an automatic layout. The browser
            downloads <code>program-guide-{"{start}"}_to_{"{end}"}.pdf</code>.
          </Step>
        </ol>

        <h4 className="mt-6 font-semibold text-[#002f49]">Customize with the Layout Builder</h4>
        <p>
          Need finer control? Click <em>Open in Layout Builder</em> to enter the
          Guidebook Canvas, where every event, gig, class, and ad is a
          drag-and-drop card.
        </p>
        <ul className="my-3 list-disc space-y-2 pl-6 text-sm">
          <li><strong>Drag</strong> any row to reorder it within the print edition.</li>
          <li><strong>Hide / show</strong> items that don't fit the visual flow.</li>
          <li><strong>Edit print copy</strong> to override a title or description just for this edition — the underlying database record is not touched.</li>
          <li><strong>Reframe the card image</strong> — click and drag on any card's image to set its focal point. The PDF crops around that point so faces and signage stay in frame.</li>
          <li><strong>Insert ad slot</strong> drops a sponsor's bought ad block exactly between any two listings.</li>
          <li>Click <strong>Export PDF</strong> to render the final layout.</li>
        </ul>

        <h4 className="mt-6 font-semibold text-[#002f49]">Guidebook sponsors (no event required)</h4>
        <p>
          You don't have to attach a sponsor to an event to get them into the
          guidebook. On the <em>Generate Guidebook</em> page, scroll to{" "}
          <strong>Guidebook sponsors</strong> and fill in the form:
        </p>
        <ol className="my-3 space-y-3">
          <Step n={1} title="Enter company info">
            Company name is required. Add contact name, email, logo URL, and ad
            copy as available.
          </Step>
          <Step n={2} title="Click Add guidebook sponsor">
            The sponsor is created as <em>standalone</em> (no event link) on the{" "}
            <strong>Guidebook Ad Space</strong> tier and immediately marked{" "}
            <em>approved</em>. The tier is auto-created the first time it's
            needed.
          </Step>
          <Step n={3} title="They appear in the next PDF">
            Standalone and event-attached guidebook sponsors are pooled together
            and rotated through the cover logo, full-page ad, half-page slots,
            and footer credits.
          </Step>
        </ol>
        <Callout kind="tip">
          Sponsors who applied through the public sponsor portal and chose the
          Guidebook tier still flow in automatically — you only need the form
          above for sponsors you want to add manually without an event.
        </Callout>
      </>
    ),
  },
  {
    id: "admin-social",
    title: "Social Media Command Center",
    icon: Share2,
    audience: "admin",
    render: () => (
      <>
        <p>
          The Social Media Command Center turns a monthly calendar into a
          drag-and-drop publishing tool for Facebook Pages, Instagram Business
          accounts, and LinkedIn — scoped to whichever department is active in
          the top-left switcher. Open it from{" "}
          <em>Event Ops sidebar → Social Command</em>.
        </p>

        <h4 className="mt-6 font-semibold text-[#002f49]">Permission</h4>
        <p>
          Access is gated by the new <strong>Social Command Center</strong>{" "}
          staff permission (<code>page.social_command</code>). Grant it under{" "}
          <em>Admin → Permissions</em>. Existing staff and admins received it
          automatically when the feature shipped.
        </p>

        <h4 className="mt-6 font-semibold text-[#002f49]">One-time platform setup (admin)</h4>
        <p>
          Before any department can connect accounts, an admin pastes OAuth
          credentials at <em>Admin → Social integrations</em>:
        </p>
        <ol className="my-3 space-y-3">
          <Step n={1} title="Create a Meta app">
            At <a className="text-primary underline" href="https://developers.facebook.com/" target="_blank" rel="noreferrer">developers.facebook.com</a>{" "}
            create a Business app. Add the <em>Facebook Login</em> and{" "}
            <em>Instagram Graph API</em> products. Copy the App ID and App
            Secret into the Meta card on the integrations page, then paste the{" "}
            <em>Redirect URI</em> shown there into Meta's allowed redirect URL
            list.
          </Step>
          <Step n={2} title="Create a LinkedIn app">
            At <a className="text-primary underline" href="https://www.linkedin.com/developers/" target="_blank" rel="noreferrer">linkedin.com/developers</a>{" "}
            create an app, enable <em>Sign In with LinkedIn using OpenID Connect</em>,{" "}
            <em>Share on LinkedIn</em>, and any organization products you have
            access to. Copy the Client ID and Secret into the LinkedIn card and
            paste the redirect URL into the Auth tab.
          </Step>
          <Step n={3} title="Hit Save on each card">
            Credentials live in <code>social_integration_secrets</code> and are
            only readable by admins. Until both cards are saved, the per-department
            Connect buttons will show "{`{platform}`} OAuth is not configured".
          </Step>
        </ol>

        <h4 className="mt-6 font-semibold text-[#002f49]">Per-department: connect accounts</h4>
        <p>
          Each department connects its own accounts so cross-department staff
          can't accidentally post to the wrong page. From the Social Command
          page, click <em>Connect</em> (top-right) or open{" "}
          <em>Social → Connections</em>:
        </p>
        <ol className="my-3 space-y-3">
          <Step n={1} title="Connect Meta">
            One sign-in connects every Facebook Page the signed-in user
            administers plus any Instagram Business accounts linked to those
            Pages.
          </Step>
          <Step n={2} title="Connect LinkedIn">
            Posts go out as the connecting member. Use a service account if you
            want a stable author across staff turnover.
          </Step>
          <Step n={3} title="Disconnect anytime">
            The trash icon next to a connected account immediately revokes
            posting from this app — tokens stay in the platform's account
            settings until you fully revoke them there.
          </Step>
        </ol>

        <h4 className="mt-6 font-semibold text-[#002f49]">Schedule a post</h4>
        <ol className="my-3 space-y-3">
          <Step n={1} title="Drag an event onto a day">
            The composer opens pre-filled with a draft caption from the event
            title, date, and speaker. Or click an empty day to compose from
            scratch.
          </Step>
          <Step n={2} title="Pick channels">
            Only platforms with connected accounts will actually publish.
            Instagram requires an image URL. X stays in the UI as a manual
            copy/paste workflow because X's automated posting API is paid-tier
            only and not wired up.
          </Step>
          <Step n={3} title="Schedule">
            Posts within 1 minute of "now" publish immediately. Future posts
            land in the calendar with status <em>scheduled</em>; results are
            recorded per platform on <code>social_posts.results</code>.
          </Step>
        </ol>

        <Callout kind="note">
          Tokens for connected accounts never leave the server — the client
          only sees account names and connection status. Publishing happens
          entirely through TanStack server functions using each department's
          stored access token.
        </Callout>
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
