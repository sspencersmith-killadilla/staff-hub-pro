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

export const getHomeContent = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeContent | null> => {
    const { data, error } = await supabaseAdmin
      .from("home_page_content")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as HomeContent | null;
  },
);

export const getHomeContentAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeContent | null> => {
    await ensureAdmin(context);
    const { data, error } = await supabaseAdmin
      .from("home_page_content")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as HomeContent | null;
  });

export const saveHomeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ content: contentSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await supabaseAdmin
      .from("home_page_content")
      .update({ draft: data.content, updated_at: new Date().toISOString() })
      .eq("singleton", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishHomeContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ content: contentSchema, label: z.string().max(120).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<HomeContent> => {
    await ensureAdmin(context);
    const { data: current } = await supabaseAdmin
      .from("home_page_content")
      .select("*")
      .eq("singleton", true)
      .single();
    if (current) {
      await supabaseAdmin.from("brand_versions").insert({
        scope: "home",
        scope_id: null,
        snapshot: current,
        label: data.label ?? "Pre-publish snapshot",
        published_by: context.userId,
      });
    }
    const { data: updated, error } = await supabaseAdmin
      .from("home_page_content")
      .update({
        ...data.content,
        draft: null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("singleton", true)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated as HomeContent;
  });
