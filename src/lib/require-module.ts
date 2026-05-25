import { redirect } from "@tanstack/react-router";
import {
  listPlatformModules,
  type ModuleKey,
} from "@/lib/platform-modules.functions";

export async function requireModule(key: ModuleKey) {
  try {
    const modules = await listPlatformModules();
    const m = modules.find((x) => x.key === key);
    if (m && !m.enabled) {
      throw redirect({ to: "/" });
    }
  } catch (err) {
    // If it's already a redirect, rethrow
    if (err && typeof err === "object" && "to" in (err as Record<string, unknown>)) {
      throw err;
    }
    // On fetch error, allow access (fail-open) — modules default enabled
  }
}
