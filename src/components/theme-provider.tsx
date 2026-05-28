import { useEffect, type ReactNode } from "react";
import { useDepartment } from "@/contexts/department-context";

const BRAND_ALIASES: Record<string, string> = {
  primary: "--primary",
  primaryColor: "--primary",
  primary_color: "--primary",
  secondary: "--secondary",
  secondaryColor: "--secondary",
  secondary_color: "--secondary",
  accent: "--accent",
  accentColor: "--accent",
  accent_color: "--accent",
  background: "--background",
  backgroundColor: "--background",
  background_color: "--background",
  foreground: "--foreground",
  text: "--foreground",
  textColor: "--foreground",
  text_color: "--foreground",
  card: "--card",
  surface: "--card",
  border: "--border",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  muted_foreground: "--muted-foreground",
};

function normalizeCssValue(value: string) {
  const v = value.trim();
  if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%(\s*\/\s*[\d.]+%?)?$/.test(v)) {
    return `hsl(${v})`;
  }
  if (/^\d{1,3}\s+\d{1,3}\s+\d{1,3}(\s*\/\s*[\d.]+%?)?$/.test(v)) {
    return `rgb(${v})`;
  }
  return v;
}

function normalizeCssKey(rawKey: string) {
  if (rawKey.startsWith("--")) return rawKey;
  return BRAND_ALIASES[rawKey] ?? `--${rawKey.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}

export function normalizeBrandCss(brand: Record<string, unknown> | null | undefined) {
  const out: Record<string, string> = {};
  if (!brand || typeof brand !== "object") return out;
  for (const [rawKey, rawVal] of Object.entries(brand)) {
    if (typeof rawVal !== "string") continue;
    out[normalizeCssKey(rawKey)] = normalizeCssValue(rawVal);
  }
  if (!out["--brand-primary"] && out["--primary"]) out["--brand-primary"] = out["--primary"];
  if (!out["--brand-accent"]) out["--brand-accent"] = out["--accent"] ?? out["--primary"];
  if (!out["--brand-background"] && out["--background"]) out["--brand-background"] = out["--background"];
  if (!out["--brand-surface"]) out["--brand-surface"] = out["--card"] ?? out["--background"];
  if (!out["--brand-text"]) out["--brand-text"] = out["--foreground"];
  return out;
}

/**
 * Apply a brand_css JSON object (e.g. { "--primary": "oklch(...)", "background": "#fff" })
 * as CSS variables on :root. Returns a cleanup that removes only the keys it set.
 */
export function applyBrandCss(brand: Record<string, unknown> | null | undefined): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }
  const root = document.documentElement;
  const applied: string[] = [];
  for (const [key, value] of Object.entries(normalizeBrandCss(brand))) {
    // Use !important so class-scoped overrides like `.dark { --primary: ... }`
    // in src/styles.css do not beat the brand tokens.
    root.style.setProperty(key, value, "important");
    applied.push(key);
  }
  return () => {
    for (const key of applied) root.style.removeProperty(key);
  };
}

/** Apply brand_css from any source (public route loader, etc.) for the lifetime of the mount. */
export function BrandThemeApplier({ brand }: { brand: Record<string, unknown> | null | undefined }) {
  useEffect(() => applyBrandCss(brand), [brand]);
  return null;
}

/**
 * Reads the active department's `brand_css` (a key/value map of CSS variables)
 * and applies them to :root so they override the default Tailwind theme tokens.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { activeDepartment } = useDepartment();
  useEffect(
    () => applyBrandCss(activeDepartment?.brand_css ?? null),
    [activeDepartment],
  );
  return <>{children}</>;
}
