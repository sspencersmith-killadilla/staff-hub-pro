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

export const listPlatformModules = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("platform_modules")
      .select("key,label,description,enabled")
      .order("label");
    if (error) throw new Error(error.message);
    return (data ?? []) as PlatformModule[];
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
