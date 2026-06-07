import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Stub for a future leaderboard UI — not yet rendered anywhere.
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
