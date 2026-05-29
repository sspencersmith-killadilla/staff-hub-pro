import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type GlobalSettings = {
  id: string;
  city_name: string;
  primary_logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  updated_at: string;
};

export const getGlobalSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<GlobalSettings | null> => {
    const { data, error } = await supabaseAdmin
      .from("global_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as GlobalSettings | null;
  },
);

const updateSchema = z.object({
  city_name: z.string().min(1).max(120),
  primary_logo_url: z.string().url().nullable().optional(),
  favicon_url: z.string().url().nullable().optional(),
  primary_color: z.string().min(3).max(40),
  secondary_color: z.string().min(3).max(40),
  font_family: z.string().min(1).max(80),
});

export const updateGlobalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!roles?.some((r) => r.role === "admin")) {
      throw new Error("Forbidden: admin role required");
    }
    const { data: updated, error } = await supabaseAdmin
      .from("global_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("singleton", true)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated as GlobalSettings;
  });
