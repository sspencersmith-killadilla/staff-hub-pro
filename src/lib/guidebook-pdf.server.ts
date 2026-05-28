// SERVER ONLY — Build a print-ready Program Guide PDF using pdf-lib.
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";

export type GuidebookEvent = {
  id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  department_name: string | null;
  venue_name: string | null;
  location_name: string | null; // room or stage
};

export type GuidebookGig = {
  id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  stage_name: string | null;
  venue_name: string | null;
  department_name: string | null;
  artist_name: string | null;
  artist_genre: string | null;
};

export type GuidebookSponsor = {
  id: string;
  company_name: string;
  ad_copy: string | null;
  logo_bytes: Uint8Array | null;
  logo_mime: string | null;
};

export type GuidebookInput = {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  title: string;
  events: GuidebookEvent[];
  gigs: GuidebookGig[];
  sponsors: GuidebookSponsor[];
};

const PAGE_W = 612; // US Letter portrait
const PAGE_H = 792;
const MARGIN = 54;
const NAVY = rgb(0.06, 0.11, 0.24);
const ACCENT = rgb(0.83, 0.66, 0.3);
const MUTED = rgb(0.35, 0.4, 0.48);
const BORDER = rgb(0.8, 0.83, 0.88);

function fmtDateLong(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
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
function fmtTime(iso: string | null) {
  if (!iso) return "TBA";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
function dateKey(iso: string | null) {
  if (!iso) return "0000-00-00";
  return new Date(iso).toISOString().slice(0, 10);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = trial;
  }
  if (cur) lines.push(cur);
  return lines;
}

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  pageNum: number;
  sponsors: GuidebookSponsor[];
  sponsorIdx: number;
  pagesSinceAd: number;
};

function newPage(ctx: Ctx) {
  drawPageFooter(ctx);
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
  ctx.pageNum += 1;
  ctx.pagesSinceAd += 1;
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN + 40) newPage(ctx);
}

function drawPageFooter(ctx: Ctx) {
  if (ctx.pageNum < 2) return;
  ctx.page.drawText(`Page ${ctx.pageNum - 1}`, {
    x: PAGE_W / 2 - 20,
    y: MARGIN / 2,
    size: 9,
    font: ctx.font,
    color: MUTED,
  });
  // Footer micro-ad rotation every page
  const sponsor = pickSponsor(ctx);
  if (sponsor) {
    const text = `Brought to you by ${sponsor.company_name}`;
    const w = ctx.italic.widthOfTextAtSize(text, 8);
    ctx.page.drawText(text, {
      x: PAGE_W - MARGIN - w,
      y: MARGIN / 2,
      size: 8,
      font: ctx.italic,
      color: MUTED,
    });
  }
}

function pickSponsor(ctx: Ctx): GuidebookSponsor | null {
  if (!ctx.sponsors.length) return null;
  const s = ctx.sponsors[ctx.sponsorIdx % ctx.sponsors.length];
  ctx.sponsorIdx += 1;
  return s;
}

async function embedLogo(ctx: Ctx, sponsor: GuidebookSponsor) {
  if (!sponsor.logo_bytes) return null;
  try {
    if (sponsor.logo_mime?.includes("png")) {
      return await ctx.doc.embedPng(sponsor.logo_bytes);
    }
    return await ctx.doc.embedJpg(sponsor.logo_bytes);
  } catch {
    try {
      return await ctx.doc.embedPng(sponsor.logo_bytes);
    } catch {
      return null;
    }
  }
}

