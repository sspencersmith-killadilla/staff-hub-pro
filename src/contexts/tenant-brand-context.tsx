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
import { resolveTenant, type Tenant } from "@/lib/global-settings.functions";
import { applyBrandCss } from "@/components/theme-provider";

type Ctx = {
  loading: boolean;
  tenant: Tenant | null;
};

const TenantBrandContext = createContext<Ctx | undefined>(undefined);

export function TenantBrandProvider({ children }: { children: ReactNode }) {
  const fetcher = useServerFn(resolveTenant);
  const host = typeof window !== "undefined" ? window.location.host : "";
  const slugMatch =
    typeof window !== "undefined"
      ? window.location.pathname.match(/^\/t\/([a-z0-9-]+)/)
      : null;
  const slug = slugMatch?.[1];

  const { data, isLoading } = useQuery({
    queryKey: ["tenant", host, slug ?? ""],
    queryFn: () => fetcher({ data: { host, slug } }),
    enabled: typeof window !== "undefined",
    staleTime: 5 * 60_000,
  });

  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    cleanupRef.current?.();
    if (!data || !data.tokens || Object.keys(data.tokens).length === 0) return;
    const vars: Record<string, string> = {};
    const t = data.tokens as Record<string, unknown>;
    for (const [k, v] of Object.entries(t)) {
      if (typeof v === "string") {
        vars[k.startsWith("--") ? k : `--${k}`] = v;
      }
    }
    cleanupRef.current = applyBrandCss(vars, -20);
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [data]);

  const value = useMemo<Ctx>(
    () => ({ loading: isLoading, tenant: data ?? null }),
    [isLoading, data],
  );

  return (
    <TenantBrandContext.Provider value={value}>{children}</TenantBrandContext.Provider>
  );
}

export function useTenantBrand() {
  const ctx = useContext(TenantBrandContext);
  if (!ctx) return { loading: false, tenant: null };
  return ctx;
}
