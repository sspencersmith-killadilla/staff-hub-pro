import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import { supabase } from "@/integrations/supabase/client";
import {
  getGlobalSettings,
  publishGlobalSettings,
  saveGlobalDraft,
  listBrandVersions,
  listPresets,
  savePreset,
  deletePreset,
  type GlobalSettings,
} from "@/lib/global-settings.functions";
import { useGlobalBrand } from "@/contexts/global-brand-context";
import { FONT_PAIRS, googleFontsUrl } from "@/lib/branding/font-pairs";
import { contrastRatio, tokensToCssVars } from "@/lib/branding/derive";
import { generateFaviconSet } from "@/lib/branding/favicon-pipeline";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

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
  logo_dark_url: string;
  favicon_url: string;
  favicon_180_url: string;
  favicon_512_url: string;
  og_image_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  foreground_color: string;
  muted_color: string;
  destructive_color: string;
  radius: string;
  heading_font: string;
  body_font: string;
};

function toForm(s: GlobalSettings | null): FormState {
  return {
    city_name: s?.city_name ?? "Our City",
    primary_logo_url: s?.logo_light_url ?? s?.primary_logo_url ?? "",
    logo_dark_url: s?.logo_dark_url ?? "",
    favicon_url: s?.favicon_url ?? "",
    favicon_180_url: s?.favicon_180_url ?? "",
    favicon_512_url: s?.favicon_512_url ?? "",
    og_image_url: s?.og_image_url ?? "",
    primary_color: s?.primary_color ?? "#2563eb",
    secondary_color: s?.secondary_color ?? "#64748b",
    accent_color: s?.accent_color ?? "#7c3aed",
    background_color: s?.background_color ?? "#ffffff",
    foreground_color: s?.foreground_color ?? "#0f172a",
    muted_color: s?.muted_color ?? "#f1f5f9",
    destructive_color: s?.destructive_color ?? "#dc2626",
    radius: s?.radius ?? "0.625rem",
    heading_font: s?.heading_font ?? s?.font_family ?? "Inter",
    body_font: s?.body_font ?? s?.font_family ?? "Inter",
  };
}