async function drawHalfPageAd(ctx: Ctx) {
  const sponsor = pickSponsor(ctx);
  if (!sponsor) return;
  ensureSpace(ctx, 240);
  const top = ctx.y;
  const h = 220;
  const bottom = top - h;
  ctx.page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: PAGE_W - 2 * MARGIN,
    height: h,
    borderColor: ACCENT,
    borderWidth: 1.5,
  });
  ctx.page.drawText("SPONSORED", {
    x: MARGIN + 14,
    y: top - 18,
    size: 8,
    font: ctx.bold,
    color: ACCENT,
  });
  ctx.page.drawText(sponsor.company_name, {
    x: MARGIN + 14,
    y: top - 42,
    size: 18,
    font: ctx.bold,
    color: NAVY,
  });
  const logo = await embedLogo(ctx, sponsor);
  if (logo) {
    const maxW = 140;
    const maxH = 140;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    ctx.page.drawImage(logo, {
      x: PAGE_W - MARGIN - lw - 14,
      y: bottom + (h - lh) / 2,
      width: lw,
      height: lh,
    });
  }
  if (sponsor.ad_copy) {
    const lines = wrapText(sponsor.ad_copy, ctx.font, 11, PAGE_W - 2 * MARGIN - 180);
    let yy = top - 70;
    for (const ln of lines.slice(0, 8)) {
      ctx.page.drawText(ln, { x: MARGIN + 14, y: yy, size: 11, font: ctx.font, color: NAVY });
      yy -= 15;
    }
  }
  ctx.y = bottom - 20;
  ctx.pagesSinceAd = 0;
}

async function drawFullPageAd(ctx: Ctx) {
  const sponsor = pickSponsor(ctx);
  if (!sponsor) return;
  newPage(ctx);
  ctx.page.drawRectangle({
    x: MARGIN,
    y: MARGIN,
    width: PAGE_W - 2 * MARGIN,
    height: PAGE_H - 2 * MARGIN,
    borderColor: ACCENT,
    borderWidth: 2,
  });
  ctx.page.drawText("SPONSORED", {
    x: MARGIN + 20,
    y: PAGE_H - MARGIN - 30,
    size: 10,
    font: ctx.bold,
    color: ACCENT,
  });
  const logo = await embedLogo(ctx, sponsor);
  if (logo) {
    const maxW = 280;
    const maxH = 240;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    ctx.page.drawImage(logo, {
      x: (PAGE_W - lw) / 2,
      y: PAGE_H / 2 + 30,
      width: lw,
      height: lh,
    });
  }
  const nameWidth = ctx.bold.widthOfTextAtSize(sponsor.company_name, 30);
  ctx.page.drawText(sponsor.company_name, {
    x: (PAGE_W - nameWidth) / 2,
    y: PAGE_H / 2 - 10,
    size: 30,
    font: ctx.bold,
    color: NAVY,
  });
  if (sponsor.ad_copy) {
    const lines = wrapText(sponsor.ad_copy, ctx.font, 13, PAGE_W - 2 * MARGIN - 40);
    let yy = PAGE_H / 2 - 50;
    for (const ln of lines.slice(0, 14)) {
      const w = ctx.font.widthOfTextAtSize(ln, 13);
      ctx.page.drawText(ln, { x: (PAGE_W - w) / 2, y: yy, size: 13, font: ctx.font, color: NAVY });
      yy -= 18;
    }
  }
  ctx.y = MARGIN;
  ctx.pagesSinceAd = 0;
}

function drawSectionHeader(ctx: Ctx, label: string) {
  ensureSpace(ctx, 60);
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 28,
    width: PAGE_W - 2 * MARGIN,
    height: 28,
    color: NAVY,
  });
  ctx.page.drawText(label.toUpperCase(), {
    x: MARGIN + 12,
    y: ctx.y - 20,
    size: 13,
    font: ctx.bold,
    color: rgb(1, 1, 1),
  });
  ctx.y -= 40;
}

function drawSubHeader(ctx: Ctx, label: string) {
  ensureSpace(ctx, 30);
  ctx.page.drawText(label, {
    x: MARGIN,
    y: ctx.y - 14,
    size: 12,
    font: ctx.bold,
    color: ACCENT,
  });
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 18 },
    end: { x: PAGE_W - MARGIN, y: ctx.y - 18 },
    thickness: 0.5,
    color: BORDER,
  });
  ctx.y -= 28;
}

