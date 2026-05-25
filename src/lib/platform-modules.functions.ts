import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/config";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ModuleKey =
  | "vendors_sponsors"
  | "streetbeats"
  | "community_orgs"
  | "room_reservations";

export type PlatformModule = {
  key: ModuleKey;
  label: string;
  description: string;
  enabled: boolean;
};

const DEFAULT_MODULES: PlatformModule[] = [
  { key: "community_orgs", label: "Community Organizations Portal", description: "Allows HOAs, nonprofits, and schools to submit public events.", enabled: true },
  { key: "room_reservations", label: "Public Room Reservations", description: "Allows residents to book conference rooms and study pods.", enabled: true },
  { key: "streetbeats", label: "StreetBeats Music Portal", description: "Allows musicians to audition and claim public busking slots.", enabled: true },
  { key: "vendors_sponsors", label: "Vendors & Sponsors Portal", description: "Allows businesses to apply for booths and sponsorship packages.", enabled: true },
];

function mergeWithDefaults(modules?: PlatformModule[] | null) {
  const map = new Map(DEFAULT_MODULES.map((module) => [module.key, module]));

  for (const module of modules ?? []) {
    map.set(module.key, module);
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function shouldUseDefaultModules(error: unknown) {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("public.platform_modules") ||
    message.includes("relation \"platform_modules\" does not exist") ||
    message.includes("schema cache")
  );
}

export const listPlatformModules = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase
        .from("platform_modules")
        .select("key,label,description,enabled")
        .order("label");

      if (error) {
        if (shouldUseDefaultModules(error)) {
          console.warn("[platform_modules] falling back to defaults:", error.message);
          return DEFAULT_MODULES;
        }

        throw new Error(error.message);
      }

      return mergeWithDefaults(data as PlatformModule[] | null | undefined);
    } catch (error) {
      if (shouldUseDefaultModules(error)) {
        console.warn("[platform_modules] falling back to defaults:", error);
        return DEFAULT_MODULES;
      }

      throw error;
    }
  },
);

export const setPlatformModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ key: z.string().min(1).max(64), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // verify admin via user_roles
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    if (rolesErr) throw new Error(rolesErr.message);
    if (!roles || roles.length === 0) throw new Error("Forbidden: admin required");

    const { error } = await supabase
      .from("platform_modules")
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
