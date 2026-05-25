import { redirect } from "@tanstack/react-router";
import {
  listPlatformModules,
  type ModuleKey,
} from "@/lib/platform-modules.functions";

export async function requireModule(key: ModuleKey) {
  let modules;
  try {
    modules = await listPlatformModules();
  } catch {
    // Fail-open: modules table not yet provisioned or fetch failed.
    return;
  }
  const m = modules.find((x) => x.key === key);
  if (m && !m.enabled) {
    throw redirect({ to: "/" });
  }
}
