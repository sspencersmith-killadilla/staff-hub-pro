import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import { supabase } from "@/integrations/supabase/client";
import {
  listTenants,
  upsertTenant,
  deleteTenant,
  type Tenant,
} from "@/lib/global-settings.functions";
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

export const Route = createFileRoute("/_authenticated/staff/admin/tenants")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: TenantsPage,
});

function TenantsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listTenants);
  const delFn = useServerFn(deleteTenant);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: () => fetchList(),
  });

  const [editing, setEditing] = useState<Tenant | null>(null);
  const [creating, setCreating] = useState(false);

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Tenant deleted.");
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tenants</h1>
          <p className="text-sm text-muted-foreground">
            Multi-tenant white-label layer. Each tenant can override global
            branding on its own host or <code>/t/&lt;slug&gt;</code> path.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/staff/admin" className="text-sm text-primary hover:underline">
            ← Back to admin
          </Link>
          <Button onClick={() => setCreating(true)}>New tenant</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All tenants</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tenants yet. Click <strong>New tenant</strong> to create one.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    {t.logo_light_url ? (
                      <img
                        src={t.logo_light_url}
                        alt=""
                        className="h-10 w-10 rounded border object-contain"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded border bg-muted" />
                    )}
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        /t/{t.slug}
                        {t.host ? ` · ${t.host}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm(`Delete tenant "${t.name}"?`)) del.mutate(t.id);
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

      {(creating || editing) && (
        <TenantDialog
          tenant={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-tenants"] });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TenantDialog({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: Tenant | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsertFn = useServerFn(upsertTenant);
  const [slug, setSlug] = useState(tenant?.slug ?? "");
  const [name, setName] = useState(tenant?.name ?? "");
  const [host, setHost] = useState(tenant?.host ?? "");
  const [primary, setPrimary] = useState<string>(
    (tenant?.tokens as any)?.primary ?? "#2563eb",
  );
  const [accent, setAccent] = useState<string>(
    (tenant?.tokens as any)?.accent ?? "#7c3aed",
  );
  const [logoLight, setLogoLight] = useState(tenant?.logo_light_url ?? "");
  const [logoDark, setLogoDark] = useState(tenant?.logo_dark_url ?? "");
  const [favicon, setFavicon] = useState(tenant?.favicon_url ?? "");
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    setSlug(tenant?.slug ?? "");
    setName(tenant?.name ?? "");
    setHost(tenant?.host ?? "");
    setPrimary((tenant?.tokens as any)?.primary ?? "#2563eb");
    setAccent((tenant?.tokens as any)?.accent ?? "#7c3aed");
    setLogoLight(tenant?.logo_light_url ?? "");
    setLogoDark(tenant?.logo_dark_url ?? "");
    setFavicon(tenant?.favicon_url ?? "");
  }, [tenant]);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: tenant?.id,
          slug: slug.trim(),
          name: name.trim(),
          host: host.trim() || null,
          tokens: { primary, accent },
          logo_light_url: logoLight || null,
          logo_dark_url: logoDark || null,
          favicon_url: favicon || null,
        },
      }),
    onSuccess: () => {
      toast.success("Tenant saved.");
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function uploadTo(
    file: File,
    kind: string,
    setter: (s: string) => void,
  ) {
    setUploading(kind);
    const ext = file.name.split(".").pop() || "png";
    const path = `tenants/${kind}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("branding")
      .upload(path, file, { upsert: true, contentType: file.type });
    setUploading(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
    setter(pub.publicUrl);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      toast.error("Slug must be lowercase letters, numbers, and dashes.");
      return;
    }
    save.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{tenant ? "Edit tenant" : "New tenant"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="t-name">Name</Label>
              <Input
                id="t-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="t-slug">Slug</Label>
              <Input
                id="t-slug"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-tenant"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="t-host">Custom host (optional)</Label>
            <Input
              id="t-host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="brand.example.com"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              When set, requests from this host resolve to this tenant.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorRow label="Primary color" value={primary} onChange={setPrimary} />
            <ColorRow label="Accent color" value={accent} onChange={setAccent} />
          </div>
          <AssetRow
            label="Light logo"
            value={logoLight}
            uploading={uploading === "logo-light"}
            onFile={(f) => uploadTo(f, "logo-light", setLogoLight)}
          />
          <AssetRow
            label="Dark logo"
            value={logoDark}
            uploading={uploading === "logo-dark"}
            onFile={(f) => uploadTo(f, "logo-dark", setLogoDark)}
          />
          <AssetRow
            label="Favicon"
            value={favicon}
            uploading={uploading === "favicon"}
            onFile={(f) => uploadTo(f, "favicon", setFavicon)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save tenant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value.startsWith("#") ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded border bg-transparent"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
        />
      </div>
    </div>
  );
}

function AssetRow({
  label,
  value,
  uploading,
  onFile,
}: {
  label: string;
  value: string;
  uploading: boolean;
  onFile: (f: File) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-2 flex items-center gap-4">
        {value ? (
          <img
            src={value}
            alt={label}
            className="h-12 w-12 rounded border object-contain"
          />
        ) : (
          <div className="h-12 w-12 rounded border bg-muted" />
        )}
        <Input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="max-w-xs"
        />
      </div>
    </div>
  );
}
