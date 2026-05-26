import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyRoles } from "@/lib/auth.functions";
import {
  listStaffWithPermissions,
  setGlobalPermissions,
  setEventPermissions,
  listEventsForPermissions,
} from "@/lib/staff-permissions.functions";
import {
  PAGE_PERMISSIONS,
  EVENT_PERMISSIONS,
  type PermissionKey,
} from "@/lib/staff-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/staff/admin/permissions")({
  beforeLoad: async () => {
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: PermissionsPage,
});

type StaffRow = Awaited<ReturnType<typeof listStaffWithPermissions>>[number];

function PermissionsPage() {
  const qc = useQueryClient();
  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["staff-permissions"],
    queryFn: () => listStaffWithPermissions(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = staff.find((s) => s.userId === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff permissions</h1>
          <p className="text-sm text-muted-foreground">
            Grant access to specific sidebar pages and event-dashboard tabs. Admins
            always have full access.
          </p>
        </div>
        <Link to="/staff/admin" className="text-sm text-primary hover:underline">
          ← Back to manage staff
        </Link>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <Card>
          <CardHeader><CardTitle>Staff</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : staff.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No staff yet.</p>
            ) : (
              <ul className="divide-y">
                {staff.map((s) => (
                  <li key={s.userId}>
                    <button
                      onClick={() => setSelectedId(s.userId)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 ${
                        selectedId === s.userId ? "bg-muted" : ""
                      }`}
                    >
                      <div className="font-medium text-sm">{s.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.isAdmin
                          ? "Admin (full access)"
                          : `${s.global.length} global · ${Object.keys(s.perEvent).length} event overrides`}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div>
          {selected ? (
            <PermissionEditor
              key={selected.userId}
              staff={selected}
              onSaved={() => qc.invalidateQueries({ queryKey: ["staff-permissions"] })}
            />
          ) : (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Select a staff member to manage their permissions.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionEditor({
  staff,
  onSaved,
}: {
  staff: StaffRow;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"global" | "event">("global");
  const [globalSet, setGlobalSet] = useState<Set<string>>(
    () => new Set(staff.global),
  );

  const { data: events = [] } = useQuery({
    queryKey: ["events-for-permissions"],
    queryFn: () => listEventsForPermissions(),
  });
  const [eventId, setEventId] = useState<string>("");

  const saveGlobal = useMutation({
    mutationFn: () =>
      setGlobalPermissions({
        data: { userId: staff.userId, permissions: Array.from(globalSet) },
      }),
    onSuccess: onSaved,
  });

  if (staff.isAdmin) {
    return (
      <Card>
        <CardContent className="p-8 text-sm text-muted-foreground">
          {staff.email} is an admin and has full access to every page and tab.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{staff.email}</CardTitle>
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant={tab === "global" ? "default" : "outline"}
            onClick={() => setTab("global")}
          >
            Global defaults
          </Button>
          <Button
            size="sm"
            variant={tab === "event" ? "default" : "outline"}
            onClick={() => setTab("event")}
          >
            Per-event overrides
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {tab === "global" && (
          <GlobalGrid
            globalSet={globalSet}
            setGlobalSet={setGlobalSet}
            onSave={() => saveGlobal.mutate()}
            saving={saveGlobal.isPending}
          />
        )}
        {tab === "event" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                Event
              </label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder="Pick an event…" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title}{e.start_time ? ` — ${new Date(e.start_time).toLocaleDateString()}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {eventId ? (
              <EventOverrideGrid
                key={eventId}
                staff={staff}
                eventId={eventId}
                onSaved={onSaved}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Pick an event to grant or revoke individual permissions for it.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GlobalGrid({
  globalSet,
  setGlobalSet,
  onSave,
  saving,
}: {
  globalSet: Set<string>;
  setGlobalSet: (s: Set<string>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const toggle = (k: PermissionKey) => {
    const next = new Set(globalSet);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setGlobalSet(next);
  };

  return (
    <div className="space-y-6">
      <PermissionSection
        title="Sidebar pages"
        items={PAGE_PERMISSIONS}
        isChecked={(k) => globalSet.has(k)}
        onToggle={toggle}
      />
      <PermissionSection
        title="Event dashboard tabs"
        items={EVENT_PERMISSIONS}
        isChecked={(k) => globalSet.has(k)}
        onToggle={toggle}
      />
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save global defaults"}
        </Button>
      </div>
    </div>
  );
}

type Tri = "inherit" | "grant" | "revoke";

function EventOverrideGrid({
  staff,
  eventId,
  onSaved,
}: {
  staff: StaffRow;
  eventId: string;
  onSaved: () => void;
}) {
  const current = staff.perEvent[eventId] ?? { grant: [], revoke: [] };
  const initial = useMemo<Record<string, Tri>>(() => {
    const m: Record<string, Tri> = {};
    for (const p of current.grant) m[p] = "grant";
    for (const p of current.revoke) m[p] = "revoke";
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
  const [state, setState] = useState<Record<string, Tri>>(initial);

  const save = useMutation({
    mutationFn: () => {
      const grants: string[] = [];
      const revokes: string[] = [];
      for (const [k, v] of Object.entries(state)) {
        if (v === "grant") grants.push(k);
        else if (v === "revoke") revokes.push(k);
      }
      return setEventPermissions({
        data: { userId: staff.userId, eventId, grants, revokes },
      });
    },
    onSuccess: onSaved,
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <strong>Inherit</strong> uses the global default. <strong>Grant</strong> allows
        this tab for this event even if global is off. <strong>Revoke</strong> hides
        it for this event even if global is on.
      </p>
      <div className="rounded-md border divide-y">
        {EVENT_PERMISSIONS.map((p) => {
          const v = state[p.key] ?? "inherit";
          const setV = (nv: Tri) => setState({ ...state, [p.key]: nv });
          return (
            <div key={p.key} className="flex items-center justify-between gap-4 px-4 py-2">
              <div className="text-sm font-medium">{p.label}</div>
              <div className="flex gap-1">
                {(["inherit", "grant", "revoke"] as Tri[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setV(opt)}
                    className={`px-2.5 py-1 text-xs font-bold uppercase rounded ${
                      v === opt
                        ? opt === "grant"
                          ? "bg-emerald-600 text-white"
                          : opt === "revoke"
                            ? "bg-red-600 text-white"
                            : "bg-slate-700 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save event overrides"}
        </Button>
      </div>
    </div>
  );
}

function PermissionSection({
  title,
  items,
  isChecked,
  onToggle,
}: {
  title: string;
  items: readonly { key: PermissionKey; label: string }[];
  isChecked: (k: PermissionKey) => boolean;
  onToggle: (k: PermissionKey) => void;
}) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <div className="grid sm:grid-cols-2 gap-2">
        {items.map((p) => (
          <label
            key={p.key}
            className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/40"
          >
            <input
              type="checkbox"
              checked={isChecked(p.key)}
              onChange={() => onToggle(p.key)}
              className="h-4 w-4"
            />
            <span className="text-sm">{p.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
