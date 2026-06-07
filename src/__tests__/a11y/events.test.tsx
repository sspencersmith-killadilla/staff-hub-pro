import { describe, it, expect } from "vitest";
import { auditComponent, formatViolations } from "./helpers";
import { Route as EventsRoute } from "@/routes/events.index";

describe("a11y: /events (ticket-purchase entry)", () => {
  it("has no WCAG 2.2 AA violations", async () => {
    const Comp = (EventsRoute.options as any).component;
    const violations = await auditComponent(<Comp />);
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});
