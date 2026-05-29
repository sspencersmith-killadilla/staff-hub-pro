import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import {
  fetchGuidebookCanvasData,
  listGuidebookSponsors,
  listGuidebookDepartments,
} from "@/lib/guidebook.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Eye,
  EyeOff,
  Megaphone,
  RefreshCw,
  Trash2,
  Pencil,
  Type as TypeIcon,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  GRID_PRESETS,
  type PublisherItem,
  type GridSpan,
} from "@/lib/guidebook-publisher/document";
import { ImageFocalPicker } from "@/components/image-focal-picker";

export const Route = createFileRoute("/_authenticated/staff/admin/guidebook-publisher")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: PublisherPage,
});

function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const KIND_LABEL: Record<PublisherItem["kind"], string> = {
  event: "Event",
  class: "Class",
  performance: "Performance",
  ad: "Sponsor Ad",
  text: "Text",
  image: "Image",
};

const KIND_COLOR: Record<PublisherItem["kind"], string> = {
  event: "bg-orange-100 text-orange-900 border-orange-300",
  class: "bg-teal-100 text-teal-900 border-teal-300",
  performance: "bg-purple-100 text-purple-900 border-purple-300",
  ad: "bg-amber-100 text-amber-900 border-amber-300",
  text: "bg-slate-100 text-slate-900 border-slate-300",
  image: "bg-blue-100 text-blue-900 border-blue-300",
};

const SPAN_OPTIONS: { id: string; label: string; span: GridSpan }[] = [
  { id: "1x1", label: "1 × 1 (single cell)", span: { w: 1, h: 1 } },
  { id: "2x1", label: "2 × 1 (wide)", span: { w: 2, h: 1 } },
  { id: "1x2", label: "1 × 2 (tall)", span: { w: 1, h: 2 } },
  { id: "2x2", label: "2 × 2 (full page)", span: { w: 2, h: 2 } },
];

function spanId(s?: GridSpan) {
  const w = s?.w ?? 1, h = s?.h ?? 1;
  return `${w}x${h}`;
}

