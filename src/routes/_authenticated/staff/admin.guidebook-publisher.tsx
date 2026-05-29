import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import {
  fetchGuidebookCanvasData,
  listGuidebookSponsors,
} from "@/lib/guidebook.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Eye,
  EyeOff,
  Megaphone,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { GRID_PRESETS, type PublisherItem } from "@/lib/guidebook-publisher/document";

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
};

const KIND_COLOR: Record<PublisherItem["kind"], string> = {
  event: "bg-orange-100 text-orange-900 border-orange-300",
  class: "bg-teal-100 text-teal-900 border-teal-300",
  performance: "bg-purple-100 text-purple-900 border-purple-300",
  ad: "bg-amber-100 text-amber-900 border-amber-300",
};

function PublisherPage() {
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today(30));
  const [presetId, setPresetId] = useState("2x2");
  const [title, setTitle] = useState("Community Program Guide");
  const [items, setItems] = useState<PublisherItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = useServerFn(fetchGuidebookCanvasData);
  const listSponsorsFn = useServerFn(listGuidebookSponsors);

  const sponsorsQ = useQuery({
    queryKey: ["publisher-sponsors"],
    queryFn: () => listSponsorsFn(),
  });

  const loadMut = useMutation({
    mutationFn: () => fetchData({ data: { startDate, endDate } }),
    onSuccess: (d) => {
      const next: PublisherItem[] = [
        ...d.events.map((e: any) => ({
          id: `event-${e.id}`,
          kind: "event" as const,
          data: e,
        })),
        ...d.classes.map((c: any) => ({
          id: `class-${c.id}`,
          kind: "class" as const,
          data: c,
        })),
        ...d.gigs.map((g: any) => ({
          id: `perf-${g.id}`,
          kind: "performance" as const,
          data: g,
        })),
      ];
      // Sort by start_time
      next.sort((a, b) => {
        const ta = (a.data as any).start_time ?? "";
        const tb = (b.data as any).start_time ?? "";
        return ta.localeCompare(tb);
      });
      setItems(next);
      toast.success(
        `Loaded ${d.events.length} events, ${d.classes.length} classes, ${d.gigs.length} performances`,
      );
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

  const toggleHidden = (idx: number) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, hidden: !it.hidden } : it)),
    );
  };

  const remove = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };

  const insertSponsorAt = (sp: any, atIdx: number | null) => {
    const ad: PublisherItem = {
      id: `ad-${sp.id}-${Date.now()}`,
      kind: "ad",
      data: {
        company_name: sp.company_name,
        ad_copy: sp.ad_copy ?? null,
        logo_url: sp.logo_url ?? null,
      },
    };
    setItems((prev) => {
      const next = [...prev];
      const at = atIdx == null ? next.length : atIdx + 1;
      next.splice(at, 0, ad);
      return next;
    });
    toast.success(`Inserted "${sp.company_name}" ad`);
  };

  const dateError =
    startDate && endDate && startDate > endDate ? "End date must be after start date." : null;

  // PDF preview (client-only)
  const [PDFViewer, setPDFViewer] = useState<any>(null);
  const [GuidebookDocument, setGuidebookDocument] = useState<any>(null);
  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    Promise.all([
      import("@react-pdf/renderer"),
      import("@/lib/guidebook-publisher/document"),
    ]).then(([rp, doc]) => {
      if (!alive) return;
      setPDFViewer(() => rp.PDFViewer);
      setGuidebookDocument(() => doc.GuidebookDocument);
    });
    return () => {
      alive = false;
    };
  }, [mounted]);

  return (
    <div className="flex flex-col h-screen bg-muted/20">
      {/* Toolbar */}
      <header className="border-b bg-background px-4 py-3 flex flex-wrap items-end gap-3">
        <Link to="/staff/admin/guidebook" className="text-sm text-muted-foreground hover:underline self-center mr-2">
          ← Back
        </Link>
        <div>
          <Label htmlFor="title" className="text-xs">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 w-64"
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
        <Button
          type="button"
          onClick={() => loadMut.mutate()}
          disabled={!!dateError || loadMut.isPending}
          className="gap-2"
        >
          {loadMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
          {loadMut.isPending ? "Loading…" : "Load date range"}
        </Button>
        {dateError && <span className="text-sm text-destructive">{dateError}</span>}
        <div className="ml-auto text-xs text-muted-foreground">
          {items.filter((i) => !i.hidden).length} visible · {items.length} total
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-3 p-3 min-h-0">
        {/* LEFT: ordered item list */}
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
                <p className="text-xs text-muted-foreground p-3">
                  Load a date range to populate items.
                </p>
              ) : (
                <ul className="space-y-1">
                  {items.map((it, idx) => {
                    const titleText =
                      (it.data as any).title ??
                      (it.data as any).course_title ??
                      (it.data as any).company_name ??
                      "Untitled";
                    const isSel = selectedIdx === idx;
                    return (
                      <li
                        key={it.id}
                        onClick={() => setSelectedIdx(idx)}
                        className={`group rounded-md border p-2 cursor-pointer text-xs ${
                          isSel ? "border-primary bg-primary/5" : "border-border bg-background"
                        } ${it.hidden ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${KIND_COLOR[it.kind]}`}>
                            {KIND_LABEL[it.kind]}
                          </span>
                          <span className="font-medium truncate flex-1">{titleText}</span>
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
            {!mounted || !PDFViewer || !GuidebookDocument ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Loading preview…
              </div>
            ) : items.filter((i) => !i.hidden).length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Load a date range to see the preview.
              </div>
            ) : (
              <PDFViewer
                showToolbar
                style={{ width: "100%", height: "100%", border: "none" }}
              >
                <GuidebookDocument
                  title={title}
                  startDate={startDate}
                  endDate={endDate}
                  items={items}
                  preset={preset}
                />
              </PDFViewer>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: ad manager */}
        <Card className="col-span-3 flex flex-col min-h-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Ad Manager
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-2">
            <p className="text-[11px] text-muted-foreground px-1 pb-2">
              {selectedIdx == null
                ? "Insertion will append to the end. Click an item on the left to insert after it."
                : `Inserting after item #${selectedIdx + 1}.`}
            </p>
            <ScrollArea className="h-full pr-2">
              {sponsorsQ.isLoading ? (
                <p className="text-xs text-muted-foreground p-3">Loading…</p>
              ) : !sponsorsQ.data?.sponsors.length ? (
                <p className="text-xs text-muted-foreground p-3">
                  No guidebook sponsors yet.{" "}
                  <Link to="/staff/admin/guidebook" className="underline">
                    Add one
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-2">
                  {sponsorsQ.data.sponsors.map((sp: any) => (
                    <li key={sp.id} className="rounded-md border bg-background p-2">
                      <div className="flex items-center gap-2">
                        {sp.logo_url ? (
                          <img
                            src={sp.logo_url}
                            alt=""
                            className="h-8 w-8 object-contain rounded bg-muted"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{sp.company_name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {sp.ad_copy ?? "No ad copy"}
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full mt-2 h-7 text-xs"
                        onClick={() => insertSponsorAt(sp, selectedIdx)}
                      >
                        Insert ad
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
