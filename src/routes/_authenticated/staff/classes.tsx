import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import {
  upsertCourse,
  deleteCourse,
  listCoursesAdmin,
  scheduleCourseSession,
  deleteCourseSession,
  listMyTeachingSessions,
  getRoster,
  setAttendance,
} from "@/lib/courses.functions";
import { listDepartmentsForFilter } from "@/lib/courses-public.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, Users, Calendar, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/classes")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("staff") && !me.roles.includes("admin")) {
      throw redirect({ to: "/no-access" });
    }
  },
  component: ClassManagement,
});

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ClassManagement() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-black mb-6">Class Management</h1>
      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">
            <Calendar className="h-4 w-4 mr-2" />
            Catalog & Schedule
          </TabsTrigger>
          <TabsTrigger value="rosters">
            <Users className="h-4 w-4 mr-2" />
            My Rosters
          </TabsTrigger>
        </TabsList>
        <TabsContent value="catalog">
          <CatalogTab />
        </TabsContent>
        <TabsContent value="rosters">
          <RostersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CatalogTab() {
  const qc = useQueryClient();
  const courses = useQuery({
    queryKey: ["admin-courses"],
    queryFn: () => listCoursesAdmin(),
  });
  const depts = useQuery({
    queryKey: ["public-departments"],
    queryFn: () => listDepartmentsForFilter(),
  });

  const [editing, setEditing] = useState<any | null>(null);
  const [scheduling, setScheduling] = useState<any | null>(null);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button
          onClick={() =>
            setEditing({ title: "", description: "", price: 0, department_id: null })
          }
        >
          + New Course
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(courses.data ?? []).map((c: any) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between">
                <span>{c.title}</span>
                <span className="text-sm text-slate-500">
                  ${Number(c.price).toFixed(2)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {c.description && (
                <p className="text-sm text-slate-600 line-clamp-2">
                  {c.description}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  onClick={() => setScheduling(c)}
                >
                  Schedule Session
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (confirm("Delete this course?")) {
                      await deleteCourse({ data: { id: c.id } });
                      qc.invalidateQueries({ queryKey: ["admin-courses"] });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <SessionList courseId={c.id} />
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <CourseDialog
          course={editing}
          depts={depts.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["admin-courses"] });
          }}
        />
      )}
      {scheduling && (
        <ScheduleDialog
          course={scheduling}
          onClose={() => setScheduling(null)}
          onSaved={() => {
            setScheduling(null);
            qc.invalidateQueries({ queryKey: ["admin-courses"] });
            qc.invalidateQueries({ queryKey: ["course-sessions"] });
          }}
        />
      )}
    </div>
  );
}

