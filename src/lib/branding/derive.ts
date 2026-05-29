// Small color-math + token derivation helpers. No deps.

import type { BrandTokens } from "./tokens";

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick white or near-black for legibility against the given background. */
export function autoForeground(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.5 ? "#0f172a" : "#ffffff";
}

/** Shift lightness toward black (factor<0) or white (factor>0) by a percent. */
export function shade(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  if (factor >= 0) {
    return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
  }
  const f = 1 + factor;
  return rgbToHex(r * f, g * f, b * f);
}

/** Build the full CSS variable map shadcn consumes from a partial BrandTokens. */
export function tokensToCssVars(t: BrandTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  if (t.primary) {
    vars["--primary"] = t.primary;
    vars["--primary-foreground"] = autoForeground(t.primary);
    vars["--ring"] = t.primary;
  }
  if (t.secondary) {
    vars["--secondary"] = t.secondary;
    vars["--secondary-foreground"] = autoForeground(t.secondary);
  }
  if (t.accent) {
    vars["--accent"] = t.accent;
    vars["--accent-foreground"] = autoForeground(t.accent);
  }
  if (t.background) vars["--background"] = t.background;
  if (t.foreground) vars["--foreground"] = t.foreground;
  if (t.muted) {
    vars["--muted"] = t.muted;
    vars["--muted-foreground"] = autoForeground(t.muted);
  }
  if (t.destructive) {
    vars["--destructive"] = t.destructive;
    vars["--destructive-foreground"] = autoForeground(t.destructive);
  }
  if (t.radius) vars["--radius"] = t.radius;
  if (t.bodyFont) vars["--font-sans"] = `'${t.bodyFont}', system-ui, sans-serif`;
  if (t.headingFont) vars["--font-heading"] = `'${t.headingFont}', system-ui, sans-serif`;
  return vars;
}
