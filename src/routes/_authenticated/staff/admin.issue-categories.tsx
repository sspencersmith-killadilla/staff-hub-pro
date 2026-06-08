import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listIssueCategoriesAdmin,
  upsertIssueCategory,
  deleteIssueCategory,
  type AdminIssueCategory,
} from "@/lib/tickets.functions";
import { listDepartmentsAdmin } from "@/lib/departments-admin.functions";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/staff/admin/issue-categories")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: IssueCategoriesPage,
});

const UNASSIGNED = "__unassigned__";

function IssueCategoriesPage() {
  const qc = useQueryClient();
  const { data: cats = [], isLoading } = useQuery({
    queryKey: ["admin-issue-categories"],
    queryFn: () => listIssueCategoriesAdmin(),
  });
  const { data: depts = [] } = useQuery({
    queryKey: ["admin-departments"],
    queryFn: () => listDepartmentsAdmin(),
  });

  const [editing, setEditing] = useState<AdminIssueCategory | null>(null);
  const [creating, setCreating] = useState(false);

  const del = useMutation({
    mutationFn: (id: string) => deleteIssueCategory({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-issue-categories"] }),
  });

  const deptName = (id: string | null) =>
    id ? depts.find((d) => d.id === id)?.name ?? "—" : "Unassigned";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">311 issue categories</h1>
          <p className="text-sm text-muted-foreground">
            Edit the dropdown options citizens see on the report form, and assign
            each category to the department that should receive new tickets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/staff/admin" className="text-sm text-primary hover:underline">
            ← Back to admin
          </Link>
          <Button onClick={() => setCreating(true)}>New category</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>All categories</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : cats.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Active</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cats.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 text-muted-foreground">{c.sort_order}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.name}</div>
                      {c.description && (
                        <div className="text-xs text-muted-foreground">{c.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">{deptName(c.default_department_id)}</td>
                    <td className="px-4 py-2">
                      {c.active ? (
                        <span className="text-emerald-600 text-xs font-medium">Active</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Hidden</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm(`Delete "${c.name}"? Existing tickets keep their reference.`))
                            del.mutate(c.id);
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <CategoryDialog
          initial={editing}
          depts={depts}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-issue-categories"] });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CategoryDialog({
  initial,
  depts,
  onClose,
  onSaved,
}: {
  initial: AdminIssueCategory | null;
  depts: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [deptId, setDeptId] = useState<string>(initial?.default_department_id ?? UNASSIGNED);
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? 0);
  const [active, setActive] = useState<boolean>(initial?.active ?? true);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      upsertIssueCategory({
        data: {
          id: initial?.id,
          name: name.trim(),
          description: description.trim() || null,
          icon: icon.trim() || null,
          default_department_id: deptId === UNASSIGNED ? null : deptId,
          sort_order: sortOrder,
          active,
        },
      }),
    onSuccess: () => onSaved(),
    onError: (e) => setErr((e as Error).message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    save.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pothole"
            />
          </div>
          <div>
            <Label htmlFor="cat-desc">Description</Label>
            <Input
              id="cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown under the dropdown choice"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cat-icon">Icon (lucide name)</Label>
              <Input
                id="cat-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="construction"
              />
            </div>
            <div>
              <Label htmlFor="cat-sort">Sort order</Label>
              <Input
                id="cat-sort"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div>
            <Label>Routes to department</Label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger><SelectValue placeholder="Pick a department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned (admins only)</SelectItem>
                {depts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              New tickets with this category are auto-assigned to this department.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} />
            Show in the citizen report dropdown
          </label>

          {err && <p className="text-sm text-destructive">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={save.isPending || !name.trim()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