function CourseDialog({
  course,
  depts,
  onClose,
  onSaved,
}: {
  course: any;
  depts: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    title: course.title ?? "",
    description: course.description ?? "",
    price: course.price ?? 0,
    department_id: course.department_id ?? null,
    image_url: course.image_url ?? "",
  });
  const save = useMutation({
    mutationFn: () =>
      upsertCourse({
        data: {
          id: course.id,
          title: f.title,
          description: f.description || null,
          price: Number(f.price),
          department_id: f.department_id || null,
          image_url: f.image_url || null,
        },
      }),
    onSuccess: onSaved,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{course.id ? "Edit Course" : "New Course"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              rows={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Price ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={f.price}
                onChange={(e) => setF({ ...f, price: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Department</Label>
              <Select
                value={f.department_id ?? "none"}
                onValueChange={(v) =>
                  setF({ ...f, department_id: v === "none" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {depts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Image URL (optional)</Label>
            <Input
              value={f.image_url}
              onChange={(e) => setF({ ...f, image_url: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({
  course,
  onClose,
  onSaved,
}: {
  course: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const rooms = useQuery({
    queryKey: ["rooms-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("rooms")
        .select("id, name, venues(name)")
        .order("name");
      return data ?? [];
    },
  });
  const instructors = useQuery({
    queryKey: ["instructors-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      return data ?? [];
    },
  });
  const [f, setF] = useState({
    room_id: "",
    instructor_id: "",
    instructor_name: "",
    start_time: "",
    end_time: "",
    capacity: 20,
  });
  const [err, setErr] = useState<string | null>(null);
  const sched = useMutation({
    mutationFn: () =>
      scheduleCourseSession({
        data: {
          course_id: course.id,
          room_id: f.room_id,
          instructor_id: f.instructor_id || null,
          instructor_name: f.instructor_name || null,
          start_time: new Date(f.start_time).toISOString(),
          end_time: new Date(f.end_time).toISOString(),
          capacity: Number(f.capacity),
        },
      }),
    onSuccess: onSaved,
    onError: (e: any) => setErr(e?.message ?? "Failed"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule: {course.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Room</Label>
            <Select
              value={f.room_id}
              onValueChange={(v) => setF({ ...f, room_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a room" />
              </SelectTrigger>
              <SelectContent>
                {(rooms.data ?? []).map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.venues?.name ? `${r.venues.name} — ${r.name}` : r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Start</Label>
              <Input
                type="datetime-local"
                value={f.start_time}
                onChange={(e) => setF({ ...f, start_time: e.target.value })}
              />
            </div>
            <div>
              <Label>End</Label>
              <Input
                type="datetime-local"
                value={f.end_time}
                onChange={(e) => setF({ ...f, end_time: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Capacity</Label>
              <Input
                type="number"
                value={f.capacity}
                onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Instructor</Label>
              <Select
                value={f.instructor_id || "none"}
                onValueChange={(v) => {
                  const sel = (instructors.data ?? []).find(
                    (u: any) => u.id === v,
                  );
                  setF({
                    ...f,
                    instructor_id: v === "none" ? "" : v,
                    instructor_name: sel?.full_name ?? sel?.email ?? "",
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="(optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(instructors.data ?? []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name ?? u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <p className="text-xs text-slate-500">
            Scheduling will automatically block the room in the master
            availability calendar.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => sched.mutate()} disabled={sched.isPending}>
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionList({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const sessions = useQuery({
    queryKey: ["course-sessions", courseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_sessions")
        .select("id, start_time, end_time, capacity, rooms(name)")
        .eq("course_id", courseId)
        .order("start_time", { ascending: true });
      return data ?? [];
    },
  });
  if (!sessions.data?.length)
    return <p className="text-xs text-slate-500 mt-1">No sessions scheduled.</p>;
  return (
    <ul className="text-xs space-y-1 mt-2 border-t pt-2">
      {sessions.data.map((s: any) => (
        <li key={s.id} className="flex items-center justify-between">
          <span>
            {fmtDateTime(s.start_time)} · {s.rooms?.name ?? "Room"} ·{" "}
            {s.capacity} cap
          </span>
          <button
            onClick={async () => {
              if (confirm("Cancel this session? Room will be unblocked.")) {
                await deleteCourseSession({ data: { id: s.id } });
                qc.invalidateQueries({ queryKey: ["course-sessions", courseId] });
              }
            }}
            className="text-red-600 hover:underline"
          >
            cancel
          </button>
        </li>
      ))}
    </ul>
  );
}

function RostersTab() {
  const sessions = useQuery({
    queryKey: ["my-teaching"],
    queryFn: () => listMyTeachingSessions(),
  });
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
      <div className="space-y-2">
        <h3 className="font-bold">Your sessions</h3>
        {(sessions.data ?? []).length === 0 && (
          <p className="text-sm text-slate-500">
            No sessions assigned to you yet.
          </p>
        )}
        {(sessions.data ?? []).map((s: any) => (
          <button
            key={s.id}
            onClick={() => setSelected(s.id)}
            className={`block w-full text-left p-3 rounded border ${
              selected === s.id ? "bg-blue-50 border-blue-400" : "bg-white"
            }`}
          >
            <div className="font-semibold text-sm">{s.course_title}</div>
            <div className="text-xs text-slate-600">
              {fmtDateTime(s.start_time)} · {s.room_name ?? "—"}
            </div>
          </button>
        ))}
      </div>
      <div className="md:col-span-2">
        {selected ? (
          <Roster sessionId={selected} />
        ) : (
          <p className="text-slate-500">Select a session to view its roster.</p>
        )}
      </div>
    </div>
  );
}

function Roster({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const roster = useQuery({
    queryKey: ["roster", sessionId],
    queryFn: () => getRoster({ data: { session_id: sessionId } }),
  });
  const toggle = useMutation({
    mutationFn: (vars: { id: string; attended: boolean }) =>
      setAttendance({
        data: { enrollment_id: vars.id, attended: vars.attended },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roster", sessionId] }),
  });
  const emails = (roster.data ?? [])
    .map((r: any) => r.email)
    .filter(Boolean)
    .join(",");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Roster ({roster.data?.length ?? 0})</span>
          {emails && (
            <a href={`mailto:?bcc=${emails}`}>
              <Button size="sm" variant="outline">
                <Mail className="h-4 w-4 mr-1" />
                Email All
              </Button>
            </a>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!roster.data?.length && (
          <p className="text-sm text-slate-500">No enrollments yet.</p>
        )}
        <ul className="divide-y">
          {(roster.data ?? []).map((r: any) => (
            <li key={r.id} className="py-2 flex items-center justify-between">
              <div>
                <div className="font-medium">{r.full_name ?? "—"}</div>
                <div className="text-xs text-slate-500">
                  {r.email} · {r.payment_status}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!r.attended}
                  onChange={(e) =>
                    toggle.mutate({ id: r.id, attended: e.target.checked })
                  }
                />
                Attended
              </label>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
