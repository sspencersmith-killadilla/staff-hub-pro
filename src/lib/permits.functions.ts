import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  loadUsaepayConfig,
  buildUsaepayAuthHeader,
} from "@/lib/usaepay.server";

// ─── Public: list active permit configurations ───────────────────────
export const listActivePermitConfigurations = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("permit_configurations")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
);

// ─── Admin: list ALL permit configurations ───────────────────────────
export const listAllPermitConfigurations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: adminCheck, error: adminErr } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "admin" },
    );
    if (adminErr) throw new Error(adminErr.message);
    if (!adminCheck) throw new Error("Admin access required");
    const { data, error } = await supabaseAdmin
      .from("permit_configurations")
      .select("*")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ─── Admin: upsert permit configuration ──────────────────────────────
const ConfigInput = z.object({
  id: z.string().uuid().optional(),
  category: z.enum(["event_type", "trail_fee", "base_fee"]),
  label: z.string().trim().min(1).max(200),
  cost: z.number().min(0).max(1_000_000),
  sort_order: z.number().int().min(0).max(10_000).default(0),
  is_active: z.boolean().default(true),
});

export const upsertPermitConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ConfigInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: adminCheck } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!adminCheck) throw new Error("Admin access required");

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("permit_configurations")
        .update({
          category: data.category,
          label: data.label,
          cost: data.cost,
          sort_order: data.sort_order,
          is_active: data.is_active,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("permit_configurations")
      .insert([
        {
          category: data.category,
          label: data.label,
          cost: data.cost,
          sort_order: data.sort_order,
          is_active: data.is_active,
        },
      ])
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// ─── Admin: delete permit configuration ──────────────────────────────
export const deletePermitConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: adminCheck } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!adminCheck) throw new Error("Admin access required");
    const { error } = await supabaseAdmin
      .from("permit_configurations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Permit submission shared shape ──────────────────────────────────
const ApplicantInfo = z
  .object({
    primary_contact_name: z.string().max(200).optional().default(""),
    primary_contact_phone: z.string().max(40).optional().default(""),
    primary_contact_email: z.string().max(255).optional().default(""),
    secondary_contact_name: z.string().max(200).optional().default(""),
    secondary_contact_phone: z.string().max(40).optional().default(""),
    secondary_contact_email: z.string().max(255).optional().default(""),
    organization_name: z.string().max(200).optional().default(""),
    organization_type: z.string().max(100).optional().default(""),
  })
  .partial();

const EventDetails = z
  .object({
    event_name: z.string().max(200).optional().default(""),
    estimated_participants: z.number().int().min(0).max(1_000_000).optional(),
    setup_start: z.string().max(40).optional().default(""),
    main_start: z.string().max(40).optional().default(""),
    main_end: z.string().max(40).optional().default(""),
    teardown_end: z.string().max(40).optional().default(""),
    serving_alcohol: z.boolean().optional(),
    tabc_license_number: z.string().max(100).optional().default(""),
    food_vendors: z.boolean().optional(),
    electrical_voltage: z.enum(["none", "110v", "220v"]).optional(),
    parade_included: z.boolean().optional(),
  })
  .partial();

const OperationsSafety = z
  .object({
    traffic_control: z.string().max(5000).optional().default(""),
    litter_control: z.string().max(5000).optional().default(""),
    public_notification: z.string().max(5000).optional().default(""),
  })
  .partial();

const InsuranceDocs = z
  .object({
    insurance_url: z.string().max(1000).optional().default(""),
    site_plan_url: z.string().max(1000).optional().default(""),
    traffic_plan_url: z.string().max(1000).optional().default(""),
  })
  .partial();

const SavePermitInput = z.object({
  id: z.string().uuid().optional(),
  department_id: z.string().uuid().nullable().optional(),
  applicant_info: ApplicantInfo,
  event_details: EventDetails,
  operations_safety: OperationsSafety,
  insurance_docs: InsuranceDocs,
  selected_event_type_id: z.string().uuid().nullable().optional(),
  selected_trail_fee_id: z.string().uuid().nullable().optional(),
  signature_name: z.string().max(200).nullable().optional(),
  intent: z.enum(["draft", "submit"]),
});

async function computeFee(opts: {
  trailFeeId: string | null | undefined;
}): Promise<number> {
  const { data: configs, error } = await supabaseAdmin
    .from("permit_configurations")
    .select("id, category, cost, is_active");
  if (error) throw new Error(error.message);
  const active = (configs ?? []).filter((c) => c.is_active);
  const base = active
    .filter((c) => c.category === "base_fee")
    .reduce((sum, c) => sum + Number(c.cost ?? 0), 0);
  let trail = 0;
  if (opts.trailFeeId) {
    const t = active.find(
      (c) => c.id === opts.trailFeeId && c.category === "trail_fee",
    );
    if (t) trail = Number(t.cost ?? 0);
  }
  return +(base + trail).toFixed(2);
}

// ─── Save draft / Submit permit ──────────────────────────────────────
export const savePermitApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SavePermitInput.parse(i))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const fee = await computeFee({ trailFeeId: data.selected_trail_fee_id });

    const payload: Record<string, unknown> = {
      user_id: uid,
      department_id: data.department_id ?? null,
      applicant_info: data.applicant_info,
      event_details: data.event_details,
      operations_safety: data.operations_safety,
      insurance_docs: data.insurance_docs,
      selected_event_type_id: data.selected_event_type_id ?? null,
      selected_trail_fee_id: data.selected_trail_fee_id ?? null,
      calculated_fee: fee,
      status: data.intent === "submit" ? "pending_review" : "draft",
    };
    if (data.intent === "submit") {
      if (!data.signature_name?.trim())
        throw new Error("Electronic signature is required to submit");
      payload.signature_name = data.signature_name.trim();
      payload.signed_at = new Date().toISOString();
    }

    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("special_event_permits")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", uid)
        .select("id, calculated_fee, status")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabaseAdmin
      .from("special_event_permits")
      .insert([payload])
      .select("id, calculated_fee, status")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ─── List my permits ─────────────────────────────────────────────────
