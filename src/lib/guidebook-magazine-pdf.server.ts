// SERVER ONLY — Render a magazine-style guidebook PDF from a pages/blocks layout.
// Coordinate system: per-page (PAGE_W x PAGE_H pt, US Letter portrait).
// Block (x,y) are measured from the TOP-LEFT of the page. The renderer flips Y.
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from "pdf-lib";

export type MagazineBlock = {
  id: string;
  type: "text" | "image" | "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  // text
  text?: string | null;
  fontSize?: number | null;
  bold?: boolean | null;
  italic?: boolean | null;
  color?: string | null; // #rrggbb
  bgColor?: string | null;
  align?: "left" | "center" | "right" | null;
  lineHeight?: number | null;
  padding?: number | null;
  // image
  imageUrl?: string | null;
  fit?: "cover" | "contain" | null;
  // rect
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

function drawRectBlock(page: PDFPage, b: MagazineBlock) {
  const pyTop = PAGE_H - b.y;
  const y = pyTop - b.h;
  const opts: any = { x: b.x, y, width: b.w, height: b.h };
  if (b.fill) {
    const [r, g, bl] = hexToRgb(b.fill);
    opts.color = rgb(r, g, bl);
  }
  if (b.borderColor) {
    const [r, g, bl] = hexToRgb(b.borderColor);
    opts.borderColor = rgb(r, g, bl);
    opts.borderWidth = b.borderWidth ?? 1;
  }
  page.drawRectangle(opts);
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
  const totalH = lines.length * lineHeight;
  const yTop = PAGE_H - b.y - pad;
  const innerH = b.h - pad * 2;
  // vertical-top align inside block
  const startY = yTop - size; // baseline of first line
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

async function drawImageBlock(page: PDFPage, b: MagazineBlock, doc: PDFDocument) {
  if (!b.imageUrl) {
    // placeholder
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
    const dx = b.x + (b.w - dw) / 2;
    const dyTop = PAGE_H - b.y - (b.h - dh) / 2;
    page.drawImage(img, { x: dx, y: dyTop - dh, width: dw, height: dh });
  } else {
    // cover: scale to fill, crop excess by clipping via temporary embedded image scale.
    // pdf-lib has no real clip; we approximate by sizing exactly and accepting overflow.
    if (b.w / b.h > ratio) {
      dw = b.w;
      dh = dw / ratio;
    } else {
      dh = b.h;
      dw = dh * ratio;
    }
    const dx = b.x + (b.w - dw) / 2;
    const dyTop = PAGE_H - b.y - (b.h - dh) / 2;
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
      if (block.type === "rect") drawRectBlock(page, block);
      else if (block.type === "text") drawTextBlock(page, block, fonts);
      else if (block.type === "image") await drawImageBlock(page, block, doc);
    }
  }

  return await doc.save();
}
