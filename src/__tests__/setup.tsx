import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import React from "react";

// jsdom shims
if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
(globalThis as any).IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};

// Per-test overridable param/search store
export const __routeState: {
  params: Record<string, string>;
  search: Record<string, unknown>;
} = { params: {}, search: {} };

// Mock TanStack router so route components can render in isolation
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<any>("@tanstack/react-router");
  const Link = React.forwardRef<HTMLAnchorElement, any>(
    ({ to, params, search, children, activeProps, inactiveProps, ...rest }, ref) => (
      <a ref={ref} href={typeof to === "string" ? to : "#"} {...rest}>
        {children}
      </a>
    ),
  );
  Link.displayName = "MockLink";
  const makeRouteFactory = () => (options: any) => ({
    options,
    useParams: () => __routeState.params,
    useSearch: () => __routeState.search,
    useLoaderData: () => undefined,
    useNavigate: () => () => {},
    useRouteContext: () => ({}),
    addChildren: (c: any) => ({ options, children: c }),
  });
  return {
    ...actual,
    Link,
    Outlet: () => null,
    useNavigate: () => () => {},
    useRouter: () => ({ invalidate: () => {}, navigate: () => {} }),
    useRouterState: () => ({ location: { pathname: "/" } }),
    createFileRoute: () => makeRouteFactory(),
    createRootRoute: makeRouteFactory(),
    createRoute: makeRouteFactory(),
    redirect: (x: any) => x,
  };
});

// Mock TanStack Start so useServerFn / createServerFn / createMiddleware are inert
vi.mock("@tanstack/react-start", () => {
  const chainable: any = {
    middleware: () => chainable,
    inputValidator: () => chainable,
    handler: () => async () => undefined,
    server: () => chainable,
    client: () => chainable,
  };
  return {
    useServerFn: (fn: any) => fn ?? (async () => undefined),
    createServerFn: () => chainable,
    createMiddleware: () => chainable,
    getRequestHeader: () => undefined,
    getRequestHeaders: () => ({}),
    setResponseHeader: () => {},
    setResponseStatus: () => {},
  };
});

// Inert Supabase client
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (r: any) => r({ data: [], error: null });
        if (prop === "maybeSingle" || prop === "single")
          return () => Promise.resolve({ data: null, error: null });
        return () => chain;
      },
    },
  );
  return {
    supabase: {
      from: () => chain,
      auth: {
        getSession: () =>
          Promise.resolve({ data: { session: null }, error: null }),
        getUser: () =>
          Promise.resolve({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
        signInWithPassword: () =>
          Promise.resolve({ data: { user: null, session: null }, error: null }),
        signUp: () =>
          Promise.resolve({ data: { user: null, session: null }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        resetPasswordForEmail: () => Promise.resolve({ error: null }),
      },
    },
  };
});

// SiteHeader pulls from DepartmentContext / RoleContext / etc. Render a stub.
vi.mock("@/components/site-header", () => ({
  SiteHeader: () => <header role="banner" />,
}));

// requireModule throws redirect outside router context — make it inert
vi.mock("@/lib/require-module", () => ({
  requireModule: () => undefined,
}));
