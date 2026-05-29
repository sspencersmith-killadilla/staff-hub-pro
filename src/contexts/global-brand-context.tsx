import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getGlobalSettings,
  type GlobalSettings,
} from "@/lib/global-settings.functions";
import { applyBrandCss } from "@/components/theme-provider";
import { tokensToCssVars } from "@/lib/branding/derive";
import type { BrandTokens } from "@/lib/branding/tokens";
import { findPair, googleFontsUrl, FONT_PAIRS } from "@/lib/branding/font-pairs";

type Ctx = {
  loading: boolean;
  settings: GlobalSettings | null;
  refresh: () => void;
};

const GlobalBrandContext = createContext<Ctx | undefined>(undefined);

function settingsToTokens(s: GlobalSettings): BrandTokens {
  return {
    primary: s.primary_color,
    secondary: s.secondary_color,
    accent: s.accent_color ?? undefined,
    background: s.background_color ?? undefined,
    foreground: s.foreground_color ?? undefined,
    muted: s.muted_color ?? undefined,
    destructive: s.destructive_color ?? undefined,
    radius: s.radius ?? undefined,
    headingFont: s.heading_font ?? s.font_family ?? undefined,
    bodyFont: s.body_font ?? s.font_family ?? undefined,
  };
}

function loadFonts(headingFont?: string, bodyFont?: string) {
  if (typeof document === "undefined") return;
  const pair =
    findPair(headingFont, bodyFont) ??
    FONT_PAIRS.find((p) => p.heading === bodyFont && p.body === bodyFont) ??
    null;
  const families = pair
    ? [pair.heading, pair.body]
    : [headingFont, bodyFont].filter(Boolean) as string[];
  if (!families.length) return;
  const id = "global-brand-fonts";
  const href = pair
    ? googleFontsUrl(pair)
    : `https://fonts.googleapis.com/css2?${families
        .map((f) => `family=${encodeURIComponent(f!)}:wght@400;500;600;700`)
        .join("&")}&display=swap`;
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  link.href = href;
}

function setIconLink(rel: string, href: string, attrs: Record<string, string> = {}) {
  if (typeof document === "undefined") return;
  const selector = `link[rel='${rel}']${
    attrs.sizes ? `[sizes='${attrs.sizes}']` : ""
  }`;
  let link = document.querySelector<HTMLLinkElement>(selector);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
  for (const [k, v] of Object.entries(attrs)) link.setAttribute(k, v);
}

function setMetaContent(name: string, content: string) {
  if (typeof document === "undefined") return;
  let m = document.querySelector<HTMLMetaElement>(`meta[name='${name}']`);
  if (!m) {
    m = document.createElement("meta");
    m.name = name;
    document.head.appendChild(m);
  }
  m.content = content;
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
    if (!data) return;
    const tokens = settingsToTokens(data);
    const vars = tokensToCssVars(tokens);
    cleanupRef.current = applyBrandCss(vars, -10);
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [data]);

  // Title, favicon, manifest, theme-color, og:image
  useEffect(() => {
    if (typeof document === "undefined" || !data) return;
    if (data.city_name) {
      const baseTitle = "Total Event System Solutions";
      if (!document.title.includes(data.city_name)) {
        document.title = `${data.city_name} — ${baseTitle}`;
      }
    }
    if (data.favicon_svg_url) {
      setIconLink("icon", data.favicon_svg_url, { type: "image/svg+xml" });
    } else if (data.favicon_32_url || data.favicon_url) {
      setIconLink("icon", data.favicon_32_url ?? data.favicon_url!, {
        sizes: "32x32",
      });
    }
    if (data.favicon_180_url) {
      setIconLink("apple-touch-icon", data.favicon_180_url, { sizes: "180x180" });
    }
    setIconLink("manifest", "/manifest.webmanifest");
    if (data.primary_color) setMetaContent("theme-color", data.primary_color);
    loadFonts(
      data.heading_font ?? data.font_family ?? undefined,
      data.body_font ?? data.font_family ?? undefined,
    );
  }, [data]);

  const value = useMemo<Ctx>(
    () => ({
      loading: isLoading,
      settings: data ?? null,
      refresh: () => refetch(),
    }),
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
