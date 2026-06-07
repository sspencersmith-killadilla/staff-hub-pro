import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ModuleKey =
  | "vendors_sponsors"
  | "streetbeats"
  | "community_orgs"
  | "room_reservations"
  | "classes"
  | "box_office"
  | "venues"
  | "social_command"
  | "guidebook"
  | "events"
  | "civic_quests";

export type PlatformModule = {
  key: ModuleKey;
  label: string;
  description: string;
  enabled: boolean;
  unavailable?: boolean;
};

const DEFAULT_MODULES: PlatformModule[] = [
  { key: "events", label: "Events Calendar", description: "Public events listing, ticketing, and schedule pages.", enabled: true },
  { key: "box_office", label: "Box Office", description: "Attendee management, check-in, and ticket sales tools.", enabled: true },
  { key: "venues", label: "Venues & Stages", description: "Internal venue, stage, and room management.", enabled: true },
  { key: "classes", label: "Classes & Sessions", description: "Course catalog, instructors, and multi-session class scheduling.", enabled: true },
  { key: "community_orgs", label: "Community Organizations Portal", description: "Allows HOAs, nonprofits, and schools to submit public events.", enabled: true },
  { key: "room_reservations", label: "Public Room Reservations", description: "Allows residents to book conference rooms and study pods.", enabled: true },
  { key: "streetbeats", label: "StreetBeats Music Portal", description: "Allows musicians to audition and claim public busking slots.", enabled: true },
  { key: "vendors_sponsors", label: "Vendors & Sponsors Portal", description: "Allows businesses to apply for booths and sponsorship packages.", enabled: true },
  { key: "social_command", label: "Social Media Command Center", description: "Cross-platform social scheduling, planner, and integrations.", enabled: true },
  { key: "guidebook", label: "Guidebook Publisher", description: "Magazine-style guidebook editor and PDF export.", enabled: true },
  { key: "civic_quests", label: "Civic Quests & Discovery", description: "Gamified self-guided adventures: badges, points, QR/geo waypoints, leaderboard, and reports.", enabled: true },
];

function mergeWithDefaults(modules?: PlatformModule[] | null) {
  const map = new Map(DEFAULT_MODULES.map((module) => [module.key, module]));

  for (const module of modules ?? []) {
    map.set(module.key, module);
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function markUnavailable(modules: PlatformModule[]) {
  return modules.map((module) => ({ ...module, unavailable: true }));
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
      const { data, error } = await supabaseAdmin
        .from("platform_modules")
        .select("key,label,description,enabled")
        .order("label");

      if (error) {
        if (shouldUseDefaultModules(error)) {
          console.warn("[platform_modules] falling back to defaults:", error.message);
          return markUnavailable(DEFAULT_MODULES);
        }

        throw new Error(error.message);
      }

      return mergeWithDefaults(data as PlatformModule[] | null | undefined);
    } catch (error) {
      if (shouldUseDefaultModules(error)) {
        console.warn("[platform_modules] falling back to defaults:", error);
        return markUnavailable(DEFAULT_MODULES);
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
    const { userId } = context;
    const moduleDefaults = DEFAULT_MODULES.find((module) => module.key === data.key);

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    if (rolesErr) throw new Error(rolesErr.message);
    if (!roles || roles.length === 0) throw new Error("Forbidden: admin required");

    const { error } = await supabaseAdmin.from("platform_modules").upsert(
      {
        key: data.key,
        label: moduleDefaults?.label ?? data.key,
        description: moduleDefaults?.description ?? "",
        enabled: data.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    if (error && shouldUseDefaultModules(error)) {
      throw new Error("Platform module settings are not ready yet. Run the platform_modules migration first.");
    }

    if (error) throw new Error(error.message);
    return { ok: true };
  });
