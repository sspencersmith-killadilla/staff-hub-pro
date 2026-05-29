import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- Types ----------

export type HeroSecondaryCta = {
  label: string;
  href: string;
  style?: "primary" | "secondary";
  requires_module?: string | null;
};

export type PortalCardItem = {
  id: string;
  title: string;
  description: string;
  link_to: string;
  link_text: string;
  icon: string;
  color_theme: string;
  requires_module?: string | null;
};

export type ExplainerItem = {
  id: string;
  title: string;
  color_theme: string;
  steps: string[];
};

export type CtaButton = { label: string; href: string };

export type HomeSection =
  | { type: "portal_cards"; id: string; title?: string; items: PortalCardItem[] }
  | {
      type: "explainer_cards";
      id: string;
      title?: string;
      subtitle?: string;
      items: ExplainerItem[];
    }
  | {
      type: "rich_text";
      id: string;
      title?: string;
      body_md: string;
      align?: "left" | "center";
      background?: "white" | "muted" | "navy";
    }
  | {
      type: "image_banner";
      id: string;
      image_url: string;
      alt: string;
      caption?: string;
      href?: string;
    }
  | {
      type: "cta_band";
      id: string;
      headline: string;
      body?: string;
      buttons: CtaButton[];
      background?: "navy" | "amber" | "white";
    };

export type HomeContent = {
  id: string;
  hero_badge: string | null;
  hero_title: string;
  hero_subtitle: string | null;
  hero_authed_message: string | null;
  hero_signup_cta_label: string | null;
  hero_login_cta_label: string | null;
  hero_primary_cta_label: string | null;
  hero_primary_cta_href: string | null;
  hero_secondary_ctas: HeroSecondaryCta[];
  sections: HomeSection[];
  footer_tagline: string | null;
  footer_body: string | null;
  footer_copyright: string | null;
  draft: HomeContentPatch | null;
  published_at: string | null;
  updated_at: string;
};

// ---------- Zod ----------

const ctaSchema = z.object({
  label: z.string().min(1).max(120),
  href: z.string().min(1).max(500),
  style: z.enum(["primary", "secondary"]).optional(),
  requires_module: z.string().max(80).nullable().optional(),
});

const portalItemSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  link_to: z.string().min(1).max(500),
  link_text: z.string().min(1).max(120),
  icon: z.string().min(1).max(80),
  color_theme: z.string().min(1).max(40),
  requires_module: z.string().max(80).nullable().optional(),
});

const explainerItemSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  color_theme: z.string().min(1).max(40),
  steps: z.array(z.string().min(1).max(500)).min(1).max(12),
});

const ctaButtonSchema = z.object({
  label: z.string().min(1).max(120),
  href: z.string().min(1).max(500),
});

const sectionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("portal_cards"),
    id: z.string().min(1).max(80),
    title: z.string().max(200).optional(),
    items: z.array(portalItemSchema).max(24),
  }),
  z.object({
    type: z.literal("explainer_cards"),
    id: z.string().min(1).max(80),
    title: z.string().max(200).optional(),
    subtitle: z.string().max(500).optional(),
    items: z.array(explainerItemSchema).max(24),
  }),
  z.object({
    type: z.literal("rich_text"),
    id: z.string().min(1).max(80),
    title: z.string().max(200).optional(),
    body_md: z.string().max(8000),
    align: z.enum(["left", "center"]).optional(),
    background: z.enum(["white", "muted", "navy"]).optional(),
  }),
  z.object({
    type: z.literal("image_banner"),
    id: z.string().min(1).max(80),
    image_url: z.string().url().max(800),
    alt: z.string().max(200),
    caption: z.string().max(500).optional(),
    href: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal("cta_band"),
    id: z.string().min(1).max(80),
    headline: z.string().min(1).max(200),
    body: z.string().max(1000).optional(),
    buttons: z.array(ctaButtonSchema).max(6),
    background: z.enum(["navy", "amber", "white"]).optional(),
  }),
]);

