import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getGlobalSettings,
  type GlobalSettings,
} from "@/lib/global-settings.functions";
import { normalizeBrandCss } from "@/components/theme-provider";

type Ctx = {
  loading: boolean;
  settings: GlobalSettings | null;
  refresh: () => void;
};

const GlobalBrandContext = createContext<Ctx | undefined>(undefined);

// brand-layer registry lives in theme-provider; we replicate the minimal
// integration here by using applyBrandCss with a low priority so per-dept
// branding overrides the global layer.
import { applyBrandCss } from "@/components/theme-provider";

function settingsToBrand(s: GlobalSettings | null): Record<string, string> | null {
  if (!s) return null;
  const brand: Record<string, string> = {
    "--primary": s.primary_color,
    "--secondary": s.secondary_color,
  };
  if (s.font_family) {
    brand["--font-sans"] = `'${s.font_family}', system-ui, sans-serif`;
  }
  return brand;
}

export function GlobalBrandProvider({ children }: { children: ReactNode }) {
  const fetcher = useServerFn(getGlobalSettings);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["global-settings"],
    queryFn: () => fetcher(),
    staleTime: 60_000,
  });

  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    cleanupRef.current?.();
    const brand = settingsToBrand(data ?? null);
    if (brand) {
      // applyBrandCss assigns priority 5; we want global below per-department
      // (which uses priority 10 via BrandThemeApplier OR priority 0 via
      // ThemeProvider). Wrap with a lower-priority layer instead.
      cleanupRef.current = applyBrandCss(brand, -10);
    }
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [data]);

  // Document title + favicon
  useEffect(() => {
    if (typeof document === "undefined" || !data) return;
    const cityName = data.city_name;
    if (cityName) {
      const baseTitle = "Total Event System Solutions";
      if (!document.title.includes(cityName)) {
        document.title = `${cityName} — ${baseTitle}`;
      }
    }
    if (data.favicon_url) {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = data.favicon_url;
    }
    if (data.font_family) {
      const id = "global-brand-font";
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
          data.font_family,
        )}:wght@400;500;600;700&display=swap`;
        document.head.appendChild(link);
      }
    }
  }, [data]);

  const value = useMemo<Ctx>(
    () => ({ loading: isLoading, settings: data ?? null, refresh: () => refetch() }),
    [isLoading, data, refetch],
  );

  return (
    <GlobalBrandContext.Provider value={value}>{children}</GlobalBrandContext.Provider>
  );
}

export function useGlobalBrand() {
  const ctx = useContext(GlobalBrandContext);
  if (!ctx) throw new Error("useGlobalBrand must be used within GlobalBrandProvider");
  return ctx;
}

// Silence unused-import lint by ensuring normalizeBrandCss tree-shakes cleanly.
void normalizeBrandCss;
