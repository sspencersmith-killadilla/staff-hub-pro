// SERVER ONLY — Render a magazine-style guidebook PDF from a pages/blocks layout.
// Coordinate system: per-page (PAGE_W x PAGE_H pt, US Letter portrait).
// Block (x,y) are measured from the TOP-LEFT of the page. The renderer flips Y.
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFPage,
  PDFFont,
  PDFImage,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
} from "pdf-lib";

export type ShapeKind =
  | "rect"
  | "circle"
  | "ellipse"
  | "triangle"
  | "hexagon"
  | "star"
  | "line";

export type FrameKind = "rect" | "rounded" | "circle" | "hexagon";

export type MagazineBlock = {
  id: string;
  type: "text" | "image" | "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  groupId?: string | null;
  // text
  text?: string | null;
  fontSize?: number | null;
  bold?: boolean | null;
  italic?: boolean | null;
  color?: string | null;
  bgColor?: string | null;
  align?: "left" | "center" | "right" | null;
  lineHeight?: number | null;
  padding?: number | null;
  // image
  imageUrl?: string | null;
  fit?: "cover" | "contain" | null;
  frame?: FrameKind | null;
  // rect / shape
  shape?: ShapeKind | null;
  fill?: string | null;
  borderColor?: string | null;
  borderWidth?: number | null;
  radius?: number | null;
};

export type MagazinePage = {
  id: string;
  bgColor?: string | null;
  blocks: MagazineBlock[];
};

export type MagazineInput = {
  title: string;
  pages: MagazinePage[];
};

export const PAGE_W = 612;
export const PAGE_H = 792;

function hexToRgb(hex: string | null | undefined, fallback: [number, number, number] = [0, 0, 0]) {
  if (!hex) return fallback;
  const m = hex.trim().replace("#", "");
  if (m.length !== 3 && m.length !== 6) return fallback;
  const norm = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(norm, 16);
  if (Number.isNaN(n)) return fallback;
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255] as [number, number, number];
}

function pickFont(b: MagazineBlock, fonts: { reg: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont }) {
  if (b.bold && b.italic) return fonts.boldItalic;
  if (b.bold) return fonts.bold;
  if (b.italic) return fonts.italic;
  return fonts.reg;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const out: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = trial;
      }
    }
    out.push(line);
  }
  return out;
}

async function fetchImage(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mime = r.headers.get("content-type") ?? "image/png";
    return { bytes: new Uint8Array(await r.arrayBuffer()), mime };
  } catch {
    return null;
  }
}

async function embedImg(doc: PDFDocument, data: { bytes: Uint8Array; mime: string }): Promise<PDFImage | null> {
  try {
    if (data.mime.includes("png")) return await doc.embedPng(data.bytes);
    return await doc.embedJpg(data.bytes);
  } catch {
    try {
      return await doc.embedPng(data.bytes);
    } catch {
      try {
        return await doc.embedJpg(data.bytes);
      } catch {
        return null;
      }
    }
  }
}

// Build a polygon-approximated path for any shape, returns operators for stroke/fill via SVG path.
function polygonPoints(shape: ShapeKind, x: number, y: number, w: number, h: number): [number, number][] {
  // y here is page Y (bottom-left coordinate space) for the BOTTOM of the box.
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  if (shape === "triangle") {
    return [
      [cx, y + h],
      [x, y],
      [x + w, y],
    ];
  }
  if (shape === "hexagon") {
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
  }
  if (shape === "star") {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const r = i % 2 === 0 ? 1 : 0.45;
      pts.push([cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)]);
    }
    return pts;
  }
  if (shape === "circle" || shape === "ellipse") {
    const pts: [number, number][] = [];
    const N = 48;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
  }
  if (shape === "rect") {
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  }
  return [];
}

function pathOpsForPoints(points: [number, number][]) {
  if (!points.length) return [];
  const ops = [moveTo(points[0][0], points[0][1])];
  for (let i = 1; i < points.length; i++) ops.push(lineTo(points[i][0], points[i][1]));
  ops.push(closePath());
  return ops;
}

