import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Building2, CalendarDays, DoorOpen } from "lucide-react";
import { getDepartmentHub } from "@/lib/departments.functions";
import { SiteHeader } from "@/components/site-header";
import { BrandThemeApplier } from "@/components/theme-provider";

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

function DepartmentHub() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(hubQO(id));
  const { department, events, rooms } = data;

  return (
    <div className="min-h-screen bg-background">
      <BrandThemeApplier brand={department.brand_css} />
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Department header */}
        <header className="mb-10 flex items-center gap-5 border-b pb-6">
          {department.logo_url ? (
            <img
              src={department.logo_url}
              alt={`${department.name} logo`}
              className="h-16 w-16 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted">
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {department.name}
            </h1>
            {department.room_policy_text && (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {department.room_policy_text}
              </p>
            )}
          </div>
        </header>

        {/* Upcoming events */}
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <CalendarDays className="h-5 w-5" /> Upcoming Events
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events for this department.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((e: any) => (
                <Link
                  key={e.id}
                  to="/events/$id"
                  params={{ id: e.id }}
                  className="group overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
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
          )}
        </section>

        {/* Rooms */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <DoorOpen className="h-5 w-5" /> Rooms
          </h2>
          {rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rooms scoped to this department.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((r: any) => (
                <Link
                  key={r.id}
                  to="/rooms/$id"
                  params={{ id: r.id }}
                  className="group overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
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
      </main>
    </div>
  );
}
