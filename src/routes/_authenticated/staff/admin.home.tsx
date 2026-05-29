import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import {
  getHomeContentAdmin,
  saveHomeDraft,
  publishHomeContent,
  type HomeContent,
  type HomeContentPatch,
  type HomeSection,
  type PortalCardItem,
  type ExplainerItem,
  type HeroSecondaryCta,
} from "@/lib/home-content.functions";
import { listBrandVersions, listTenants } from "@/lib/global-settings.functions";
import { DEFAULT_HOME_CONTENT } from "@/lib/home-content-defaults";
import { HomePageView } from "@/components/home/HomePageView";
import {
  ICON_KEYS,
  COLOR_THEMES,
} from "@/components/home/icon-registry";
import { SortableList } from "@/components/admin/SortableList";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronUp, ChevronDown, Trash2, Plus } from "lucide-react";


export const Route = createFileRoute("/_authenticated/staff/admin/home")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: HomeEditorPage,
});

const MODULE_KEYS = [
  { value: "", label: "Always show" },
  { value: "vendors_sponsors", label: "vendors_sponsors" },
  { value: "streetbeats", label: "streetbeats" },
  { value: "community_orgs", label: "community_orgs" },
  { value: "room_reservations", label: "room_reservations" },
  { value: "classes", label: "classes" },
  { value: "box_office", label: "box_office" },
  { value: "venues", label: "venues" },
  { value: "events", label: "events" },
];

