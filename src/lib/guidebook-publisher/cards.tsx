// Magazine card components built with @react-pdf/renderer primitives.
// These render BOTH the live <PDFViewer> preview and the final downloaded PDF —
// guaranteeing pixel-perfect parity.
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// ─── Design tokens ──────────────────────────────────────────────────────
export const TOKENS = {
  page: { w: 612, h: 792, margin: 36, gutter: 12, headerH: 30 },
  color: {
    ink: "#0F172A",
    muted: "#475569",
    line: "#E2E8F0",
    paper: "#FFFFFF",
    accent: "#C2410C",
    accentSoft: "#FEF3EC",
    cta: "#0F172A",
    ctaInk: "#FFFFFF",
    sponsor: "#1E3A5F",
    sponsorBg: "#EEF4FB",
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
    height: "100%",
    width: "100%",
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
  imageSm: { width: "100%", height: 64, objectFit: "cover", marginBottom: 8 },
  imageLg: { width: "100%", height: 220, objectFit: "cover", marginBottom: 12 },
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
  sponsorCallout: {
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: TOKENS.color.sponsor,
    backgroundColor: TOKENS.color.sponsorBg,
    paddingVertical: 5,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sponsorCalloutText: {
    fontSize: 8,
    color: TOKENS.color.sponsor,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.6,
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

// ─── Card types ─────────────────────────────────────────────────────────
type CardSize = "hero" | "half" | "quarter";

export type SponsorRef = {
  company_name: string;
  logo_url?: string | null;
  tagline?: string | null;
};

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

function SponsorCallout({ sponsor }: { sponsor?: SponsorRef | null }) {
  if (!sponsor) return null;
  return (
    <View style={s.sponsorCallout} wrap={false}>
      {sponsor.logo_url ? (
        <Image
          src={sponsor.logo_url}
          style={{ width: 22, height: 14, objectFit: "contain" }}
        />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.sponsorCalloutText}>
          PRESENTED BY {sponsor.company_name.toUpperCase()}
        </Text>
        {sponsor.tagline ? (
          <Text style={{ fontSize: 7, color: TOKENS.color.muted, marginTop: 1 }}>
            {sponsor.tagline}
          </Text>
        ) : null}
      </View>
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
  show_image?: boolean;
  focal_x?: number | null;
  focal_y?: number | null;
  department_name?: string | null;
  cta_label?: string | null;
  eyebrow_override?: string | null;
  sponsor?: SponsorRef | null;
};

function focalStyle(x?: number | null, y?: number | null) {
  return { objectPosition: `${x ?? 50}% ${y ?? 50}%` } as const;
}

export function EventCard({ data, size = "quarter" }: { data: EventCardData; size?: CardSize }) {
  const hero = size === "hero";
  const showImg = !!data.image_url && (data.show_image ?? true);
  const imgStyle = hero ? s.imageLg : size === "quarter" ? s.imageSm : s.image;
  return (
    <View style={s.card} wrap={false}>
      {showImg ? (
        <Image src={data.image_url!} style={[imgStyle, focalStyle(data.focal_x, data.focal_y)]} />
      ) : null}
      <View style={s.accentRule} />
      <Text style={s.eyebrow}>
        {data.eyebrow_override ??
          (data.department_name ? `${data.department_name} · Event` : "Event")}
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
      <SponsorCallout sponsor={data.sponsor} />
      <Text style={s.cta}>{data.cta_label ?? "Learn More"}</Text>
    </View>
  );
}

export type ClassSession = {
  id?: string;
  start_time: string | null;
  end_time?: string | null;
  room_name?: string | null;
  venue_name?: string | null;
  instructor_name?: string | null;
};

export type ClassCardData = {
  course_title: string;
  start_time: string;
  end_time?: string | null;
  room_name?: string | null;
  venue_name?: string | null;
  instructor_name?: string | null;
  price?: number | null;
  image_url?: string | null;
  show_image?: boolean;
  focal_x?: number | null;
  focal_y?: number | null;
  description?: string | null;
  department_name?: string | null;
  cta_label?: string | null;
  eyebrow_override?: string | null;
  sponsor?: SponsorRef | null;
  sessions?: ClassSession[];
};

function fmtSessionLine(sess: ClassSession) {
  const range = fmtRange(sess.start_time, sess.end_time);
  const where = [sess.room_name, sess.venue_name].filter(Boolean).join(" · ");
  return where ? `${range} — ${where}` : range;
}

export function ClassCard({ data, size = "quarter" }: { data: ClassCardData; size?: CardSize }) {
  const hero = size === "hero";
  const showImg = !!data.image_url && (data.show_image ?? true);
  const imgStyle = hero ? s.imageLg : size === "quarter" ? s.imageSm : s.image;
  return (
    <View style={s.card} wrap={false}>
      {showImg ? (
        <Image src={data.image_url!} style={[imgStyle, focalStyle(data.focal_x, data.focal_y)]} />
      ) : null}
      <View style={[s.accentRule, { backgroundColor: "#0E7C7B" }]} />
      <Text style={[s.eyebrow, { color: "#0E7C7B" }]}>
        {data.eyebrow_override ??
          (data.department_name ? `${data.department_name} · Class` : "Class")}
      </Text>
      <Text style={hero ? s.titleLg : s.title}>{data.course_title}</Text>
      <View style={{ marginTop: 4 }}>
        {data.sessions && data.sessions.length > 1 ? (
          <View style={{ marginBottom: 4 }}>
            <Text style={[s.metaLabel, { width: "auto", marginBottom: 2 }]}>SESSIONS</Text>
            {data.sessions.slice(0, hero ? 12 : size === "half" ? 8 : 5).map((sess, i) => (
              <Text key={i} style={s.metaValue}>• {fmtSessionLine(sess)}</Text>
            ))}
            {data.sessions.length > (hero ? 12 : size === "half" ? 8 : 5) ? (
              <Text style={[s.metaValue, { fontStyle: "italic" }]}>
                +{data.sessions.length - (hero ? 12 : size === "half" ? 8 : 5)} more
              </Text>
            ) : null}
          </View>
        ) : (
          <>
            <MetaRow label="WHEN" value={fmtRange(data.start_time, data.end_time)} />
            <MetaRow
              label="WHERE"
              value={[data.room_name, data.venue_name].filter(Boolean).join(" · ")}
            />
          </>
        )}
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
      <SponsorCallout sponsor={data.sponsor} />
      <Text style={[s.cta, { backgroundColor: "#0E7C7B" }]}>{data.cta_label ?? "Register"}</Text>
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
  description?: string | null;
  image_url?: string | null;
  show_image?: boolean;
  focal_x?: number | null;
  focal_y?: number | null;
  cta_label?: string | null;
  eyebrow_override?: string | null;
  sponsor?: SponsorRef | null;
};

export function PerformanceCard({
  data,
  size = "quarter",
}: {
  data: PerformanceCardData;
  size?: CardSize;
}) {
  const hero = size === "hero";
  const showImg = !!data.image_url && (data.show_image ?? true);
  const imgStyle = hero ? s.imageLg : size === "quarter" ? s.imageSm : s.image;
  return (
    <View style={s.card} wrap={false}>
      {showImg ? <Image src={data.image_url!} style={[imgStyle, focalStyle(data.focal_x, data.focal_y)]} /> : null}
      <View style={[s.accentRule, { backgroundColor: "#9333EA" }]} />
      <Text style={[s.eyebrow, { color: "#9333EA" }]}>
        {data.eyebrow_override ??
          (data.artist_genre ? `Live · ${data.artist_genre}` : "Live Performance")}
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
      {data.description ? (
        <Text style={s.body} wrap>
          {data.description}
        </Text>
      ) : null}
      <SponsorCallout sponsor={data.sponsor} />
      <Text style={[s.cta, { backgroundColor: "#9333EA" }]}>{data.cta_label ?? "RSVP"}</Text>
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
        <Text style={[s.body, { textAlign: "center", marginTop: 0 }]} wrap>
          {data.ad_copy}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Custom Text Card ─────────────────────────────────────────────────
export type TextCardData = {
  heading?: string | null;
  body?: string | null;
  eyebrow?: string | null;
  align?: "left" | "center";
  background?: "paper" | "accent" | "ink";
};

export function TextCard({ data, size = "quarter" }: { data: TextCardData; size?: CardSize }) {
  const hero = size === "hero";
  const bg =
    data.background === "accent"
      ? TOKENS.color.accentSoft
      : data.background === "ink"
        ? TOKENS.color.ink
        : TOKENS.color.paper;
  const ink = data.background === "ink" ? "#FFFFFF" : TOKENS.color.ink;
  const muted = data.background === "ink" ? "#CBD5E1" : TOKENS.color.muted;
  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: bg,
          alignItems: data.align === "center" ? "center" : "flex-start",
          justifyContent: "center",
          padding: 18,
        },
      ]}
      wrap={false}
    >
      {data.eyebrow ? (
        <Text style={[s.eyebrow, { color: TOKENS.color.accent }]}>{data.eyebrow}</Text>
      ) : null}
      {data.heading ? (
        <Text
          style={[
            hero ? s.titleLg : s.title,
            { color: ink, textAlign: data.align ?? "left", marginBottom: 6 },
          ]}
        >
          {data.heading}
        </Text>
      ) : null}
      {data.body ? (
        <Text
          style={[s.body, { color: muted, textAlign: data.align ?? "left", marginTop: 0 }]}
          wrap
        >
          {data.body}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Custom Image Card ────────────────────────────────────────────────
export type ImageCardData = {
  image_url: string;
  caption?: string | null;
  focal_x?: number | null;
  focal_y?: number | null;
};

export function ImageCard({ data }: { data: ImageCardData; size?: CardSize }) {
  return (
    <View style={[s.card, { padding: 0, overflow: "hidden" }]} wrap={false}>
      {data.image_url ? (
        <Image
          src={data.image_url}
          style={[
            { width: "100%", height: data.caption ? "85%" : "100%", objectFit: "cover" },
            focalStyle(data.focal_x, data.focal_y),
          ]}
        />
      ) : (
        <View
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: TOKENS.color.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 10, color: TOKENS.color.muted }}>No image</Text>
        </View>
      )}
      {data.caption ? (
        <View style={{ padding: 8 }}>
          <Text style={{ fontSize: 9, color: TOKENS.color.muted, fontFamily: "Helvetica" }}>
            {data.caption}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function CoverCard({
  title,
  startDate,
  endDate,
  coverImageUrl,
  subtitle,
}: {
  title: string;
  startDate: string;
  endDate: string;
  coverImageUrl?: string | null;
  subtitle?: string | null;
}) {
  return (
    <View
      style={[
        s.card,
        {
          padding: 0,
          backgroundColor: TOKENS.color.ink,
          borderWidth: 0,
        },
      ]}
    >
      {coverImageUrl ? (
        <Image
          src={coverImageUrl}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.55,
          }}
        />
      ) : null}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: 36,
          backgroundColor: "rgba(15,23,42,0.65)",
        }}
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
            marginBottom: 12,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 13, color: "#E2E8F0", marginBottom: 12 }}>
            {subtitle}
          </Text>
        ) : null}
        <Text style={{ fontSize: 12, color: "#94A3B8", fontFamily: "Helvetica" }}>
          {fmtDate(startDate)} — {fmtDate(endDate)}
        </Text>
      </View>
    </View>
  );
}
