import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Group,
  Hexagon,
  Image as ImageIcon,
  Minus,
  Plus,
  Square,
  Star,
  Trash2,
  Triangle,
  Type,
  Ungroup,
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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

// ── Constants ───────────────────────────────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const DISPLAY_SCALE = 0.85;

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
type ShapeKind =
  | "rect"
  | "circle"
  | "ellipse"
  | "triangle"
  | "hexagon"
  | "star"
  | "line";
type FrameKind = "rect" | "rounded" | "circle" | "hexagon";

type Block = {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  groupId?: string;
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
  frame?: FrameKind;
  shape?: ShapeKind;
  fill?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
};

type Page = { id: string; bgColor?: string; blocks: Block[] };

const STORAGE_KEY = "guidebook-magazine-draft-v2";

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
  const [editGroupChild, setEditGroupChild] = useState(false); // when true, click selects single block within group
  const [data, setData] = useState<Awaited<ReturnType<typeof fetcher>> | null>(
    null,
  );

  // field-picker state
  const [picker, setPicker] = useState<{
    kind: "event" | "gig" | "class" | "ad";
    item: any;
  } | null>(null);

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
    } catch {}
  }, [pages]);

  const active = pages[activePageIdx];
  const selected = active?.blocks.find((b) => b.id === selectedId) ?? null;
  const selectedGroupIds = useMemo(() => {
    if (!selected || !active) return new Set<string>();
    if (selected.groupId && !editGroupChild) {
      return new Set(
        active.blocks.filter((b) => b.groupId === selected.groupId).map((b) => b.id),
      );
    }
    return new Set([selected.id]);
  }, [selected, active, editGroupChild]);

  // ── Page ops ──
  const addPage = () => {
    setPages((p) => [...p, blankPage()]);
    setActivePageIdx(pages.length);
    setSelectedId(null);
  };
  const duplicatePage = () => {
    setPages((p) => {
      const next = [...p];
      const idMap = new Map<string, string>();
      const blocks = active.blocks.map((b) => {
        const newId = uid();
        idMap.set(b.id, newId);
        return { ...b, id: newId };
      });
      // remap groupIds (keep grouping)
      const gMap = new Map<string, string>();
      blocks.forEach((b) => {
        if (b.groupId) {
          if (!gMap.has(b.groupId)) gMap.set(b.groupId, uid());
          b.groupId = gMap.get(b.groupId);
        }
      });
      const clone: Page = { ...active, id: uid(), blocks };
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

  // ── Block ops ──
  const updateActivePage = useCallback(
    (mut: (p: Page) => Page) => {
      setPages((prev) => prev.map((p, i) => (i === activePageIdx ? mut(p) : p)));
    },
    [activePageIdx],
  );

  const addBlock = (b: Block) => {
    updateActivePage((p) => ({ ...p, blocks: [...p.blocks, b] }));
    setSelectedId(b.id);
  };
  const addBlocks = (bs: Block[]) => {
    if (!bs.length) return;
    updateActivePage((p) => ({ ...p, blocks: [...p.blocks, ...bs] }));
    setSelectedId(bs[0].id);
  };
  const updateBlock = (id: string, patch: Partial<Block>) => {
    updateActivePage((p) => ({
      ...p,
      blocks: p.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  };
  // Move every block in the same group together (delta only)
  const moveBlockOrGroup = (id: string, dx: number, dy: number) => {
    updateActivePage((p) => {
      const b = p.blocks.find((x) => x.id === id);
      if (!b) return p;
      const targets =
        b.groupId && !editGroupChild
          ? new Set(p.blocks.filter((x) => x.groupId === b.groupId).map((x) => x.id))
          : new Set([id]);
      return {
        ...p,
        blocks: p.blocks.map((x) =>
          targets.has(x.id)
            ? {
                ...x,
                x: Math.max(0, Math.min(PAGE_W - x.w, Math.round(x.x + dx))),
                y: Math.max(0, Math.min(PAGE_H - x.h, Math.round(x.y + dy))),
              }
            : x,
        ),
      };
    });
  };
  const removeSelection = () => {
    if (!selected) return;
    updateActivePage((p) => {
      const targets =
        selected.groupId && !editGroupChild
          ? new Set(p.blocks.filter((x) => x.groupId === selected.groupId).map((x) => x.id))
          : new Set([selected.id]);
      return { ...p, blocks: p.blocks.filter((b) => !targets.has(b.id)) };
    });
    setSelectedId(null);
  };
  const duplicateSelection = () => {
    if (!selected) return;
    updateActivePage((p) => {
      const members =
        selected.groupId && !editGroupChild
          ? p.blocks.filter((b) => b.groupId === selected.groupId)
          : [selected];
      const newGroup = selected.groupId ? uid() : undefined;
      const clones = members.map((b) => ({
        ...b,
        id: uid(),
        x: b.x + 12,
        y: b.y + 12,
        groupId: newGroup ?? b.groupId,
      }));
      return { ...p, blocks: [...p.blocks, ...clones] };
    });
  };
  const bringForward = () => {
    if (!selected) return;
    updateActivePage((p) => {
      const i = p.blocks.findIndex((b) => b.id === selected.id);
      if (i < 0 || i === p.blocks.length - 1) return p;
      const next = [...p.blocks];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return { ...p, blocks: next };
    });
  };
  const sendBackward = () => {
    if (!selected) return;
    updateActivePage((p) => {
      const i = p.blocks.findIndex((b) => b.id === selected.id);
      if (i <= 0) return p;
      const next = [...p.blocks];
      [next[i], next[i - 1]] = [next[i - 1], next[i]];
      return { ...p, blocks: next };
    });
  };
  const ungroupSelection = () => {
    if (!selected?.groupId) return;
    const g = selected.groupId;
    updateActivePage((p) => ({
      ...p,
      blocks: p.blocks.map((b) => (b.groupId === g ? { ...b, groupId: undefined } : b)),
    }));
    toast.success("Ungrouped");
  };
  const groupSelectionWith = () => {
    // Group selected block + neighbors? Simpler: re-group the currently highlighted ids
    if (!selected) return;
    const g = uid();
    const ids = Array.from(selectedGroupIds);
    if (ids.length < 2) {
      toast.message("Select a group (or use field picker to insert one).");
      return;
    }
    updateActivePage((p) => ({
      ...p,
      blocks: p.blocks.map((b) => (ids.includes(b.id) ? { ...b, groupId: g } : b)),
    }));
  };

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

  // ── Export ──
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
              groupId: b.groupId ?? null,
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
              frame: b.frame ?? null,
              shape: b.shape ?? null,
              fill: b.fill ?? null,
              borderColor: b.borderColor ?? null,
              borderWidth: b.borderWidth ?? null,
              radius: b.radius ?? null,
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
            <Wand2 className="h-4 w-4" /> Auto-build
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
        {/* Pages */}
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

        {/* Canvas */}
        <main className="flex-1 overflow-auto p-6 flex items-start justify-center">
          {active && (
            <Canvas
              page={active}
              selectedIds={selectedGroupIds}
              primaryId={selectedId}
              onSelect={setSelectedId}
              onMove={moveBlockOrGroup}
              onResize={(id, w, h) => updateBlock(id, { w, h })}
            />
          )}
        </main>

        {/* Inspector */}
        <aside className="w-80 border-l bg-white overflow-y-auto">
          <div className="border-b p-3 space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Add block
            </div>
            <div className="grid grid-cols-4 gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                title="Text"
                onClick={() =>
                  addBlock({
                    id: uid(),
                    type: "text",
                    x: 60, y: 60, w: 280, h: 60,
                    text: "Edit me", fontSize: 18, color: "#111111",
                    align: "left", padding: 6,
                  })
                }
              ><Type className="h-4 w-4" /></Button>
              <Button
                type="button" variant="outline" size="sm" title="Image"
                onClick={() =>
                  addBlock({
                    id: uid(), type: "image",
                    x: 60, y: 60, w: 240, h: 180,
                    imageUrl: "", fit: "cover", frame: "rect",
                  })
                }
              ><ImageIcon className="h-4 w-4" /></Button>
              <Button
                type="button" variant="outline" size="sm" title="Rectangle"
                onClick={() =>
                  addBlock({
                    id: uid(), type: "rect", shape: "rect",
                    x: 60, y: 60, w: 200, h: 80, fill: "#5fbf7a",
                  })
                }
              ><Square className="h-4 w-4" /></Button>
              <Button
                type="button" variant="outline" size="sm" title="Circle"
                onClick={() =>
                  addBlock({
                    id: uid(), type: "rect", shape: "circle",
                    x: 60, y: 60, w: 120, h: 120, fill: "#5fbf7a",
                  })
                }
              ><Circle className="h-4 w-4" /></Button>
              <Button
                type="button" variant="outline" size="sm" title="Triangle"
                onClick={() =>
                  addBlock({
                    id: uid(), type: "rect", shape: "triangle",
                    x: 60, y: 60, w: 140, h: 120, fill: "#5fbf7a",
                  })
                }
              ><Triangle className="h-4 w-4" /></Button>
              <Button
                type="button" variant="outline" size="sm" title="Hexagon"
                onClick={() =>
                  addBlock({
                    id: uid(), type: "rect", shape: "hexagon",
                    x: 60, y: 60, w: 140, h: 120, fill: "#5fbf7a",
                  })
                }
              ><Hexagon className="h-4 w-4" /></Button>
              <Button
                type="button" variant="outline" size="sm" title="Star"
                onClick={() =>
                  addBlock({
                    id: uid(), type: "rect", shape: "star",
                    x: 60, y: 60, w: 140, h: 140, fill: "#f5b400",
                  })
                }
              ><Star className="h-4 w-4" /></Button>
              <Button
                type="button" variant="outline" size="sm" title="Line"
                onClick={() =>
                  addBlock({
                    id: uid(), type: "rect", shape: "line",
                    x: 60, y: 60, w: 200, h: 2,
                    borderColor: "#111", borderWidth: 2,
                  })
                }
              ><Minus className="h-4 w-4" /></Button>
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
                <p className="text-[11px] text-muted-foreground">
                  Click any item to choose which fields to include — inserted as a
                  movable group you can ungroup later.
                </p>
                <DataInserter
                  data={data}
                  onPick={(kind, item) => setPicker({ kind, item })}
                />
              </div>
            )}
          </div>

          <div className="p-3 border-b">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={editGroupChild} onCheckedChange={setEditGroupChild} />
              Edit within group (click selects a single piece)
            </label>
          </div>

          <div className="p-3">
            {selected ? (
              <Inspector
                block={selected}
                isGroup={!!selected.groupId && !editGroupChild}
                onChange={(patch) => updateBlock(selected.id, patch)}
                onRemove={removeSelection}
                onDuplicate={duplicateSelection}
                onForward={bringForward}
                onBackward={sendBackward}
                onUngroup={ungroupSelection}
                onGroup={groupSelectionWith}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Click a block on the page to edit. Drag to move, drag the bottom-right
                corner to resize. Grouped blocks move together.
              </p>
            )}
          </div>
        </aside>
      </div>

      {picker && (
        <FieldPickerDialog
          kind={picker.kind}
          item={picker.item}
          onCancel={() => setPicker(null)}
          onInsert={(blocks) => {
            addBlocks(blocks);
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

// ── Canvas ──────────────────────────────────────────────────────────────
function Canvas({
  page, selectedIds, primaryId, onSelect, onMove, onResize,
}: {
  page: Page;
  selectedIds: Set<string>;
  primaryId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onResize: (id: string, w: number, h: number) => void;
}) {
  return (
    <div
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
          selected={selectedIds.has(b.id)}
          isPrimary={b.id === primaryId}
          onSelect={() => onSelect(b.id)}
          onMove={(dx, dy) => onMove(b.id, dx, dy)}
          onResize={(w, h) => onResize(b.id, w, h)}
        />
      ))}
    </div>
  );
}

function BlockView({
  block, selected, isPrimary, onSelect, onMove, onResize,
}: {
  block: Block;
  selected: boolean;
  isPrimary: boolean;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (w: number, h: number) => void;
}) {
  const startDrag = (e: React.MouseEvent, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const startX = e.clientX, startY = e.clientY;
    const orig = { w: block.w, h: block.h };
    let lastDx = 0, lastDy = 0;
    const onMv = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / DISPLAY_SCALE;
      const dy = (ev.clientY - startY) / DISPLAY_SCALE;
      if (mode === "move") {
        onMove(dx - lastDx, dy - lastDy);
        lastDx = dx; lastDy = dy;
      } else {
        onResize(Math.max(8, Math.round(orig.w + dx)), Math.max(8, Math.round(orig.h + dy)));
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMv);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMv);
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
    outline: isPrimary
      ? "2px solid #2563eb"
      : selected
        ? "2px solid #93c5fd"
        : block.groupId
          ? "1px dashed rgba(37,99,235,0.25)"
          : "1px dashed rgba(0,0,0,0.08)",
  };

  return (
    <div style={style} onMouseDown={(e) => startDrag(e, "move")}>
      {block.type === "rect" && <ShapePreview block={block} />}
      {block.type === "image" && <ImagePreview block={block} />}
      {block.type === "text" && (
        <div
          style={{
            width: "100%", height: "100%",
            padding: (block.padding ?? 6) * DISPLAY_SCALE,
            background: block.bgColor ?? "transparent",
            color: block.color ?? "#111",
            fontSize: (block.fontSize ?? 12) * DISPLAY_SCALE,
            lineHeight: block.lineHeight ?? 1.2,
            fontWeight: block.bold ? 700 : 400,
            fontStyle: block.italic ? "italic" : "normal",
            textAlign: block.align ?? "left",
            overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          {block.text || ""}
        </div>
      )}
      {isPrimary && (
        <div
          onMouseDown={(e) => startDrag(e, "resize")}
          style={{
            position: "absolute", right: -6, bottom: -6,
            width: 12, height: 12, background: "#2563eb",
            cursor: "nwse-resize", borderRadius: 2,
          }}
        />
      )}
    </div>
  );
}

function shapeClipPath(shape: ShapeKind | undefined, radius = 0): string | undefined {
  switch (shape) {
    case "circle":
    case "ellipse":
      return "ellipse(50% 50% at 50% 50%)";
    case "triangle":
      return "polygon(50% 0%, 0% 100%, 100% 100%)";
    case "hexagon":
      return "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
    case "star":
      return "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";
    default:
      return undefined;
  }
}
function frameClipPath(frame: FrameKind | undefined): string | undefined {
  switch (frame) {
    case "circle":
      return "ellipse(50% 50% at 50% 50%)";
    case "hexagon":
      return "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
    default:
      return undefined;
  }
}

function ShapePreview({ block }: { block: Block }) {
  const shape = (block.shape ?? "rect") as ShapeKind;
  if (shape === "line") {
    return (
      <svg width="100%" height="100%" preserveAspectRatio="none">
        <line
          x1={0} y1={0} x2="100%" y2="100%"
          stroke={block.borderColor ?? block.fill ?? "#111"}
          strokeWidth={Math.max(1, (block.borderWidth ?? 1) * DISPLAY_SCALE)}
        />
      </svg>
    );
  }
  const clip = shapeClipPath(shape);
  return (
    <div
      style={{
        width: "100%", height: "100%",
        background: block.fill ?? "transparent",
        border: block.borderColor
          ? `${(block.borderWidth ?? 1) * DISPLAY_SCALE}px solid ${block.borderColor}`
          : undefined,
        borderRadius: shape === "rect" ? (block.radius ?? 0) * DISPLAY_SCALE : undefined,
        clipPath: clip,
      }}
    />
  );
}

function ImagePreview({ block }: { block: Block }) {
  const frame = (block.frame ?? "rect") as FrameKind;
  const clip = frameClipPath(frame);
  return (
    <div
      style={{
        width: "100%", height: "100%",
        background: block.imageUrl
          ? `${block.fit === "contain" ? "no-repeat center / contain" : "no-repeat center / cover"} url(${JSON.stringify(block.imageUrl)})`
          : "repeating-linear-gradient(45deg,#eee,#eee 6px,#f5f5f5 6px,#f5f5f5 12px)",
        borderRadius: frame === "rounded" ? (block.radius ?? 16) * DISPLAY_SCALE : undefined,
        clipPath: clip,
      }}
    >
      {!block.imageUrl && (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Image URL…
        </div>
      )}
    </div>
  );
}

// ── Inspector ───────────────────────────────────────────────────────────
function Inspector({
  block, isGroup, onChange, onRemove, onDuplicate, onForward, onBackward,
  onUngroup, onGroup,
}: {
  block: Block;
  isGroup: boolean;
  onChange: (patch: Partial<Block>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onForward: () => void;
  onBackward: () => void;
  onUngroup: () => void;
  onGroup: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <div className="flex items-center gap-1">
          <Badge variant="secondary">{block.type}</Badge>
          {isGroup && <Badge variant="outline">group</Badge>}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onBackward} title="Send back">↓</Button>
          <Button size="sm" variant="ghost" onClick={onForward} title="Bring forward">↑</Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate} title="Duplicate">
            <Copy className="h-4 w-4" />
          </Button>
          {block.groupId ? (
            <Button size="sm" variant="ghost" onClick={onUngroup} title="Ungroup">
              <Ungroup className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onGroup} title="Group selection">
              <Group className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove} title="Delete">
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
            <Textarea rows={4} value={block.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Font size" value={block.fontSize ?? 12} onChange={(v) => onChange({ fontSize: v })} />
            <div>
              <Label className="text-xs">Align</Label>
              <Select value={block.align ?? "left"} onValueChange={(v) => onChange({ align: v as any })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
              <Switch checked={!!block.bold} onCheckedChange={(v) => onChange({ bold: v })} />
              Bold
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={!!block.italic} onCheckedChange={(v) => onChange({ italic: v })} />
              Italic
            </label>
          </div>
          <ColorField label="Text color" value={block.color ?? "#111111"} onChange={(v) => onChange({ color: v })} />
          <ColorField label="Background" value={block.bgColor ?? "#ffffff"} onChange={(v) => onChange({ bgColor: v })}
            allowClear onClear={() => onChange({ bgColor: undefined })} />
        </>
      )}

      {block.type === "image" && (
        <>
          <div>
            <Label className="text-xs">Image URL</Label>
            <Input value={block.imageUrl ?? ""} onChange={(e) => onChange({ imageUrl: e.target.value })} placeholder="https://…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Fit</Label>
              <Select value={block.fit ?? "cover"} onValueChange={(v) => onChange({ fit: v as any })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Cover</SelectItem>
                  <SelectItem value="contain">Contain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Frame</Label>
              <Select value={block.frame ?? "rect"} onValueChange={(v) => onChange({ frame: v as FrameKind })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rect">Rectangle</SelectItem>
                  <SelectItem value="rounded">Rounded</SelectItem>
                  <SelectItem value="circle">Circle</SelectItem>
                  <SelectItem value="hexagon">Hexagon</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {block.frame === "rounded" && (
            <NumField label="Corner radius" value={block.radius ?? 16} onChange={(v) => onChange({ radius: v })} />
          )}
        </>
      )}

      {block.type === "rect" && (
        <>
          <div>
            <Label className="text-xs">Shape</Label>
            <Select
              value={(block.shape ?? "rect")}
              onValueChange={(v) => onChange({ shape: v as ShapeKind })}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rect">Rectangle</SelectItem>
                <SelectItem value="circle">Circle</SelectItem>
                <SelectItem value="ellipse">Ellipse</SelectItem>
                <SelectItem value="triangle">Triangle</SelectItem>
                <SelectItem value="hexagon">Hexagon</SelectItem>
                <SelectItem value="star">Star</SelectItem>
                <SelectItem value="line">Line</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(block.shape ?? "rect") === "rect" && (
            <NumField label="Corner radius" value={block.radius ?? 0} onChange={(v) => onChange({ radius: v })} />
          )}
          <ColorField label="Fill" value={block.fill ?? "#cccccc"} onChange={(v) => onChange({ fill: v })}
            allowClear onClear={() => onChange({ fill: undefined })} />
          <ColorField label="Border" value={block.borderColor ?? "#000000"} onChange={(v) => onChange({ borderColor: v })}
            allowClear onClear={() => onChange({ borderColor: undefined })} />
          <NumField label="Border width" value={block.borderWidth ?? 0} onChange={(v) => onChange({ borderWidth: v })} />
        </>
      )}
    </div>
  );
}

function NumField({
  label, value, onChange,
}: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-9" />
    </div>
  );
}

function ColorField({
  label, value, onChange, allowClear, onClear,
}: {
  label: string; value: string; onChange: (v: string) => void;
  allowClear?: boolean; onClear?: () => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-14 p-1" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 flex-1" />
        {allowClear && (<Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>)}
      </div>
    </div>
  );
}

// ── Data inserter (lists, opens field picker) ───────────────────────────
function DataInserter({
  data, onPick,
}: {
  data: any;
  onPick: (kind: "event" | "gig" | "class" | "ad", item: any) => void;
}) {
  const [open, setOpen] = useState<"events" | "gigs" | "classes" | "ads" | null>(null);
  const groups: Array<[string, "events" | "gigs" | "classes" | "ads", any[]]> = [
    ["Events", "events", data.events],
    ["Performances", "gigs", data.gigs],
    ["Classes", "classes", data.classes],
    ["Sponsor ads", "ads", data.sponsors],
  ];
  const kindMap = {
    events: "event", gigs: "gig", classes: "class", ads: "ad",
  } as const;
  return (
    <div className="space-y-1">
      {groups.map(([label, key, list]) => (
        <div key={key} className="border rounded">
          <button
            type="button"
            className="flex w-full items-center justify-between px-2 py-1 text-xs hover:bg-muted/50"
            onClick={() => setOpen(open === key ? null : key)}
          >
            <span>{label} <span className="text-muted-foreground">({list.length})</span></span>
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
                  onClick={() => onPick(kindMap[key], it)}
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

// ── Field picker dialog ─────────────────────────────────────────────────
type FieldDef = { key: string; label: string; available: boolean };

function fieldsFor(kind: "event" | "gig" | "class" | "ad", item: any): FieldDef[] {
  if (kind === "event") {
    return [
      { key: "image", label: "Image", available: !!item.image_url },
      { key: "title", label: "Title", available: !!item.title },
      { key: "time", label: "Time", available: !!item.start_time },
      { key: "venue", label: "Venue / location", available: !!(item.venue_name || item.location_name) },
      { key: "description", label: "Description", available: !!item.description },
    ];
  }
  if (kind === "gig") {
    return [
      { key: "title", label: "Title / artist", available: !!(item.title || item.artist_name) },
      { key: "time", label: "Time", available: !!item.start_time },
      { key: "artist", label: "Artist details", available: !!(item.artist_name || item.artist_genre) },
      { key: "venue", label: "Stage / venue", available: !!(item.stage_name || item.venue_name) },
    ];
  }
  if (kind === "class") {
    return [
      { key: "image", label: "Image", available: !!item.image_url },
      { key: "title", label: "Course title", available: !!item.course_title },
      { key: "time", label: "Time", available: !!item.start_time },
      { key: "instructor", label: "Instructor", available: !!item.instructor_name },
      { key: "room", label: "Room", available: !!item.room_name },
      { key: "price", label: "Price", available: typeof item.price === "number" },
      { key: "description", label: "Description", available: !!item.description },
    ];
  }
  // ad
  return [
    { key: "background", label: "Background panel", available: true },
    { key: "logo", label: "Logo", available: !!item.logo_url },
    { key: "name", label: "Company name", available: !!item.company_name },
    { key: "adcopy", label: "Ad copy", available: !!item.ad_copy },
  ];
}

function FieldPickerDialog({
  kind, item, onCancel, onInsert,
}: {
  kind: "event" | "gig" | "class" | "ad";
  item: any;
  onCancel: () => void;
  onInsert: (blocks: Block[]) => void;
}) {
  const all = fieldsFor(kind, item);
  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(all.filter((f) => f.available).map((f) => [f.key, true])),
  );
  const [frame, setFrame] = useState<FrameKind>("rect");

  const toggle = (k: string) => setPicked((p) => ({ ...p, [k]: !p[k] }));

  const insert = () => {
    const group = uid();
    const accent = "#0f1b3d";
    const blocks: Block[] = [];
    const baseX = 60;
    let cursorY = 80;

    const push = (b: Block) => blocks.push({ ...b, groupId: group });

    if (kind === "event") {
      if (picked.image && item.image_url) {
        push({
          id: uid(), type: "image",
          x: baseX, y: cursorY, w: 240, h: 180,
          imageUrl: item.image_url, fit: "cover", frame,
          radius: frame === "rounded" ? 16 : undefined,
        });
        cursorY += 196;
      }
      if (picked.title) {
        push({
          id: uid(), type: "text",
          x: baseX, y: cursorY, w: 280, h: 32,
          text: item.title, fontSize: 18, bold: true, color: accent,
        });
        cursorY += 36;
      }
      if (picked.time) {
        push({
          id: uid(), type: "text",
          x: baseX, y: cursorY, w: 280, h: 18,
          text: `${fmtTime(item.start_time)}${item.end_time ? `–${fmtTime(item.end_time)}` : ""}`,
          fontSize: 11, bold: true, color: "#444",
        });
        cursorY += 22;
      }
      if (picked.venue && (item.venue_name || item.location_name)) {
        push({
          id: uid(), type: "text",
          x: baseX, y: cursorY, w: 280, h: 18,
          text: [item.venue_name, item.location_name].filter(Boolean).join(" · "),
          fontSize: 10, color: "#666",
        });
        cursorY += 20;
      }
      if (picked.description && item.description) {
        push({
          id: uid(), type: "text",
          x: baseX, y: cursorY, w: 280, h: 80,
          text: item.description, fontSize: 9, color: "#444",
        });
      }
    } else if (kind === "gig") {
      if (picked.title) {
        push({
          id: uid(), type: "text", x: baseX, y: cursorY, w: 280, h: 28,
          text: item.title || item.artist_name || "Performance",
          fontSize: 16, bold: true, color: accent,
        });
        cursorY += 32;
      }
      if (picked.time) {
        push({
          id: uid(), type: "text", x: baseX, y: cursorY, w: 280, h: 18,
          text: `${fmtTime(item.start_time)}${item.end_time ? `–${fmtTime(item.end_time)}` : ""}`,
          fontSize: 11, bold: true, color: "#444",
        });
        cursorY += 22;
      }
      if (picked.artist) {
        push({
          id: uid(), type: "text", x: baseX, y: cursorY, w: 280, h: 18,
          text: [item.artist_name, item.artist_genre].filter(Boolean).join(" · "),
          fontSize: 10, color: "#666",
        });
        cursorY += 20;
      }
      if (picked.venue) {
        push({
          id: uid(), type: "text", x: baseX, y: cursorY, w: 280, h: 18,
          text: [item.stage_name, item.venue_name].filter(Boolean).join(" · "),
          fontSize: 10, color: "#666",
        });
      }
    } else if (kind === "class") {
      if (picked.image && item.image_url) {
        push({
          id: uid(), type: "image",
          x: baseX, y: cursorY, w: 240, h: 160,
          imageUrl: item.image_url, fit: "cover", frame,
          radius: frame === "rounded" ? 16 : undefined,
        });
        cursorY += 176;
      }
      if (picked.title) {
        push({
          id: uid(), type: "text", x: baseX, y: cursorY, w: 280, h: 28,
          text: item.course_title, fontSize: 16, bold: true, color: accent,
        });
        cursorY += 32;
      }
      if (picked.time) {
        push({
          id: uid(), type: "text", x: baseX, y: cursorY, w: 280, h: 18,
          text: fmtTime(item.start_time), fontSize: 11, bold: true, color: "#444",
        });
        cursorY += 22;
      }
      if (picked.instructor) {
        push({
          id: uid(), type: "text", x: baseX, y: cursorY, w: 280, h: 18,
          text: `with ${item.instructor_name}`, fontSize: 10, color: "#666",
        });
        cursorY += 20;
      }
      if (picked.room) {
        push({
          id: uid(), type: "text", x: baseX, y: cursorY, w: 280, h: 18,
          text: item.room_name, fontSize: 10, color: "#666",
        });
        cursorY += 20;
      }
      if (picked.price) {
        push({
          id: uid(), type: "text", x: baseX, y: cursorY, w: 280, h: 18,
          text: item.price > 0 ? `$${item.price.toFixed(2)}` : "Free",
          fontSize: 11, bold: true, color: accent,
        });
        cursorY += 22;
      }
      if (picked.description && item.description) {
        push({
          id: uid(), type: "text", x: baseX, y: cursorY, w: 280, h: 80,
          text: item.description, fontSize: 9, color: "#444",
        });
      }
    } else {
      // ad
      const adX = 60, adY = 80, adW = 280, adH = 200;
      if (picked.background) {
        push({
          id: uid(), type: "rect", shape: "rect",
          x: adX, y: adY, w: adW, h: adH,
          fill: "#fff8e6", borderColor: "#d4a84a", borderWidth: 1.5, radius: 6,
        });
      }
      if (picked.logo && item.logo_url) {
        push({
          id: uid(), type: "image",
          x: adX + 10, y: adY + 10, w: 110, h: 110,
          imageUrl: item.logo_url, fit: "contain", frame,
        });
      }
      if (picked.name) {
        push({
          id: uid(), type: "text",
          x: adX + 130, y: adY + 16, w: adW - 140, h: 28,
          text: item.company_name, fontSize: 14, bold: true, color: accent,
        });
      }
      if (picked.adcopy && item.ad_copy) {
        push({
          id: uid(), type: "text",
          x: adX + 130, y: adY + 50, w: adW - 140, h: adH - 60,
          text: item.ad_copy, fontSize: 9, color: "#444",
        });
      }
    }

    onInsert(blocks);
  };

  const showFrame = ["event", "class", "ad"].includes(kind);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Insert {kind} — choose fields
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {all.map((f) => (
            <label
              key={f.key}
              className={`flex items-center gap-2 text-sm ${!f.available ? "opacity-40" : ""}`}
            >
              <Checkbox
                checked={!!picked[f.key]}
                disabled={!f.available}
                onCheckedChange={() => toggle(f.key)}
              />
              {f.label}
              {!f.available && <span className="text-xs text-muted-foreground">(not set)</span>}
            </label>
          ))}
          {showFrame && (
            <div className="pt-2">
              <Label className="text-xs">Image frame</Label>
              <Select value={frame} onValueChange={(v) => setFrame(v as FrameKind)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rect">Rectangle</SelectItem>
                  <SelectItem value="rounded">Rounded</SelectItem>
                  <SelectItem value="circle">Circle</SelectItem>
                  <SelectItem value="hexagon">Hexagon</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={insert}>Insert as group</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page thumbnail ──────────────────────────────────────────────────────
function PageThumb({ page }: { page: Page }) {
  const s = 0.18;
  return (
    <div
      className="relative"
      style={{ width: PAGE_W * s, height: PAGE_H * s, background: page.bgColor ?? "#fff" }}
    >
      {page.blocks.map((b) => {
        const shape = (b.shape ?? "rect") as ShapeKind;
        const clip = b.type === "image"
          ? frameClipPath(b.frame)
          : b.type === "rect"
            ? shapeClipPath(shape)
            : undefined;
        return (
          <div
            key={b.id}
            style={{
              position: "absolute",
              left: b.x * s, top: b.y * s,
              width: b.w * s, height: b.h * s,
              background:
                b.type === "rect"
                  ? b.fill ?? "transparent"
                  : b.type === "text"
                    ? b.bgColor ?? "transparent"
                    : "#ddd",
              clipPath: clip,
              borderRadius:
                (b.type === "rect" && shape === "rect"
                  ? (b.radius ?? 0) * s
                  : b.type === "image" && b.frame === "rounded"
                    ? (b.radius ?? 16) * s
                    : undefined),
              border: b.type === "image" && !b.imageUrl ? "1px dashed #bbb" : undefined,
              color: b.color ?? "#111",
              fontSize: Math.max(2, (b.fontSize ?? 12) * s),
              fontWeight: b.bold ? 700 : 400,
              overflow: "hidden",
            }}
          >
            {b.type === "text" ? b.text : null}
          </div>
        );
      })}
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

// Auto-build (unchanged): generates a starter multi-page layout.
function buildMagazineFromData(
  title: string,
  data: { events: any[]; gigs: any[]; classes: any[]; sponsors: any[] },
): Page[] {
  const pages: Page[] = [];
  const cover: Page = {
    id: uid(),
    bgColor: "#ffffff",
    blocks: [
      { id: uid(), type: "rect", shape: "rect", x: 0, y: 0, w: PAGE_W, h: 240, fill: "#5fbf7a" },
      { id: uid(), type: "text", x: 40, y: 60, w: PAGE_W - 80, h: 36,
        text: "COMMUNITY PROGRAM", fontSize: 14, bold: true, color: "#ffffff" },
      { id: uid(), type: "text", x: 40, y: 100, w: PAGE_W - 80, h: 80,
        text: title, fontSize: 44, bold: true, color: "#ffffff" },
      { id: uid(), type: "text", x: 40, y: 190, w: PAGE_W - 80, h: 30,
        text: "weekly programs", fontSize: 14, italic: true, color: "#ffffff" },
      { id: uid(), type: "text", x: 40, y: 280, w: PAGE_W - 80, h: 30,
        text: `${data.events.length} events · ${data.gigs.length} performances · ${data.classes.length} classes`,
        fontSize: 12, color: "#444" },
    ],
  };
  const hero = data.sponsors[0];
  if (hero?.logo_url) {
    cover.blocks.push({
      id: uid(), type: "image",
      x: PAGE_W / 2 - 100, y: PAGE_H - 260, w: 200, h: 160,
      imageUrl: hero.logo_url, fit: "contain", frame: "rounded", radius: 16,
    });
    cover.blocks.push({
      id: uid(), type: "text", x: 40, y: PAGE_H - 90, w: PAGE_W - 80, h: 24,
      text: `Presented in partnership with ${hero.company_name}`,
      fontSize: 11, italic: true, align: "center", color: "#555",
    });
  }
  pages.push(cover);

  const eventsByDay = new Map<string, any[]>();
  for (const e of data.events) {
    const k = dateKey(e.start_time);
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k)!.push(e);
  }
  const days = Array.from(eventsByDay.keys()).sort();
  let sponsorIdx = 0;
  for (const day of days) {
    const dayEvents = eventsByDay.get(day)!.sort((a, b) =>
      (a.start_time ?? "").localeCompare(b.start_time ?? ""));
    const page: Page = {
      id: uid(), bgColor: "#ffffff",
      blocks: [
        { id: uid(), type: "rect", shape: "rect", x: 0, y: 0, w: PAGE_W, h: 90, fill: "#5fbf7a" },
        { id: uid(), type: "text", x: 40, y: 20, w: PAGE_W - 80, h: 30,
          text: title.toUpperCase(), fontSize: 11, bold: true, color: "#ffffff" },
        { id: uid(), type: "text", x: 40, y: 42, w: PAGE_W - 80, h: 40,
          text: fmtDayHeader(day), fontSize: 28, bold: true, color: "#ffffff" },
      ],
    };
    let cursorY = 130;
    let listX = 40, listW = PAGE_W - 80;
    const heroEvent = dayEvents.find((e) => e.image_url);
    if (heroEvent?.image_url) {
      page.blocks.push({
        id: uid(), type: "image", x: 40, y: 110, w: 260, h: 220,
        imageUrl: heroEvent.image_url, fit: "cover", frame: "rect",
      });
      listX = 320; listW = PAGE_W - 320 - 40; cursorY = 110;
    }
    for (const e of dayEvents.slice(0, 8)) {
      const g = uid();
      page.blocks.push({
        id: uid(), type: "text", groupId: g, x: listX, y: cursorY, w: 32, h: 32,
        text: dayLetter(e.start_time), fontSize: 18, bold: true,
        color: "#5fbf7a", bgColor: "#f0f0f0", align: "center",
      });
      page.blocks.push({
        id: uid(), type: "text", groupId: g, x: listX + 40, y: cursorY - 2,
        w: listW - 40, h: 22, text: (e.title ?? "").toUpperCase(),
        fontSize: 11, bold: true, color: "#0f1b3d",
      });
      page.blocks.push({
        id: uid(), type: "text", groupId: g, x: listX + 40, y: cursorY + 18,
        w: listW - 40, h: 36,
        text: `${fmtTime(e.start_time)}${e.end_time ? `–${fmtTime(e.end_time)}` : ""}  ·  ${e.venue_name ?? ""}${e.description ? `\n${e.description}` : ""}`,
        fontSize: 9, color: "#555",
      });
      cursorY += 70;
      if (cursorY > PAGE_H - 200) break;
    }
    const sponsor = data.sponsors[sponsorIdx % Math.max(1, data.sponsors.length)];
    if (data.sponsors.length) {
      sponsorIdx++;
      const g = uid();
      page.blocks.push({ id: uid(), type: "rect", shape: "rect", groupId: g, x: 0, y: PAGE_H - 100, w: PAGE_W, h: 100, fill: "#fff4d6" });
      page.blocks.push({ id: uid(), type: "text", groupId: g, x: 40, y: PAGE_H - 84, w: PAGE_W - 80, h: 18,
        text: "SPONSORED", fontSize: 9, bold: true, color: "#c97a00" });
      page.blocks.push({ id: uid(), type: "text", groupId: g, x: 40, y: PAGE_H - 64, w: PAGE_W - 200, h: 24,
        text: sponsor.company_name, fontSize: 16, bold: true, color: "#0f1b3d" });
      if (sponsor.ad_copy)
        page.blocks.push({ id: uid(), type: "text", groupId: g, x: 40, y: PAGE_H - 40, w: PAGE_W - 200, h: 30,
          text: sponsor.ad_copy, fontSize: 9, color: "#444" });
      if (sponsor.logo_url)
        page.blocks.push({ id: uid(), type: "image", groupId: g, x: PAGE_W - 140, y: PAGE_H - 88, w: 100, h: 76,
          imageUrl: sponsor.logo_url, fit: "contain", frame: "rect" });
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
