import { createFileRoute, redirect, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import {
  listStaff,
  inviteStaff,
  setStaffRole,
  deleteStaff,
  bulkInviteStaff,
  promoteExistingUser,
  updateStaffProfile,
  updateStaffEmail,
} from "@/lib/staff.functions";
import {
  listDepartmentsAdmin,
  listUserDepartmentRoles,
  assignUserDepartmentRole,
  removeUserDepartmentRole,
} from "@/lib/departments-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/staff/admin")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: AdminRouteComponent,
});

function AdminRouteComponent() {
  const isChildRoute = useRouterState({
    select: (state) => state.location.pathname !== "/staff/admin",
  });

  return isChildRoute ? <Outlet /> : <AdminPage />;
}

function AdminPage() {
  const qc = useQueryClient();
  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: () => listStaff(),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [bulkEmails, setBulkEmails] = useState("");
  const [bulkResult, setBulkResult] = useState<
    | { total: number; invited: number; existed: number; errors: { email: string; message?: string }[] }
    | null
  >(null);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteRole, setPromoteRole] = useState<"staff" | "admin">("staff");
  const [promoteMsg, setPromoteMsg] = useState<string | null>(null);
  const [editingStaff, setEditingStaff] = useState<{ userId: string; email: string; full_name: string | null; phone: string | null } | null>(null);

  const promote = useMutation({
    mutationFn: () =>
      promoteExistingUser({ data: { email: promoteEmail, role: promoteRole } }),
    onSuccess: (r) => {
      setPromoteMsg(`Granted ${promoteRole} to ${r.email}.`);
      setPromoteEmail("");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e) => setPromoteMsg((e as Error).message),
  });

  const invite = useMutation({
    mutationFn: () => inviteStaff({ data: { email, role } }),
    onSuccess: () => {
      setEmail("");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });
  const toggle = useMutation({
    mutationFn: (v: { userId: string; role: "admin" | "staff"; enabled: boolean }) =>
      setStaffRole({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });
  const del = useMutation({
    mutationFn: (userId: string) => deleteStaff({ data: { userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });
  const bulk = useMutation({
    mutationFn: async (emails: string[]) => bulkInviteStaff({ data: { emails } }),
    onSuccess: (r) => {
      setBulkResult(r);
      setBulkEmails("");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });

  function handleBulkSubmit(e: FormEvent) {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emails = bulkEmails
      .split(/[\n,;]+/)
      .map((l: string) => l.trim())
      .filter((v: string) => v && emailRegex.test(v));
    if (emails.length === 0) {
      setBulkResult({ total: 0, invited: 0, existed: 0, errors: [{ email: "(none)", message: "No valid emails found" }] });
      return;
    }
    bulk.mutate(emails);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Manage staff</h1>
          <p className="text-sm text-muted-foreground">
            Invite staff and admins, change roles, or remove accounts.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link
            to="/staff/admin/permissions"
            className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
          >
            Manage permissions →
          </Link>
          <Link
            to="/staff/admin/departments"
            className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
          >
            Manage departments →
          </Link>
          <Link
            to="/staff/admin/guidebook"
            className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
          >
            Generate guidebook →
          </Link>
          <Link
            to="/staff/admin/social-integrations"
            className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
          >
            Social integrations →
          </Link>
          <Link
            to="/staff/admin/permits"
            className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
          >
            Permit settings →
          </Link>
          <Link
            to="/staff/admin/analytics"
            className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
          >
            Executive analytics →
          </Link>
        </div>
      </div>


      <Card>
        <CardHeader><CardTitle>Invite a new user</CardTitle></CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <div className="flex-1 min-w-[220px]">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? "Sending…" : "Send invite"}
            </Button>
          </form>
          {invite.error && (
            <p className="mt-2 text-sm text-destructive">
              {(invite.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Promote existing user</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Grant a role to someone who already has an account — no invite email
            is sent.
          </p>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setPromoteMsg(null);
              promote.mutate();
            }}
          >
            <div className="flex-1 min-w-[220px]">
              <Label htmlFor="promote-email">Email</Label>
              <Input
                id="promote-email"
                type="email"
                required
                value={promoteEmail}
                onChange={(e) => setPromoteEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={promoteRole} onValueChange={(v) => setPromoteRole(v as any)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={promote.isPending}>
              {promote.isPending ? "Granting…" : "Grant role"}
            </Button>
          </form>
          {promoteMsg && (
            <p
              className={`mt-2 text-sm ${
                promote.isError ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {promoteMsg}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bulk invite</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Paste or type emails separated by commas or newlines. Everyone is
            invited as <strong>staff</strong>. Promote individuals to admin using
            the toggles below.
          </p>
          <form className="space-y-3" onSubmit={handleBulkSubmit}>
            <textarea
              className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="staff1@example.com, staff2@example.com"
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
            />
            <Button type="submit" disabled={!bulkEmails.trim() || bulk.isPending}>
              {bulk.isPending ? "Inviting…" : "Invite all as staff"}
            </Button>
          </form>
          {bulk.error && (
            <p className="text-sm text-destructive">{(bulk.error as Error).message}</p>
          )}
          {bulkResult && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div>Processed <strong>{bulkResult.total}</strong> emails</div>
              <div>Invited: <strong>{bulkResult.invited}</strong></div>
              <div>Already existed (granted staff role): <strong>{bulkResult.existed}</strong></div>
              {bulkResult.errors.length > 0 && (
                <div>
                  <div className="text-destructive">Errors: {bulkResult.errors.length}</div>
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {bulkResult.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>{e.email}: {e.message ?? "unknown error"}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>



      <Card>
        <CardHeader><CardTitle>Current staff</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff yet.</p>
          ) : (
            <div className="space-y-3">
              {staff.map((s) => (
                <div key={s.userId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <div className="font-medium">{s.full_name || s.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.email}
                      {s.phone ? ` · ${s.phone}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Roles: {s.roles.join(", ") || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      Staff
                      <Switch
                        checked={s.roles.includes("staff")}
                        onCheckedChange={(checked) =>
                          toggle.mutate({
                            userId: s.userId, role: "staff", enabled: checked,
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      Admin
                      <Switch
                        checked={s.roles.includes("admin")}
                        onCheckedChange={(checked) =>
                          toggle.mutate({
                            userId: s.userId, role: "admin", enabled: checked,
                          })
                        }
                      />
                    </label>
                    <Button
                      size="sm" variant="outline"
                      onClick={() =>
                        setEditingStaff({
                          userId: s.userId,
                          email: s.email,
                          full_name: s.full_name ?? null,
                          phone: s.phone ?? null,
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm" variant="destructive"
                      onClick={() => {
                        if (confirm(`Delete ${s.email}? This removes their account entirely.`))
                          del.mutate(s.userId);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editingStaff && (
        <EditStaffDialog
          staff={editingStaff}
          onClose={() => setEditingStaff(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["staff"] });
          }}
        />
      )}
    </div>
  );
}

function EditStaffDialog({
  staff,
  onClose,
  onSaved,
}: {
  staff: { userId: string; email: string; full_name: string | null; phone: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(staff.full_name ?? "");
  const [phone, setPhone] = useState(staff.phone ?? "");
  const [email, setEmail] = useState(staff.email);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setFullName(staff.full_name ?? "");
    setPhone(staff.phone ?? "");
    setEmail(staff.email);
  }, [staff]);

  const { data: depts = [] } = useQuery({
    queryKey: ["admin-departments"],
    queryFn: () => listDepartmentsAdmin(),
  });
  const { data: userDepts = [], isLoading: udLoading } = useQuery({
    queryKey: ["user-dept-roles", staff.userId],
    queryFn: () => listUserDepartmentRoles({ data: { userId: staff.userId } }),
  });

  const saveProfile = useMutation({
    mutationFn: () =>
      updateStaffProfile({
        data: {
          userId: staff.userId,
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
        },
      }),
  });
  const saveEmail = useMutation({
    mutationFn: () =>
      updateStaffEmail({ data: { userId: staff.userId, email: email.trim() } }),
  });
  const addDept = useMutation({
    mutationFn: (v: { departmentId: string; role: "dept_admin" | "staff" }) =>
      assignUserDepartmentRole({ data: { userId: staff.userId, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-dept-roles", staff.userId] }),
  });
  const removeDept = useMutation({
    mutationFn: (id: string) => removeUserDepartmentRole({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-dept-roles", staff.userId] }),
  });

  const [newDeptId, setNewDeptId] = useState<string>("");
  const [newDeptRole, setNewDeptRole] = useState<"dept_admin" | "staff">("staff");

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await saveProfile.mutateAsync();
      if (email.trim().toLowerCase() !== staff.email.toLowerCase()) {
        await saveEmail.mutateAsync();
      }
      onSaved();
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit staff member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="edit-name">Full name</Label>
            <Input
              id="edit-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="text-sm font-medium">Department assignments</div>
            {udLoading ? (
              <div className="text-xs text-muted-foreground">Loading…</div>
            ) : userDepts.length === 0 ? (
              <div className="text-xs text-muted-foreground">No department assignments.</div>
            ) : (
              <ul className="space-y-1">
                {userDepts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm">
                    <span>
                      {r.department_name}{" "}
                      <span className="text-xs text-muted-foreground">({r.role})</span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeDept.mutate(r.id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2 pt-2 border-t">
              <div className="flex-1 min-w-[160px]">
                <Label className="text-xs">Department</Label>
                <Select value={newDeptId} onValueChange={setNewDeptId}>
                  <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                  <SelectContent>
                    {depts.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Role</Label>
                <Select value={newDeptRole} onValueChange={(v) => setNewDeptRole(v as any)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="dept_admin">Dept admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!newDeptId || addDept.isPending}
                onClick={() => {
                  if (!newDeptId) return;
                  addDept.mutate({ departmentId: newDeptId, role: newDeptRole });
                  setNewDeptId("");
                }}
              >
                Add
              </Button>
            </div>
            {(addDept.error || removeDept.error) && (
              <p className="text-xs text-destructive">
                {((addDept.error || removeDept.error) as Error).message}
              </p>
            )}
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saveProfile.isPending || saveEmail.isPending}>
              {saveProfile.isPending || saveEmail.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
