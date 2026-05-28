import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Image as ImageIcon,
  Plus,
  Square,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import {
  fetchGuidebookCanvasData,
  generateMagazineGuidebook,
} from "@/lib/guidebook.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Constants (PDF coordinate space) ────────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const DISPLAY_SCALE = 0.85; // px per pt for on-screen rendering

const SearchSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticated/staff/admin/guidebook-magazine",
)({
  validateSearch: (s) => SearchSchema.parse(s),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: MagazinePage,
});

// ── Types ───────────────────────────────────────────────────────────────
type BlockType = "text" | "image" | "rect";

type Block = {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  bgColor?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  padding?: number;
  imageUrl?: string;
  fit?: "cover" | "contain";
  fill?: string;
  borderColor?: string;
  borderWidth?: number;
};

type Page = { id: string; bgColor?: string; blocks: Block[] };

const STORAGE_KEY = "guidebook-magazine-draft-v1";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function fmtTime(iso: string | null) {
  if (!iso) return "TBA";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDayHeader(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function dateKey(iso: string | null) {
  if (!iso) return "0000-00-00";
  return new Date(iso).toISOString().slice(0, 10);
}

// ── Component ───────────────────────────────────────────────────────────
function MagazinePage() {
  const search = Route.useSearch();
  const [startDate, setStartDate] = useState(search.start || today());
  const [endDate, setEndDate] = useState(search.end || today(30));
  const [title, setTitle] = useState("Community Program Guide");

  const fetcher = useServerFn(fetchGuidebookCanvasData);
  const generate = useServerFn(generateMagazineGuidebook);

  const [pages, setPages] = useState<Page[]>(() => loadDraft() ?? [blankPage()]);
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [data, setData] = useState<Awaited<ReturnType<typeof fetcher>> | null>(
    null,
  );

  const dataQ = useQuery({
    queryKey: ["magazine-data", startDate, endDate],
    queryFn: async () => {
      try {
        const res = await fetcher({ data: { startDate, endDate } });
        setData(res);
        return res;
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load data");
        throw e;
      }
    },
    enabled: false,
  });

  // autosave
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
    } catch {}
  }, [pages]);

  const active = pages[activePageIdx];
  const selected = active?.blocks.find((b) => b.id === selectedId) ?? null;

  // ── Page operations ───────────────────────────────────────────
  const addPage = () => {
    setPages((p) => [...p, blankPage()]);
    setActivePageIdx(pages.length);
    setSelectedId(null);
  };
  const duplicatePage = () => {
    setPages((p) => {
      const next = [...p];
      const clone: Page = {
        ...active,
        id: uid(),
        blocks: active.blocks.map((b) => ({ ...b, id: uid() })),
      };
      next.splice(activePageIdx + 1, 0, clone);
      return next;
    });
    setActivePageIdx((i) => i + 1);
  };
  const deletePage = () => {
    if (pages.length === 1) {
      toast.error("Keep at least one page");
      return;
    }
    setPages((p) => p.filter((_, i) => i !== activePageIdx));
    setActivePageIdx((i) => Math.max(0, i - 1));
    setSelectedId(null);
  };
  const movePage = (dir: -1 | 1) => {
    const j = activePageIdx + dir;
    if (j < 0 || j >= pages.length) return;
    setPages((p) => {
      const next = [...p];
      [next[activePageIdx], next[j]] = [next[j], next[activePageIdx]];
      return next;
    });
    setActivePageIdx(j);
  };

  // ── Block operations ──────────────────────────────────────────
  const updateActivePage = useCallback(
    (mut: (p: Page) => Page) => {
      setPages((prev) =>
        prev.map((p, i) => (i === activePageIdx ? mut(p) : p)),
      );
    },
    [activePageIdx],
  );

  const addBlock = (b: Block) => {
    updateActivePage((p) => ({ ...p, blocks: [...p.blocks, b] }));
    setSelectedId(b.id);
  };
  const updateBlock = (id: string, patch: Partial<Block>) => {
    updateActivePage((p) => ({
      ...p,
      blocks: p.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  };
  const removeBlock = (id: string) => {
    updateActivePage((p) => ({
      ...p,
      blocks: p.blocks.filter((b) => b.id !== id),
    }));
    setSelectedId(null);
  };
  const duplicateBlock = (id: string) => {
    const b = active.blocks.find((x) => x.id === id);
    if (!b) return;
    const clone = { ...b, id: uid(), x: b.x + 12, y: b.y + 12 };
    addBlock(clone);
  };
  const bringForward = (id: string) => {
    updateActivePage((p) => {
      const i = p.blocks.findIndex((b) => b.id === id);
      if (i < 0 || i === p.blocks.length - 1) return p;
      const next = [...p.blocks];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return { ...p, blocks: next };
    });
  };
  const sendBackward = (id: string) => {
    updateActivePage((p) => {
      const i = p.blocks.findIndex((b) => b.id === id);
      if (i <= 0) return p;
      const next = [...p.blocks];
      [next[i], next[i - 1]] = [next[i - 1], next[i]];
      return { ...p, blocks: next };
    });
  };

  // ── Auto-build pages from data ────────────────────────────────
  const buildFromData = () => {
    if (!data) {
      toast.error("Load data first");
      return;
    }
    const generated = buildMagazineFromData(title, data);
    setPages(generated);
    setActivePageIdx(0);
    setSelectedId(null);
    toast.success(`Generated ${generated.length} pages — edit freely.`);
  };

  // ── Export ────────────────────────────────────────────────────
  const exportMut = useMutation({
    mutationFn: () =>
      generate({
        data: {
          title,
          pages: pages.map((p) => ({
            id: p.id,
            bgColor: p.bgColor ?? null,
            blocks: p.blocks.map((b) => ({
              id: b.id,
              type: b.type,
              x: b.x,
              y: b.y,
              w: b.w,
              h: b.h,
              text: b.text ?? null,
              fontSize: b.fontSize ?? null,
              bold: b.bold ?? null,
              italic: b.italic ?? null,
              color: b.color ?? null,
              bgColor: b.bgColor ?? null,
              align: b.align ?? null,
              lineHeight: b.lineHeight ?? null,
              padding: b.padding ?? null,
              imageUrl: b.imageUrl ?? null,
              fit: b.fit ?? null,
              fill: b.fill ?? null,
              borderColor: b.borderColor ?? null,
              borderWidth: b.borderWidth ?? null,
            })),
          })),
        },
      }),
    onSuccess: (result) => {
      const bin = atob(result.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`PDF exported (${result.pageCount} pages).`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Export failed"),
  });

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="border-b bg-white px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link
          to="/staff/admin/guidebook"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Guidebook
        </Link>
        <h1 className="text-lg font-semibold">Magazine Layout Builder</h1>
        <Input
          className="max-w-xs"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Guide title"
        />
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-36"
          />
          <span className="text-muted-foreground">→</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-36"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={dataQ.isFetching}
            onClick={() => dataQ.refetch()}
          >
            {dataQ.isFetching ? "Loading…" : data ? "Reload data" : "Load data"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!data}
            onClick={buildFromData}
          >
            <Wand2 className="h-4 w-4" /> Auto-build pages
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {data && (
            <Badge variant="outline" className="font-normal">
              {data.events.length} events · {data.gigs.length} gigs ·{" "}
              {data.classes.length} classes · {data.sponsors.length} ads
            </Badge>
          )}
          <Button
            type="button"
            disabled={exportMut.isPending}
            onClick={() => exportMut.mutate()}
          >
            {exportMut.isPending ? "Exporting…" : "Export PDF"}
          </Button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-57px)]">
        {/* Left: page navigator */}
        <aside className="w-44 border-r bg-white overflow-y-auto p-2 space-y-2">
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="flex-1" onClick={addPage}>
              <Plus className="h-4 w-4" /> Page
            </Button>
            <Button size="icon" variant="ghost" onClick={duplicatePage} title="Duplicate page">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={() => movePage(-1)} title="Move up">
              <ChevronLeft className="h-4 w-4 rotate-90" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => movePage(1)} title="Move down">
              <ChevronRight className="h-4 w-4 rotate-90" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={deletePage}
              title="Delete page"
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2 pt-2">
            {pages.map((p, i) => (
              <button
                type="button"
                key={p.id}
                onClick={() => {
                  setActivePageIdx(i);
                  setSelectedId(null);
                }}
                className={`block w-full overflow-hidden rounded border text-left ${
                  i === activePageIdx ? "ring-2 ring-primary" : ""
                }`}
              >
                <PageThumb page={p} />
                <div className="px-1 py-0.5 text-[10px] text-muted-foreground">
                  Page {i + 1}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Center: canvas */}
        <main className="flex-1 overflow-auto p-6 flex items-start justify-center">
          {active && (
            <Canvas
              page={active}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUpdateBlock={updateBlock}
            />
          )}
        </main>

        {/* Right: inspector + add palette */}
        <aside className="w-72 border-l bg-white overflow-y-auto">
          <div className="border-b p-3 space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Add block
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  addBlock({
                    id: uid(),
                    type: "text",
                    x: 60,
                    y: 60,
                    w: 280,
                    h: 60,
                    text: "Edit me",
                    fontSize: 18,
                    color: "#111111",
                    align: "left",
                    padding: 6,
                  })
                }
              >
                <Type className="h-4 w-4" /> Text
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  addBlock({
                    id: uid(),
                    type: "image",
                    x: 60,
                    y: 60,
                    w: 240,
                    h: 180,
                    imageUrl: "",
                    fit: "cover",
                  })
                }
              >
                <ImageIcon className="h-4 w-4" /> Image
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  addBlock({
                    id: uid(),
                    type: "rect",
                    x: 60,
                    y: 60,
                    w: 200,
                    h: 80,
                    fill: "#5fbf7a",
                  })
                }
              >
                <Square className="h-4 w-4" /> Shape
              </Button>
            </div>
            <div>
              <Label className="text-xs">Page background</Label>
              <Input
                type="color"
                value={active?.bgColor ?? "#ffffff"}
                onChange={(e) =>
                  updateActivePage((p) => ({ ...p, bgColor: e.target.value }))
                }
                className="h-9"
              />
            </div>
            {data && (
              <div className="pt-2 space-y-1">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Insert from data
                </div>
                <DataInserter data={data} onInsert={addBlock} />
              </div>
            )}
          </div>

          <div className="p-3">
            {selected ? (
              <Inspector
                block={selected}
                onChange={(patch) => updateBlock(selected.id, patch)}
                onRemove={() => removeBlock(selected.id)}
                onDuplicate={() => duplicateBlock(selected.id)}
                onForward={() => bringForward(selected.id)}
                onBackward={() => sendBackward(selected.id)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Click a block on the page to edit. Drag to move, drag the
                bottom-right corner to resize.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Canvas (the editable page) ──────────────────────────────────────────
function Canvas({
  page,
  selectedId,
  onSelect,
  onUpdateBlock,
}: {
  page: Page;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateBlock: (id: string, patch: Partial<Block>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative bg-white shadow-xl"
      style={{
        width: PAGE_W * DISPLAY_SCALE,
        height: PAGE_H * DISPLAY_SCALE,
        background: page.bgColor ?? "#ffffff",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      {page.blocks.map((b) => (
        <BlockView
          key={b.id}
          block={b}
          selected={b.id === selectedId}
          onSelect={() => onSelect(b.id)}
          onChange={(patch) => onUpdateBlock(b.id, patch)}
        />
      ))}
    </div>
  );
}

function BlockView({
  block,
  selected,
  onSelect,
  onChange,
}: {
  block: Block;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Block>) => void;
}) {
  const startDrag = (e: React.MouseEvent, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { x: block.x, y: block.y, w: block.w, h: block.h };
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / DISPLAY_SCALE;
      const dy = (ev.clientY - startY) / DISPLAY_SCALE;
      if (mode === "move") {
        onChange({
          x: Math.max(0, Math.min(PAGE_W - orig.w, Math.round(orig.x + dx))),
          y: Math.max(0, Math.min(PAGE_H - orig.h, Math.round(orig.y + dy))),
        });
      } else {
        onChange({
          w: Math.max(20, Math.round(orig.w + dx)),
          h: Math.max(20, Math.round(orig.h + dy)),
        });
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const style: React.CSSProperties = {
    position: "absolute",
    left: block.x * DISPLAY_SCALE,
    top: block.y * DISPLAY_SCALE,
    width: block.w * DISPLAY_SCALE,
    height: block.h * DISPLAY_SCALE,
    boxSizing: "border-box",
    cursor: "move",
    outline: selected ? "2px solid #2563eb" : "1px dashed rgba(0,0,0,0.08)",
  };

  return (
    <div style={style} onMouseDown={(e) => startDrag(e, "move")}>
      {block.type === "rect" && (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: block.fill ?? "transparent",
            border: block.borderColor
              ? `${block.borderWidth ?? 1}px solid ${block.borderColor}`
              : undefined,
          }}
        />
      )}
      {block.type === "image" && (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: block.imageUrl
              ? `${block.fit === "contain" ? "no-repeat center / contain" : "no-repeat center / cover"} url(${JSON.stringify(block.imageUrl)})`
              : "repeating-linear-gradient(45deg,#eee,#eee 6px,#f5f5f5 6px,#f5f5f5 12px)",
          }}
        >
          {!block.imageUrl && (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Image URL…
            </div>
          )}
        </div>
      )}
      {block.type === "text" && (
        <div
          style={{
            width: "100%",
            height: "100%",
            padding: (block.padding ?? 6) * DISPLAY_SCALE,
            background: block.bgColor ?? "transparent",
            color: block.color ?? "#111",
            fontSize: (block.fontSize ?? 12) * DISPLAY_SCALE,
            lineHeight: block.lineHeight ?? 1.2,
            fontWeight: block.bold ? 700 : 400,
            fontStyle: block.italic ? "italic" : "normal",
            textAlign: block.align ?? "left",
            overflow: "hidden",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          {block.text || ""}
        </div>
      )}
      {selected && (
        <div
          onMouseDown={(e) => startDrag(e, "resize")}
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: "#2563eb",
            cursor: "nwse-resize",
            borderRadius: 2,
          }}
        />
      )}
    </div>
  );
}

// ── Inspector ───────────────────────────────────────────────────────────
function Inspector({
  block,
  onChange,
  onRemove,
  onDuplicate,
  onForward,
  onBackward,
}: {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onForward: () => void;
  onBackward: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{block.type}</Badge>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onBackward} title="Send back">
            ↓
          </Button>
          <Button size="sm" variant="ghost" onClick={onForward} title="Bring forward">
            ↑
          </Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate} title="Duplicate">
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={onRemove}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        <NumField label="X" value={block.x} onChange={(v) => onChange({ x: v })} />
        <NumField label="Y" value={block.y} onChange={(v) => onChange({ y: v })} />
        <NumField label="W" value={block.w} onChange={(v) => onChange({ w: v })} />
        <NumField label="H" value={block.h} onChange={(v) => onChange({ h: v })} />
      </div>

      {block.type === "text" && (
        <>
          <div>
            <Label className="text-xs">Text</Label>
            <Textarea
              rows={4}
              value={block.text ?? ""}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Font size"
              value={block.fontSize ?? 12}
              onChange={(v) => onChange({ fontSize: v })}
            />
            <div>
              <Label className="text-xs">Align</Label>
              <Select
                value={block.align ?? "left"}
                onValueChange={(v) => onChange({ align: v as any })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={!!block.bold}
                onCheckedChange={(v) => onChange({ bold: v })}
              />
              Bold
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={!!block.italic}
                onCheckedChange={(v) => onChange({ italic: v })}
              />
              Italic
            </label>
          </div>
          <ColorField
            label="Text color"
            value={block.color ?? "#111111"}
            onChange={(v) => onChange({ color: v })}
          />
          <ColorField
            label="Background"
            value={block.bgColor ?? "#ffffff"}
            onChange={(v) => onChange({ bgColor: v })}
            allowClear
            onClear={() => onChange({ bgColor: undefined })}
          />
        </>
      )}

      {block.type === "image" && (
        <>
          <div>
            <Label className="text-xs">Image URL</Label>
            <Input
              value={block.imageUrl ?? ""}
              onChange={(e) => onChange({ imageUrl: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div>
            <Label className="text-xs">Fit</Label>
            <Select
              value={block.fit ?? "cover"}
              onValueChange={(v) => onChange({ fit: v as any })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">Cover (fill, may crop)</SelectItem>
                <SelectItem value="contain">Contain (fit, letterbox)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {block.type === "rect" && (
        <>
          <ColorField
            label="Fill"
            value={block.fill ?? "#cccccc"}
            onChange={(v) => onChange({ fill: v })}
            allowClear
            onClear={() => onChange({ fill: undefined })}
          />
          <ColorField
            label="Border"
            value={block.borderColor ?? "#000000"}
            onChange={(v) => onChange({ borderColor: v })}
            allowClear
            onClear={() => onChange({ borderColor: undefined })}
          />
          <NumField
            label="Border width"
            value={block.borderWidth ?? 0}
            onChange={(v) => onChange({ borderWidth: v })}
          />
        </>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-9"
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  allowClear,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowClear?: boolean;
  onClear?: () => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-14 p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 flex-1"
        />
        {allowClear && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Data Inserter ───────────────────────────────────────────────────────
function DataInserter({
  data,
  onInsert,
}: {
  data: NonNullable<any>;
  onInsert: (b: Block) => void;
}) {
  const [open, setOpen] = useState<"events" | "gigs" | "classes" | "ads" | null>(
    null,
  );

  const insertEvent = (e: any) => {
    // Multi-block composition: image + title + time
    const baseX = 60;
    const baseY = 80;
    if (e.image_url) {
      onInsert({
        id: uid(),
        type: "image",
        x: baseX,
        y: baseY,
        w: 240,
        h: 180,
        imageUrl: e.image_url,
        fit: "cover",
      });
    }
    onInsert({
      id: uid(),
      type: "text",
      x: baseX,
      y: baseY + (e.image_url ? 190 : 0),
      w: 240,
      h: 36,
      text: e.title,
      fontSize: 18,
      bold: true,
      color: "#0f1b3d",
    });
    onInsert({
      id: uid(),
      type: "text",
      x: baseX,
      y: baseY + (e.image_url ? 226 : 36),
      w: 240,
      h: 60,
      text: `${fmtTime(e.start_time)}${e.end_time ? `–${fmtTime(e.end_time)}` : ""}\n${e.venue_name ?? ""}${e.location_name ? ` · ${e.location_name}` : ""}${e.description ? `\n${e.description}` : ""}`,
      fontSize: 10,
      color: "#444444",
    });
  };
  const insertGig = (g: any) => {
    onInsert({
      id: uid(),
      type: "text",
      x: 60,
      y: 80,
      w: 280,
      h: 30,
      text: g.title || g.artist_name || "Performance",
      fontSize: 16,
      bold: true,
      color: "#0f1b3d",
    });
    onInsert({
      id: uid(),
      type: "text",
      x: 60,
      y: 112,
      w: 280,
      h: 50,
      text: `${fmtTime(g.start_time)}${g.end_time ? `–${fmtTime(g.end_time)}` : ""}\n${[g.artist_name, g.stage_name, g.venue_name].filter(Boolean).join(" · ")}`,
      fontSize: 10,
      color: "#444",
    });
  };
  const insertClass = (c: any) => {
    onInsert({
      id: uid(),
      type: "text",
      x: 60,
      y: 80,
      w: 280,
      h: 30,
      text: c.course_title,
      fontSize: 16,
      bold: true,
      color: "#0f1b3d",
    });
    onInsert({
      id: uid(),
      type: "text",
      x: 60,
      y: 112,
      w: 280,
      h: 60,
      text: `${fmtTime(c.start_time)}\n${c.instructor_name ?? ""}${c.room_name ? ` · ${c.room_name}` : ""}${c.price > 0 ? ` · $${c.price.toFixed(2)}` : " · Free"}`,
      fontSize: 10,
      color: "#444",
    });
  };
  const insertAd = (s: any) => {
    onInsert({
      id: uid(),
      type: "rect",
      x: 60,
      y: 60,
      w: 280,
      h: 180,
      fill: "#fff8e6",
      borderColor: "#d4a84a",
      borderWidth: 1.5,
    });
    if (s.logo_url) {
      onInsert({
        id: uid(),
        type: "image",
        x: 70,
        y: 70,
        w: 120,
        h: 120,
        imageUrl: s.logo_url,
        fit: "contain",
      });
    }
    onInsert({
      id: uid(),
      type: "text",
      x: 200,
      y: 80,
      w: 130,
      h: 30,
      text: s.company_name,
      fontSize: 14,
      bold: true,
      color: "#0f1b3d",
    });
    if (s.ad_copy)
      onInsert({
        id: uid(),
        type: "text",
        x: 200,
        y: 112,
        w: 130,
        h: 120,
        text: s.ad_copy,
        fontSize: 9,
        color: "#444",
      });
  };

  const groups: Array<[string, "events" | "gigs" | "classes" | "ads", any[]]> = [
    ["Events", "events", data.events],
    ["Performances", "gigs", data.gigs],
    ["Classes", "classes", data.classes],
    ["Sponsor ads", "ads", data.sponsors],
  ];

  return (
    <div className="space-y-1">
      {groups.map(([label, key, list]) => (
        <div key={key} className="border rounded">
          <button
            type="button"
            className="flex w-full items-center justify-between px-2 py-1 text-xs hover:bg-muted/50"
            onClick={() => setOpen(open === key ? null : key)}
          >
            <span>
              {label} <span className="text-muted-foreground">({list.length})</span>
            </span>
            <span>{open === key ? "−" : "+"}</span>
          </button>
          {open === key && (
            <div className="max-h-48 overflow-y-auto p-1 space-y-1">
              {list.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">None</p>
              )}
              {list.map((it: any) => (
                <button
                  key={it.id}
                  type="button"
                  className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted"
                  onClick={() => {
                    if (key === "events") insertEvent(it);
                    else if (key === "gigs") insertGig(it);
                    else if (key === "classes") insertClass(it);
                    else insertAd(it);
                  }}
                >
                  {it.title ?? it.course_title ?? it.company_name ?? "Item"}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Page thumbnail ──────────────────────────────────────────────────────
function PageThumb({ page }: { page: Page }) {
  const s = 0.18;
  return (
    <div
      className="relative"
      style={{
        width: PAGE_W * s,
        height: PAGE_H * s,
        background: page.bgColor ?? "#fff",
      }}
    >
      {page.blocks.map((b) => (
        <div
          key={b.id}
          style={{
            position: "absolute",
            left: b.x * s,
            top: b.y * s,
            width: b.w * s,
            height: b.h * s,
            background:
              b.type === "rect"
                ? b.fill ?? "transparent"
                : b.type === "text"
                  ? b.bgColor ?? "transparent"
                  : "#ddd",
            border:
              b.type === "image" && !b.imageUrl ? "1px dashed #bbb" : undefined,
            color: b.color ?? "#111",
            fontSize: Math.max(2, (b.fontSize ?? 12) * s),
            fontWeight: b.bold ? 700 : 400,
            overflow: "hidden",
          }}
        >
          {b.type === "text" ? b.text : null}
        </div>
      ))}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────
function blankPage(): Page {
  return { id: uid(), bgColor: "#ffffff", blocks: [] };
}

function loadDraft(): Page[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return null;
}

// Auto-generates a magazine-style multi-page layout inspired by classic
// weekly-program flyers. Users edit freely after generation.
function buildMagazineFromData(
  title: string,
  data: {
    events: any[];
    gigs: any[];
    classes: any[];
    sponsors: any[];
  },
): Page[] {
  const pages: Page[] = [];

  // ── Cover page ──
  const cover: Page = {
    id: uid(),
    bgColor: "#ffffff",
    blocks: [
      {
        id: uid(),
        type: "rect",
        x: 0,
        y: 0,
        w: PAGE_W,
        h: 240,
        fill: "#5fbf7a",
      },
      {
        id: uid(),
        type: "text",
        x: 40,
        y: 60,
        w: PAGE_W - 80,
        h: 36,
        text: "COMMUNITY PROGRAM",
        fontSize: 14,
        bold: true,
        color: "#ffffff",
      },
      {
        id: uid(),
        type: "text",
        x: 40,
        y: 100,
        w: PAGE_W - 80,
        h: 80,
        text: title,
        fontSize: 44,
        bold: true,
        color: "#ffffff",
      },
      {
        id: uid(),
        type: "text",
        x: 40,
        y: 190,
        w: PAGE_W - 80,
        h: 30,
        text: "weekly programs",
        fontSize: 14,
        italic: true,
        color: "#ffffff",
      },
      {
        id: uid(),
        type: "text",
        x: 40,
        y: 280,
        w: PAGE_W - 80,
        h: 30,
        text: `${data.events.length} events · ${data.gigs.length} performances · ${data.classes.length} classes`,
        fontSize: 12,
        color: "#444",
      },
    ],
  };
  // hero sponsor logo
  const hero = data.sponsors[0];
  if (hero?.logo_url) {
    cover.blocks.push({
      id: uid(),
      type: "image",
      x: PAGE_W / 2 - 100,
      y: PAGE_H - 260,
      w: 200,
      h: 160,
      imageUrl: hero.logo_url,
      fit: "contain",
    });
    cover.blocks.push({
      id: uid(),
      type: "text",
      x: 40,
      y: PAGE_H - 90,
      w: PAGE_W - 80,
      h: 24,
      text: `Presented in partnership with ${hero.company_name}`,
      fontSize: 11,
      italic: true,
      align: "center",
      color: "#555",
    });
  }
  pages.push(cover);

  // ── One page per day with events ──
  const eventsByDay = new Map<string, any[]>();
  for (const e of data.events) {
    const k = dateKey(e.start_time);
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k)!.push(e);
  }
  const days = Array.from(eventsByDay.keys()).sort();
  let sponsorIdx = 0;
  for (const day of days) {
    const dayEvents = eventsByDay
      .get(day)!
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
    const page: Page = {
      id: uid(),
      bgColor: "#ffffff",
      blocks: [
        // header band
        { id: uid(), type: "rect", x: 0, y: 0, w: PAGE_W, h: 90, fill: "#5fbf7a" },
        {
          id: uid(),
          type: "text",
          x: 40,
          y: 20,
          w: PAGE_W - 80,
          h: 30,
          text: title.toUpperCase(),
          fontSize: 11,
          bold: true,
          color: "#ffffff",
        },
        {
          id: uid(),
          type: "text",
          x: 40,
          y: 42,
          w: PAGE_W - 80,
          h: 40,
          text: fmtDayHeader(day),
          fontSize: 28,
          bold: true,
          color: "#ffffff",
        },
      ],
    };

    // Optional hero image from first event
    const heroEvent = dayEvents.find((e) => e.image_url);
    let listY = 130;
    let listX = 40;
    let listW = PAGE_W - 80;
    if (heroEvent?.image_url) {
      page.blocks.push({
        id: uid(),
        type: "image",
        x: 40,
        y: 110,
        w: 260,
        h: 220,
        imageUrl: heroEvent.image_url,
        fit: "cover",
      });
      listX = 320;
      listW = PAGE_W - 320 - 40;
      listY = 110;
    }

    // Event listing
    let cursorY = listY;
    for (const e of dayEvents.slice(0, 8)) {
      // letter day badge
      page.blocks.push({
        id: uid(),
        type: "text",
        x: listX,
        y: cursorY,
        w: 32,
        h: 32,
        text: dayLetter(e.start_time),
        fontSize: 18,
        bold: true,
        color: "#5fbf7a",
        bgColor: "#f0f0f0",
        align: "center",
      });
      page.blocks.push({
        id: uid(),
        type: "text",
        x: listX + 40,
        y: cursorY - 2,
        w: listW - 40,
        h: 22,
        text: (e.title ?? "").toUpperCase(),
        fontSize: 11,
        bold: true,
        color: "#0f1b3d",
      });
      page.blocks.push({
        id: uid(),
        type: "text",
        x: listX + 40,
        y: cursorY + 18,
        w: listW - 40,
        h: 36,
        text: `${fmtTime(e.start_time)}${e.end_time ? `–${fmtTime(e.end_time)}` : ""}  ·  ${e.venue_name ?? ""}${e.description ? `\n${e.description}` : ""}`,
        fontSize: 9,
        color: "#555",
      });
      cursorY += 70;
      if (cursorY > PAGE_H - 200) break;
    }

    // Sponsor band at bottom
    const sponsor = data.sponsors[sponsorIdx % Math.max(1, data.sponsors.length)];
    if (data.sponsors.length) {
      sponsorIdx++;
      page.blocks.push({
        id: uid(),
        type: "rect",
        x: 0,
        y: PAGE_H - 100,
        w: PAGE_W,
        h: 100,
        fill: "#fff4d6",
      });
      page.blocks.push({
        id: uid(),
        type: "text",
        x: 40,
        y: PAGE_H - 84,
        w: PAGE_W - 80,
        h: 18,
        text: "SPONSORED",
        fontSize: 9,
        bold: true,
        color: "#c97a00",
      });
      page.blocks.push({
        id: uid(),
        type: "text",
        x: 40,
        y: PAGE_H - 64,
        w: PAGE_W - 200,
        h: 24,
        text: sponsor.company_name,
        fontSize: 16,
        bold: true,
        color: "#0f1b3d",
      });
      if (sponsor.ad_copy)
        page.blocks.push({
          id: uid(),
          type: "text",
          x: 40,
          y: PAGE_H - 40,
          w: PAGE_W - 200,
          h: 30,
          text: sponsor.ad_copy,
          fontSize: 9,
          color: "#444",
        });
      if (sponsor.logo_url)
        page.blocks.push({
          id: uid(),
          type: "image",
          x: PAGE_W - 140,
          y: PAGE_H - 88,
          w: 100,
          h: 76,
          imageUrl: sponsor.logo_url,
          fit: "contain",
        });
    }
    pages.push(page);
  }

  // ── StreetBeats page ──
  if (data.gigs.length) {
    const page: Page = {
      id: uid(),
      bgColor: "#ffffff",
      blocks: [
        { id: uid(), type: "rect", x: 0, y: 0, w: PAGE_W, h: 90, fill: "#0f1b3d" },
        {
          id: uid(),
          type: "text",
          x: 40,
          y: 30,
          w: PAGE_W - 80,
          h: 40,
          text: "StreetBeats Performances",
          fontSize: 26,
          bold: true,
          color: "#ffffff",
        },
      ],
    };
    let y = 120;
    for (const g of data.gigs.slice(0, 14)) {
      page.blocks.push({
        id: uid(),
        type: "text",
        x: 40,
        y,
        w: 100,
        h: 20,
        text: fmtTime(g.start_time),
        fontSize: 11,
        bold: true,
        color: "#0f1b3d",
      });
      page.blocks.push({
        id: uid(),
        type: "text",
        x: 150,
        y,
        w: PAGE_W - 200,
        h: 20,
        text: g.title || g.artist_name || "Performance",
        fontSize: 12,
        bold: true,
        color: "#0f1b3d",
      });
      page.blocks.push({
        id: uid(),
        type: "text",
        x: 150,
        y: y + 16,
        w: PAGE_W - 200,
        h: 16,
        text: [g.artist_name, g.artist_genre, g.stage_name, g.venue_name]
          .filter(Boolean)
          .join(" · "),
        fontSize: 9,
        color: "#666",
      });
      y += 40;
    }
    pages.push(page);
  }

  // ── Classes page ──
  if (data.classes.length) {
    const page: Page = {
      id: uid(),
      bgColor: "#ffffff",
      blocks: [
        { id: uid(), type: "rect", x: 0, y: 0, w: PAGE_W, h: 90, fill: "#c97a00" },
        {
          id: uid(),
          type: "text",
          x: 40,
          y: 30,
          w: PAGE_W - 80,
          h: 40,
          text: "Classes",
          fontSize: 26,
          bold: true,
          color: "#ffffff",
        },
      ],
    };
    let y = 120;
    for (const c of data.classes.slice(0, 12)) {
      if (c.image_url) {
        page.blocks.push({
          id: uid(),
          type: "image",
          x: 40,
          y,
          w: 80,
          h: 60,
          imageUrl: c.image_url,
          fit: "cover",
        });
      }
      const tx = c.image_url ? 132 : 40;
      const tw = PAGE_W - tx - 40;
      page.blocks.push({
        id: uid(),
        type: "text",
        x: tx,
        y,
        w: tw,
        h: 22,
        text: c.course_title,
        fontSize: 14,
        bold: true,
        color: "#0f1b3d",
      });
      page.blocks.push({
        id: uid(),
        type: "text",
        x: tx,
        y: y + 22,
        w: tw,
        h: 36,
        text: `${fmtTime(c.start_time)}  ·  ${c.instructor_name ?? ""}${c.room_name ? ` · ${c.room_name}` : ""}  ·  ${c.price > 0 ? `$${c.price.toFixed(2)}` : "Free"}${c.description ? `\n${c.description}` : ""}`,
        fontSize: 9,
        color: "#555",
      });
      y += 80;
      if (y > PAGE_H - 80) break;
    }
    pages.push(page);
  }

  return pages;
}

function dayLetter(iso: string | null) {
  if (!iso) return "·";
  const d = new Date(iso);
  return ["SU", "M", "TU", "W", "TH", "F", "SA"][d.getDay()];
}