function BrandingPage() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getGlobalSettings);
  const publishFn = useServerFn(publishGlobalSettings);
  const draftFn = useServerFn(saveGlobalDraft);
  const versionsFn = useServerFn(listBrandVersions);
  const presetsFn = useServerFn(listPresets);
  const savePresetFn = useServerFn(savePreset);
  const deletePresetFn = useServerFn(deletePreset);
  const { refresh } = useGlobalBrand();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-global-settings"],
    queryFn: () => fetchSettings(),
  });
  const { data: versions = [] } = useQuery({
    queryKey: ["brand-versions", "global"],
    queryFn: () => versionsFn({ data: { scope: "global" as const } }),
  });
  const { data: presets = [] } = useQuery({
    queryKey: ["brand-presets"],
    queryFn: () => presetsFn(),
  });


  const [form, setForm] = useState<FormState>(toForm(null));
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  // Load Google Fonts for the live preview
  useEffect(() => {
    if (typeof document === "undefined") return;
    const pair = FONT_PAIRS.find(
      (p) => p.heading === form.heading_font && p.body === form.body_font,
    );
    if (!pair) return;
    const id = "branding-preview-fonts";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = googleFontsUrl(pair);
  }, [form.heading_font, form.body_font]);

  const previewStyle = useMemo(() => {
    const vars = tokensToCssVars({
      primary: form.primary_color,
      secondary: form.secondary_color,
      accent: form.accent_color,
      background: form.background_color,
      foreground: form.foreground_color,
      muted: form.muted_color,
      destructive: form.destructive_color,
      radius: form.radius,
      headingFont: form.heading_font,
      bodyFont: form.body_font,
    });
    return vars as React.CSSProperties;
  }, [form]);

  const contrast = useMemo(
    () => ({
      primary: contrastRatio(form.primary_color, "#ffffff"),
      bg: contrastRatio(form.background_color, form.foreground_color),
      accent: contrastRatio(form.accent_color, "#ffffff"),
      destructive: contrastRatio(form.destructive_color, "#ffffff"),
    }),
    [form],
  );

  const buildPatch = () => ({
    city_name: form.city_name.trim(),
    primary_color: form.primary_color,
    secondary_color: form.secondary_color,
    accent_color: form.accent_color || null,
    background_color: form.background_color || null,
    foreground_color: form.foreground_color || null,
    muted_color: form.muted_color || null,
    destructive_color: form.destructive_color || null,
    radius: form.radius || null,
    font_family: form.body_font || "Inter",
    heading_font: form.heading_font || null,
    body_font: form.body_font || null,
    primary_logo_url: form.primary_logo_url || null,
    logo_light_url: form.primary_logo_url || null,
    logo_dark_url: form.logo_dark_url || null,
    favicon_url: form.favicon_url || null,
    favicon_32_url: form.favicon_url || null,
    favicon_180_url: form.favicon_180_url || null,
    favicon_512_url: form.favicon_512_url || null,
    og_image_url: form.og_image_url || null,
  });

  const saveDraft = useMutation({
    mutationFn: () => draftFn({ data: { tokens: buildPatch() as any } }),
    onSuccess: () => toast.success("Draft saved."),
    onError: (e) => toast.error((e as Error).message),
  });

  const publish = useMutation({
    mutationFn: () => publishFn({ data: { patch: buildPatch() } }),
    onSuccess: () => {
      toast.success("Branding published.");
      qc.invalidateQueries({ queryKey: ["admin-global-settings"] });
      qc.invalidateQueries({ queryKey: ["global-settings"] });
      qc.invalidateQueries({ queryKey: ["brand-versions", "global"] });
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function uploadAsset(file: File, kind: string): Promise<string | null> {
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

  function makeUploader(key: keyof FormState, kind: string) {
    return async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploadingKey(key);
      const url = await uploadAsset(file, kind);
      setUploadingKey(null);
      if (url) setForm((f) => ({ ...f, [key]: url }));
    };
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    publish.mutate();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Global Branding</h1>
          <p className="text-sm text-muted-foreground">
            White-label the platform. Department branding overrides these defaults on department pages.
          </p>
        </div>
        <Link to="/staff/admin" className="text-sm font-medium text-primary hover:underline">
          ← Back to admin
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <Tabs defaultValue="identity">
              <TabsList>
                <TabsTrigger value="identity">Identity</TabsTrigger>
                <TabsTrigger value="colors">Colors</TabsTrigger>
                <TabsTrigger value="typography">Typography</TabsTrigger>
                <TabsTrigger value="assets">Assets</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="identity">
                <Card>
                  <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="city_name">City Name</Label>
                      <Input
                        id="city_name"
                        value={form.city_name}
                        onChange={(e) => setForm({ ...form, city_name: e.target.value })}
                        required
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Used in page titles, the site header, and footers.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="radius">Corner Radius</Label>
                      <Input
                        id="radius"
                        value={form.radius}
                        onChange={(e) => setForm({ ...form, radius: e.target.value })}
                        placeholder="0.625rem"
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="colors">
                <Card>
                  <CardHeader><CardTitle>Brand Colors</CardTitle></CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    {([
                      ["primary_color", "Primary"],
                      ["secondary_color", "Secondary"],
                      ["accent_color", "Accent"],
                      ["destructive_color", "Destructive"],
                      ["background_color", "Background"],
                      ["foreground_color", "Foreground"],
                      ["muted_color", "Muted"],
                    ] as const).map(([key, label]) => (
                      <ColorField
                        key={key}
                        id={key}
                        label={label}
                        value={form[key]}
                        onChange={(v) => setForm({ ...form, [key]: v })}
                      />
                    ))}
                  </CardContent>
                </Card>

                <Card className="mt-4">
                  <CardHeader><CardTitle>Accessibility (WCAG)</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <ContrastRow label="Primary vs white" ratio={contrast.primary} />
                    <ContrastRow label="Background vs foreground" ratio={contrast.bg} />
                    <ContrastRow label="Accent vs white" ratio={contrast.accent} />
                    <ContrastRow label="Destructive vs white" ratio={contrast.destructive} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="typography">
                <Card>
                  <CardHeader><CardTitle>Font Pair</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {FONT_PAIRS.map((pair) => {
                        const selected =
                          pair.heading === form.heading_font &&
                          pair.body === form.body_font;
                        return (
                          <button
                            type="button"
                            key={pair.id}
                            onClick={() =>
                              setForm({
                                ...form,
                                heading_font: pair.heading,
                                body_font: pair.body,
                              })
                            }
                            className={`rounded-md border p-3 text-left transition ${
                              selected
                                ? "border-primary ring-2 ring-primary"
                                : "border-input hover:border-primary"
                            }`}
                          >
                            <div className="text-xs text-muted-foreground">{pair.vibe}</div>
                            <div
                              className="text-lg font-semibold"
                              style={{ fontFamily: `'${pair.heading}', serif` }}
                            >
                              {pair.heading}
                            </div>
                            <div
                              className="text-sm text-muted-foreground"
                              style={{ fontFamily: `'${pair.body}', sans-serif` }}
                            >
                              The quick brown fox jumps over the lazy dog.
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="assets">
                <Card>
                  <CardHeader><CardTitle>Logos & Favicons</CardTitle></CardHeader>
                  <CardContent className="space-y-5">
                    <AssetUploader
                      label="Primary (light) Logo"
                      value={form.primary_logo_url}
                      uploading={uploadingKey === "primary_logo_url"}
                      onChange={makeUploader("primary_logo_url", "logo-light")}
                    />
                    <AssetUploader
                      label="Dark-mode Logo"
                      value={form.logo_dark_url}
                      uploading={uploadingKey === "logo_dark_url"}
                      onChange={makeUploader("logo_dark_url", "logo-dark")}
                    />
                    <AssetUploader
                      label="Favicon (32×32)"
                      value={form.favicon_url}
                      uploading={uploadingKey === "favicon_url"}
                      onChange={makeUploader("favicon_url", "favicon-32")}
                    />
                    <AssetUploader
                      label="Apple touch icon (180×180)"
                      value={form.favicon_180_url}
                      uploading={uploadingKey === "favicon_180_url"}
                      onChange={makeUploader("favicon_180_url", "favicon-180")}
                    />
                    <AssetUploader
                      label="Android / PWA icon (512×512)"
                      value={form.favicon_512_url}
                      uploading={uploadingKey === "favicon_512_url"}
                      onChange={makeUploader("favicon_512_url", "favicon-512")}
                    />
                    <AssetUploader
                      label="Social share image (og:image, 1200×630)"
                      value={form.og_image_url}
                      uploading={uploadingKey === "og_image_url"}
                      onChange={makeUploader("og_image_url", "og")}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history">
                <Card>
                  <CardHeader><CardTitle>Version History</CardTitle></CardHeader>
                  <CardContent>
                    {versions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No publishes yet. Each "Publish" writes a snapshot here.
                      </p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {versions.map((v) => (
                          <li
                            key={v.id}
                            className="flex items-center justify-between rounded border p-2"
                          >
                            <div>
                              <div className="font-medium">{v.label ?? "Snapshot"}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(v.published_at).toLocaleString()}
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const snap = v.snapshot as Partial<GlobalSettings>;
                                setForm(toForm(snap as GlobalSettings));
                                toast.info("Snapshot loaded into editor. Click Publish to revert.");
                              }}
                            >
                              Load
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => saveDraft.mutate()}
                disabled={saveDraft.isPending}
              >
                {saveDraft.isPending ? "Saving…" : "Save draft"}
              </Button>
              <Button type="submit" disabled={publish.isPending}>
                {publish.isPending ? "Publishing…" : "Publish branding"}
              </Button>
            </div>
          </div>

          <aside
            className="sticky top-6 h-fit rounded-lg border bg-card p-4 shadow-sm"
            style={previewStyle}
          >
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Live preview
            </div>
            <div
              className="mt-2 rounded-md border p-4"
              style={{
                background: form.background_color,
                color: form.foreground_color,
                fontFamily: `'${form.body_font}', sans-serif`,
                borderRadius: form.radius,
              }}
            >
              <h2
                className="text-xl font-bold"
                style={{ fontFamily: `'${form.heading_font}', serif` }}
              >
                {form.city_name}
              </h2>
              <p className="mt-1 text-sm opacity-80">
                Welcome to the {form.city_name} community portal.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded px-3 py-2 text-sm font-medium"
                  style={{
                    background: form.primary_color,
                    color: "#fff",
                    borderRadius: form.radius,
                  }}
                >
                  Primary
                </button>
                <button
                  type="button"
                  className="rounded px-3 py-2 text-sm font-medium"
                  style={{
                    background: form.accent_color,
                    color: "#fff",
                    borderRadius: form.radius,
                  }}
                >
                  Accent
                </button>
                <button
                  type="button"
                  className="rounded px-3 py-2 text-sm font-medium"
                  style={{
                    background: form.muted_color,
                    color: form.foreground_color,
                    borderRadius: form.radius,
                  }}
                >
                  Muted
                </button>
                <button
                  type="button"
                  className="rounded px-3 py-2 text-sm font-medium"
                  style={{
                    background: form.destructive_color,
                    color: "#fff",
                    borderRadius: form.radius,
                  }}
                >
                  Destructive
                </button>
              </div>
              {form.primary_logo_url && (
                <img
                  src={form.primary_logo_url}
                  alt="logo preview"
                  className="mt-4 h-10 w-auto"
                />
              )}
            </div>
          </aside>
        </form>
      )}
    </div>
  );
}

function ContrastRow({ label, ratio }: { label: string; ratio: number }) {
  const grade =
    ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA Large" : "Fail";
  const tone =
    ratio >= 4.5 ? "default" : ratio >= 3 ? "secondary" : "destructive";
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-xs">{ratio.toFixed(2)}:1</span>
        <Badge variant={tone as any}>{grade}</Badge>
      </span>
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
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
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

function AssetUploader({
  label,
  value,
  uploading,
  onChange,
}: {
  label: string;
  value: string;
  uploading: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-2 flex items-center gap-4">
        {value ? (
          <img src={value} alt={label} className="h-12 w-12 rounded border object-contain" />
        ) : (
          <div className="h-12 w-12 rounded border bg-muted" />
        )}
        <Input
          type="file"
          accept="image/*"
          onChange={onChange}
          disabled={uploading}
          className="max-w-xs"
        />
      </div>
    </div>
  );
}
