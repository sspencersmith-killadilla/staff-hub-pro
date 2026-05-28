import { useEffect, type ReactNode } from "react";
import { useDepartment } from "@/contexts/department-context";

/**
 * Apply a brand_css JSON object (e.g. { "--primary": "oklch(...)", "background": "#fff" })
 * as CSS variables on :root. Returns a cleanup that removes only the keys it set.
 */
export function applyBrandCss(brand: Record<string, unknown> | null | undefined): () => void {
  if (typeof document === "undefined" || !brand || typeof brand !== "object") {
    return () => {};
  }
  const root = document.documentElement;
  const applied: string[] = [];
  for (const [rawKey, rawVal] of Object.entries(brand)) {
    if (typeof rawVal !== "string") continue;
    const key = rawKey.startsWith("--") ? rawKey : `--${rawKey}`;
    // Use !important so class-scoped overrides like `.dark { --primary: ... }`
    // in src/styles.css do not beat the brand tokens.
    root.style.setProperty(key, rawVal, "important");
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
