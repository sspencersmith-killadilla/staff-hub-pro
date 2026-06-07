import { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import axe from "axe-core";
import { __routeState } from "../setup";

/**
 * Render a route component in isolation and run axe-core (WCAG 2.2 AA).
 * Per-route Supabase / server-fn calls are stubbed in setup.ts.
 *
 * Returns axe violation objects. Assert `violations.length === 0`.
 */
export async function auditComponent(
  ui: ReactElement,
  opts: {
    params?: Record<string, string>;
    search?: Record<string, unknown>;
  } = {},
) {
  __routeState.params = opts.params ?? {};
  __routeState.search = opts.search ?? {};

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const { container, unmount } = render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );

  await new Promise((r) => setTimeout(r, 50));

  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag22aa"] },
    resultTypes: ["violations"],
  });
  unmount();
  return results.violations;
}

export function formatViolations(violations: axe.Result[]): string {
  if (!violations.length) return "no violations";
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"})\n  ${v.helpUrl}`,
    )
    .join("\n");
}
