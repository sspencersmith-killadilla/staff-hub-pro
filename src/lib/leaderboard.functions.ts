import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isCivicQuestsEnabled(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("platform_modules")
      .select("enabled")
      .eq("key", "civic_quests")
      .maybeSingle();
    if (!data) return true;
    return !!data.enabled;
  } catch {
    return true;
  }
}

// Stub kept for backward compat.
export const getTopPoints = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z.object({ limit: z.number().int().min(1).max(100).default(20) }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, points")
      .order("points", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return {
      entries: (rows ?? []).map((r: any) => ({
        user_id: r.id as string,
        display_name: (r.full_name as string | null) ?? "Player",
        points: (r.points as number | undefined) ?? 0,
      })),
    };
  });

export type LeaderboardRow = {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  points: number;
};

// Public leaderboard — top N residents by quest points.
export const getLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z.object({ limit: z.number().int().min(1).max(100).default(100) }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    if (!(await isCivicQuestsEnabled())) {
      return { rows: [] as LeaderboardRow[], disabled: true as const, total_players: 0 };
    }
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, avatar_url, points")
      .gt("points", 0)
      .order("points", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const out: LeaderboardRow[] = (rows ?? []).map((r: any, i: number) => {
      const name = (r.full_name as string | null) ?? "Explorer";
      return {
        rank: i + 1,
        user_id: r.id as string,
        display_name: name,
        avatar_url: (r.avatar_url as string | null) ?? null,
        points: (r.points as number | undefined) ?? 0,
      };
    });

    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gt("points", 0);

    return { rows: out, disabled: false as const, total_players: count ?? out.length };
  });

// Signed-in user's own rank ("count of players with more points + 1").
export const getMyLeaderboardRank = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isCivicQuestsEnabled())) {
      return { points: 0, rank: null as number | null, disabled: true as const };
    }
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("points")
      .eq("id", context.userId)
      .maybeSingle();
    const points = (me?.points as number | undefined) ?? 0;
    if (points <= 0) return { points: 0, rank: null, disabled: false as const };

    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gt("points", points);

    return { points, rank: (count ?? 0) + 1, disabled: false as const };
  });