function roundedRectPoints(x: number, y: number, w: number, h: number, r: number): [number, number][] {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (rr <= 0) {
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  }
  const N = 8; // segments per corner
  const pts: [number, number][] = [];
  const corners: [number, number, number][] = [
    [x + w - rr, y + rr, -Math.PI / 2], // bottom-right (start angle)
    [x + w - rr, y + h - rr, 0], // top-right
    [x + rr, y + h - rr, Math.PI / 2], // top-left
    [x + rr, y + rr, Math.PI], // bottom-left
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= N; i++) {
      const a = start + (Math.PI / 2) * (i / N);
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
  }
  return pts;
}

function drawShape(page: PDFPage, b: MagazineBlock) {
  const shape = (b.shape ?? "rect") as ShapeKind;
  const yBottom = PAGE_H - b.y - b.h;
  const fill = b.fill ? rgb(...hexToRgb(b.fill)) : undefined;
  const border = b.borderColor ? rgb(...hexToRgb(b.borderColor)) : undefined;
  const borderWidth = b.borderWidth ?? (border ? 1 : 0);

  if (shape === "line") {
    // diagonal line from top-left to bottom-right of the box
    const color = border ?? fill ?? rgb(0, 0, 0);
    page.drawLine({
      start: { x: b.x, y: PAGE_H - b.y },
      end: { x: b.x + b.w, y: PAGE_H - b.y - b.h },
      thickness: borderWidth || 1,
      color,
    });
    return;
  }

  if (shape === "rect") {
    if ((b.radius ?? 0) > 0) {
      const pts = roundedRectPoints(b.x, yBottom, b.w, b.h, b.radius!);
      page.drawSvgPath(pointsToSvgPath(pts), {
        x: 0,
        y: 0,
        color: fill,
        borderColor: border,
        borderWidth,
      });
    } else {
      page.drawRectangle({
        x: b.x,
        y: yBottom,
        width: b.w,
        height: b.h,
        color: fill,
        borderColor: border,
        borderWidth,
      });
    }
    return;
  }

  if (shape === "circle" && b.w === b.h) {
    page.drawCircle({
      x: b.x + b.w / 2,
      y: yBottom + b.h / 2,
      size: b.w / 2,
      color: fill,
      borderColor: border,
      borderWidth,
    });
    return;
  }

  // polygon shapes (incl. ellipse approximation, triangle, hexagon, star)
  const pts = polygonPoints(shape, b.x, yBottom, b.w, b.h);
  if (!pts.length) return;
  page.drawSvgPath(pointsToSvgPath(pts), {
    x: 0,
    y: 0,
    color: fill,
    borderColor: border,
    borderWidth,
  });
}

function pointsToSvgPath(points: [number, number][]): string {
  if (!points.length) return "";
  // pdf-lib's drawSvgPath uses SVG coordinate system (Y-down) relative to the supplied (x,y)
  // origin which defaults to the page top-left. We want to draw in page-bottom coordinates,
  // so we'll flip via the page height.
  const flip = (y: number) => PAGE_H - y;
  let d = `M ${points[0][0]} ${flip(points[0][1])}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]} ${flip(points[i][1])}`;
  }
  d += " Z";
  return d;
}

