import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, DoorOpen, GraduationCap } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { listPublicDepartments } from "@/lib/departments.functions";

const listQO = queryOptions({
  queryKey: ["public-departments-index"],
  queryFn: () => listPublicDepartments(),
});

export const Route = createFileRoute("/departments/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(listQO),
  head: () => ({
    meta: [
      { title: "Departments — Browse by city department" },
      {
        name: "description",
        content:
          "Browse city departments to see their upcoming events, classes, and bookable rooms in one place.",
      },
      { property: "og:title", content: "Departments — Browse by city department" },
      {
        property: "og:description",
        content:
          "Pick a department (Library, Parks, City Hall, …) to see everything they offer.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">
      Couldn't load departments: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">No departments found.</div>
  ),
  component: DepartmentsIndex,
});

function DepartmentsIndex() {
  const { data } = useSuspenseQuery(listQO);
  const departments = data as Array<{
    id: string;
    name: string;
    logo_url: string | null;
    upcoming_events: number;
    classes: number;
    rooms: number;
  }>;

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <header className="border-b bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
            Browse by Department
          </p>
          <h1 className="mt-1 text-4xl font-black tracking-tight">Departments</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Pick a department to see all of its upcoming events, classes, and
            bookable rooms in one place. No login required.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No departments have published content yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((d) => (
              <Link
                key={d.id}
                to="/departments/$id"
                params={{ id: d.id }}
                className="group flex flex-col gap-3 rounded-lg border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  {d.logo_url ? (
                    <img
                      src={d.logo_url}
                      alt={`${d.name} logo`}
                      className="h-12 w-12 rounded-md object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
                      <Building2 className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <h2 className="text-lg font-semibold leading-tight group-hover:underline">
                    {d.name}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {d.upcoming_events} event{d.upcoming_events === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <GraduationCap className="h-3.5 w-3.5" />
                    {d.classes} class{d.classes === 1 ? "" : "es"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <DoorOpen className="h-3.5 w-3.5" />
                    {d.rooms} room{d.rooms === 1 ? "" : "s"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
