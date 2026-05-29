import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import { supabase } from "@/integrations/supabase/client";
import {
  getGlobalSettings,
  updateGlobalSettings,
  type GlobalSettings,
} from "@/lib/global-settings.functions";
import { useGlobalBrand } from "@/contexts/global-brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/staff/admin/branding")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: BrandingPage,
});

type FormState = {
  city_name: string;
  primary_logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
  font_family: string;
};

function toForm(s: GlobalSettings | null): FormState {
  return {
    city_name: s?.city_name ?? "Our City",
    primary_logo_url: s?.primary_logo_url ?? "",
    favicon_url: s?.favicon_url ?? "",
    primary_color: s?.primary_color ?? "#2563eb",
    secondary_color: s?.secondary_color ?? "#64748b",
    font_family: s?.font_family ?? "Inter",
  };
}

function BrandingPage() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getGlobalSettings);
  const updateFn = useServerFn(updateGlobalSettings);
  const { refresh } = useGlobalBrand();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-global-settings"],
    queryFn: () => fetchSettings(),
  });

  const [form, setForm] = useState<FormState>(toForm(null));
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          city_name: form.city_name.trim(),
          primary_logo_url: form.primary_logo_url || null,
          favicon_url: form.favicon_url || null,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          font_family: form.font_family.trim() || "Inter",
        },
      }),
    onSuccess: () => {
      toast.success("Global branding updated.");
      qc.invalidateQueries({ queryKey: ["admin-global-settings"] });
      qc.invalidateQueries({ queryKey: ["global-settings"] });
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function uploadAsset(
    file: File,
    kind: "logo" | "favicon",
  ): Promise<string | null> {
    const ext = file.name.split(".").pop() || "png";
    const path = `${kind}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("branding")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      toast.error(error.message);
      return null;
    }
    const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
    return pub.publicUrl;
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const url = await uploadAsset(file, "logo");
    setUploadingLogo(false);
    if (url) setForm((f) => ({ ...f, primary_logo_url: url }));
  }

  async function handleFaviconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFavicon(true);
    const url = await uploadAsset(file, "favicon");
    setUploadingFavicon(false);
    if (url) setForm((f) => ({ ...f, favicon_url: url }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Global Branding</h1>
          <p className="text-sm text-muted-foreground">
            White-label the platform with your city's identity.
          </p>
        </div>
        <Link
          to="/staff/admin"
          className="text-sm font-medium text-primary hover:underline"
        >
          ← Back to admin
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="city_name">City Name</Label>
                <Input
                  id="city_name"
                  value={form.city_name}
                  onChange={(e) =>
                    setForm({ ...form, city_name: e.target.value })
                  }
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Appears in page titles, the site header, and footers.
                </p>
              </div>
              <div>
                <Label htmlFor="font_family">Font Family</Label>
                <Input
                  id="font_family"
                  value={form.font_family}
                  onChange={(e) =>
                    setForm({ ...form, font_family: e.target.value })
                  }
                  placeholder="Inter"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Any Google Font family name (e.g. "Inter", "Poppins").
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label>Primary City Logo</Label>
                <div className="mt-2 flex items-center gap-4">
                  {form.primary_logo_url ? (
                    <img
                      src={form.primary_logo_url}
                      alt="logo preview"
                      className="h-12 w-auto rounded border"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded border bg-muted" />
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    disabled={uploadingLogo}
                    className="max-w-xs"
                  />
                </div>
              </div>
              <div>
                <Label>Favicon</Label>
                <div className="mt-2 flex items-center gap-4">
                  {form.favicon_url ? (
                    <img
                      src={form.favicon_url}
                      alt="favicon preview"
                      className="h-8 w-8 rounded border"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded border bg-muted" />
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleFaviconChange}
                    disabled={uploadingFavicon}
                    className="max-w-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brand Colors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ColorField
                id="primary_color"
                label="Primary Color"
                value={form.primary_color}
                onChange={(v) => setForm({ ...form, primary_color: v })}
              />
              <ColorField
                id="secondary_color"
                label="Secondary Color"
                value={form.secondary_color}
                onChange={(v) => setForm({ ...form, secondary_color: v })}
              />
              <p className="text-xs text-muted-foreground">
                Department-specific branding will override these colors on
                department pages.
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save branding"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1 flex items-center gap-3">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded border bg-transparent"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-[160px] font-mono"
        />
      </div>
    </div>
  );
}
