import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useModules } from "@/hooks/use-modules";
import {
  Music,
  BedDouble,
  HeartHandshake,
  Ticket,
  CalendarCheck,
  Store,
  Sparkles,
  Shield,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/hub")({
  head: () => ({
    meta: [
      { title: "My Hub" },
      {
        name: "description",
        content:
          "Your personal hub — apply, book, and manage everything you do with the city under one account.",
      },
    ],
  }),
  component: HubPage,
});

type Action = {
  title: string;
  description: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  module?: "streetbeats" | "room_reservations" | "community_orgs" | "vendors_sponsors";
  cta: string;
};

function HubPage() {
  const { me, isStaff, isAdmin } = useAuth();
  const { isEnabled } = useModules();

  const applyActions: Action[] = [
    {
      title: "Apply as a Musician",
      description:
        "Join the StreetBeats roster — or add another musical act under this same account.",
      to: "/streetbeats/apply",
      icon: Music,
      accent: "from-pink-500 to-rose-500",
      module: "streetbeats",
      cta: "Apply / add act",
    },
    {
      title: "Apply as a Community Org",
      description:
        "Register an HOA, nonprofit, or school. Add as many organizations as you help run.",
      to: "/community/apply",
      icon: HeartHandshake,
      accent: "from-green-500 to-emerald-600",
      module: "community_orgs",
      cta: "Apply / add org",
    },
    {
      title: "Apply as a Vendor",
      description:
        "Sell food, goods, or services at upcoming city events.",
      to: "/vendor",
      icon: Store,
      accent: "from-amber-500 to-orange-500",
      module: "vendors_sponsors",
      cta: "Vendor application",
    },
    {
      title: "Become a Sponsor",
      description:
        "Sponsor an event and get your brand on flyers, maps, and event pages.",
      to: "/sponsors",
      icon: Sparkles,
      accent: "from-indigo-500 to-violet-500",
      module: "vendors_sponsors",
      cta: "View tiers",
    },
  ];

  const doActions: Action[] = [
    {
      title: "Book a Room",
      description:
        "Reserve a city meeting room. View live availability and submit a request.",
      to: "/rooms",
      icon: BedDouble,
      accent: "from-cyan-500 to-sky-600",
      module: "room_reservations",
      cta: "Book a room",
    },
    {
      title: "Browse Events",
      description: "See what's coming up and grab a ticket.",
      to: "/events",
      icon: Ticket,
      accent: "from-emerald-500 to-teal-600",
      cta: "Browse events",
    },
  ];

  const manageActions: Action[] = [
    {
      title: "My Tickets",
      description: "Your purchased and reserved event tickets.",
      to: "/my-tickets",
      icon: Ticket,
      accent: "from-emerald-500 to-green-600",
      cta: "View tickets",
    },
    {
      title: "My Room Reservations",
      description: "Status of your room booking requests.",
      to: "/my-reservations",
      icon: CalendarCheck,
      accent: "from-cyan-500 to-blue-600",
      module: "room_reservations",
      cta: "View reservations",
    },
    {
      title: "My Gigs",
      description: "Claim slots and manage your StreetBeats performances.",
      to: "/streetbeats/my-gigs",
      icon: Music,
      accent: "from-pink-500 to-fuchsia-600",
      module: "streetbeats",
      cta: "Manage gigs",
    },
    {
      title: "My Organizations",
      description: "Submit community events and manage your registered orgs.",
      to: "/community/manage",
      icon: HeartHandshake,
      accent: "from-green-500 to-emerald-700",
      module: "community_orgs",
      cta: "Manage orgs",
    },
  ];

  const visible = (list: Action[]) =>
    list.filter((a) => !a.module || isEnabled(a.module));

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
            Your Hub
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-[#002f49]">
            Welcome back{me?.email ? `, ${me.email.split("@")[0]}` : ""}.
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            One account, every program. Apply as a musician, register a community
            org, book a room, or buy a ticket — all under the same login. Apply
            for as many programs (or as many acts / orgs) as you want.
          </p>
        </div>

        <Section title="Apply / Add a new role">
          <Grid actions={visible(applyActions)} />
        </Section>

        <Section title="Do something">
          <Grid actions={visible(doActions)} />
        </Section>

        <Section title="Manage your stuff">
          <Grid actions={visible(manageActions)} />
        </Section>

        {(isStaff || isAdmin) && (
          <Section title="Staff">
            <Grid
              actions={[
                {
                  title: "Staff Portal",
                  description: "Operations, approvals, events, venues.",
                  to: "/staff",
                  icon: Shield,
                  accent: "from-slate-700 to-slate-900",
                  cta: "Open staff portal",
                },
                ...(isAdmin
                  ? [
                      {
                        title: "Admin",
                        description: "User roles, platform modules, settings.",
                        to: "/staff/admin",
                        icon: Shield,
                        accent: "from-red-600 to-rose-700",
                        cta: "Admin tools",
                      } as Action,
                    ]
                  : []),
              ]}
            />
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-[#002f49]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ actions }: { actions: Action[] }) {
  if (actions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing available here yet.</p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map((a) => (
        <ActionCard key={a.to + a.title} action={a} />
      ))}
    </div>
  );
}

function ActionCard({ action }: { action: Action }) {
  const Icon = action.icon;
  return (
    <Link
      to={action.to}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div
        className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br ${action.accent} text-white shadow`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-black text-[#002f49]">{action.title}</h3>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">
        {action.description}
      </p>
      <span className="mt-4 text-xs font-bold uppercase tracking-wider text-[#002f49] group-hover:underline">
        {action.cta} →
      </span>
    </Link>
  );
}
