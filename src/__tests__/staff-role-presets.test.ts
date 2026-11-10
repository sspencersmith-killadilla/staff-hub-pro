import { describe, it, expect } from "vitest";
import { ROLE_PRESETS } from "@/lib/staff-role-presets";
import { ALL_PERMISSIONS } from "@/lib/staff-permissions";

describe("role presets", () => {
  it("only grant permissions that exist", () => {
    for (const p of ROLE_PRESETS) for (const k of p.permissions) expect(ALL_PERMISSIONS).toContain(k);
  });
  it("never grant platform settings", () => {
    for (const p of ROLE_PRESETS) expect(p.permissions).not.toContain("page.settings");
  });
});
