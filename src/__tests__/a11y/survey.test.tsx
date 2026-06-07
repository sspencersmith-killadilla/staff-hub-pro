import { describe, it, expect } from "vitest";
import { auditComponent, formatViolations } from "./helpers";
import { Route as SurveyRoute } from "@/routes/survey.$id";

describe("a11y: /survey/$id (survey response flow)", () => {
  it("loading state has no WCAG 2.2 AA violations", async () => {
    const Comp = (SurveyRoute.options as any).component;
    const violations = await auditComponent(<Comp />, {
      params: { id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});
