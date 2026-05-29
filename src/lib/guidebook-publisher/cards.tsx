// Magazine card components built with @react-pdf/renderer primitives.
// These render BOTH the live <PDFViewer> preview and the final downloaded PDF —
// guaranteeing pixel-perfect parity.
import { Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";

// ─── Design tokens ──────────────────────────────────────────────────────
// Card design follows a refined editorial style: thick top accent rule,
// generous padding, restrained type pairing, single saturated CTA chip.
export const TOKENS = {
  page: { w: 612, h: 792, margin: 36, gutter: 12 },
  color: {
    ink: "#0F172A",
    muted: "#475569",
    line: "#E2E8F0",
    paper: "#FFFFFF",
    accent: "#C2410C", // brick-orange accent rule
    accentSoft: "#FEF3EC",
    cta: "#0F172A",
    ctaInk: "#FFFFFF",
    sponsor: "#1E3A5F",
  },
  type: {
    eyebrow: 8,
    meta: 9,
    body: 10,
    title: 16,
    titleLg: 22,
    hero: 34,
  },
};

const s = StyleSheet.create({
  card: {
    borderWidth: 0.75,
    borderColor: TOKENS.color.line,
    backgroundColor: TOKENS.color.paper,
    padding: 14,
    flexDirection: "column",
    overflow: "hidden",
  },
  accentRule: {
    height: 3,
    backgroundColor: TOKENS.color.accent,
    marginBottom: 10,
    width: 36,
  },
  eyebrow: {
    fontSize: TOKENS.type.eyebrow,
    color: TOKENS.color.accent,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  title: {
    fontSize: TOKENS.type.title,
    color: TOKENS.color.ink,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
    marginBottom: 6,
  },
  titleLg: {
    fontSize: TOKENS.type.titleLg,
    color: TOKENS.color.ink,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.1,
    marginBottom: 8,
  },
  meta: {
    fontSize: TOKENS.type.meta,
    color: TOKENS.color.muted,
    fontFamily: "Helvetica",
    marginBottom: 2,
  },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: {
    fontSize: TOKENS.type.meta,
    color: TOKENS.color.ink,
    fontFamily: "Helvetica-Bold",
    width: 44,
  },
  metaValue: {
    fontSize: TOKENS.type.meta,
    color: TOKENS.color.muted,
    fontFamily: "Helvetica",
    flex: 1,
  },
  body: {
    fontSize: TOKENS.type.body,
    color: TOKENS.color.ink,
    fontFamily: "Helvetica",
    lineHeight: 1.4,
    marginTop: 6,
  },
  cta: {
    marginTop: "auto",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: TOKENS.color.cta,
    color: TOKENS.color.ctaInk,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  image: { width: "100%", height: 110, objectFit: "cover", marginBottom: 10 },
  imageLg: { width: "100%", height: 220, objectFit: "cover", marginBottom: 12 },
  divider: { height: 0.5, backgroundColor: TOKENS.color.line, marginVertical: 6 },
  sponsorTag: {
    position: "absolute",
    top: 10,
    right: 10,
    fontSize: 7,
    color: TOKENS.color.sponsor,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────
function fmtDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return "";
  const startDate = fmtDate(start);
  const endDate = end ? fmtDate(end) : null;
  const timeRange =
    start && end && fmtDate(start) === fmtDate(end)
      ? `${fmtTime(start)} – ${fmtTime(end)}`
      : fmtTime(start);
  if (endDate && endDate !== startDate) {
    return `${startDate} – ${endDate}`;
  }
  return `${startDate} · ${timeRange}`;
}

// ─── Card components ────────────────────────────────────────────────────
type CardSize = "hero" | "half" | "quarter";

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

export type EventCardData = {
  title: string;
  start_time: string;
  end_time?: string | null;
  venue_name?: string | null;
  location_name?: string | null;
  description?: string | null;
  image_url?: string | null;
  department_name?: string | null;
};

export function EventCard({ data, size = "quarter" }: { data: EventCardData; size?: CardSize }) {
  const hero = size === "hero";
  const showImg = data.image_url && size !== "quarter";
  return (
    <View style={[s.card, { flex: 1 }]} wrap={false}>
      {showImg ? (
        <Image src={data.image_url!} style={hero ? s.imageLg : s.image} />
      ) : null}
      <View style={s.accentRule} />
      <Text style={s.eyebrow}>
        {data.department_name ? `${data.department_name} · Event` : "Event"}
      </Text>
      <Text style={hero ? s.titleLg : s.title}>{data.title}</Text>
      <View style={{ marginTop: 4 }}>
        <MetaRow label="WHEN" value={fmtRange(data.start_time, data.end_time)} />
        <MetaRow
          label="WHERE"
          value={[data.location_name, data.venue_name].filter(Boolean).join(" · ")}
        />
      </View>
      {data.description ? (
        <Text style={s.body} wrap>
          {data.description}
        </Text>
      ) : null}
      <Text style={s.cta}>Learn More</Text>
    </View>
  );
}

export type ClassCardData = {
  course_title: string;
  start_time: string;
  end_time?: string | null;
  room_name?: string | null;
  venue_name?: string | null;
  instructor_name?: string | null;
  price?: number | null;
  image_url?: string | null;
  description?: string | null;
  department_name?: string | null;
};

export function ClassCard({ data, size = "quarter" }: { data: ClassCardData; size?: CardSize }) {
  const hero = size === "hero";
  const showImg = data.image_url && size !== "quarter";
  return (
    <View style={[s.card, { flex: 1 }]} wrap={false}>
      {showImg ? (
        <Image src={data.image_url!} style={hero ? s.imageLg : s.image} />
      ) : null}
      <View style={[s.accentRule, { backgroundColor: "#0E7C7B" }]} />
      <Text style={[s.eyebrow, { color: "#0E7C7B" }]}>
        {data.department_name ? `${data.department_name} · Class` : "Class"}
      </Text>
      <Text style={hero ? s.titleLg : s.title}>{data.course_title}</Text>
      <View style={{ marginTop: 4 }}>
        <MetaRow label="WHEN" value={fmtRange(data.start_time, data.end_time)} />
        <MetaRow
          label="WHERE"
          value={[data.room_name, data.venue_name].filter(Boolean).join(" · ")}
        />
        <MetaRow label="WITH" value={data.instructor_name ?? undefined} />
        <MetaRow
          label="PRICE"
          value={data.price && data.price > 0 ? `$${data.price.toFixed(2)}` : "Free"}
        />
      </View>
      {data.description ? (
        <Text style={s.body} wrap>
          {data.description}
        </Text>
      ) : null}
      <Text style={[s.cta, { backgroundColor: "#0E7C7B" }]}>Register</Text>
    </View>
  );
}

export type PerformanceCardData = {
  title: string;
  start_time: string;
  end_time?: string | null;
  stage_name?: string | null;
  venue_name?: string | null;
  artist_name?: string | null;
  artist_genre?: string | null;
};

export function PerformanceCard({
  data,
  size = "quarter",
}: {
  data: PerformanceCardData;
  size?: CardSize;
}) {
  const hero = size === "hero";
  return (
    <View style={[s.card, { flex: 1 }]} wrap={false}>
      <View style={[s.accentRule, { backgroundColor: "#9333EA" }]} />
      <Text style={[s.eyebrow, { color: "#9333EA" }]}>
        {data.artist_genre ? `Live · ${data.artist_genre}` : "Live Performance"}
      </Text>
      <Text style={hero ? s.titleLg : s.title}>
        {data.artist_name ?? data.title}
      </Text>
      {data.artist_name && data.title && data.artist_name !== data.title ? (
        <Text style={s.meta}>{data.title}</Text>
      ) : null}
      <View style={{ marginTop: 4 }}>
        <MetaRow label="WHEN" value={fmtRange(data.start_time, data.end_time)} />
        <MetaRow
          label="STAGE"
          value={[data.stage_name, data.venue_name].filter(Boolean).join(" · ")}
        />
      </View>
      <Text style={[s.cta, { backgroundColor: "#9333EA" }]}>RSVP</Text>
    </View>
  );
}

export type SponsorAdCardData = {
  company_name: string;
  ad_copy?: string | null;
  logo_url?: string | null;
};

export function SponsorAdCard({
  data,
  size = "quarter",
}: {
  data: SponsorAdCardData;
  size?: CardSize;
}) {
  const hero = size === "hero";
  return (
    <View
      style={[
        s.card,
        {
          flex: 1,
          backgroundColor: TOKENS.color.accentSoft,
          borderColor: TOKENS.color.accent,
          alignItems: "center",
          justifyContent: "center",
          padding: 18,
        },
      ]}
      wrap={false}
    >
      <Text style={s.sponsorTag}>Paid Sponsor</Text>
      {data.logo_url ? (
        <Image
          src={data.logo_url}
          style={{
            width: hero ? 220 : 110,
            height: hero ? 110 : 60,
            objectFit: "contain",
            marginBottom: 10,
          }}
        />
      ) : null}
      <Text
        style={[
          hero ? s.titleLg : s.title,
          { textAlign: "center", marginBottom: 6 },
        ]}
      >
        {data.company_name}
      </Text>
      {data.ad_copy ? (
        <Text
          style={[s.body, { textAlign: "center", marginTop: 0 }]}
          wrap
        >
          {data.ad_copy}
        </Text>
      ) : null}
    </View>
  );
}

export function CoverCard({
  title,
  startDate,
  endDate,
}: {
  title: string;
  startDate: string;
  endDate: string;
}) {
  return (
    <View
      style={[
        s.card,
        {
          flex: 1,
          padding: 36,
          justifyContent: "flex-end",
          backgroundColor: TOKENS.color.ink,
        },
      ]}
    >
      <View style={[s.accentRule, { width: 60, height: 4 }]} />
      <Text
        style={{
          fontSize: 11,
          color: TOKENS.color.accent,
          letterSpacing: 2,
          textTransform: "uppercase",
          fontFamily: "Helvetica-Bold",
          marginBottom: 10,
        }}
      >
        Program Guide
      </Text>
      <Text
        style={{
          fontSize: 44,
          color: "#FFFFFF",
          fontFamily: "Helvetica-Bold",
          lineHeight: 1.05,
          marginBottom: 16,
        }}
      >
        {title}
      </Text>
      <Text style={{ fontSize: 12, color: "#94A3B8", fontFamily: "Helvetica" }}>
        {fmtDate(startDate)} — {fmtDate(endDate)}
      </Text>
    </View>
  );
}
