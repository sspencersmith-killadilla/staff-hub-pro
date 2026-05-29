// Page assembly: cover page + interior pages laid out via a snap grid that
// supports per-item span (width × height in grid cells) via bin-packing.
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import {
  CoverCard,
  EventCard,
  ClassCard,
  PerformanceCard,
  SponsorAdCard,
  TextCard,
  ImageCard,
  TOKENS,
  type EventCardData,
  type ClassCardData,
  type PerformanceCardData,
  type SponsorAdCardData,
  type TextCardData,
  type ImageCardData,
} from "./cards";

// ─── Item model ─────────────────────────────────────────────────────────
export type GridSpan = { w: number; h: number };

export type PublisherItemBase = {
  id: string;
  hidden?: boolean;
  /** Cells wide / tall in current snap grid. Defaults to {1,1}. */
  span?: GridSpan;
};
export type PublisherItem =
  | (PublisherItemBase & { kind: "event"; data: EventCardData })
  | (PublisherItemBase & { kind: "class"; data: ClassCardData })
  | (PublisherItemBase & { kind: "performance"; data: PerformanceCardData })
  | (PublisherItemBase & { kind: "ad"; data: SponsorAdCardData });

// ─── Snap grid presets ──────────────────────────────────────────────────
export type GridPreset = {
  id: string;
  label: string;
  cols: number;
  rows: number;
  perPage: number;
};

export const GRID_PRESETS: GridPreset[] = [
  { id: "2x2", label: "4 per page (2×2)", cols: 2, rows: 2, perPage: 4 },
  { id: "1x2", label: "2 per page (1×2)", cols: 1, rows: 2, perPage: 2 },
  { id: "2x3", label: "6 per page (2×3)", cols: 2, rows: 3, perPage: 6 },
  { id: "1x1", label: "1 per page (full)", cols: 1, rows: 1, perPage: 1 },
];

// ─── Bin-packing ────────────────────────────────────────────────────────
type Placement = {
  item: PublisherItem;
  row: number;
  col: number;
  w: number;
  h: number;
};

function clampSpan(span: GridSpan | undefined, preset: GridPreset): GridSpan {
  const w = Math.max(1, Math.min(preset.cols, span?.w ?? 1));
  const h = Math.max(1, Math.min(preset.rows, span?.h ?? 1));
  return { w, h };
}

function packPages(items: PublisherItem[], preset: GridPreset): Placement[][] {
  const pages: Placement[][] = [];
  let grid: boolean[][] = [];
  let placements: Placement[] = [];

  const newPage = () => {
    if (placements.length) pages.push(placements);
    grid = Array.from({ length: preset.rows }, () =>
      new Array(preset.cols).fill(false),
    );
    placements = [];
  };
  newPage();

  const fits = (r: number, c: number, w: number, h: number) => {
    if (r + h > preset.rows || c + w > preset.cols) return false;
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++) if (grid[r + dr][c + dc]) return false;
    return true;
  };
  const occupy = (r: number, c: number, w: number, h: number) => {
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++) grid[r + dr][c + dc] = true;
  };

  for (const item of items) {
    const { w, h } = clampSpan(item.span, preset);
    let placed = false;
    for (let attempt = 0; attempt < 2 && !placed; attempt++) {
      for (let r = 0; r < preset.rows && !placed; r++) {
        for (let c = 0; c < preset.cols && !placed; c++) {
          if (fits(r, c, w, h)) {
            occupy(r, c, w, h);
            placements.push({ item, row: r, col: c, w, h });
            placed = true;
          }
        }
      }
      if (!placed) newPage();
    }
  }
  if (placements.length) pages.push(placements);
  return pages;
}

// ─── Styles ─────────────────────────────────────────────────────────────
const pageStyles = StyleSheet.create({
  page: {
    backgroundColor: "#F8FAFC",
    padding: TOKENS.page.margin,
    flexDirection: "column",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingBottom: 8,
    marginBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: TOKENS.color.line,
  },
  pageTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: TOKENS.color.ink,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  pageFolio: {
    fontSize: 9,
    fontFamily: "Helvetica",
    color: TOKENS.color.muted,
  },
  gridStage: { flex: 1, position: "relative" },
});

function renderCard(item: PublisherItem, sizeHint: "hero" | "half" | "quarter") {
  if (item.kind === "event") return <EventCard data={item.data} size={sizeHint} />;
  if (item.kind === "class") return <ClassCard data={item.data} size={sizeHint} />;
  if (item.kind === "performance")
    return <PerformanceCard data={item.data} size={sizeHint} />;
  return <SponsorAdCard data={item.data} size={sizeHint} />;
}

function sizeHintFor(cells: number, totalCells: number): "hero" | "half" | "quarter" {
  if (cells === totalCells) return "hero";
  if (cells * 2 >= totalCells) return "half";
  return "quarter";
}

// ─── Document ───────────────────────────────────────────────────────────
export function GuidebookDocument({
  title,
  startDate,
  endDate,
  items,
  preset,
  coverImageUrl,
  coverSubtitle,
}: {
  title: string;
  startDate: string;
  endDate: string;
  items: PublisherItem[];
  preset: GridPreset;
  coverImageUrl?: string | null;
  coverSubtitle?: string | null;
}) {
  const visible = items.filter((i) => !i.hidden);
  const pages = packPages(visible, preset);
  const totalPages = pages.length + 1; // + cover

  // Stage dimensions inside page padding (LETTER 612x792 minus 2*margin)
  const stageW = TOKENS.page.w - TOKENS.page.margin * 2;
  const stageH = TOKENS.page.h - TOKENS.page.margin * 2 - TOKENS.page.headerH;
  const cellW = (stageW - TOKENS.page.gutter * (preset.cols - 1)) / preset.cols;
  const cellH = (stageH - TOKENS.page.gutter * (preset.rows - 1)) / preset.rows;
  const totalCells = preset.cols * preset.rows;

  return (
    <Document title={title} author="Total Events System Solutions">
      {/* Cover */}
      <Page size="LETTER" style={[pageStyles.page, { padding: 0 }]}>
        <CoverCard
          title={title}
          startDate={startDate}
          endDate={endDate}
          coverImageUrl={coverImageUrl ?? null}
          subtitle={coverSubtitle ?? null}
        />
      </Page>

      {pages.map((placements, pIdx) => (
        <Page key={pIdx} size="LETTER" style={pageStyles.page}>
          <View style={pageStyles.pageHeader}>
            <Text style={pageStyles.pageTitle}>{title}</Text>
            <Text style={pageStyles.pageFolio}>
              Page {pIdx + 2} of {totalPages}
            </Text>
          </View>
          <View style={pageStyles.gridStage}>
            {placements.map((p, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: p.col * (cellW + TOKENS.page.gutter),
                  top: p.row * (cellH + TOKENS.page.gutter),
                  width: cellW * p.w + TOKENS.page.gutter * (p.w - 1),
                  height: cellH * p.h + TOKENS.page.gutter * (p.h - 1),
                }}
              >
                {renderCard(p.item, sizeHintFor(p.w * p.h, totalCells))}
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
}
