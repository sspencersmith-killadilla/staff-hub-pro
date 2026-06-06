import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SegmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all_active_users") }),
  z.object({ type: z.literal("event_attendees"), event_id: z.string().uuid() }),
  z.object({ type: z.literal("approved_vendors") }),
  z.object({ type: z.literal("department_members"), department_id: z.string().uuid() }),
]);

const AudienceSchema = z.object({ segments: z.array(SegmentSchema).default([]) });

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "staff"])
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("communication_campaigns")
      .select("id, subject, status, scheduled_for, sent_at, recipient_count, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("communication_campaigns")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");
    return row;
  });

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  subject: z.string().min(1).max(300),
  body_html: z.string().max(200_000),
  body_json: z.any().optional(),
  target_audience_rules: AudienceSchema,
  scheduled_for: z.string().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
});

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof SaveSchema>) => SaveSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const status = data.scheduled_for ? "scheduled" : "draft";
    const payload: any = {
      subject: data.subject,
      body_html: data.body_html,
      body_json: data.body_json ?? null,
      target_audience_rules: data.target_audience_rules,
      scheduled_for: data.scheduled_for ?? null,
      department_id: data.department_id ?? null,
      status,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("communication_campaigns")
        .update(payload)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    payload.created_by = context.userId;
    const { data: row, error } = await context.supabase
      .from("communication_campaigns")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { error } = await context.supabase.from("communication_campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Resolve audience -> list of unique emails
export const previewAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rules: z.infer<typeof AudienceSchema> }) =>
    z.object({ rules: AudienceSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emails = await resolveAudience(supabaseAdmin, data.rules);
    return { count: emails.length, sample: emails.slice(0, 10) };
  });

async function resolveAudience(
  admin: any,
  rules: z.infer<typeof AudienceSchema>,
): Promise<string[]> {
  const set = new Set<string>();
  for (const seg of rules.segments) {
    if (seg.type === "all_active_users") {
      const { data } = await admin.from("profiles").select("email").not("email", "is", null);
      (data ?? []).forEach((r: any) => r.email && set.add(r.email.toLowerCase()));
    } else if (seg.type === "event_attendees") {
      // Sessions belong to events via session->stage->venue? Simpler: attendees has session_id; we'll just match attendees by ticket_tiers.session_id where session.event matches.
      const { data: sessions } = await admin
        .from("sessions")
        .select("id, event_id")
        .eq("event_id", seg.event_id);
      const sessionIds = (sessions ?? []).map((s: any) => s.id);
      if (sessionIds.length) {
        const { data } = await admin
          .from("attendees")
          .select("email, ticket_tiers!inner(session_id)")
          .in("ticket_tiers.session_id", sessionIds);
        (data ?? []).forEach((r: any) => r.email && set.add(r.email.toLowerCase()));
      }
    } else if (seg.type === "approved_vendors") {
      const { data } = await admin
        .from("vendor_applications")
        .select("contact_email")
        .in("status", ["approved", "paid"]);
      (data ?? []).forEach((r: any) => r.contact_email && set.add(r.contact_email.toLowerCase()));
    } else if (seg.type === "department_members") {
      const { data: roles } = await admin
        .from("department_roles")
        .select("user_id")
        .eq("department_id", seg.department_id);
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (ids.length) {
        const { data } = await admin.from("profiles").select("email").in("id", ids);
        (data ?? []).forEach((r: any) => r.email && set.add(r.email.toLowerCase()));
      }
    }
  }
  // strip unsubscribed
  const { data: unsubs } = await admin.from("campaign_unsubscribes").select("email");
  (unsubs ?? []).forEach((r: any) => set.delete(r.email.toLowerCase()));
  return Array.from(set);
}

export { resolveAudience };

// Trigger dispatch immediately
export const dispatchCampaignNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { dispatchCampaign } = await import("@/lib/communications.server");
    return dispatchCampaign(data.id);
  });

export const sendTestCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; email: string }) =>
    z.object({ id: z.string().uuid(), email: z.string().email() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { sendTest } = await import("@/lib/communications.server");
    return sendTest(data.id, data.email);
  });
