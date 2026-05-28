import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useDepartment } from "@/contexts/department-context";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type BrandLayer = {
  id: symbol;
  priority: number;
  vars: Record<string, string>;
};

const brandLayers: BrandLayer[] = [];
const managedKeys = new Set<string>();

function refreshBrandCss() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const keys = new Set<string>(managedKeys);
  for (const layer of brandLayers) {
    for (const key of Object.keys(layer.vars)) keys.add(key);
  }

  for (const key of keys) {
    const winner = brandLayers
      .filter((layer) => layer.vars[key] !== undefined)
      .sort((a, b) => a.priority - b.priority)
      .at(-1);
    if (winner) {
      root.style.setProperty(key, winner.vars[key], "important");
      managedKeys.add(key);
    } else {
      root.style.removeProperty(key);
      managedKeys.delete(key);
    }
  }
}

function setBrandLayer(id: symbol, brand: Record<string, unknown> | null | undefined, priority: number) {
  const vars = normalizeBrandCss(brand);
  const existingIndex = brandLayers.findIndex((layer) => layer.id === id);
  if (Object.keys(vars).length === 0) {
    if (existingIndex >= 0) brandLayers.splice(existingIndex, 1);
  } else if (existingIndex >= 0) {
    brandLayers[existingIndex] = { id, priority, vars };
  } else {
    brandLayers.push({ id, priority, vars });
  }
  refreshBrandCss();
}

const BRAND_ALIASES: Record<string, string> = {
  primary: "--primary",
  primaryColor: "--primary",
  primary_color: "--primary",
  primaryForeground: "--primary-foreground",
  primary_foreground: "--primary-foreground",
  secondary: "--secondary",
  secondaryColor: "--secondary",
  secondary_color: "--secondary",
  secondaryForeground: "--secondary-foreground",
  secondary_foreground: "--secondary-foreground",
  accent: "--accent",
  accentColor: "--accent",
  accent_color: "--accent",
  accentForeground: "--accent-foreground",
  accent_foreground: "--accent-foreground",
  background: "--background",
  backgroundColor: "--background",
  background_color: "--background",
  foreground: "--foreground",
  text: "--foreground",
  textColor: "--foreground",
  text_color: "--foreground",
  card: "--card",
  surface: "--card",
  cardForeground: "--card-foreground",
  card_foreground: "--card-foreground",
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
  const id = Symbol("brand-css");
  setBrandLayer(id, brand, 5);
  return () => {
    const index = brandLayers.findIndex((layer) => layer.id === id);
    if (index >= 0) brandLayers.splice(index, 1);
    refreshBrandCss();
  };
}

/** Apply brand_css from any source (public route loader, etc.) for the lifetime of the mount. */
export function BrandThemeApplier({ brand }: { brand: Record<string, unknown> | null | undefined }) {
  const layerId = useRef(Symbol("route-brand-css"));
  useIsomorphicLayoutEffect(() => {
    setBrandLayer(layerId.current, brand, 10);
    return () => setBrandLayer(layerId.current, null, 10);
  }, [brand]);
  return null;
}

/**
 * Reads the active department's `brand_css` (a key/value map of CSS variables)
 * and applies them to :root so they override the default Tailwind theme tokens.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { activeDepartment } = useDepartment();
  const layerId = useRef(Symbol("active-department-brand-css"));
  useIsomorphicLayoutEffect(() => {
    setBrandLayer(layerId.current, activeDepartment?.brand_css ?? null, 0);
    return () => setBrandLayer(layerId.current, null, 0);
  }, [activeDepartment]);
  return <>{children}</>;
}
