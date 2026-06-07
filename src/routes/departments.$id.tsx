import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Building2, CalendarDays, DoorOpen, GraduationCap, Info, Music } from "lucide-react";
import { getDepartmentHub } from "@/lib/departments.functions";
import { SiteHeader } from "@/components/site-header";
import { BrandThemeApplier } from "@/components/theme-provider";
import { useLayoutPrefs } from "@/hooks/use-layout-prefs";
import { CustomizeToolbar, SectionControls } from "@/components/customize-toolbar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const hubQO = (id: string) =>
  queryOptions({
    queryKey: ["department-hub", id],
    queryFn: () => getDepartmentHub({ data: { id } }),
  });

export const Route = createFileRoute("/departments/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(hubQO(params.id)),
  head: ({ params }) => ({
    meta: [
      { title: `Department — ${params.id}` },
      { name: "description", content: "Department hub with upcoming events and bookable rooms." },
    ],
  }),
  component: DepartmentHub,
});

const ALL_SECTIONS = ["events", "classes", "gigs", "rooms"] as const;

function DepartmentHub() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(hubQO(id));
  const { department, events, rooms, gigs = [], classes = [] } = data as any;
  const [editing, setEditing] = useState(false);

  const { visibleIds, orderedIds, hidden, move, toggleHidden, reset } = useLayoutPrefs(
    `department-hub:${id}`,
    [...ALL_SECTIONS],
  );

  const idsToRender = editing ? orderedIds : visibleIds;

  return (
    <div className="min-h-dvh bg-background">
      <BrandThemeApplier brand={department.brand_css} />
      <SiteHeader />

      {/* Branded hero — actually uses brand tokens so the theme is visible */}
      <header
        className="border-b"
        style={{
          background:
            "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 70%, var(--accent)) 100%)",
          color: "var(--primary-foreground)",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-10">
          {department.logo_url ? (
            <img
              src={department.logo_url}
              alt={`${department.name} logo`}
              className="h-20 w-20 rounded-lg object-cover ring-2 ring-white/30"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-white/15 ring-2 ring-white/30">
              <Building2 className="h-10 w-10" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] opacity-80">
              Department Hub
            </p>
            <h1 className="mt-1 text-4xl font-black tracking-tight">{department.name}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Arrange this hub to suit you. Your layout is saved per account.
          </p>
          <CustomizeToolbar
            editing={editing}
            onToggleEditing={() => setEditing((v) => !v)}
            onReset={reset}
          />
        </div>

        {idsToRender.map((sectionId, idx) => {
          const isHidden = hidden.includes(sectionId);
          const header = (
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2
                className="flex items-center gap-2 text-xl font-semibold"
                style={{ color: "var(--primary)" }}
              >
                {sectionId === "events" ? (
                  <>
                    <CalendarDays className="h-5 w-5" /> Upcoming Events
                  </>
                ) : sectionId === "classes" ? (
                  <>
                    <GraduationCap className="h-5 w-5" /> Classes
                  </>
                ) : sectionId === "gigs" ? (
                  <>
                    <Music className="h-5 w-5" /> Streetbeats Gigs
                  </>
                ) : (
                  <>
                    <DoorOpen className="h-5 w-5" /> Rooms
                  </>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {sectionId === "rooms" && department.room_policy_text && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline"
                        style={{ color: "var(--primary)" }}
                      >
                        <Info className="h-3.5 w-3.5" /> Room policy
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{department.name} — Room Policy</DialogTitle>
                      </DialogHeader>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {department.room_policy_text}
                      </p>
                    </DialogContent>
                  </Dialog>
                )}
                {editing && (
                  <SectionControls
                    id={sectionId}
                    index={idx}
                    total={orderedIds.length}
                    isHidden={isHidden}
                    onMove={move}
                    onToggleHidden={toggleHidden}
                  />
                )}
              </div>
            </div>
          );

          return (
            <section
              key={sectionId}
              className={`mb-12 ${isHidden ? "opacity-40" : ""}`}
            >
              {header}
              {isHidden ? (
                <p className="text-xs italic text-muted-foreground">
                  Hidden — toggle the eye icon to show.
                </p>
              ) : sectionId === "events" ? (
                events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No upcoming events for this department.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {events.map((e: any) => (
                      <Link
                        key={e.id}
                        to="/events/$id"
                        params={{ id: e.id }}
                        className="group overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
                        style={{ borderColor: "color-mix(in oklab, var(--primary) 25%, transparent)" }}
                      >
                        {e.image_url ? (
                          <div className="aspect-video w-full overflow-hidden bg-muted">
                            <img
                              src={e.image_url}
                              alt={e.title}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              style={{
                                objectPosition: `${e.focal_x ?? 50}% ${e.focal_y ?? 50}%`,
                              }}
                            />
                          </div>
                        ) : (
                          <div className="aspect-video w-full bg-muted" />
                        )}
                        <div className="p-4">
                          <h3 className="line-clamp-2 font-medium text-foreground">{e.title}</h3>
                          {e.start_time && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {new Date(e.start_time).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )
              ) : sectionId === "gigs" ? (
                gigs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No upcoming Streetbeats gigs at this department's stages.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {gigs.map((g: any) => (
                      <Link
                        key={g.id}
                        to="/gigs/$id"
                        params={{ id: g.id }}
                        className="group overflow-hidden rounded-lg border bg-card p-4 transition-shadow hover:shadow-md"
                        style={{ borderColor: "color-mix(in oklab, var(--primary) 25%, transparent)" }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="line-clamp-2 font-medium text-foreground">{g.title}</h3>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                            style={{
                              background: g.status === "claimed"
                                ? "color-mix(in oklab, var(--primary) 18%, transparent)"
                                : "color-mix(in oklab, var(--accent) 18%, transparent)",
                              color: "var(--primary)",
                            }}
                          >
                            {g.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(g.start_time).toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {g.stage?.name ?? "—"}
                          {g.venue?.name ? ` · ${g.venue.name}` : ""}
                        </p>
                        {g.artist && (
                          <p className="mt-2 text-xs font-semibold" style={{ color: "var(--primary)" }}>
                            {g.artist.full_name}
                            {g.artist.genre ? ` · ${g.artist.genre}` : ""}
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                )
              ) : rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rooms scoped to this department.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rooms.map((r: any) => (
                    <Link
                      key={r.id}
                      to="/rooms/$id"
                      params={{ id: r.id }}
                      className="group overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
                      style={{ borderColor: "color-mix(in oklab, var(--primary) 25%, transparent)" }}
                    >
                      {r.image_url ? (
                        <div className="aspect-video w-full overflow-hidden bg-muted">
                          <img
                            src={r.image_url}
                            alt={r.name}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                        </div>
                      ) : (
                        <div className="aspect-video w-full bg-muted" />
                      )}
                      <div className="p-4">
                        <h3 className="font-medium text-foreground">{r.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.venue?.name ?? "—"}
                          {r.capacity ? ` · cap ${r.capacity}` : ""}
                          {r.instant_bookable ? " · Instant book" : ""}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