function drawTextBlock(
  page: PDFPage,
  b: MagazineBlock,
  fonts: { reg: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont },
) {
  const pad = b.padding ?? 6;
  if (b.bgColor) {
    const [r, g, bl] = hexToRgb(b.bgColor);
    const yTop = PAGE_H - b.y;
    page.drawRectangle({
      x: b.x,
      y: yTop - b.h,
      width: b.w,
      height: b.h,
      color: rgb(r, g, bl),
    });
  }
  const text = (b.text ?? "").toString();
  if (!text.trim()) return;
  const size = b.fontSize ?? 12;
  const font = pickFont(b, fonts);
  const lh = b.lineHeight ?? 1.2;
  const innerW = Math.max(1, b.w - pad * 2);
  const lines = wrapText(text, font, size, innerW);
  const lineHeight = size * lh;
  const yTop = PAGE_H - b.y - pad;
  const innerH = b.h - pad * 2;
  const startY = yTop - size;
  const maxLines = Math.max(1, Math.floor(innerH / lineHeight));
  const [cr, cg, cb] = hexToRgb(b.color, [0.06, 0.11, 0.24]);
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    const ln = lines[i];
    const w = font.widthOfTextAtSize(ln, size);
    let x = b.x + pad;
    if (b.align === "center") x = b.x + (b.w - w) / 2;
    else if (b.align === "right") x = b.x + b.w - pad - w;
    page.drawText(ln, {
      x,
      y: startY - i * lineHeight,
      size,
      font,
      color: rgb(cr, cg, cb),
    });
  }
}

// Build clip-path operators (in page-bottom coordinates) for an image frame
function frameClipOps(b: MagazineBlock) {
  const frame = (b.frame ?? "rect") as FrameKind;
  const yBottom = PAGE_H - b.y - b.h;
  let pts: [number, number][] = [];
  if (frame === "rounded") {
    pts = roundedRectPoints(b.x, yBottom, b.w, b.h, b.radius ?? 16);
  } else if (frame === "circle") {
    const r = Math.min(b.w, b.h) / 2;
    const cx = b.x + b.w / 2;
    const cy = yBottom + b.h / 2;
    const N = 48;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  } else if (frame === "hexagon") {
    pts = polygonPoints("hexagon", b.x, yBottom, b.w, b.h);
  } else {
    return null;
  }
  return pathOpsForPoints(pts);
}

async function drawImageBlock(page: PDFPage, b: MagazineBlock, doc: PDFDocument) {
  if (!b.imageUrl) {
    page.drawRectangle({
      x: b.x,
      y: PAGE_H - b.y - b.h,
      width: b.w,
      height: b.h,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 0.5,
    });
    return;
  }
  const data = await fetchImage(b.imageUrl);
  if (!data) return;
  const img = await embedImg(doc, data);
  if (!img) return;

  const fit = b.fit ?? "cover";
  const ratio = img.width / img.height;
  let dw = b.w;
  let dh = b.h;
  if (fit === "contain") {
    if (b.w / b.h > ratio) {
      dh = b.h;
      dw = dh * ratio;
    } else {
      dw = b.w;
      dh = dw / ratio;
    }
  } else {
    if (b.w / b.h > ratio) {
      dw = b.w;
      dh = dw / ratio;
    } else {
      dh = b.h;
      dw = dh * ratio;
    }
  }
  const dx = b.x + (b.w - dw) / 2;
  const dyTop = PAGE_H - b.y - (b.h - dh) / 2;

  const clipOps = frameClipOps(b);
  if (clipOps) {
    page.pushOperators(pushGraphicsState(), ...clipOps, clip(), endPath());
    page.drawImage(img, { x: dx, y: dyTop - dh, width: dw, height: dh });
    page.pushOperators(popGraphicsState());
  } else {
    page.drawImage(img, { x: dx, y: dyTop - dh, width: dw, height: dh });
  }
}

export async function buildMagazinePdf(input: MagazineInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(input.title || "Program Guide");
  doc.setCreator("Total Events System Solutions");
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  const fonts = { reg, bold, italic, boldItalic };

  for (const pg of input.pages) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    if (pg.bgColor) {
      const [r, g, b] = hexToRgb(pg.bgColor);
      page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(r, g, b) });
    }
    for (const block of pg.blocks) {
      if (block.type === "rect") drawShape(page, block);
      else if (block.type === "text") drawTextBlock(page, block, fonts);
      else if (block.type === "image") await drawImageBlock(page, block, doc);
    }
  }

  return await doc.save();
}
