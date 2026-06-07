import { describe, it, expect } from "vitest";
import { auditComponent, formatViolations } from "./helpers";
import { Route as VendorRoute } from "@/routes/vendor";

describe("a11y: /vendor (vendor application flow)", () => {
  it("has no WCAG 2.2 AA violations", async () => {
    const Comp = (VendorRoute.options as any).component;
    const violations = await auditComponent(<Comp />);
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});
