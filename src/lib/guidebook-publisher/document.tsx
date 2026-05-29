// Page assembly: cover page + interior pages laid out via a snap grid.
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import {
  CoverCard,
  EventCard,
  ClassCard,
  PerformanceCard,
  SponsorAdCard,
  TOKENS,
  type EventCardData,
  type ClassCardData,
  type PerformanceCardData,
  type SponsorAdCardData,
} from "./cards";

// ─── Item model ─────────────────────────────────────────────────────────
export type PublisherItem =
  | { id: string; kind: "event"; hidden?: boolean; data: EventCardData }
  | { id: string; kind: "class"; hidden?: boolean; data: ClassCardData }
  | { id: string; kind: "performance"; hidden?: boolean; data: PerformanceCardData }
  | { id: string; kind: "ad"; hidden?: boolean; data: SponsorAdCardData };

// ─── Snap grid presets ──────────────────────────────────────────────────
// Each preset defines the interior page layout. Cover is always a separate page.
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
  grid: {
    flex: 1,
    flexDirection: "column",
  },
  row: {
    flexDirection: "row",
    flex: 1,
    marginBottom: TOKENS.page.gutter,
  },
  rowLast: { marginBottom: 0 },
  cellWrap: { marginRight: TOKENS.page.gutter, flex: 1 },
  cellWrapLast: { flex: 1 },
});

function renderCard(item: PublisherItem, size: "hero" | "half" | "quarter") {
  if (item.kind === "event") return <EventCard data={item.data} size={size} />;
  if (item.kind === "class") return <ClassCard data={item.data} size={size} />;
  if (item.kind === "performance") return <PerformanceCard data={item.data} size={size} />;
  return <SponsorAdCard data={item.data} size={size} />;
}

function cardSizeFor(preset: GridPreset): "hero" | "half" | "quarter" {
  if (preset.perPage === 1) return "hero";
  if (preset.perPage === 2) return "half";
  return "quarter";
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ─── Document ───────────────────────────────────────────────────────────
export function GuidebookDocument({
  title,
  startDate,
  endDate,
  items,
  preset,
}: {
  title: string;
  startDate: string;
  endDate: string;
  items: PublisherItem[];
  preset: GridPreset;
}) {
  const visible = items.filter((i) => !i.hidden);
  const pages = chunk(visible, preset.perPage);
  const totalPages = pages.length + 1; // + cover
  const size = cardSizeFor(preset);

  return (
    <Document title={title} author="Total Events System Solutions">
      {/* Cover */}
      <Page size="LETTER" style={[pageStyles.page, { padding: 0 }]}>
        <CoverCard title={title} startDate={startDate} endDate={endDate} />
      </Page>

      {pages.map((pageItems, pIdx) => {
        const rows = chunk(pageItems, preset.cols);
        // Pad final row so layout doesn't expand single cells
        while (rows.length && rows[rows.length - 1].length < preset.cols) {
          rows[rows.length - 1].push(null as any);
        }
        // Pad row count to maintain grid height
        while (rows.length < preset.rows) rows.push(new Array(preset.cols).fill(null));

        return (
          <Page key={pIdx} size="LETTER" style={pageStyles.page}>
            <View style={pageStyles.pageHeader}>
              <Text style={pageStyles.pageTitle}>{title}</Text>
              <Text style={pageStyles.pageFolio}>
                Page {pIdx + 2} of {totalPages}
              </Text>
            </View>
            <View style={pageStyles.grid}>
              {rows.map((row, rIdx) => (
                <View
                  key={rIdx}
                  style={[pageStyles.row, rIdx === rows.length - 1 ? pageStyles.rowLast : {}]}
                >
                  {row.map((item, cIdx) => (
                    <View
                      key={cIdx}
                      style={cIdx === row.length - 1 ? pageStyles.cellWrapLast : pageStyles.cellWrap}
                    >
                      {item ? (
                        renderCard(item, size)
                      ) : (
                        <View style={{ flex: 1 }} />
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
