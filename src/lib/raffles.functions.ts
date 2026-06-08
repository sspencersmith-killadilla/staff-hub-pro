// Raffles: admin CRUD, user entry counts, draw winners.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Raffle = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  prize_id: string | null;
  prize_name: string | null;
  draw_date: string | null;
  winners_count: number;
  status: "open" | "drawn" | "closed";
  linked_quest_ids: string[];
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

export const adminListRaffles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("raffles")
      .select(
        "id, title, description, image_url, prize_id, draw_date, winners_count, status, prizes(name), raffle_quests(quest_id)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const raffles: Raffle[] = (data ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      image_url: r.image_url,
      prize_id: r.prize_id,
      prize_name: r.prizes?.name ?? null,
      draw_date: r.draw_date,
      winners_count: r.winners_count,
      status: r.status,
      linked_quest_ids: (r.raffle_quests ?? []).map(
        (q: any) => q.quest_id as string,
      ),
    }));
    return { raffles };
  });

const raffleInput = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  image_url: z.string().max(1000).nullable().optional(),
  prize_id: z.string().uuid().nullable().optional(),
  draw_date: z.string().nullable().optional(),
  winners_count: z.number().int().min(1).max(1000),
  status: z.enum(["open", "drawn", "closed"]),
  quest_links: z.array(
    z.object({
      quest_id: z.string().uuid(),
      entries_per_completion: z.number().int().min(1).max(100),
    }),
  ),
});

export const adminSaveRaffle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => raffleInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const payload = {
      title: data.title,
      description: data.description ?? null,
      image_url: data.image_url ?? null,
      prize_id: data.prize_id ?? null,
      draw_date: data.draw_date ?? null,
      winners_count: data.winners_count,
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    let raffleId = data.id ?? null;
    if (raffleId) {
      const { error } = await supabaseAdmin
        .from("raffles")
        .update(payload)
        .eq("id", raffleId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("raffles")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      raffleId = ins.id as string;
    }

    await supabaseAdmin
      .from("raffle_quests")
      .delete()
      .eq("raffle_id", raffleId);
    if (data.quest_links.length) {
      const rows = data.quest_links.map((l) => ({
        raffle_id: raffleId!,
        quest_id: l.quest_id,
        entries_per_completion: l.entries_per_completion,
      }));
      const { error } = await supabaseAdmin
        .from("raffle_quests")
        .insert(rows);
      if (error) throw new Error(error.message);
    }
    return { id: raffleId };
  });

export const adminDeleteRaffle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("raffles")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDrawRaffle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ raffleId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: result, error } = await supabaseAdmin.rpc(
      "draw_raffle_winners",
      { _raffle_id: data.raffleId },
    );
    if (error) throw new Error(error.message);
    return { drawn: (result as number | null) ?? 0 };
  });

// ─── Citizen: my raffle entries + winners ─────────────────────────────
export type MyRaffleSummary = {
  raffle_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  draw_date: string | null;
  status: "open" | "drawn" | "closed";
  prize_name: string | null;
  my_entries: number;
  is_winner: boolean;
};

export const listMyRaffles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: raffles, error } = await supabaseAdmin
      .from("raffles")
      .select(
        "id, title, description, image_url, prize_id, draw_date, status, prizes(name)",
      )
      .in("status", ["open", "drawn"])
      .order("draw_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);

    const { data: entries } = await supabaseAdmin
      .from("raffle_entries")
      .select("raffle_id")
      .eq("user_id", context.userId);

    const { data: wins } = await supabaseAdmin
      .from("raffle_winners")
      .select("raffle_id")
      .eq("user_id", context.userId);

    const entryCounts = new Map<string, number>();
    for (const e of (entries ?? []) as any[]) {
      entryCounts.set(e.raffle_id, (entryCounts.get(e.raffle_id) ?? 0) + 1);
    }
    const winSet = new Set(((wins ?? []) as any[]).map((w) => w.raffle_id));

    const rows: MyRaffleSummary[] = ((raffles ?? []) as any[])
      .map((r) => ({
        raffle_id: r.id,
        title: r.title,
        description: r.description,
        image_url: r.image_url,
        draw_date: r.draw_date,
        status: r.status,
        prize_name: r.prizes?.name ?? null,
        my_entries: entryCounts.get(r.id) ?? 0,
        is_winner: winSet.has(r.id),
      }))
      .filter((r) => r.my_entries > 0 || r.is_winner);

    return { raffles: rows };
  });