function drawEvent(ctx: Ctx, e: GuidebookEvent) {
  const titleLines = wrapText(e.title, ctx.bold, 12, PAGE_W - 2 * MARGIN - 110);
  const descLines = e.description
    ? wrapText(e.description, ctx.font, 9.5, PAGE_W - 2 * MARGIN - 20).slice(0, 3)
    : [];
  const needed = 22 + titleLines.length * 14 + descLines.length * 12 + 8;
  ensureSpace(ctx, needed);
  const time = `${fmtTime(e.start_time)}${e.end_time ? `–${fmtTime(e.end_time)}` : ""}`;
  ctx.page.drawText(time, { x: MARGIN, y: ctx.y, size: 10, font: ctx.bold, color: NAVY });
  let yy = ctx.y;
  for (let i = 0; i < titleLines.length; i++) {
    ctx.page.drawText(titleLines[i], {
      x: MARGIN + 100,
      y: yy - i * 13,
      size: 12,
      font: ctx.bold,
      color: NAVY,
    });
  }
  yy -= titleLines.length * 13;
  const meta = [e.location_name, e.venue_name].filter(Boolean).join(" · ");
  if (meta) {
    ctx.page.drawText(meta, { x: MARGIN + 100, y: yy - 2, size: 9, font: ctx.italic, color: MUTED });
    yy -= 12;
  }
  for (const ln of descLines) {
    ctx.page.drawText(ln, { x: MARGIN + 100, y: yy - 2, size: 9.5, font: ctx.font, color: NAVY });
    yy -= 12;
  }
  ctx.y = yy - 10;
}

function drawGig(ctx: Ctx, g: GuidebookGig) {
  ensureSpace(ctx, 36);
  const time = `${fmtTime(g.start_time)}${g.end_time ? `–${fmtTime(g.end_time)}` : ""}`;
  ctx.page.drawText(time, { x: MARGIN, y: ctx.y, size: 10, font: ctx.bold, color: NAVY });
  ctx.page.drawText(g.title || g.artist_name || "Performance", {
    x: MARGIN + 100,
    y: ctx.y,
    size: 11,
    font: ctx.bold,
    color: NAVY,
  });
  const meta = [g.artist_name, g.artist_genre, g.stage_name, g.venue_name]
    .filter(Boolean)
    .join(" · ");
  if (meta) {
    ctx.page.drawText(meta, {
      x: MARGIN + 100,
      y: ctx.y - 12,
      size: 9,
      font: ctx.italic,
      color: MUTED,
    });
  }
  ctx.y -= 28;
}

