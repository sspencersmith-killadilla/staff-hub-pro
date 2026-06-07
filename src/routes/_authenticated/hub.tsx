import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useModules } from "@/hooks/use-modules";
import { useLayoutPrefs } from "@/hooks/use-layout-prefs";
import { CustomizeToolbar, SectionControls } from "@/components/customize-toolbar";
import {
  Music,
  BedDouble,
  HeartHandshake,
  Ticket,
  CalendarCheck,
  Store,
  Sparkles,
  Shield,
  CalendarHeart,
  FileText,
  Compass,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyEarnedQuests } from "@/lib/quests.functions";

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
  module?: "streetbeats" | "room_reservations" | "community_orgs" | "vendors_sponsors" | "civic_quests";
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
    {
      title: "Special Event Permit",
      description:
        "Apply for a city Special Event Permit — five-step wizard with fees and online payment.",
      to: "/events/permits/apply",
      icon: FileText,
      accent: "from-blue-500 to-indigo-600",
      cta: "Start application",
    },
    {
      title: "Civic Quests",
      description: "Self-guided adventures around the city. Earn badges and points.",
      to: "/explore",
      icon: Compass,
      accent: "from-amber-500 to-orange-600",
      module: "civic_quests",
      cta: "Start exploring",
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
    {
      title: "My Permits",
      description: "Resume drafts and track Special Event Permit applications.",
      to: "/my-permits",
      icon: FileText,
      accent: "from-blue-500 to-indigo-700",
      cta: "View permits",
    },
  ];

  const visible = (list: Action[]) =>
    list.filter((a) => !a.module || isEnabled(a.module));

  const staffActions: Action[] = (isStaff || isAdmin)
    ? [
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
      ]
    : [];

  const sectionMap: Record<string, { title: string; actions: Action[] }> = {
    apply: { title: "Apply / Add a new role", actions: visible(applyActions) },
    do: { title: "Do something", actions: visible(doActions) },
    manage: { title: "Manage your stuff", actions: visible(manageActions) },
    ...(staffActions.length ? { staff: { title: "Staff", actions: staffActions } } : {}),
  };

  const allIds = Object.keys(sectionMap);
  const [editing, setEditing] = useState(false);
  const { visibleIds, orderedIds, hidden, move, toggleHidden, reset } = useLayoutPrefs(
    "personal-hub",
    allIds,
  );

  const idsToRender = editing ? orderedIds : visibleIds;

  return (
    <div className="min-h-dvh bg-[#f8fafc]">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
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
          <CustomizeToolbar
            editing={editing}
            onToggleEditing={() => setEditing((v) => !v)}
            onReset={reset}
          />
        </div>

        <Link
          to="/my-schedule"
          className="group mb-10 flex items-center justify-between gap-6 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-600 p-6 text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl sm:p-8"
        >
          <div className="flex items-center gap-5">
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur sm:flex">
              <CalendarHeart className="h-7 w-7" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/80">
                Your Community, your way
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                My Favorites
              </h2>
              <p className="mt-1 max-w-xl text-sm text-white/90">
                Tap the heart on any event, artist, vendor, room, or venue —
                everything you save lands here as a personalized favorites.
              </p>
            </div>
          </div>
        </Link>

        <QuestBadges />

        {idsToRender.map((sid, idx) => {
          const sect = sectionMap[sid];
          if (!sect) return null;
          const isHidden = hidden.includes(sid);
          return (
            <section key={sid} className={`mb-10 ${isHidden ? "opacity-40" : ""}`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-black uppercase tracking-widest text-[#002f49]">
                  {sect.title}
                </h2>
                {editing && (
                  <SectionControls
                    id={sid}
                    index={idx}
                    total={orderedIds.length}
                    isHidden={isHidden}
                    onMove={move}
                    onToggleHidden={toggleHidden}
                  />
                )}
              </div>
              {isHidden ? (
                <p className="text-xs italic text-muted-foreground">
                  Hidden — toggle the eye icon to show.
                </p>
              ) : (
                <Grid actions={sect.actions} />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function QuestBadges() {
  const { isEnabled } = useModules();
  const enabled = isEnabled("civic_quests");
  const fetchMine = useServerFn(listMyEarnedQuests);
  const { data } = useQuery({
    queryKey: ["my-earned-quests"],
    queryFn: () => fetchMine(),
    enabled,
  });
  if (!enabled) return null;
  const earned = (data?.entries ?? []).filter((e) => e.is_completed);
  if (!data) return null;
  return (
    <section className="mb-10 rounded-xl border-2 border-stone-900 bg-amber-100 p-5 shadow-[4px_4px_0_0_rgba(0,0,0,0.9)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl font-black text-stone-900">
            Quest Badges
          </h2>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-700">
            {data.points} pts · {earned.length} earned
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/leaderboard"
            className="rounded-md border-2 border-stone-900 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-stone-900 hover:bg-stone-100"
          >
            Leaderboard
          </Link>
          <Link
            to="/explore"
            className="rounded-md bg-stone-900 px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-100 hover:bg-stone-700"
          >
            Find more →
          </Link>
        </div>
      </div>
      {earned.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3">
          {earned.map((e) => (
            <li
              key={e.quest_id}
              className="flex items-center gap-2 rounded-full border-2 border-stone-900 bg-white px-3 py-1"
              title={e.title}
            >
              {e.badge_image_url ? (
                <img
                  src={e.badge_image_url}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <Compass className="h-5 w-5 text-amber-700" />
              )}
              <span className="text-sm font-bold text-stone-900">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
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