function PublisherPage() {
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today(30));
  const [presetId, setPresetId] = useState("2x2");
  const [title, setTitle] = useState("Community Program Guide");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverSubtitle, setCoverSubtitle] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("__all");
  const [items, setItems] = useState<PublisherItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState("inspector");

  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    setMounted(true);
    waitForSupabaseSession().then((s) => setSessionReady(!!s?.user));
  }, []);

  const fetchData = useServerFn(fetchGuidebookCanvasData);
  const listSponsorsFn = useServerFn(listGuidebookSponsors);
  const listDeptsFn = useServerFn(listGuidebookDepartments);

  const sponsorsQ = useQuery({
    queryKey: ["publisher-sponsors"],
    queryFn: () => listSponsorsFn(),
    enabled: sessionReady,
  });

  const deptsQ = useQuery({
    queryKey: ["publisher-departments"],
    queryFn: () => listDeptsFn(),
    enabled: sessionReady,
  });

  const loadMut = useMutation({
    mutationFn: () =>
      fetchData({
        data: {
          startDate,
          endDate,
          departmentId: departmentId === "__all" ? null : departmentId,
        },
      }),
    onSuccess: (d) => {
      const next: PublisherItem[] = [
        ...d.events.map((e: any) => ({ id: `event-${e.id}`, kind: "event" as const, data: e })),
        ...d.classes.map((c: any) => ({ id: `class-${c.id}`, kind: "class" as const, data: c })),
        ...d.gigs.map((g: any) => ({ id: `perf-${g.id}`, kind: "performance" as const, data: g })),
      ];
      next.sort((a, b) => {
        const ta = (a.data as any).start_time ?? "";
        const tb = (b.data as any).start_time ?? "";
        return ta.localeCompare(tb);
      });
      setItems(next);
      toast.success(`Loaded ${d.events.length} events, ${d.classes.length} classes, ${d.gigs.length} performances`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to load data"),
  });

  const preset = useMemo(
    () => GRID_PRESETS.find((p) => p.id === presetId) ?? GRID_PRESETS[0],
    [presetId],
  );

  const move = (idx: number, dir: -1 | 1) => {
    setItems((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setSelectedIdx((s) => (s === idx ? idx + dir : s));
  };

  const toggleHidden = (idx: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, hidden: !it.hidden } : it)));

  const remove = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };

  const updateSelectedData = (patch: Record<string, any>) => {
    if (selectedIdx == null) return;
    setItems((prev) =>
      prev.map((it, i) =>
        i === selectedIdx ? ({ ...it, data: { ...(it.data as any), ...patch } } as PublisherItem) : it,
      ),
    );
  };

  const updateSelectedSpan = (span: GridSpan) => {
    if (selectedIdx == null) return;
    setItems((prev) => prev.map((it, i) => (i === selectedIdx ? { ...it, span } : it)));
  };

  const insertSponsorAt = (sp: any, atIdx: number | null) => {
    const ad: PublisherItem = {
      id: `ad-${sp.id}-${Date.now()}`,
      kind: "ad",
      data: { company_name: sp.company_name, ad_copy: sp.ad_copy ?? null, logo_url: sp.logo_url ?? null },
    };
    setItems((prev) => {
      const next = [...prev];
      const at = atIdx == null ? next.length : atIdx + 1;
      next.splice(at, 0, ad);
      return next;
    });
    toast.success(`Inserted "${sp.company_name}" ad`);
  };

  const attachSponsorToSelected = (sp: any | null) => {
    if (selectedIdx == null) return;
    if (items[selectedIdx].kind === "ad") {
      toast.error("Sponsor highlights apply to events/classes/performances, not ad blocks.");
      return;
    }
    updateSelectedData({
      sponsor: sp
        ? { company_name: sp.company_name, logo_url: sp.logo_url ?? null, tagline: sp.ad_copy ?? null }
        : null,
    });
  };

  const insertCustomItem = (kind: "text" | "image") => {
    const newItem: PublisherItem =
      kind === "text"
        ? {
            id: `text-${Date.now()}`,
            kind: "text",
            data: {
              heading: "New section",
              body: "Add your custom copy here.",
              eyebrow: null,
              align: "left",
              background: "paper",
            },
          }
        : {
            id: `image-${Date.now()}`,
            kind: "image",
            data: { image_url: "", caption: null, focal_x: 50, focal_y: 50 },
          };
    setItems((prev) => {
      const next = [...prev];
      const at = selectedIdx == null ? next.length : selectedIdx + 1;
      next.splice(at, 0, newItem);
      setSelectedIdx(at);
      return next;
    });
    setRightTab("inspector");
    toast.success(`Added ${kind === "text" ? "text" : "image"} section`);
  };

  const dateError =
    startDate && endDate && startDate > endDate ? "End date must be after start date." : null;

  // PDF preview (client-only) — use BlobProvider + iframe (more robust than PDFViewer in Vite)
  const [pdfMod, setPdfMod] = useState<any>(null);
  const [GuidebookDocument, setGuidebookDocument] = useState<any>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    // @react-pdf/renderer's image fetcher uses Node's Buffer in the browser.
    // Polyfill it before importing so fetchImage doesn't throw "Buffer is not defined".
    import("buffer")
      .then(({ Buffer }) => {
        if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer;
        return Promise.all([
          import("@react-pdf/renderer"),
          import("@/lib/guidebook-publisher/document"),
        ]);
      })
      .then(([rp, doc]) => {
        if (!alive) return;
        setPdfMod(() => rp);
        setGuidebookDocument(() => doc.GuidebookDocument);
      })
      .catch((err) => {
        if (!alive) return;
        // eslint-disable-next-line no-console
        console.error("Failed to load PDF preview modules", err);
        setPdfLoadError(err?.message ?? String(err));
      });
    return () => {
      alive = false;
    };
  }, [mounted]);

  const selected = selectedIdx != null ? items[selectedIdx] : null;

  return (
    <div className="flex flex-col h-screen bg-muted/20">
      {/* Toolbar */}
      <header className="border-b bg-background px-4 py-3 flex flex-wrap items-end gap-3">
        <Link to="/staff/admin/guidebook" className="text-sm text-muted-foreground hover:underline self-center mr-2">
          ← Back
        </Link>
        <div>
          <Label htmlFor="title" className="text-xs">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 w-56" />
        </div>
        <div>
          <Label htmlFor="cover" className="text-xs">Cover image URL</Label>
          <Input
            id="cover"
            placeholder="https://…"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            className="h-9 w-64"
          />
        </div>
        <div>
          <Label htmlFor="sub" className="text-xs">Cover subtitle</Label>
          <Input
            id="sub"
            placeholder="Optional"
            value={coverSubtitle}
            onChange={(e) => setCoverSubtitle(e.target.value)}
            className="h-9 w-48"
          />
        </div>
        <div>
          <Label htmlFor="s" className="text-xs">Start</Label>
          <Input id="s" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label htmlFor="e" className="text-xs">End</Label>
          <Input id="e" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-xs">Snap grid</Label>
          <Select value={presetId} onValueChange={setPresetId}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GRID_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Department</Label>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="h-9 w-48"><SelectValue placeholder="All departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All departments</SelectItem>
              {(deptsQ.data?.departments ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={() => loadMut.mutate()} disabled={!!dateError || loadMut.isPending} className="gap-2">
          {loadMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
          {loadMut.isPending ? "Loading…" : "Load date range"}
        </Button>
        <div className="flex items-end gap-1">
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={() => insertCustomItem("text")}>
            <TypeIcon className="h-3.5 w-3.5" /> Text
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={() => insertCustomItem("image")}>
            <ImageIcon className="h-3.5 w-3.5" /> Image
          </Button>
        </div>
        {dateError && <span className="text-sm text-destructive">{dateError}</span>}
        <div className="ml-auto text-xs text-muted-foreground">
          {items.filter((i) => !i.hidden).length} visible · {items.length} total
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-3 p-3 min-h-0">
        {/* LEFT: ordered list */}
        <Card className="col-span-3 flex flex-col min-h-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Layout order</span>
              <Badge variant="secondary" className="font-normal">{items.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-2">
            <ScrollArea className="h-full pr-2">
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">Load a date range to populate items.</p>
              ) : (
                <ul className="space-y-1">
                  {items.map((it, idx) => {
                    const titleText =
                      (it.data as any).title ?? (it.data as any).course_title ?? (it.data as any).company_name ?? "Untitled";
                    const isSel = selectedIdx === idx;
                    return (
                      <li
                        key={it.id}
                        onClick={() => { setSelectedIdx(idx); setRightTab("inspector"); }}
                        className={`group rounded-md border p-2 cursor-pointer text-xs ${
                          isSel ? "border-primary bg-primary/5" : "border-border bg-background"
                        } ${it.hidden ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${KIND_COLOR[it.kind]}`}>
                            {KIND_LABEL[it.kind]}
                          </span>
                          <span className="font-medium truncate flex-1">{titleText}</span>
                          <span className="text-[10px] text-muted-foreground">{spanId(it.span)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); move(idx, -1); }}>
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); move(idx, 1); }}>
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); toggleHidden(idx); }}>
                            {it.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); setSelectedIdx(idx); setRightTab("inspector"); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6 ml-auto"
                            onClick={(e) => { e.stopPropagation(); remove(idx); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* CENTER: live PDF preview */}
        <Card className="col-span-6 flex flex-col min-h-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Live preview · US Letter</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            {pdfLoadError ? (
              <div className="flex flex-col items-center justify-center h-full text-destructive text-sm px-4 text-center gap-2">
                <p>Couldn't load PDF preview engine.</p>
                <p className="text-xs text-muted-foreground">{pdfLoadError}</p>
              </div>
            ) : !mounted || !pdfMod || !GuidebookDocument ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading preview…</div>
            ) : items.filter((i) => !i.hidden).length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Load a date range to see the preview.
              </div>
            ) : (
              <PdfPreview
                pdfMod={pdfMod}
                doc={
                  <GuidebookDocument
                    title={title}
                    startDate={startDate}
                    endDate={endDate}
                    items={items}
                    preset={preset}
                    coverImageUrl={coverImageUrl || null}
                    coverSubtitle={coverSubtitle || null}
                  />
                }
              />
            )}
          </CardContent>
        </Card>

        {/* RIGHT: inspector + ads */}
        <Card className="col-span-3 flex flex-col min-h-0">
          <CardHeader className="py-2 pb-0">
            <Tabs value={rightTab} onValueChange={setRightTab} className="w-full">
              <TabsList className="grid grid-cols-2 w-full h-8">
                <TabsTrigger value="inspector" className="text-xs">
                  <Pencil className="h-3 w-3 mr-1" /> Inspector
                </TabsTrigger>
                <TabsTrigger value="ads" className="text-xs">
                  <Megaphone className="h-3 w-3 mr-1" /> Ads
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-2">
            {rightTab === "inspector" ? (
              <ScrollArea className="h-full pr-2">
                {!selected ? (
                  <p className="text-xs text-muted-foreground p-3">
                    Select an item on the left to edit its content, size, and sponsor highlight.
                  </p>
                ) : (
                  <InspectorPanel
                    item={selected}
                    sponsors={sponsorsQ.data?.sponsors ?? []}
                    onUpdate={updateSelectedData}
                    onSpan={updateSelectedSpan}
                    onAttachSponsor={attachSponsorToSelected}
                  />
                )}
              </ScrollArea>
            ) : (
              <ScrollArea className="h-full pr-2">
                <p className="text-[11px] text-muted-foreground px-1 pb-2">
                  {selectedIdx == null
                    ? "Insertion will append. Click an item to insert after it."
                    : `Inserting after item #${selectedIdx + 1}.`}
                </p>
                {sponsorsQ.isLoading ? (
                  <p className="text-xs text-muted-foreground p-3">Loading…</p>
                ) : !sponsorsQ.data?.sponsors.length ? (
                  <p className="text-xs text-muted-foreground p-3">
                    No guidebook sponsors yet.{" "}
                    <Link to="/staff/admin/guidebook" className="underline">Add one</Link>.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {sponsorsQ.data.sponsors.map((sp: any) => (
                      <li key={sp.id} className="rounded-md border bg-background p-2">
                        <div className="flex items-center gap-2">
                          {sp.logo_url ? (
                            <img src={sp.logo_url} alt="" className="h-8 w-8 object-contain rounded bg-muted" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{sp.company_name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{sp.ad_copy ?? "No ad copy"}</div>
                          </div>
                        </div>
                        <Button type="button" size="sm" variant="outline" className="w-full mt-2 h-7 text-xs"
                          onClick={() => insertSponsorAt(sp, selectedIdx)}>
                          Insert ad block
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Inspector panel ────────────────────────────────────────────────────
function InspectorPanel({
  item,
  sponsors,
  onUpdate,
  onSpan,
  onAttachSponsor,
}: {
  item: PublisherItem;
  sponsors: any[];
  onUpdate: (patch: Record<string, any>) => void;
  onSpan: (span: GridSpan) => void;
  onAttachSponsor: (sp: any | null) => void;
}) {
  const d: any = item.data;
  const isAd = item.kind === "ad";
  const isText = item.kind === "text";
  const isImage = item.kind === "image";
  const isCustom = isText || isImage;
  const titleField = item.kind === "class" ? "course_title" : "title";

  // Custom (text/image) sections get a dedicated inspector
  if (isCustom) {
    return (
      <div className="space-y-3 p-1 text-xs">
        <div>
          <Label className="text-[11px]">Card type</Label>
          <div className="text-xs font-medium">{KIND_LABEL[item.kind]}</div>
        </div>
        <div>
          <Label className="text-[11px]">Grid span</Label>
          <Select
            value={spanId(item.span)}
            onValueChange={(v) => {
              const opt = SPAN_OPTIONS.find((o) => o.id === v);
              if (opt) onSpan(opt.span);
            }}
          >
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SPAN_OPTIONS.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isText && (
          <>
            <FieldInput
              label="Eyebrow (optional)"
              value={d.eyebrow}
              onChange={(v) => onUpdate({ eyebrow: v })}
              placeholder="e.g. WELCOME"
            />
            <FieldInput
              label="Heading"
              value={d.heading}
              onChange={(v) => onUpdate({ heading: v })}
            />
            <div>
              <Label className="text-[11px]">Body</Label>
              <Textarea
                className="min-h-[120px] text-xs"
                value={d.body ?? ""}
                onChange={(e) => onUpdate({ body: e.target.value || null })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Align</Label>
                <Select value={d.align ?? "left"} onValueChange={(v) => onUpdate({ align: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Background</Label>
                <Select
                  value={d.background ?? "paper"}
                  onValueChange={(v) => onUpdate({ background: v })}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paper">Paper</SelectItem>
                    <SelectItem value="accent">Accent</SelectItem>
                    <SelectItem value="ink">Ink (dark)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        {isImage && (
          <>
            <FieldInput
              label="Image URL"
              value={d.image_url}
              onChange={(v) => onUpdate({ image_url: v ?? "" })}
              placeholder="https://…"
            />
            {d.image_url ? (
              <ImageFocalPicker
                src={d.image_url}
                x={d.focal_x ?? 50}
                y={d.focal_y ?? 50}
                onChange={({ x, y }: { x: number; y: number }) =>
                  onUpdate({ focal_x: x, focal_y: y })
                }
              />
            ) : (
              <p className="text-[10px] text-muted-foreground">
                Paste an image URL above to position it.
              </p>
            )}
            <FieldInput
              label="Caption (optional)"
              value={d.caption}
              onChange={(v) => onUpdate({ caption: v })}
            />
          </>
        )}
      </div>
    );
  }


  return (
    <div className="space-y-3 p-1 text-xs">
      <div>
        <Label className="text-[11px]">Card type</Label>
        <div className="text-xs font-medium">{KIND_LABEL[item.kind]}</div>
      </div>

      <div>
        <Label className="text-[11px]">Grid span</Label>
        <Select value={spanId(item.span)} onValueChange={(v) => {
          const opt = SPAN_OPTIONS.find((o) => o.id === v);
          if (opt) onSpan(opt.span);
        }}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SPAN_OPTIONS.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground mt-1">
          Clamped to current snap grid. Use 2×2 to fill a page.
        </p>
      </div>

      {/* Title / company name */}
      <div>
        <Label className="text-[11px]">
          {isAd ? "Company name" : item.kind === "class" ? "Course title" : "Title"}
        </Label>
        <Input
          className="h-8"
          value={d[isAd ? "company_name" : titleField] ?? ""}
          onChange={(e) => onUpdate({ [isAd ? "company_name" : titleField]: e.target.value })}
        />
      </div>

      {/* Eyebrow override */}
      {!isAd && (
        <div>
          <Label className="text-[11px]">Eyebrow (label above title)</Label>
          <Input
            className="h-8"
            placeholder="e.g. CITY EVENT"
            value={d.eyebrow_override ?? ""}
            onChange={(e) => onUpdate({ eyebrow_override: e.target.value || null })}
          />
        </div>
      )}

      {/* When */}
      {!isAd && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">Start</Label>
            <Input
              className="h-8" type="datetime-local"
              value={toLocalDt(d.start_time)}
              onChange={(e) => onUpdate({ start_time: fromLocalDt(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-[11px]">End</Label>
            <Input
              className="h-8" type="datetime-local"
              value={toLocalDt(d.end_time)}
              onChange={(e) => onUpdate({ end_time: fromLocalDt(e.target.value) })}
            />
          </div>
        </div>
      )}

      {/* Where (varies by kind) */}
      {item.kind === "event" && (
        <>
          <FieldInput label="Venue" value={d.venue_name} onChange={(v) => onUpdate({ venue_name: v })} />
          <FieldInput label="Location/Room" value={d.location_name} onChange={(v) => onUpdate({ location_name: v })} />
        </>
      )}
      {item.kind === "class" && (
        <>
          <FieldInput label="Room" value={d.room_name} onChange={(v) => onUpdate({ room_name: v })} />
          <FieldInput label="Venue" value={d.venue_name} onChange={(v) => onUpdate({ venue_name: v })} />
          <FieldInput label="Instructor" value={d.instructor_name} onChange={(v) => onUpdate({ instructor_name: v })} />
          <div>
            <Label className="text-[11px]">Price</Label>
            <Input
              className="h-8" type="number" step="0.01"
              value={d.price ?? ""}
              onChange={(e) => onUpdate({ price: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
          {Array.isArray(d.sessions) && d.sessions.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-2 space-y-1">
              <Label className="text-[11px] font-semibold">
                Sessions ({d.sessions.length})
              </Label>
              <ul className="space-y-0.5 max-h-40 overflow-auto">
                {d.sessions.map((sess: any, i: number) => (
                  <li key={sess.id ?? i} className="text-[10px] text-muted-foreground">
                    {sess.start_time
                      ? new Date(sess.start_time).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "—"}
                    {sess.room_name ? ` · ${sess.room_name}` : ""}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-muted-foreground italic">
                All sessions for this class render in a single card.
              </p>
            </div>
          )}
        </>
      )}
      {item.kind === "performance" && (
        <>
          <FieldInput label="Stage" value={d.stage_name} onChange={(v) => onUpdate({ stage_name: v })} />
          <FieldInput label="Venue" value={d.venue_name} onChange={(v) => onUpdate({ venue_name: v })} />
          <FieldInput label="Artist" value={d.artist_name} onChange={(v) => onUpdate({ artist_name: v })} />
          <FieldInput label="Genre" value={d.artist_genre} onChange={(v) => onUpdate({ artist_genre: v })} />
        </>
      )}

      {/* Image */}
      {!isAd && (
        <div className="rounded-md border bg-muted/30 p-2 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-semibold">Image</Label>
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
              <Switch
                checked={d.show_image ?? true}
                onCheckedChange={(v: boolean) => onUpdate({ show_image: v })}
                disabled={!d.image_url}
              />
              <span>Show on card</span>
            </label>
          </div>
          <FieldInput
            label="Image URL (imported from source)"
            value={d.image_url}
            onChange={(v) => onUpdate({ image_url: v })}
            placeholder="No image on source record"
          />
          {d.image_url ? (
            <ImageFocalPicker
              src={d.image_url}
              x={d.focal_x ?? 50}
              y={d.focal_y ?? 50}
              onChange={({ x, y }: { x: number; y: number }) => onUpdate({ focal_x: x, focal_y: y })}
            />
          ) : (
            <p className="text-[10px] text-muted-foreground">
              No image on the original record. Paste a URL above to add one.
            </p>
          )}
        </div>
      )}
      {isAd && (
        <FieldInput label="Logo URL" value={d.logo_url} onChange={(v) => onUpdate({ logo_url: v })} />
      )}

      {/* Description / ad copy */}
      <div>
        <Label className="text-[11px]">{isAd ? "Ad copy" : "Description"}</Label>
        <Textarea
          className="min-h-[70px] text-xs"
          value={(isAd ? d.ad_copy : d.description) ?? ""}
          onChange={(e) =>
            onUpdate({ [isAd ? "ad_copy" : "description"]: e.target.value || null })
          }
        />
      </div>

      {/* CTA */}
      {!isAd && (
        <FieldInput
          label="Button label"
          value={d.cta_label}
          onChange={(v) => onUpdate({ cta_label: v })}
          placeholder={item.kind === "class" ? "Register" : item.kind === "performance" ? "RSVP" : "Learn More"}
        />
      )}

      {/* Sponsor highlight (events/classes/performances only) */}
      {!isAd && (
        <div className="rounded-md border bg-muted/30 p-2 space-y-2">
          <Label className="text-[11px] font-semibold">Sponsor highlight</Label>
          <p className="text-[10px] text-muted-foreground">
            Adds a "Presented by" callout inside the card.
          </p>
          <Select
            value={d.sponsor?.company_name ?? "__none"}
            onValueChange={(v) => {
              if (v === "__none") return onAttachSponsor(null);
              const sp = sponsors.find((s) => s.company_name === v);
              if (sp) onAttachSponsor(sp);
            }}
          >
            <SelectTrigger className="h-8"><SelectValue placeholder="No sponsor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No sponsor</SelectItem>
              {sponsors.map((sp) => (
                <SelectItem key={sp.id} value={sp.company_name}>{sp.company_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {d.sponsor && (
            <div className="text-[10px] text-muted-foreground">
              Highlighting: <span className="font-medium">{d.sponsor.company_name}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldInput({
  label, value, onChange, placeholder,
}: {
  label: string; value?: string | null; onChange: (v: string | null) => void; placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      <Input
        className="h-8"
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}

function toLocalDt(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalDt(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Renders a PDF document into an iframe via BlobProvider. More robust across
// Vite/React 19 setups than @react-pdf/renderer's built-in <PDFViewer>.
function PdfPreview({ pdfMod, doc }: { pdfMod: any; doc: ReactElement }) {
  const { BlobProvider } = pdfMod;
  return (
    <BlobProvider document={doc}>
      {({ url, loading, error }: { url: string | null; loading: boolean; error: Error | null }) => {
        if (error) {
          return (
            <div className="flex flex-col items-center justify-center h-full text-destructive text-sm px-4 text-center gap-2">
              <p>PDF render failed.</p>
              <p className="text-xs text-muted-foreground">{error.message}</p>
            </div>
          );
        }
        if (loading || !url) {
          return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Rendering PDF…
            </div>
          );
        }
        return (
          <iframe
            src={url}
            title="Guidebook PDF preview"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        );
      }}
    </BlobProvider>
  );
}
