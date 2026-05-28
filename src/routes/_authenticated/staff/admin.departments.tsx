import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listDepartmentsAdmin,
  upsertDepartment,
  deleteDepartment,
  type AdminDepartment,
} from "@/lib/departments-admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/staff/admin/departments")({
  component: DepartmentsPage,
});

function DepartmentsPage() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-departments"],
    queryFn: () => listDepartmentsAdmin(),
  });

  const [editing, setEditing] = useState<AdminDepartment | null>(null);
  const [creating, setCreating] = useState(false);

  const del = useMutation({
    mutationFn: (id: string) => deleteDepartment({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-departments"] }),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Departments</h1>
          <p className="text-sm text-muted-foreground">
            Create, edit, and delete departments. Each department has its own
            logo, brand styling, and room policy.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/staff/admin" className="text-sm text-primary hover:underline">
            ← Back to manage staff
          </Link>
          <Button onClick={() => setCreating(true)}>New department</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All departments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No departments yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Logo</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Policy</th>
                  <th className="px-4 py-2 font-medium">Brand vars</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2">
                      {d.logo_url ? (
                        <img
                          src={d.logo_url}
                          alt=""
                          className="h-10 w-10 rounded object-cover border"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded border bg-muted" />
                      )}
                    </td>
                    <td className="px-4 py-2 font-medium">{d.name}</td>
                    <td className="px-4 py-2 max-w-[220px] truncate text-muted-foreground">
                      {d.room_policy_text || "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {d.brand_css ? Object.keys(d.brand_css).length : 0}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditing(d)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (
                              confirm(
                                `Delete "${d.name}"? Records currently scoped to this department will need to be reassigned.`,
                              )
                            ) {
                              del.mutate(d.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {del.error && (
            <p className="p-3 text-sm text-destructive">
              {(del.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <DepartmentEditDialog
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-departments"] });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function DepartmentEditDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminDepartment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(initial?.logo_url ?? null);
  const [policy, setPolicy] = useState(initial?.room_policy_text ?? "");
  const [brandText, setBrandText] = useState(() =>
    initial?.brand_css ? JSON.stringify(initial.brand_css, null, 2) : "{\n  \n}",
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (payload: {
      id?: string;
      name: string;
      logo_url: string | null;
      room_policy_text: string | null;
      brand_css: Record<string, string> | null;
    }) => upsertDepartment({ data: payload }),
    onSuccess: onSaved,
    onError: (e) => setError((e as Error).message),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop() || "png";
      const id = initial?.id ?? "new";
      const path = `${id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("department-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("department-logos").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
    } catch (e: any) {
      setError(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let brand_css: Record<string, string> | null = null;
    const trimmed = brandText.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          Object.values(parsed).some((v) => typeof v !== "string")
        ) {
          throw new Error("Must be a JSON object of string values");
        }
        brand_css = parsed as Record<string, string>;
      } catch (err: any) {
        setError(`Brand CSS: ${err.message}`);
        return;
      }
    }
    save.mutate({
      id: initial?.id,
      name: name.trim(),
      logo_url: logoUrl,
      room_policy_text: policy.trim() || null,
      brand_css,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial ? `Edit ${initial.name}` : "New department"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="dept-name">Department name</Label>
            <Input
              id="dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>

          <div>
            <Label>Logo</Label>
            <div className="flex items-center gap-4 mt-1">
              <div className="h-16 w-16 rounded border bg-muted overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="space-y-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                  disabled={uploading}
                />
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl(null)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="dept-policy">Room policy text</Label>
            <textarea
              id="dept-policy"
              className="mt-1 min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
              placeholder="Shown to community members when they request to book a room owned by this department."
            />
          </div>

          <div>
            <Label htmlFor="dept-brand">
              Brand CSS variables (JSON)
            </Label>
            <p className="text-xs text-muted-foreground mb-1">
              Object of CSS variable names to full color values. Applied to
              <code className="mx-1">:root</code> with <code>!important</code>
              whenever this department is active. Use full <code>oklch()</code>
              or <code>#hex</code> values — not raw HSL triplets — because this
              theme's tokens are declared as complete colors. Example:
              <code className="ml-1">{'{ "--primary": "oklch(0.55 0.22 264)", "--primary-foreground": "oklch(0.98 0 0)" }'}</code>
            </p>
            <textarea
              id="dept-brand"
              className="font-mono mt-1 min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
              value={brandText}
              onChange={(e) => setBrandText(e.target.value)}
              spellCheck={false}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || uploading}>
              {save.isPending ? "Saving…" : initial ? "Save changes" : "Create department"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
