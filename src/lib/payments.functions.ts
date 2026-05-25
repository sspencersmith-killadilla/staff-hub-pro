import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * USAePay payment integration.
 *
 * Required env vars (configured later by the operator):
 *   USAEPAY_API_KEY  – merchant API key
 *   USAEPAY_API_PIN  – API PIN
 *   USAEPAY_MODE     – "sandbox" (default) or "live"
 *
 * Auth scheme (per USAePay REST docs):
 *   seed  = random hex string
 *   hash  = sha256(API_KEY + seed + API_PIN)
 *   header: Authorization: Basic base64("API_KEY:HASH:SEED")
 */

type UsaepayConfig = {
  apiKey: string;
  apiPin: string;
  mode: "sandbox" | "live";
  baseUrl: string;
};

function loadUsaepayConfig(): UsaepayConfig | null {
  const apiKey = process.env.USAEPAY_API_KEY;
  const apiPin = process.env.USAEPAY_API_PIN;
  if (!apiKey || !apiPin) return null;
  const mode = (process.env.USAEPAY_MODE === "live" ? "live" : "sandbox") as
    | "sandbox"
    | "live";
  const baseUrl =
    mode === "live"
      ? "https://secure.usaepay.com/api/v2"
      : "https://sandbox.usaepay.com/api/v2";
  return { apiKey, apiPin, mode, baseUrl };
}

function buildAuthHeader(cfg: UsaepayConfig): string {
  const seed = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(cfg.apiKey + seed + cfg.apiPin)
    .digest("hex");
  const token = Buffer.from(`${cfg.apiKey}:${hash}:${seed}`).toString("base64");
  return `Basic ${token}`;
}

/** Tells the client whether USAePay creds are configured (no secrets exposed). */
export const getPaymentsStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const cfg = loadUsaepayConfig();
    return {
      provider: "usaepay" as const,
      configured: !!cfg,
      mode: cfg?.mode ?? null,
    };
  },
);

const payInput = z.object({
  session_id: z.string().uuid(),
  ticket_tier_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255),
  quantity: z.number().int().min(1).max(20).default(1),
  // Card data — PCI scope applies. Swap to USAePay PaymentSDK tokens later.
  card: z.object({
    number: z.string().trim().min(12).max(25),
    expiration: z
      .string()
      .trim()
      .regex(/^\d{2}\/?\d{2}$/u, "Expiration must be MM/YY or MMYY"),
    cvc: z.string().trim().regex(/^\d{3,4}$/u),
    avs_zip: z.string().trim().min(3).max(10).optional(),
  }),
});

export const payAndRegisterForCityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => payInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // 1. Validate tier & price.
    const { data: tier, error: tierErr } = await supabaseAdmin
      .from("ticket_tiers")
      .select("id, session_id, name, price")
      .eq("id", data.ticket_tier_id)
      .maybeSingle();
    if (tierErr) throw new Error(tierErr.message);
    if (!tier || tier.session_id !== data.session_id) {
      throw new Error("Invalid ticket tier for this event");
    }
    const unitPrice = Number(tier.price ?? 0);
    if (!(unitPrice > 0)) {
      throw new Error("This tier is free — use the free registration flow.");
    }
    const quantity = data.quantity ?? 1;
    const amount = +(unitPrice * quantity).toFixed(2);
    const amountCents = Math.round(amount * 100);

    // 2. Reject duplicate registrations early.
    const { data: existing } = await supabaseAdmin
      .from("attendees")
      .select("id")
      .eq("user_id", userId)
      .eq("session_id", data.session_id)
      .maybeSingle();
    if (existing) {
      return {
        id: existing.id,
        already_registered: true as const,
        payment_status: "skipped" as const,
      };
    }

    // 3. Load provider config.
    const cfg = loadUsaepayConfig();
    if (!cfg) {
      throw new Error(
        "Payments are not yet configured. The site operator needs to add USAEPAY_API_KEY and USAEPAY_API_PIN before tickets can be sold.",
      );
    }

    // 4. Normalise expiration to MMYY for USAePay.
    const expRaw = data.card.expiration.replace(/\D/g, "");
    if (expRaw.length !== 4) throw new Error("Invalid card expiration");
    const expiration = expRaw; // MMYY

    // 5. Call USAePay.
    const paymentRow: Record<string, unknown> = {
      session_id: data.session_id,
      user_id: userId,
      provider: "usaepay",
      mode: cfg.mode,
      amount_cents: amountCents,
      currency: "USD",
      status: "pending",
    };
    const { data: pendingPay } = await supabaseAdmin
      .from("ticket_payments")
      .insert(paymentRow)
      .select("id")
      .single();
    const paymentId = pendingPay?.id ?? null;

    let providerJson: any = null;
    try {
      const res = await fetch(`${cfg.baseUrl}/transactions`, {
        method: "POST",
        headers: {
          Authorization: buildAuthHeader(cfg),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          command: "sale",
          amount: amount.toFixed(2),
          invoice: `evt-${data.session_id.slice(0, 8)}`,
          description: `Ticket: ${tier.name} x${quantity}`,
          creditcard: {
            number: data.card.number.replace(/\s+/g, ""),
            expiration,
            cvc: data.card.cvc,
            cardholder: data.full_name,
            avs_zip: data.card.avs_zip ?? undefined,
          },
          billing_address: { email: data.email },
        }),
      });
      providerJson = await res.json().catch(() => ({}));

      const approved =
        providerJson?.result_code === "A" || providerJson?.result === "Approved";

      if (!res.ok || !approved) {
        const msg =
          providerJson?.error ??
          providerJson?.result ??
          `Payment declined (${res.status})`;
        if (paymentId) {
          await supabaseAdmin
            .from("ticket_payments")
            .update({
              status: res.ok ? "declined" : "error",
              result_code: providerJson?.result_code ?? null,
              error_message: String(msg).slice(0, 500),
              raw_response: providerJson,
            })
            .eq("id", paymentId);
        }
        throw new Error(String(msg));
      }

      // 6. Create attendee row.
      const { data: row, error: insErr } = await supabaseAdmin
        .from("attendees")
        .insert({
          user_id: userId,
          session_id: data.session_id,
          full_name: data.full_name,
          email: data.email,
          ticket_tier_id: data.ticket_tier_id,
          quantity,
          checked_in: false,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);

      if (paymentId) {
        await supabaseAdmin
          .from("ticket_payments")
          .update({
            attendee_id: row.id,
            status: "approved",
            transaction_ref: providerJson?.refnum ?? null,
            auth_code: providerJson?.authcode ?? null,
            result_code: providerJson?.result_code ?? "A",
            raw_response: providerJson,
          })
          .eq("id", paymentId);
      }

      return {
        id: row.id,
        already_registered: false as const,
        payment_status: "approved" as const,
        transaction_ref: providerJson?.refnum ?? null,
        amount,
      };
    } catch (err: any) {
      if (paymentId) {
        await supabaseAdmin
          .from("ticket_payments")
          .update({
            status: "error",
            error_message: String(err?.message ?? err).slice(0, 500),
            raw_response: providerJson,
          })
          .eq("id", paymentId);
      }
      throw err;
    }
  });
