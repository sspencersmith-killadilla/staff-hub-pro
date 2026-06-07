import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import axe from "axe-core";

/**
 * Render a component inside a minimal in-memory TanStack router + QueryClient
 * and run axe-core against the resulting DOM.
 *
 * Returns the violations array. Assert `violations.length === 0` in the test.
 *
 * Pass `params` / `search` to populate Route.useParams() / Route.useSearch().
 */
export async function renderAndAudit(
  component: () => ReactNode,
  opts: {
    path?: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
  } = {},
) {
  const path = opts.path ?? "/";
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const leaf = createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: component as any,
    validateSearch: () => opts.search ?? {},
  });
  const routeTree = rootRoute.addChildren([leaf]);
  const router = createRouter({
    routeTree,
    history: {
      // memory-history shim
      location: {
        pathname: path,
        search: "",
        hash: "",
        href: path,
        state: {},
      },
      length: 1,
      subscribers: new Set(),
      subscribe(fn: any) {
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
      },
      push() {},
      replace() {},
      go() {},
      back() {},
      forward() {},
      createHref: (p: string) => p,
      block: () => () => {},
      flush: () => {},
      destroy: () => {},
      notify: () => {},
    } as any,
  });

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const { container, unmount } = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} defaultComponent={component as any} />
    </QueryClientProvider>,
  );

  // Wait a tick for suspense / queries to settle into their loading state
  await new Promise((r) => setTimeout(r, 30));

  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag22aa"] },
  });
  unmount();
  return results.violations;
}

export function formatViolations(violations: axe.Result[]) {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes.length} node(s)\n  ${v.helpUrl}`,
    )
    .join("\n\n");
}