export const listMyPermits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("special_event_permits")
      .select(
        "*, event_type:selected_event_type_id(label), trail_fee:selected_trail_fee_id(label, cost)",
      )
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ─── Get a single permit (owner / staff) ─────────────────────────────
export const getPermit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await supabaseAdmin
      .from("special_event_permits")
      .select(
        "*, event_type:selected_event_type_id(label), trail_fee:selected_trail_fee_id(label, cost)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Permit not found");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isStaff } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "staff",
    });
    if (row.user_id !== context.userId && !isAdmin && !isStaff)
      throw new Error("Not authorized");
    return row;
  });

// ─── Staff: list all permits (queue) ─────────────────────────────────
export const listAllPermits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isStaff } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "staff",
    });
    if (!isAdmin && !isStaff) throw new Error("Staff access required");
    const { data, error } = await supabaseAdmin
      .from("special_event_permits")
      .select(
        "*, event_type:selected_event_type_id(label), trail_fee:selected_trail_fee_id(label, cost)",
      )
      .neq("status", "draft")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ─── Staff: set permit status ────────────────────────────────────────
export const setPermitStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending_review", "approved", "paid", "rejected"]),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isStaff } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "staff",
    });
    if (!isAdmin && !isStaff) throw new Error("Staff access required");
    const patch: Record<string, unknown> = { status: data.status };
    if (data.notes !== undefined) patch.staff_notes = data.notes;
    const { error } = await supabaseAdmin
      .from("special_event_permits")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Pay for permit (USAePay) ────────────────────────────────────────
const PayInput = z.object({
  id: z.string().uuid(),
  contract_accepted: z.literal(true),
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255),
  card: z.object({
    number: z.string().trim().min(12).max(25),
    expiration: z.string().trim().regex(/^\d{2}\/?\d{2}$/u),
    cvc: z.string().trim().regex(/^\d{3,4}$/u),
    avs_zip: z.string().trim().min(3).max(10).optional(),
  }),
});

export const payForPermit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => PayInput.parse(i))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const { data: row, error: rowErr } = await supabaseAdmin
      .from("special_event_permits")
      .select("id, user_id, status, calculated_fee, event_details")
      .eq("id", data.id)
      .eq("user_id", uid)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Error("Permit not found");
    if (row.status !== "approved" && row.status !== "pending_review") {
      throw new Error(
        "This permit cannot be paid in its current status",
      );
    }
    const amount = Number(row.calculated_fee ?? 0);
    if (!(amount > 0)) throw new Error("This permit has no payable amount");

    const cfg = loadUsaepayConfig();
    if (!cfg)
      throw new Error(
        "Payments are not yet configured. Operator needs USAEPAY_API_KEY and USAEPAY_API_PIN.",
      );
    const expRaw = data.card.expiration.replace(/\D/g, "");
    if (expRaw.length !== 4) throw new Error("Invalid card expiration");

    const eventName =
      (row.event_details as any)?.event_name?.toString().slice(0, 80) ??
      "Special Event Permit";

    const res = await fetch(`${cfg.baseUrl}/transactions`, {
      method: "POST",
      headers: {
        Authorization: buildUsaepayAuthHeader(cfg),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        command: "sale",
        amount: amount.toFixed(2),
        invoice: `permit-${row.id.slice(0, 8)}`,
        description: `Special Event Permit — ${eventName}`,
        creditcard: {
          number: data.card.number.replace(/\s+/g, ""),
          expiration: expRaw,
          cvc: data.card.cvc,
          cardholder: data.full_name,
          avs_zip: data.card.avs_zip ?? undefined,
        },
        billing_address: { email: data.email },
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    const approved = json?.result_code === "A" || json?.result === "Approved";
    if (!res.ok || !approved) {
      const msg =
        json?.error ?? json?.result ?? `Payment declined (${res.status})`;
      throw new Error(String(msg));
    }
    const { error: updErr } = await supabaseAdmin
      .from("special_event_permits")
      .update({
        status: "paid",
        payment_ref: json?.refnum ? String(json.refnum) : null,
        paid_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, amount, transaction_ref: json?.refnum ?? null };
  });

// ─── Delete my draft ────────────────────────────────────────────────
export const deleteMyDraftPermit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("special_event_permits")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