function toPatch(c: HomeContent): HomeContentPatch {
  return {
    hero_badge: c.hero_badge,
    hero_title: c.hero_title,
    hero_subtitle: c.hero_subtitle,
    hero_authed_message: c.hero_authed_message,
    hero_signup_cta_label: c.hero_signup_cta_label,
    hero_login_cta_label: c.hero_login_cta_label,
    hero_primary_cta_label: c.hero_primary_cta_label,
    hero_primary_cta_href: c.hero_primary_cta_href,
    hero_secondary_ctas: c.hero_secondary_ctas ?? [],
    sections: c.sections ?? [],
    footer_tagline: c.footer_tagline,
    footer_body: c.footer_body,
    footer_copyright: c.footer_copyright,
  };
}

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function HomeEditorPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getHomeContentAdmin);
  const draftFn = useServerFn(saveHomeDraft);
  const publishFn = useServerFn(publishHomeContent);
  const versionsFn = useServerFn(listBrandVersions);
  const tenantsFn = useServerFn(listTenants);

  const [tenantId, setTenantId] = useState<string | null>(null);

  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => tenantsFn(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-home-content", tenantId],
    queryFn: () => fetchFn({ data: { tenantId } }),
  });
  const { data: versions = [] } = useQuery({
    queryKey: ["brand-versions", "home"],
    queryFn: () => versionsFn({ data: { scope: "home" as const } }),
  });

  const [form, setForm] = useState<HomeContentPatch>(() =>
    toPatch(DEFAULT_HOME_CONTENT),
  );

  useEffect(() => {
    if (data) {
      const live = toPatch(data);
      setForm(data.draft ? { ...live, ...data.draft } : live);
    } else {
      // No row for this tenant yet — start from global defaults
      setForm(toPatch(DEFAULT_HOME_CONTENT));
    }
  }, [data, tenantId]);

  const previewContent: HomeContent = useMemo(
    () => ({ ...DEFAULT_HOME_CONTENT, ...form, id: "preview" }),
    [form],
  );

  const saveDraft = useMutation({
    mutationFn: () => draftFn({ data: { content: form, tenantId } }),
    onSuccess: () => toast.success("Draft saved."),
    onError: (e) => toast.error((e as Error).message),
  });

  const publish = useMutation({
    mutationFn: () => publishFn({ data: { content: form, tenantId } }),
    onSuccess: () => {
      toast.success("Home page published.");
      qc.invalidateQueries({ queryKey: ["admin-home-content"] });
      qc.invalidateQueries({ queryKey: ["home-content"] });
      qc.invalidateQueries({ queryKey: ["brand-versions", "home"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });


  function updateSection(idx: number, next: HomeSection) {
    setForm((f) => {
      const s = [...f.sections];
      s[idx] = next;
      return { ...f, sections: s };
    });
  }
  function moveSection(idx: number, dir: -1 | 1) {
    setForm((f) => {
      const s = [...f.sections];
      const j = idx + dir;
      if (j < 0 || j >= s.length) return f;
      [s[idx], s[j]] = [s[j], s[idx]];
      return { ...f, sections: s };
    });
  }
  function removeSection(idx: number) {
    setForm((f) => ({ ...f, sections: f.sections.filter((_, i) => i !== idx) }));
  }
  function addSection(type: HomeSection["type"]) {
    const id = newId(type);
    let s: HomeSection;
    if (type === "portal_cards") s = { type, id, items: [] };
    else if (type === "explainer_cards") s = { type, id, items: [] };
    else if (type === "rich_text")
      s = { type, id, body_md: "Your text here…", align: "left", background: "white" };
    else if (type === "image_banner")
      s = { type, id, image_url: "https://placehold.co/1200x400", alt: "Banner" };
    else
      s = {
        type: "cta_band",
        id,
        headline: "Call to action",
        buttons: [{ label: "Get started", href: "/signup" }],
        background: "navy",
      };
    setForm((f) => ({ ...f, sections: [...f.sections, s] }));
  }

  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Edit Home Page</h1>
          <p className="text-sm text-muted-foreground">
            All content on <code>/</code> is editable here. Save a draft to
            keep working, or publish to make changes live.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-64">
            <Label className="text-xs text-muted-foreground">Editing scope</Label>
            <Select
              value={tenantId ?? "__global"}
              onValueChange={(v) => setTenantId(v === "__global" ? null : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__global">Global default (all sites)</SelectItem>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    Tenant: {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Link to="/staff/admin" className="text-sm font-medium text-primary hover:underline">
            ← Back to admin
          </Link>
        </div>
      </div>


      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_560px]">
        <div className="space-y-6 min-w-0">
          <Tabs defaultValue="hero">
            <TabsList>
              <TabsTrigger value="hero">Hero</TabsTrigger>
              <TabsTrigger value="sections">Sections</TabsTrigger>
              <TabsTrigger value="footer">Footer</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="hero">
              <Card>
                <CardHeader><CardTitle>Hero</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Badge (small pill above title)" value={form.hero_badge ?? ""}
                    onChange={(v) => setForm({ ...form, hero_badge: v || null })} />
                  <Field label="Title" value={form.hero_title}
                    onChange={(v) => setForm({ ...form, hero_title: v })} />
                  <TextField label="Subtitle" value={form.hero_subtitle ?? ""}
                    onChange={(v) => setForm({ ...form, hero_subtitle: v || null })} />
                  <TextField label="Message shown when signed in"
                    value={form.hero_authed_message ?? ""}
                    onChange={(v) => setForm({ ...form, hero_authed_message: v || null })} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Sign-up CTA label"
                      value={form.hero_signup_cta_label ?? ""}
                      onChange={(v) => setForm({ ...form, hero_signup_cta_label: v || null })} />
                    <Field label="Log-in link label"
                      value={form.hero_login_cta_label ?? ""}
                      onChange={(v) => setForm({ ...form, hero_login_cta_label: v || null })} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Hero buttons</Label>
                      <Button type="button" size="sm" variant="outline"
                        onClick={() =>
                          setForm({
                            ...form,
                            hero_secondary_ctas: [
                              ...form.hero_secondary_ctas,
                              { label: "New button", href: "/" },
                            ],
                          })
                        }>
                        <Plus className="h-4 w-4 mr-1" /> Add button
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {form.hero_secondary_ctas.map((cta, i) => (
                        <CtaEditor
                          key={i}
                          cta={cta}
                          onChange={(next) => {
                            const list = [...form.hero_secondary_ctas];
                            list[i] = next;
                            setForm({ ...form, hero_secondary_ctas: list });
                          }}
                          onRemove={() =>
                            setForm({
                              ...form,
                              hero_secondary_ctas: form.hero_secondary_ctas.filter(
                                (_, idx) => idx !== i,
                              ),
                            })
                          }
                          onMove={(dir) => {
                            const list = [...form.hero_secondary_ctas];
                            const j = i + dir;
                            if (j < 0 || j >= list.length) return;
                            [list[i], list[j]] = [list[j], list[i]];
                            setForm({ ...form, hero_secondary_ctas: list });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sections">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Sections</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Plus className="h-4 w-4 mr-1" /> Add section
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => addSection("portal_cards")}>
                        Portal cards
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addSection("explainer_cards")}>
                        Explainer cards
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addSection("rich_text")}>
                        Rich text
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addSection("image_banner")}>
                        Image banner
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addSection("cta_band")}>
                        CTA band
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="space-y-4">
                  {form.sections.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No sections yet. Use "Add section" above.
                    </p>
                  )}
                  <SortableList
                    items={form.sections}
                    onReorder={(next) => setForm((f) => ({ ...f, sections: next }))}
                    getId={(s, i) => s.id ?? `section-${i}`}
                  >
                    {(section, idx, handle) => (
                      <SectionEditor
                        section={section}
                        dragHandle={handle}
                        onChange={(next) => updateSection(idx, next)}
                        onRemove={() => removeSection(idx)}
                      />
                    )}
                  </SortableList>

                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="footer">
              <Card>
                <CardHeader><CardTitle>Footer</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Tagline (tracked uppercase)"
                    value={form.footer_tagline ?? ""}
                    onChange={(v) => setForm({ ...form, footer_tagline: v || null })} />
                  <TextField label="Body"
                    value={form.footer_body ?? ""}
                    onChange={(v) => setForm({ ...form, footer_body: v || null })} />
                  <Field label="Copyright line (year is appended automatically)"
                    value={form.footer_copyright ?? ""}
                    onChange={(v) => setForm({ ...form, footer_copyright: v || null })} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader><CardTitle>Version History</CardTitle></CardHeader>
                <CardContent>
                  {versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No publishes yet.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {versions.map((v) => (
                        <li key={v.id} className="flex items-center justify-between rounded border p-2">
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
                              setForm(toPatch(v.snapshot as HomeContent));
                              toast.info("Snapshot loaded. Click Publish to revert.");
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
            <Button type="button" variant="outline"
              onClick={() => saveDraft.mutate()}
              disabled={saveDraft.isPending}>
              {saveDraft.isPending ? "Saving…" : "Save draft"}
            </Button>
            <Button type="button" onClick={() => publish.mutate()}
              disabled={publish.isPending}>
              {publish.isPending ? "Publishing…" : "Publish home page"}
            </Button>
          </div>
        </div>

        <aside className="sticky top-6 h-fit">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Live preview
          </div>
          <div className="overflow-hidden rounded-lg border shadow-sm bg-white">
            <div
              style={{
                width: 1280,
                transform: "scale(0.42)",
                transformOrigin: "top left",
                height: 2000,
              }}
            >
              <HomePageView content={previewContent} showHeader={false} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------- Field primitives ----------

function Field({
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
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TextField({
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
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
    </div>
  );
}

function ModuleSelect({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <Label>Show when module is enabled</Label>
      <Select
        value={value ?? "__all"}
        onValueChange={(v) => onChange(v === "__all" ? null : v)}
      >

        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {MODULE_KEYS.map((m) => (
            <SelectItem key={m.value || "__all"} value={m.value || "__all"}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CtaEditor({
  cta,
  onChange,
  onRemove,
  onMove,
}: {
  cta: HeroSecondaryCta;
  onChange: (c: HeroSecondaryCta) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded border p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Label" value={cta.label}
          onChange={(e) => onChange({ ...cta, label: e.target.value })} />
        <Input placeholder="/path or https://…" value={cta.href}
          onChange={(e) => onChange({ ...cta, href: e.target.value })} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label>Style</Label>
          <Select value={cta.style ?? "secondary"}
            onValueChange={(v) => onChange({ ...cta, style: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="primary">Primary (filled)</SelectItem>
              <SelectItem value="secondary">Outline</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ModuleSelect value={cta.requires_module}
          onChange={(v) => onChange({ ...cta, requires_module: v })} />
      </div>
      <RowActions onMove={onMove} onRemove={onRemove} />
    </div>
  );
}

function RowActions({
  onMove,
  onRemove,
}: {
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" size="icon" variant="ghost" onClick={() => onMove(-1)}>
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={() => onMove(1)}>
        <ChevronDown className="h-4 w-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

// ---------- Section editors ----------

function SectionEditor({
  section,
  onChange,
  onRemove,
  dragHandle,
}: {
  section: HomeSection;
  onChange: (s: HomeSection) => void;
  onRemove: () => void;
  dragHandle?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-4 space-y-3 bg-background">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {dragHandle}
          <div className="text-sm font-semibold capitalize">
            {section.type.replace("_", " ")}
          </div>
        </div>
        <Button type="button" size="icon" variant="ghost" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {section.type === "portal_cards" && (
        <PortalCardsEditor section={section} onChange={onChange} />
      )}
      {section.type === "explainer_cards" && (
        <ExplainerCardsEditor section={section} onChange={onChange} />
      )}
      {section.type === "rich_text" && (
        <RichTextEditor section={section} onChange={onChange} />
      )}
      {section.type === "image_banner" && (
        <ImageBannerEditor section={section} onChange={onChange} />
      )}
      {section.type === "cta_band" && (
        <CtaBandEditor section={section} onChange={onChange} />
      )}
    </div>
  );
}

function PortalCardsEditor({
  section,
  onChange,
}: {
  section: Extract<HomeSection, { type: "portal_cards" }>;
  onChange: (s: HomeSection) => void;
}) {
  function update(i: number, next: PortalCardItem) {
    const items = [...section.items];
    items[i] = next;
    onChange({ ...section, items });
  }
  function move(i: number, dir: -1 | 1) {
    const items = [...section.items];
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    onChange({ ...section, items });
  }
  function remove(i: number) {
    onChange({ ...section, items: section.items.filter((_, idx) => idx !== i) });
  }
  function add() {
    onChange({
      ...section,
      items: [
        ...section.items,
        {
          id: newId("card"),
          title: "New card",
          description: "Description",
          link_to: "/",
          link_text: "Learn more →",
          icon: "ticket",
          color_theme: "emerald",
        },
      ],
    });
  }
  return (
    <div className="space-y-3">
      <Field label="Section title (optional)" value={section.title ?? ""}
        onChange={(v) => onChange({ ...section, title: v || undefined })} />
      {section.items.map((it, i) => (
        <div key={it.id} className="rounded border p-3 space-y-2 bg-muted/30">
          <Field label="Title" value={it.title}
            onChange={(v) => update(i, { ...it, title: v })} />
          <TextField label="Description" value={it.description}
            onChange={(v) => update(i, { ...it, description: v })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Link URL" value={it.link_to}
              onChange={(v) => update(i, { ...it, link_to: v })} />
            <Field label="Link text" value={it.link_text}
              onChange={(v) => update(i, { ...it, link_text: v })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label>Icon</Label>
              <Select value={it.icon}
                onValueChange={(v) => update(i, { ...it, icon: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ICON_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Color</Label>
              <Select value={it.color_theme}
                onValueChange={(v) => update(i, { ...it, color_theme: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLOR_THEMES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ModuleSelect value={it.requires_module}
              onChange={(v) => update(i, { ...it, requires_module: v })} />
          </div>
          <RowActions onMove={(d) => move(i, d)} onRemove={() => remove(i)} />
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add}>
        <Plus className="h-4 w-4 mr-1" /> Add card
      </Button>
    </div>
  );
}

function ExplainerCardsEditor({
  section,
  onChange,
}: {
  section: Extract<HomeSection, { type: "explainer_cards" }>;
  onChange: (s: HomeSection) => void;
}) {
  function update(i: number, next: ExplainerItem) {
    const items = [...section.items];
    items[i] = next;
    onChange({ ...section, items });
  }
  function move(i: number, dir: -1 | 1) {
    const items = [...section.items];
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    onChange({ ...section, items });
  }
  function remove(i: number) {
    onChange({ ...section, items: section.items.filter((_, idx) => idx !== i) });
  }
  function add() {
    onChange({
      ...section,
      items: [
        ...section.items,
        {
          id: newId("ex"),
          title: "New role",
          color_theme: "emerald",
          steps: ["Step one", "Step two"],
        },
      ],
    });
  }
  return (
    <div className="space-y-3">
      <Field label="Section title (optional)" value={section.title ?? ""}
        onChange={(v) => onChange({ ...section, title: v || undefined })} />
      <TextField label="Subtitle (optional)" value={section.subtitle ?? ""}
        onChange={(v) => onChange({ ...section, subtitle: v || undefined })} />
      {section.items.map((it, i) => (
        <div key={it.id} className="rounded border p-3 space-y-2 bg-muted/30">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Title" value={it.title}
              onChange={(v) => update(i, { ...it, title: v })} />
            <div>
              <Label>Color</Label>
              <Select value={it.color_theme}
                onValueChange={(v) => update(i, { ...it, color_theme: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLOR_THEMES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Steps (one per line)</Label>
            <Textarea
              rows={4}
              value={it.steps.join("\n")}
              onChange={(e) =>
                update(i, {
                  ...it,
                  steps: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <RowActions onMove={(d) => move(i, d)} onRemove={() => remove(i)} />
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add}>
        <Plus className="h-4 w-4 mr-1" /> Add explainer
      </Button>
    </div>
  );
}

function RichTextEditor({
  section,
  onChange,
}: {
  section: Extract<HomeSection, { type: "rich_text" }>;
  onChange: (s: HomeSection) => void;
}) {
  return (
    <div className="space-y-2">
      <Field label="Heading (optional)" value={section.title ?? ""}
        onChange={(v) => onChange({ ...section, title: v || undefined })} />
      <div>
        <Label>Body</Label>
        <Textarea rows={6} value={section.body_md}
          onChange={(e) => onChange({ ...section, body_md: e.target.value })} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label>Alignment</Label>
          <Select value={section.align ?? "left"}
            onValueChange={(v) => onChange({ ...section, align: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Background</Label>
          <Select value={section.background ?? "white"}
            onValueChange={(v) => onChange({ ...section, background: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="white">White</SelectItem>
              <SelectItem value="muted">Muted</SelectItem>
              <SelectItem value="navy">Navy</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function ImageBannerEditor({
  section,
  onChange,
}: {
  section: Extract<HomeSection, { type: "image_banner" }>;
  onChange: (s: HomeSection) => void;
}) {
  return (
    <div className="space-y-3">
      <ImageUploader
        label="Banner image"
        value={section.image_url}
        onChange={(v) => onChange({ ...section, image_url: v })}
      />
      <Field label="Alt text" value={section.alt}
        onChange={(v) => onChange({ ...section, alt: v })} />
      <Field label="Caption (optional)" value={section.caption ?? ""}
        onChange={(v) => onChange({ ...section, caption: v || undefined })} />
      <Field label="Click-through URL (optional)" value={section.href ?? ""}
        onChange={(v) => onChange({ ...section, href: v || undefined })} />
    </div>
  );
}

function CtaBandEditor({
  section,
  onChange,
}: {
  section: Extract<HomeSection, { type: "cta_band" }>;
  onChange: (s: HomeSection) => void;
}) {
  function updateBtn(i: number, key: "label" | "href", v: string) {
    const buttons = [...section.buttons];
    buttons[i] = { ...buttons[i], [key]: v };
    onChange({ ...section, buttons });
  }
  return (
    <div className="space-y-2">
      <Field label="Headline" value={section.headline}
        onChange={(v) => onChange({ ...section, headline: v })} />
      <TextField label="Body (optional)" value={section.body ?? ""}
        onChange={(v) => onChange({ ...section, body: v || undefined })} />
      <div>
        <Label>Background</Label>
        <Select value={section.background ?? "navy"}
          onValueChange={(v) => onChange({ ...section, background: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="navy">Navy</SelectItem>
            <SelectItem value="amber">Amber</SelectItem>
            <SelectItem value="white">White</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Buttons</Label>
        {section.buttons.map((b, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="Label" value={b.label}
              onChange={(e) => updateBtn(i, "label", e.target.value)} />
            <Input placeholder="URL" value={b.href}
              onChange={(e) => updateBtn(i, "href", e.target.value)} />
            <Button type="button" size="icon" variant="ghost"
              onClick={() =>
                onChange({
                  ...section,
                  buttons: section.buttons.filter((_, idx) => idx !== i),
                })
              }>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline"
          onClick={() =>
            onChange({
              ...section,
              buttons: [...section.buttons, { label: "Button", href: "/" }],
            })
          }>
          <Plus className="h-4 w-4 mr-1" /> Add button
        </Button>
      </div>
    </div>
  );
}
