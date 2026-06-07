import { describe, it, expect } from "vitest";
import { auditComponent, formatViolations } from "./helpers";
import { Route as SignupRoute } from "@/routes/signup";

describe("a11y: /signup", () => {
  it("has no WCAG 2.2 AA violations", async () => {
    const Comp = (SignupRoute.options as any).component;
    const violations = await auditComponent(<Comp />);
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});