const contentSchema = z.object({
  hero_badge: z.string().max(120).nullable().optional(),
  hero_title: z.string().min(1).max(300),
  hero_subtitle: z.string().max(1000).nullable().optional(),
  hero_authed_message: z.string().max(1000).nullable().optional(),
  hero_signup_cta_label: z.string().max(120).nullable().optional(),
  hero_login_cta_label: z.string().max(120).nullable().optional(),
  hero_primary_cta_label: z.string().max(120).nullable().optional(),
  hero_primary_cta_href: z.string().max(500).nullable().optional(),
  hero_secondary_ctas: z.array(ctaSchema).max(12),
  sections: z.array(sectionSchema).max(30),
  footer_tagline: z.string().max(200).nullable().optional(),
  footer_body: z.string().max(1000).nullable().optional(),
  footer_copyright: z.string().max(200).nullable().optional(),
});

export type HomeContentPatch = z.infer<typeof contentSchema>;

async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (!roles?.some((r: { role: string }) => r.role === "admin")) {
    throw new Error("Forbidden: admin role required");
  }
}

// ---------- Server functions ----------

async function fetchRowByTenant(tenantId: string | null) {
  let q = supabaseAdmin.from("home_page_content").select("*");
  q = tenantId ? q.eq("tenant_id", tenantId) : q.is("tenant_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return data as HomeContent | null;
}

async function resolveHostTenantId(host?: string | null): Promise<string | null> {
  if (!host) return null;
  const { data } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("host", host)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export const getHomeContent = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ host: z.string().max(255).optional() }).optional().parse(input),
  )
  .handler(async ({ data }): Promise<HomeContent | null> => {
    const tenantId = await resolveHostTenantId(data?.host ?? null);
    if (tenantId) {
      const tenantRow = await fetchRowByTenant(tenantId);
      if (tenantRow) return tenantRow;
    }
    return await fetchRowByTenant(null);
  });

export const getHomeContentAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ tenantId: z.string().uuid().nullable().optional() }).optional().parse(input),
  )
  .handler(async ({ data, context }): Promise<HomeContent | null> => {
    await ensureAdmin(context);
    return await fetchRowByTenant(data?.tenantId ?? null);
  });

async function ensureRow(tenantId: string | null): Promise<HomeContent> {
  const existing = await fetchRowByTenant(tenantId);
  if (existing) return existing;
  const seed = tenantId ? await fetchRowByTenant(null) : null;
  const base = seed
    ? {
        hero_badge: seed.hero_badge,
        hero_title: seed.hero_title,
        hero_subtitle: seed.hero_subtitle,
        hero_authed_message: seed.hero_authed_message,
        hero_signup_cta_label: seed.hero_signup_cta_label,
        hero_login_cta_label: seed.hero_login_cta_label,
        hero_primary_cta_label: seed.hero_primary_cta_label,
        hero_primary_cta_href: seed.hero_primary_cta_href,
        hero_secondary_ctas: seed.hero_secondary_ctas,
        sections: seed.sections,
        footer_tagline: seed.footer_tagline,
        footer_body: seed.footer_body,
        footer_copyright: seed.footer_copyright,
      }
    : { hero_title: "Welcome", hero_secondary_ctas: [], sections: [] };
  const { data: inserted, error } = await supabaseAdmin
    .from("home_page_content")
    .insert({ ...base, tenant_id: tenantId, singleton: tenantId ? null : true })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return inserted as HomeContent;
}

export const saveHomeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        content: contentSchema,
        tenantId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const tenantId = data.tenantId ?? null;
    const row = await ensureRow(tenantId);
    const { error } = await supabaseAdmin
      .from("home_page_content")
      .update({ draft: data.content, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishHomeContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        content: contentSchema,
        label: z.string().max(120).optional(),
        tenantId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<HomeContent> => {
    await ensureAdmin(context);
    const tenantId = data.tenantId ?? null;
    const row = await ensureRow(tenantId);
    await supabaseAdmin.from("brand_versions").insert({
      scope: "home",
      scope_id: tenantId,
      snapshot: row,
      label: data.label ?? "Pre-publish snapshot",
      published_by: context.userId,
    });
    const { data: updated, error } = await supabaseAdmin
      .from("home_page_content")
      .update({
        ...data.content,
        draft: null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated as HomeContent;
  });

