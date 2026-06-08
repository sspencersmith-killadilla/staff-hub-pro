// Prize catalog + ticket wallet + redemption server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Prize = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  fulfilled_by: "city" | "sponsor";
  sponsor_name: string | null;
  pickup_location: string | null;
  total_quantity: number | null;
  remaining_quantity: number | null;
  is_active: boolean;
};

export type PrizeTicket = {
  id: string;
  user_id: string;
  quest_id: string | null;
  prize_id: string;
  source: "quest" | "raffle";
  serial: string;
  qr_token: string;
  status: "issued" | "redeemed" | "void";
  issued_at: string;
  redeemed_at: string | null;
  prize: Prize | null;
  quest_title: string | null;
};

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin only");
}

async function assertStaffOrAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "staff"]);
  if (!data || data.length === 0) throw new Error("Forbidden: staff only");
}

// ─── Admin: list all prizes ──────────────────────────────────────────
export const adminListPrizes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("prizes")
      .select(
        "id, name, description, image_url, fulfilled_by, sponsor_name, pickup_location, total_quantity, remaining_quantity, is_active",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { prizes: (data ?? []) as Prize[] };
  });

const prizeInput = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  image_url: z.string().max(1000).nullable().optional(),
  fulfilled_by: z.enum(["city", "sponsor"]),
  sponsor_name: z.string().max(200).nullable().optional(),
  pickup_location: z.string().max(300).nullable().optional(),
  total_quantity: z.number().int().min(0).max(1_000_000).nullable().optional(),
  remaining_quantity: z.number().int().min(0).max(1_000_000).nullable().optional(),
  is_active: z.boolean(),
});

export const adminSavePrize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => prizeInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload = {
      name: data.name,
      description: data.description ?? null,
      image_url: data.image_url ?? null,
      fulfilled_by: data.fulfilled_by,
      sponsor_name: data.sponsor_name ?? null,
      pickup_location: data.pickup_location ?? null,
      total_quantity: data.total_quantity ?? null,
      remaining_quantity:
        data.remaining_quantity ?? data.total_quantity ?? null,
      is_active: data.is_active,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("prizes")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("prizes")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id as string };
  });

export const adminDeletePrize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("prizes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Admin: set/unset prize reward for a quest ───────────────────────
export const adminSetQuestRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        questId: z.string().uuid(),
        prizeIds: z.array(z.string().uuid()).max(10),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin
      .from("quest_prize_rewards")
      .delete()
      .eq("quest_id", data.questId);
    if (data.prizeIds.length) {
      const rows = data.prizeIds.map((pid) => ({
        quest_id: data.questId,
        prize_id: pid,
      }));
      const { error } = await supabaseAdmin
        .from("quest_prize_rewards")
        .insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminGetQuestRewards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ questId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("quest_prize_rewards")
      .select("prize_id")
      .eq("quest_id", data.questId);
    if (error) throw new Error(error.message);
    return { prizeIds: (rows ?? []).map((r: any) => r.prize_id as string) };
  });

// ─── Citizen: my tickets ─────────────────────────────────────────────
export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("prize_tickets")
      .select(
        "id, user_id, quest_id, prize_id, source, serial, qr_token, status, issued_at, redeemed_at, prizes(id, name, description, image_url, fulfilled_by, sponsor_name, pickup_location, is_active, total_quantity, remaining_quantity), quests(title)",
      )
      .eq("user_id", context.userId)
      .order("issued_at", { ascending: false });
    if (error) throw new Error(error.message);
    const tickets: PrizeTicket[] = (data ?? []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      quest_id: r.quest_id,
      prize_id: r.prize_id,
      source: r.source,
      serial: r.serial,
      qr_token: r.qr_token,
      status: r.status,
      issued_at: r.issued_at,
      redeemed_at: r.redeemed_at,
      prize: r.prizes
        ? {
            id: r.prizes.id,
            name: r.prizes.name,
            description: r.prizes.description,
            image_url: r.prizes.image_url,
            fulfilled_by: r.prizes.fulfilled_by,
            sponsor_name: r.prizes.sponsor_name,
            pickup_location: r.prizes.pickup_location,
            total_quantity: r.prizes.total_quantity,
            remaining_quantity: r.prizes.remaining_quantity,
            is_active: r.prizes.is_active,
          }
        : null,
      quest_title: r.quests?.title ?? null,
    }));
    return { tickets };
  });

