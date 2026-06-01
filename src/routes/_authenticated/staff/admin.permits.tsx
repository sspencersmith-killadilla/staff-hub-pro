import { useState } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import {
  listAllPermitConfigurations,
  upsertPermitConfiguration,
  deletePermitConfiguration,
  listAllPermits,
  setPermitStatus,
} from "@/lib/permits.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/admin/permits")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  head: () => ({ meta: [{ title: "Permit Settings" }] }),
  component: PermitsAdminPage,
});

type Category = "event_type" | "trail_fee" | "base_fee";
const CATEGORY_LABEL: Record<Category, string> = {
  event_type: "Event Type",
  trail_fee: "Trail / Route Fee",
  base_fee: "Base Fee",
};

type Config = {
  id: string;
  category: Category;
  label: string;
  cost: number | string;
  sort_order: number;
  is_active: boolean;
};

function PermitsAdminPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listAllPermitConfigurations);
  const fetchQueue = useServerFn(listAllPermits);
  const upsert = useServerFn(upsertPermitConfiguration);
  const del = useServerFn(deletePermitConfiguration);
  const setStatus = useServerFn(setPermitStatus);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["permit-configs", "all"],
    queryFn: () => fetchAll(),
  });
  const { data: queue = [] } = useQuery({
    queryKey: ["permits", "queue"],
    queryFn: () => fetchQueue(),
  });

  const [editing, setEditing] = useState<Partial<Config> | null>(null);

  const saveMut = useMutation({
    mutationFn: (v: Partial<Config>) =>
      upsert({
        data: {
          id: v.id,
          category: v.category as Category,
          label: String(v.label ?? ""),
          cost: Number(v.cost ?? 0),
          sort_order: Number(v.sort_order ?? 0),
          is_active: v.is_active ?? true,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["permit-configs"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const toggleMut = useMutation({
    mutationFn: (c: Config) =>
      upsert({
        data: {
          id: c.id,
          category: c.category,
          label: c.label,
          cost: Number(c.cost),
          sort_order: c.sort_order,
          is_active: !c.is_active,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permit-configs"] }),
    onError: (e: any) => toast.error(e?.message ?? "Toggle failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["permit-configs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: any }) =>
      setStatus({ data: { id: v.id, status: v.status } }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["permits", "queue"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const grouped = (configs as Config[]).reduce<Record<Category, Config[]>>(
    (acc, c) => {
      (acc[c.category] ??= []).push(c);
      return acc;
    },
    { event_type: [], trail_fee: [], base_fee: [] },
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Permit Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage Special Event Permit fees, event types, and submissions.
          </p>
        </div>
        <Link
          to="/staff/admin"
          className="text-sm font-medium text-primary hover:underline"
        >
          ← Back to Admin
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Fee & event type catalog</CardTitle>
          <Button
            size="sm"
            onClick={() =>
              setEditing({
                category: "event_type",
                label: "",
                cost: 0,
                sort_order: 0,
                is_active: true,
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Add Item
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            (Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
              <div key={cat} className="mb-6 last:mb-0">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_LABEL[cat]}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead className="w-28 text-right">Cost</TableHead>
                      <TableHead className="w-24 text-center">Order</TableHead>
                      <TableHead className="w-24 text-center">Active</TableHead>
                      <TableHead className="w-32 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped[cat].length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-sm text-muted-foreground"
                        >
                          No items.
                        </TableCell>
                      </TableRow>
                    ) : (
                      grouped[cat].map((c) => (
                        <TableRow key={c.id} className={c.is_active ? "" : "opacity-50"}>
                          <TableCell className="font-medium">{c.label}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            ${Number(c.cost).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            {c.sort_order}
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={c.is_active}
                              onCheckedChange={() => toggleMut.mutate(c)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditing(c)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Delete "${c.label}"? Toggling Active off is usually safer.`,
                                  )
                                )
                                  delMut.mutate(c.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submitted permits</CardTitle>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(queue as any[]).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.event_details?.event_name || "(untitled)"}
                      <div className="text-xs text-muted-foreground">
                        {p.event_details?.main_start
                          ? formatDateTime(p.event_details.main_start)
                          : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.applicant_info?.primary_contact_name || "—"}
                      <div className="text-xs text-muted-foreground">
                        {p.applicant_info?.primary_contact_email}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.event_type?.label || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${Number(p.calculated_fee).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold uppercase">
                        {p.status.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {p.status === "pending_review" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              statusMut.mutate({
                                id: p.id,
                                status: "approved",
                              })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              statusMut.mutate({
                                id: p.id,
                                status: "rejected",
                              })
                            }
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {p.status === "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            statusMut.mutate({
                              id: p.id,
                              status: "pending_review",
                            })
                          }
                        >
                          Re-open
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editing && (
        <ConfigDialog
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(v) => saveMut.mutate(v)}
          saving={saveMut.isPending}
        />
      )}
    </div>
  );
}

function ConfigDialog({
  value,
  onClose,
  onSave,
  saving,
}: {
  value: Partial<Config>;
  onClose: () => void;
  onSave: (v: Partial<Config>) => void;
  saving: boolean;
}) {
  const [v, setV] = useState<Partial<Config>>(value);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{v.id ? "Edit item" : "Add item"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(v);
          }}
          className="space-y-4"
        >
          <div>
            <Label>Category</Label>
            <Select
              value={(v.category as string) ?? "event_type"}
              onValueChange={(c) => setV((s) => ({ ...s, category: c as Category }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="event_type">Event Type</SelectItem>
                <SelectItem value="trail_fee">Trail / Route Fee</SelectItem>
                <SelectItem value="base_fee">Base Fee</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Label</Label>
            <Input
              required
              value={v.label ?? ""}
              onChange={(e) => setV((s) => ({ ...s, label: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cost (USD)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={String(v.cost ?? 0)}
                onChange={(e) => setV((s) => ({ ...s, cost: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Sort order</Label>
              <Input
                type="number"
                min="0"
                value={String(v.sort_order ?? 0)}
                onChange={(e) =>
                  setV((s) => ({ ...s, sort_order: Number(e.target.value) }))
                }
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={v.is_active ?? true}
              onCheckedChange={(c) => setV((s) => ({ ...s, is_active: c }))}
            />
            Active
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
