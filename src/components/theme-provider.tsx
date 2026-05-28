import { useEffect, type ReactNode } from "react";
import { useDepartment } from "@/contexts/department-context";

/**
 * Reads the active department's `brand_css` (a key/value map of CSS variables)
 * and applies them to :root so they override the default Tailwind theme tokens.
 *
 * Example brand_css:
 *   { "--primary": "oklch(0.55 0.2 250)", "--primary-foreground": "oklch(1 0 0)" }
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { activeDepartment } = useDepartment();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const brand = activeDepartment?.brand_css ?? null;

    const applied: string[] = [];
    if (brand && typeof brand === "object") {
      for (const [rawKey, rawVal] of Object.entries(brand)) {
        if (typeof rawVal !== "string") continue;
        const key = rawKey.startsWith("--") ? rawKey : `--${rawKey}`;
        root.style.setProperty(key, rawVal);
        applied.push(key);
      }
    }

    return () => {
      for (const key of applied) root.style.removeProperty(key);
    };
  }, [activeDepartment]);

  return <>{children}</>;
}
