import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyRoles } from "@/lib/auth.functions";
import {
  listStaff,
  inviteStaff,
  setStaffRole,
  deleteStaff,
  bulkInviteStaff,
} from "@/lib/staff.functions";
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

export const Route = createFileRoute("/_authenticated/staff/admin")({
  beforeLoad: async () => {
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: AdminPage,
});

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

  function handleBulkSubmit(e: React.FormEvent) {
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
      <div>
        <h1 className="text-2xl font-semibold">Manage staff</h1>
        <p className="text-sm text-muted-foreground">
          Invite staff and admins, change roles, or remove accounts.
        </p>
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
        <CardHeader><CardTitle>Bulk invite from CSV</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Download the template, add one email per row, then upload. Everyone is
            invited as <strong>staff</strong>. Promote individuals to admin using
            the toggles below.
          </p>
          <div>
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              Download CSV template
            </Button>
          </div>
          <form className="flex flex-wrap items-end gap-3" onSubmit={handleUpload}>
            <div className="flex-1 min-w-[220px]">
              <Label htmlFor="csv-file">Upload CSV</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button type="submit" disabled={!csvFile || bulk.isPending}>
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
                    <div className="font-medium">{s.email}</div>
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
    </div>
  );
}
