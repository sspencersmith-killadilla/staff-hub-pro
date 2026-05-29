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
  // new branding-engine columns (all nullable for back-compat)
  accent_color: string | null;
  background_color: string | null;
  foreground_color: string | null;
  muted_color: string | null;
  destructive_color: string | null;
  dark_primary_color: string | null;
  dark_background_color: string | null;
  dark_foreground_color: string | null;
  dark_accent_color: string | null;
  radius: string | null;
  heading_font: string | null;
  body_font: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  logo_icon_url: string | null;
  wordmark_url: string | null;
  og_image_url: string | null;
  favicon_svg_url: string | null;
  favicon_32_url: string | null;
  favicon_180_url: string | null;
  favicon_512_url: string | null;
  manifest_url: string | null;
  draft_tokens: any | null;
  published_at: string | null;
  updated_at: string;
};

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  host: string | null;
  tokens: any;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  created_at: string;
  updated_at: string;
};

export type BrandPreset = {
  id: string;
  name: string;
  tokens: any;
  logo_urls: any;
  created_at: string;
};

export type BrandVersion = {
  id: string;
  scope: "global" | "tenant" | "department";
  scope_id: string | null;
  snapshot: any;
  label: string | null;
  published_at: string;
};

async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (!roles?.some((r: { role: string }) => r.role === "admin")) {
    throw new Error("Forbidden: admin role required");
  }
}

// ---------- Global settings ----------

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

const settingsPatchSchema = z.object({
  city_name: z.string().min(1).max(120).optional(),
  primary_color: z.string().min(3).max(40).optional(),
  secondary_color: z.string().min(3).max(40).optional(),
  accent_color: z.string().min(3).max(40).nullable().optional(),
  background_color: z.string().min(3).max(40).nullable().optional(),
  foreground_color: z.string().min(3).max(40).nullable().optional(),
  muted_color: z.string().min(3).max(40).nullable().optional(),
  destructive_color: z.string().min(3).max(40).nullable().optional(),
  dark_primary_color: z.string().min(3).max(40).nullable().optional(),
  dark_background_color: z.string().min(3).max(40).nullable().optional(),
  dark_foreground_color: z.string().min(3).max(40).nullable().optional(),
  dark_accent_color: z.string().min(3).max(40).nullable().optional(),
  radius: z.string().min(1).max(40).nullable().optional(),
  font_family: z.string().min(1).max(80).optional(),
  heading_font: z.string().min(1).max(80).nullable().optional(),
  body_font: z.string().min(1).max(80).nullable().optional(),
  primary_logo_url: z.string().url().nullable().optional(),
  favicon_url: z.string().url().nullable().optional(),
  logo_light_url: z.string().url().nullable().optional(),
  logo_dark_url: z.string().url().nullable().optional(),
  logo_icon_url: z.string().url().nullable().optional(),
  wordmark_url: z.string().url().nullable().optional(),
  og_image_url: z.string().url().nullable().optional(),
  favicon_svg_url: z.string().url().nullable().optional(),
  favicon_32_url: z.string().url().nullable().optional(),
  favicon_180_url: z.string().url().nullable().optional(),
  favicon_512_url: z.string().url().nullable().optional(),
  manifest_url: z.string().url().nullable().optional(),
});

export type GlobalSettingsPatch = z.infer<typeof settingsPatchSchema>;

export const updateGlobalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => settingsPatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: updated, error } = await supabaseAdmin
      .from("global_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("singleton", true)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated as GlobalSettings;
  });

// Save draft (writes to draft_tokens jsonb, does not affect live row)
const draftSchema = z.object({
  tokens: z.record(z.string(), z.unknown()),
});

export const saveGlobalDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => draftSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await supabaseAdmin
      .from("global_settings")
      .update({ draft_tokens: data.tokens, updated_at: new Date().toISOString() })
      .eq("singleton", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Publish: copy draft to live columns, snapshot current live to brand_versions
const publishSchema = z.object({
  patch: settingsPatchSchema,
  label: z.string().max(120).optional(),
});

export const publishGlobalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => publishSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: current } = await supabaseAdmin
      .from("global_settings")
      .select("*")
      .eq("singleton", true)
      .single();
    if (current) {
      await supabaseAdmin.from("brand_versions").insert({
        scope: "global",
        scope_id: null,
        snapshot: current,
        label: data.label ?? "Pre-publish snapshot",
        published_by: context.userId,
      });
    }
    const { data: updated, error } = await supabaseAdmin
      .from("global_settings")
      .update({
        ...data.patch,
        draft_tokens: null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("singleton", true)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated as GlobalSettings;
  });

// ---------- Tenants ----------

export const listTenants = createServerFn({ method: "GET" }).handler(
  async (): Promise<Tenant[]> => {
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Tenant[];
  },
);

export const resolveTenant = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({ host: z.string().optional(), slug: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Tenant | null> => {
    if (data.host) {
      const { data: byHost } = await supabaseAdmin
        .from("tenants")
        .select("*")
        .eq("host", data.host)
        .maybeSingle();
      if (byHost) return byHost as Tenant;
    }
    if (data.slug) {
      const { data: bySlug } = await supabaseAdmin
        .from("tenants")
        .select("*")
        .eq("slug", data.slug)
        .maybeSingle();
      if (bySlug) return bySlug as Tenant;
    }
    return null;
  });

const tenantSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  host: z.string().max(255).nullable().optional(),
  tokens: z.record(z.string(), z.unknown()).optional(),
  logo_light_url: z.string().url().nullable().optional(),
  logo_dark_url: z.string().url().nullable().optional(),
  favicon_url: z.string().url().nullable().optional(),
});

export const upsertTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => tenantSchema.parse(input))
  .handler(async ({ data, context }): Promise<Tenant> => {
    await ensureAdmin(context);
    const row = { ...data, updated_at: new Date().toISOString() };
    const { data: saved, error } = await supabaseAdmin
      .from("tenants")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved as Tenant;
  });

export const deleteTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await supabaseAdmin.from("tenants").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Presets ----------

export const listPresets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrandPreset[]> => {
    await ensureAdmin(context);
    const { data, error } = await supabaseAdmin
      .from("brand_presets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as BrandPreset[];
  });

const presetSchema = z.object({
  name: z.string().min(1).max(80),
  tokens: z.record(z.string(), z.unknown()),
  logo_urls: z.record(z.string(), z.unknown()).optional(),
});

export const savePreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => presetSchema.parse(input))
  .handler(async ({ data, context }): Promise<BrandPreset> => {
    await ensureAdmin(context);
    const { data: saved, error } = await supabaseAdmin
      .from("brand_presets")
      .insert({ ...data, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved as BrandPreset;
  });

export const deletePreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await supabaseAdmin.from("brand_presets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Versions ----------

const versionListSchema = z.object({
  scope: z.enum(["global", "tenant", "department"]),
  scope_id: z.string().uuid().nullable().optional(),
});

export const listBrandVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => versionListSchema.parse(input))
  .handler(async ({ data, context }): Promise<BrandVersion[]> => {
    await ensureAdmin(context);
    let q = supabaseAdmin
      .from("brand_versions")
      .select("*")
      .eq("scope", data.scope)
      .order("published_at", { ascending: false })
      .limit(50);
    if (data.scope_id) q = q.eq("scope_id", data.scope_id);
    else q = q.is("scope_id", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as BrandVersion[];
  });
