import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import {
  fetchGuidebookCanvasData,
  generateGuidebook,
} from "@/lib/guidebook.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { GripVertical, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";

const SearchSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/staff/admin/guidebook-canvas")({
  validateSearch: (s) => SearchSchema.parse(s),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: CanvasPage,
});

type Override = { title?: string; description?: string; adCopy?: string };
type CanvasItem = {
  id: string;
  kind: "section" | "event" | "gig" | "class" | "ad";
  refId?: string | null;
  label?: string | null;
  hidden?: boolean;
  overrides?: Override | null;
};

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

function CanvasPage() {
  const search = Route.useSearch();
  const [startDate, setStartDate] = useState(search.start || today());
  const [endDate, setEndDate] = useState(search.end || today(30));
  const fetcher = useServerFn(fetchGuidebookCanvasData);
  const generate = useServerFn(generateGuidebook);

  const [items, setItems] = useState<CanvasItem[]>([]);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetcher>> | null>(
    null,
  );

  const dataQ = useQuery({
    queryKey: ["guidebook-canvas", startDate, endDate],
    queryFn: async () => {
      const res = await fetcher({ data: { startDate, endDate } });
      setData(res);
      setItems(buildInitialLayout(res));
      return res;
    },
    enabled: false,
  });

  function buildInitialLayout(d: NonNullable<typeof data>): CanvasItem[] {
    const out: CanvasItem[] = [];
    if (d.events.length) {
      out.push({ id: `sec-events`, kind: "section", label: "Events" });
      for (const e of d.events) {
        out.push({ id: `event-${e.id}`, kind: "event", refId: e.id });
      }
    }
    if (d.gigs.length) {
      out.push({ id: `sec-gigs`, kind: "section", label: "StreetBeats Performances" });
      for (const g of d.gigs) {
        out.push({ id: `gig-${g.id}`, kind: "gig", refId: g.id });
      }
    }
    if (d.classes.length) {
      out.push({ id: `sec-classes`, kind: "section", label: "Classes" });
      for (const c of d.classes) {
        out.push({ id: `class-${c.id}`, kind: "class", refId: c.id });
      }
    }
    return out;
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const next = Array.from(items);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setItems(next);
  }

  function toggleHidden(id: string) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, hidden: !it.hidden } : it)),
    );
  }
  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }
  function updateOverride(id: string, patch: Override) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, overrides: { ...(it.overrides ?? {}), ...patch } } : it,
      ),
    );
  }
  function insertAdAfter(index: number, sponsorId: string) {
    const sponsor = data?.sponsors.find((s) => s.id === sponsorId);
    if (!sponsor) return;
    const newItem: CanvasItem = {
      id: `ad-${sponsorId}-${Date.now()}`,
      kind: "ad",
      refId: sponsorId,
    };
    setItems((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, newItem);
      return next;
    });
  }

  const generateMut = useMutation({
    mutationFn: () =>
      generate({
        data: {
          startDate,
          endDate,
          layout: items.map((it) => ({
            id: it.id,
            kind: it.kind,
            refId: it.refId ?? null,
            label: it.label ?? null,
            hidden: it.hidden ?? false,
            overrides: it.overrides ?? null,
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
      toast.success("PDF generated from custom layout.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to generate"),
  });

  const dateError =
    startDate && endDate && startDate > endDate
      ? "End date must be after start date."
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <div>
        <Link
          to="/staff/admin/guidebook"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Guidebook
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Guidebook Layout Builder
        </h1>
        <p className="text-sm text-muted-foreground">
          Drag to reorder, hide items, override print copy, and drop sponsor ad
          slots anywhere. Then export the PDF.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label htmlFor="s">Start</Label>
            <Input id="s" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="e">End</Label>
            <Input id="e" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={!!dateError || dataQ.isFetching}
              onClick={() => dataQ.refetch()}
            >
              {dataQ.isFetching ? "Loading…" : data ? "Reload data" : "Load data"}
            </Button>
          </div>
        </div>
        {dateError && <p className="text-sm text-destructive">{dateError}</p>}
      </Card>

      {data && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              {items.filter((i) => !i.hidden && i.kind !== "section").length}{" "}
              cards visible · {items.filter((i) => i.hidden).length} hidden ·{" "}
              {data.sponsors.length} sponsor ads available
            </div>
            <Button
              type="button"
              disabled={generateMut.isPending || items.length === 0}
              onClick={() => generateMut.mutate()}
            >
              {generateMut.isPending ? "Generating PDF…" : "Export PDF"}
            </Button>
          </div>

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="canvas">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-2"
                >
                  {items.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(p) => (
                        <div
                          ref={p.innerRef}
                          {...p.draggableProps}
                          className={`${item.hidden ? "opacity-50" : ""}`}
                        >
                          <CardRow
                            item={item}
                            data={data}
                            dragHandleProps={p.dragHandleProps}
                            onToggleHidden={() => toggleHidden(item.id)}
                            onRemove={() => removeItem(item.id)}
                            onOverride={(patch) => updateOverride(item.id, patch)}
                            onInsertAd={(sponsorId) => insertAdAfter(index, sponsorId)}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </>
      )}
    </div>
  );
}

function CardRow({
  item,
  data,
  dragHandleProps,
  onToggleHidden,
  onRemove,
  onOverride,
  onInsertAd,
}: {
  item: CanvasItem;
  data: NonNullable<ReturnType<typeof useStateData>>;
  dragHandleProps: any;
  onToggleHidden: () => void;
  onRemove: () => void;
  onOverride: (patch: Override) => void;
  onInsertAd: (sponsorId: string) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [adPickerOpen, setAdPickerOpen] = useState(false);
  const [adSponsor, setAdSponsor] = useState<string>("");

  const display = useMemo(() => describeItem(item, data), [item, data]);

  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-1 cursor-grab text-muted-foreground hover:text-foreground"
          {...dragHandleProps}
          aria-label="Drag"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={item.kind === "ad" ? "default" : item.kind === "section" ? "secondary" : "outline"}>
              {item.kind}
            </Badge>
            <div className="font-medium truncate">{display.title}</div>
          </div>
          {display.meta && (
            <div className="mt-1 text-xs text-muted-foreground">{display.meta}</div>
          )}
          {display.body && (
            <div className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {display.body}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {item.kind !== "section" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditOpen(true)}
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleHidden}
            title={item.hidden ? "Show" : "Hide"}
          >
            {item.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setAdPickerOpen(true)}
            title="Insert ad slot below"
            disabled={data.sponsors.length === 0}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit print copy</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {item.kind !== "ad" && (
              <div>
                <Label htmlFor="ov-title">Title</Label>
                <Input
                  id="ov-title"
                  defaultValue={item.overrides?.title ?? ""}
                  placeholder={display.title}
                  onBlur={(e) => onOverride({ title: e.target.value || undefined })}
                />
              </div>
            )}
            {item.kind === "ad" ? (
              <div>
                <Label htmlFor="ov-ad">Ad copy</Label>
                <Textarea
                  id="ov-ad"
                  rows={5}
                  defaultValue={item.overrides?.adCopy ?? ""}
                  placeholder={display.body ?? ""}
                  onBlur={(e) => onOverride({ adCopy: e.target.value || undefined })}
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="ov-desc">Description</Label>
                <Textarea
                  id="ov-desc"
                  rows={4}
                  defaultValue={item.overrides?.description ?? ""}
                  placeholder={display.body ?? ""}
                  onBlur={(e) =>
                    onOverride({ description: e.target.value || undefined })
                  }
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Overrides apply to this print edition only — the database record is
              not modified.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setEditOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adPickerOpen} onOpenChange={setAdPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insert sponsor ad slot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Sponsor</Label>
            <Select value={adSponsor} onValueChange={setAdSponsor}>
              <SelectTrigger>
                <SelectValue placeholder="Pick sponsor…" />
              </SelectTrigger>
              <SelectContent>
                {data.sponsors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={!adSponsor}
              onClick={() => {
                onInsertAd(adSponsor);
                setAdPickerOpen(false);
                setAdSponsor("");
              }}
            >
              Insert below
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// helper purely for typing
function useStateData() {
  return null as null | {
    events: Array<any>;
    gigs: Array<any>;
    classes: Array<any>;
    sponsors: Array<{ id: string; company_name: string; ad_copy: string | null; logo_url: string | null }>;
  };
}

function describeItem(
  item: CanvasItem,
  data: {
    events: any[]; gigs: any[]; classes: any[];
    sponsors: { id: string; company_name: string; ad_copy: string | null; logo_url: string | null }[];
  },
): { title: string; meta?: string; body?: string } {
  if (item.kind === "section") return { title: item.label || "Section" };
  if (item.kind === "event") {
    const e = data.events.find((x) => x.id === item.refId);
    if (!e) return { title: "Missing event" };
    return {
      title: item.overrides?.title || e.title,
      meta: `${fmtTime(e.start_time)} · ${[e.location_name, e.venue_name].filter(Boolean).join(" · ")}`,
      body: item.overrides?.description ?? e.description ?? undefined,
    };
  }
  if (item.kind === "gig") {
    const g = data.gigs.find((x) => x.id === item.refId);
    if (!g) return { title: "Missing performance" };
    return {
      title: item.overrides?.title || g.title || g.artist_name || "Performance",
      meta: `${fmtTime(g.start_time)} · ${[g.artist_name, g.stage_name, g.venue_name].filter(Boolean).join(" · ")}`,
    };
  }
  if (item.kind === "class") {
    const c = data.classes.find((x) => x.id === item.refId);
    if (!c) return { title: "Missing class" };
    return {
      title: item.overrides?.title || c.course_title,
      meta: `${fmtTime(c.start_time)} · ${[c.venue_name, c.room_name, c.instructor_name].filter(Boolean).join(" · ")}`,
      body: item.overrides?.description ?? undefined,
    };
  }
  if (item.kind === "ad") {
    const s = data.sponsors.find((x) => x.id === item.refId);
    if (!s) return { title: "Missing sponsor" };
    return {
      title: `Ad slot — ${s.company_name}`,
      meta: "Half-page sponsor ad",
      body: item.overrides?.adCopy ?? s.ad_copy ?? undefined,
    };
  }
  return { title: "Item" };
}