// ─── Staff: lookup a ticket by QR token (for the redemption page) ─────
export const staffLookupTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ token: z.string().min(4).max(200) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaffOrAdmin(context.userId);
    // Accept either qr_token or serial.
    const value = data.token.trim();
    const { data: rows, error } = await supabaseAdmin
      .from("prize_tickets")
      .select(
        "id, user_id, status, issued_at, redeemed_at, serial, qr_token, source, prizes(name, image_url, sponsor_name, fulfilled_by, pickup_location), quests(title)",
      )
      .or(`qr_token.eq.${value},serial.eq.${value}`)
      .limit(1);
    if (error) throw new Error(error.message);
    const t = rows?.[0];
    if (!t) throw new Error("Ticket not found");

    // Get citizen profile.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", (t as any).user_id)
      .maybeSingle();

    return {
      id: (t as any).id as string,
      status: (t as any).status as PrizeTicket["status"],
      serial: (t as any).serial as string,
      issued_at: (t as any).issued_at as string,
      redeemed_at: ((t as any).redeemed_at as string | null) ?? null,
      source: (t as any).source as PrizeTicket["source"],
      prize_name: (t as any).prizes?.name ?? "Prize",
      prize_image_url: ((t as any).prizes?.image_url as string | null) ?? null,
      prize_sponsor: ((t as any).prizes?.sponsor_name as string | null) ?? null,
      prize_fulfilled_by:
        ((t as any).prizes?.fulfilled_by as "city" | "sponsor") ?? "city",
      prize_pickup_location:
        ((t as any).prizes?.pickup_location as string | null) ?? null,
      quest_title: ((t as any).quests?.title as string | null) ?? null,
      citizen_name: (profile?.full_name as string | null) ?? null,
      citizen_email: (profile?.email as string | null) ?? null,
    };
  });

export const staffRedeemTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ ticketId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaffOrAdmin(context.userId);
    const { data: existing } = await supabaseAdmin
      .from("prize_tickets")
      .select("status")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (!existing) throw new Error("Ticket not found");
    if ((existing as any).status === "redeemed") {
      throw new Error("Ticket already redeemed");
    }
    if ((existing as any).status === "void") {
      throw new Error("Ticket has been voided");
    }
    const { error } = await supabaseAdmin
      .from("prize_tickets")
      .update({
        status: "redeemed",
        redeemed_at: new Date().toISOString(),
        redeemed_by: context.userId,
      })
      .eq("id", data.ticketId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Image upload (admin only) ───────────────────────────────────────
export const adminUploadQuestMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        filename: z.string().min(1).max(200),
        contentType: z.string().min(1).max(100),
        base64: z.string().min(1).max(20_000_000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
    const path = `waypoints/${Date.now()}-${safe}`;
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const { error } = await supabaseAdmin.storage
      .from("quest-media")
      .upload(path, bytes, {
        contentType: data.contentType,
        upsert: false,
      });
    if (error) throw new Error(error.message);
    const { data: pub } = supabaseAdmin.storage
      .from("quest-media")
      .getPublicUrl(path);
    return { url: pub.publicUrl };
  });

// ─── AI image generation for waypoints (admin only) ──────────────────
export const adminGenerateWaypointImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const prompt = `A clean, vibrant illustration depicting the city landmark or location "${data.title}". ${
      data.description ? `Context: ${data.description}. ` : ""
    }Modern flat illustration style, warm and inviting, no text or typography, centered composition, suitable as a hero image on a waypoint card.`;

    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-image-2",
          prompt,
          size: "1024x1024",
          quality: "low",
          n: 1,
        }),
      },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Image gateway error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `waypoints/ai-${Date.now()}.png`;
    const { error } = await supabaseAdmin.storage
      .from("quest-media")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (error) throw new Error(error.message);
    const { data: pub } = supabaseAdmin.storage
      .from("quest-media")
      .getPublicUrl(path);
    return { url: pub.publicUrl };
  });
