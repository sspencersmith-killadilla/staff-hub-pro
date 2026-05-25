import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ─── Public: open sessions accepting vendors/sponsors ─────────────────
export const listOpenSessions = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("sessions")
      .select("id, title, start_time, stages(name)")
      .eq("accepts_vendors", true)
      .order("start_time", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
);

// ─── Public: tiers for an event ───────────────────────────────────────
export const listTiers = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z
      .object({
        sessionId: z.string().uuid(),
        kind: z.enum(["vendor", "sponsor"]),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const table = data.kind === "vendor" ? "vendor_tiers" : "sponsorship_tiers";
    const { data: tiers, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .eq("session_id", data.sessionId)
      .order("price", { ascending: false });
    if (error) throw new Error(error.message);
    return tiers ?? [];
  });

// ─── My applications ──────────────────────────────────────────────────
export const listMyApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const [vRes, sRes] = await Promise.all([
      supabaseAdmin
        .from("vendors")
        .select("*, sessions(*, stages(name)), vendor_tiers(name)")
        .eq("user_id", uid),
      supabaseAdmin
        .from("sponsors")
        .select("*, sessions(*, stages(name)), sponsorship_tiers(name)")
        .eq("user_id", uid),
    ]);
    if (vRes.error) throw new Error(vRes.error.message);
    if (sRes.error) throw new Error(sRes.error.message);
    return { vendors: vRes.data ?? [], sponsors: sRes.data ?? [] };
  });

// ─── Submit application ───────────────────────────────────────────────
const SubmitInput = z.object({
  kind: z.enum(["vendor", "sponsor"]),
  sessionId: z.string().uuid(),
  tierId: z.string().uuid(),
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  logoUrl: z.string().max(1000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const submitApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SubmitInput.parse(i))
  .handler(async ({ data, context }) => {
    const email = context.claims?.email ?? null;
    if (data.kind === "vendor") {
      const { error } = await supabaseAdmin.from("vendors").insert([
        {
          user_id: context.userId,
          business_name: data.companyName,
          contact_name: data.contactName,
          contact_email: email,
          application_notes: data.notes ?? null,
          logo_url: data.logoUrl ?? null,
          session_id: data.sessionId,
          vendor_tier_id: data.tierId,
          status: "pending",
        },
      ]);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("sponsors").insert([
        {
          user_id: context.userId,
          company_name: data.companyName,
          contact_name: data.contactName,
          contact_email: email,
          logo_url: data.logoUrl ?? null,
          session_id: data.sessionId,
          sponsorship_tier_id: data.tierId,
          status: "pending",
        },
      ]);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ─── Update application (user-scoped) ─────────────────────────────────
const UpdateInput = z.object({
  id: z.string().uuid(),
  kind: z.enum(["vendor", "sponsor"]),
  business_name: z.string().min(1).max(200),
  contact_name: z.string().min(1).max(200),
  logo_url: z.string().max(1000).optional().nullable(),
  application_notes: z.string().max(2000).optional().nullable(),
  photo_urls: z.array(z.string().max(1000)).max(20).optional(),
});

export const updateApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    if (data.kind === "vendor") {
      const { error } = await supabaseAdmin
        .from("vendors")
        .update({
          business_name: data.business_name,
          contact_name: data.contact_name,
          logo_url: data.logo_url ?? null,
          application_notes: data.application_notes ?? null,
          photo_urls: data.photo_urls ?? [],
        })
        .eq("id", data.id)
        .eq("user_id", uid);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("sponsors")
        .update({
          company_name: data.business_name,
          contact_name: data.contact_name,
          logo_url: data.logo_url ?? null,
        })
        .eq("id", data.id)
        .eq("user_id", uid);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ─── Cancel application (user-scoped) ─────────────────────────────────
export const cancelApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        kind: z.enum(["vendor", "sponsor"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const table = data.kind === "vendor" ? "vendors" : "sponsors";
    const { error } = await supabaseAdmin
      .from(table)
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Public: sponsors directory grouped by event ──────────────────────
export const listPublicSponsors = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("sponsors")
      .select("id, company_name, logo_url, status, sessions(title)")
      .in("status", ["approved", "paid"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const grouped: Record<string, any[]> = {};
    for (const s of data ?? []) {
      const title = (s as any).sessions?.title ?? "General Programming";
      if (!grouped[title]) grouped[title] = [];
      grouped[title].push(s);
    }
    return grouped;
  },
);