export async function buildGuidebookPdf(input: GuidebookInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(input.title);
  doc.setCreator("Total Events System Solutions");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const ctx: Ctx = {
    doc,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    font,
    bold,
    italic,
    pageNum: 1,
    sponsors: input.sponsors,
    sponsorIdx: 0,
    pagesSinceAd: 0,
  };

  // ── Cover page ──
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 220, width: PAGE_W, height: 220, color: NAVY });
  ctx.page.drawText("PROGRAM", {
    x: MARGIN,
    y: PAGE_H - 110,
    size: 48,
    font: bold,
    color: rgb(1, 1, 1),
  });
  ctx.page.drawText("GUIDE", {
    x: MARGIN,
    y: PAGE_H - 160,
    size: 48,
    font: bold,
    color: ACCENT,
  });
  ctx.page.drawText(input.title, {
    x: MARGIN,
    y: PAGE_H - 190,
    size: 14,
    font: italic,
    color: rgb(1, 1, 1),
  });
  ctx.page.drawText(`${fmtDateLong(input.startDate)} – ${fmtDateLong(input.endDate)}`, {
    x: MARGIN,
    y: PAGE_H - 260,
    size: 14,
    font: bold,
    color: NAVY,
  });
  ctx.page.drawText(
    `${input.events.length} events · ${input.gigs.length} StreetBeats performances`,
    {
      x: MARGIN,
      y: PAGE_H - 285,
      size: 11,
      font,
      color: MUTED,
    },
  );

  // Cover sponsor logo if any
  const heroSponsor = input.sponsors[0];
  if (heroSponsor) {
    const logo = await embedLogo(ctx, heroSponsor);
    if (logo) {
      const maxW = 220;
      const maxH = 180;
      const scale = Math.min(maxW / logo.width, maxH / logo.height);
      const lw = logo.width * scale;
      const lh = logo.height * scale;
      ctx.page.drawImage(logo, {
        x: (PAGE_W - lw) / 2,
        y: 180,
        width: lw,
        height: lh,
      });
      ctx.page.drawText("Presented in partnership with", {
        x: (PAGE_W - font.widthOfTextAtSize("Presented in partnership with", 10)) / 2,
        y: 180 + lh + 16,
        size: 10,
        font: italic,
        color: MUTED,
      });
      ctx.page.drawText(heroSponsor.company_name, {
        x: (PAGE_W - bold.widthOfTextAtSize(heroSponsor.company_name, 14)) / 2,
        y: 160,
        size: 14,
        font: bold,
        color: NAVY,
      });
    }
  }

  // ── Full-page ad after cover ──
  if (input.sponsors.length > 1) await drawFullPageAd(ctx);

  // ── Events grouped by date then by department ──
  newPage(ctx);
  drawSectionHeader(ctx, "Events");

  const eventsByDay = new Map<string, GuidebookEvent[]>();
  for (const e of input.events) {
    const k = dateKey(e.start_time);
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k)!.push(e);
  }
  const sortedDays = Array.from(eventsByDay.keys()).sort();
  for (const day of sortedDays) {
    drawSubHeader(ctx, fmtDayHeader(day));
    const dayEvents = eventsByDay.get(day)!.sort((a, b) => {
      return (a.start_time ?? "").localeCompare(b.start_time ?? "");
    });
    // group by department within day
    const byDept = new Map<string, GuidebookEvent[]>();
    for (const e of dayEvents) {
      const k = e.department_name ?? "General";
      if (!byDept.has(k)) byDept.set(k, []);
      byDept.get(k)!.push(e);
    }
    for (const [dept, list] of byDept) {
      ensureSpace(ctx, 24);
      ctx.page.drawText(dept, {
        x: MARGIN,
        y: ctx.y,
        size: 10,
        font: bold,
        color: MUTED,
      });
      ctx.y -= 16;
      for (const e of list) drawEvent(ctx, e);
    }
    if (ctx.pagesSinceAd >= 2) await drawHalfPageAd(ctx);
  }

  // ── StreetBeats section ──
  if (input.gigs.length) {
    newPage(ctx);
    drawSectionHeader(ctx, "StreetBeats Performances");
    const gigsByStage = new Map<string, GuidebookGig[]>();
    for (const g of input.gigs) {
      const k = g.stage_name ?? "Various Stages";
      if (!gigsByStage.has(k)) gigsByStage.set(k, []);
      gigsByStage.get(k)!.push(g);
    }
    for (const [stage, list] of gigsByStage) {
      drawSubHeader(ctx, stage);
      const sorted = list.sort((a, b) =>
        (a.start_time ?? "").localeCompare(b.start_time ?? ""),
      );
      for (const g of sorted) drawGig(ctx, g);
      if (ctx.pagesSinceAd >= 2) await drawHalfPageAd(ctx);
    }
  }

  // ── Sponsor index / thank you ──
  if (input.sponsors.length) {
    newPage(ctx);
    drawSectionHeader(ctx, "Thank You to Our Sponsors");
    for (const s of input.sponsors) {
      ensureSpace(ctx, 60);
      const logo = await embedLogo(ctx, s);
      const xText = logo ? MARGIN + 70 : MARGIN;
      if (logo) {
        const scale = Math.min(50 / logo.width, 50 / logo.height);
        ctx.page.drawImage(logo, {
          x: MARGIN,
          y: ctx.y - 50,
          width: logo.width * scale,
          height: logo.height * scale,
        });
      }
      ctx.page.drawText(s.company_name, {
        x: xText,
        y: ctx.y - 14,
        size: 13,
        font: bold,
        color: NAVY,
      });
      if (s.ad_copy) {
        const lines = wrapText(s.ad_copy, font, 10, PAGE_W - xText - MARGIN).slice(0, 2);
        let yy = ctx.y - 30;
        for (const ln of lines) {
          ctx.page.drawText(ln, { x: xText, y: yy, size: 10, font, color: MUTED });
          yy -= 12;
        }
      }
      ctx.y -= 64;
    }
  }

  drawPageFooter(ctx);
  return await doc.save();
}
