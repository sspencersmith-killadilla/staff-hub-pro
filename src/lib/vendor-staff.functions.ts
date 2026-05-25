import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "@/lib/staff-guard";

const STATUSES = ["pending", "approved", "rejected", "paid", "cancelled"] as const;
const StatusSchema = z.enum(STATUSES);

export const listAllVendors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("vendors")
      .select(
        "id, business_name, contact_name, contact_email, logo_url, application_notes, status, session_id, vendor_tier_id, sessions(id, title, start_time), vendor_tiers(id, name, price)",
      )
      .order("id", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAllSponsors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data, error } = await supabaseAdmin
      .from("sponsors")
      .select(
        "id, company_name, contact_name, contact_email, logo_url, status, created_at, session_id, sponsorship_tier_id, sessions(id, title, start_time), sponsorship_tiers(id, name, price)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setVendorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), status: StatusSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("vendors")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSponsorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), status: StatusSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("sponsors")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
