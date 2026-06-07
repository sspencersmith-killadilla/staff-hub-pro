import { describe, it, expect } from "vitest";
import { auditComponent, formatViolations } from "./helpers";
import { Route as LoginRoute } from "@/routes/login";

describe("a11y: /login (ticket-purchase entry, vendor-portal entry)", () => {
  it("has no WCAG 2.2 AA violations", async () => {
    const Comp = (LoginRoute.options as any).component;
    const violations = await auditComponent(<Comp />, {
      search: { redirect: "/hub" },
    });
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});
