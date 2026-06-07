import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { SiteHeader } from "@/components/site-header";
import {
  listPublicClasses,
  listDepartmentsForFilter,
} from "@/lib/courses-public.functions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/classes")({
  head: () => ({
    meta: [
      { title: "Classes — Community Program" },
      {
        name: "description",
        content:
          "Browse classes by department, view schedules, and register online.",
      },
      { property: "og:title", content: "Classes — Community Program" },
    ],
  }),
  component: ClassesIndex,
});

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ClassesIndex() {
  const [deptId, setDeptId] = useState<string>("all");
  const depts = useQuery({
    queryKey: ["public-departments"],
    queryFn: () => listDepartmentsForFilter(),
  });
  const classes = useQuery({
    queryKey: ["public-classes", deptId],
    queryFn: () =>
      listPublicClasses({
        data: { departmentId: deptId === "all" ? null : deptId },
      }),
  });

  const courses = classes.data?.courses ?? [];
  const upcoming = useMemo(
    () => courses.filter((c: any) => (c.sessions ?? []).length > 0),
    [courses],
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />
      <header className="bg-[#002f49] text-white py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-black tracking-tight">Classes</h1>
          <p className="mt-2 text-white/80 max-w-2xl">
            Discover community classes and register online. Filter by department
            and view upcoming session schedules.
          </p>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm font-medium">Department:</label>
          <div className="w-64">
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger>
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {(depts.data ?? []).map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {classes.isLoading && (
          <p className="text-slate-500">Loading classes…</p>
        )}
        {!classes.isLoading && upcoming.length === 0 && (
          <p className="text-slate-500">
            No upcoming classes scheduled right now.
          </p>
        )}

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((c: any) => (
            <Link
              key={c.id}
              to="/classes/$id"
              params={{ id: c.id }}
              className="block bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow overflow-hidden"
            >
              {c.image_url ? (
                <img
                  src={c.image_url}
                  alt={c.title}
                  className="w-full h-40 object-cover"
                />
              ) : (
                <div className="w-full h-40 bg-gradient-to-br from-blue-500 to-indigo-700" />
              )}
              <div className="p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  {c.department_name ?? "General"}
                </div>
                <h2 className="font-bold text-lg mt-1">{c.title}</h2>
                {c.description && (
                  <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                    {c.description}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#002f49]">
                    {Number(c.price) > 0
                      ? `$${Number(c.price).toFixed(2)}`
                      : "Free"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {c.sessions.length} session
                    {c.sessions.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Next: {fmtDateTime(c.sessions[0].start_time)}
                </div>
                <Button size="sm" variant="outline" className="mt-3 w-full">
                  View & Register
                </Button>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
