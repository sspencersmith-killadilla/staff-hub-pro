import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { nanoid } from "nanoid";

// ─── Types exported to UI ─────────────────────────────────────────────
export type CompletionType = "qr_scan" | "geo_location" | "honor_system_button";

export type PublicWaypoint = {
  id: string;
  quest_id: string;
  title: string;
  description: string | null;
  completion_type: CompletionType;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  sort_order: number;
  image_url: string | null;
  image_alt: string | null;
};


export type PublicQuest = {
  id: string;
  title: string;
  description: string | null;
  badge_image_url: string | null;
  points_reward: number;
  department_id: string | null;
  waypoint_count: number;
};

export type AdminWaypoint = PublicWaypoint & { secret_code: string | null };
export type AdminQuest = PublicQuest & {
  is_active: boolean;
  waypoints: AdminWaypoint[];
};

// ─── Admin guard ──────────────────────────────────────────────────────
async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

async function assertStaffWithQuestReports(userId: string) {
  const { data: adminRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (adminRow) return;
  const { data: perm } = await supabaseAdmin
    .from("staff_permissions")
    .select("permission")
    .eq("user_id", userId)
    .eq("permission", "page.quests_report")
    .maybeSingle();
  if (!perm) throw new Error("Forbidden: missing page.quests_report");
}

// ─── Module enabled check ─────────────────────────────────────────────
async function isCivicQuestsEnabled(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("platform_modules")
      .select("enabled")
      .eq("key", "civic_quests")
      .maybeSingle();
    if (!data) return true; // default-on when row missing
    return !!data.enabled;
  } catch {
    return true; // fail-open if table missing
  }
}

async function assertCivicQuestsEnabled() {
  if (!(await isCivicQuestsEnabled())) {
    throw new Error("Civic Quests module is disabled");
  }
}

export const getCivicQuestsModuleStatus = createServerFn({ method: "GET" }).handler(
  async () => ({ enabled: await isCivicQuestsEnabled() }),
);

// ─── Public: list active quests ───────────────────────────────────────
export const listPublicQuests = createServerFn({ method: "GET" }).handler(
  async () => {
    if (!(await isCivicQuestsEnabled())) return { quests: [], disabled: true as const };
    const { data, error } = await supabaseAdmin
      .from("quests")
      .select(
        "id, title, description, badge_image_url, points_reward, department_id, quest_waypoints(id)",
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const quests: PublicQuest[] = (data ?? []).map((q: any) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      badge_image_url: q.badge_image_url,
      points_reward: q.points_reward,
      department_id: q.department_id,
      waypoint_count: (q.quest_waypoints ?? []).length,
    }));
    return { quests, disabled: false as const };
  },
);

// ─── Public: one quest with waypoints (no secrets) ────────────────────
export const getPublicQuest = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await assertCivicQuestsEnabled();
    const { data: q, error } = await supabaseAdmin
      .from("quests")
      .select(
        "id, title, description, badge_image_url, points_reward, department_id, is_active",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!q || !q.is_active) throw new Error("Quest not found");
    const { data: wps, error: wpErr } = await supabaseAdmin
      .from("quest_waypoints")
      .select(
        "id, quest_id, title, description, completion_type, lat, lng, radius_m, sort_order, image_url, image_alt",
      )
      .eq("quest_id", data.id)
      .order("sort_order", { ascending: true });
    if (wpErr) throw new Error(wpErr.message);


    // Lightweight public stats (completions + in-progress count).
    const { data: prog } = await supabaseAdmin
      .from("user_quest_progress")
      .select("is_completed")
      .eq("quest_id", data.id);
    const completion_count = (prog ?? []).filter((r: any) => r.is_completed).length;
    const in_progress_count = (prog ?? []).length - completion_count;

    return {
      quest: {
        id: q.id,
        title: q.title,
        description: q.description,
        badge_image_url: q.badge_image_url,
        points_reward: q.points_reward,
        department_id: q.department_id,
      } as PublicQuest & { description: string | null },
      waypoints: (wps ?? []) as PublicWaypoint[],
      stats: { completion_count, in_progress_count },
    };
  });

// ─── User: my progress for one quest ─────────────────────────────────
export const getMyQuestProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ questId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("user_quest_progress")
      .select("completed_waypoints, is_completed, completed_at")
      .eq("user_id", context.userId)
      .eq("quest_id", data.questId)
      .maybeSingle();
    return {
      completed: (row?.completed_waypoints as string[] | undefined) ?? [],
      is_completed: !!row?.is_completed,
      completed_at: row?.completed_at ?? null,
    };
  });

// ─── User: list all my earned quests (for hub) ───────────────────────
export const listMyEarnedQuests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isCivicQuestsEnabled())) {
      return { points: 0, entries: [], disabled: true as const };
    }
    const { data, error } = await supabaseAdmin
      .from("user_quest_progress")
      .select(
        "quest_id, is_completed, completed_at, completed_waypoints, quests(id, title, badge_image_url, points_reward)",
      )
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("points")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      points: (profile?.points as number | undefined) ?? 0,
      disabled: false as const,
      entries: (data ?? []).map((r: any) => ({
        quest_id: r.quest_id,
        is_completed: !!r.is_completed,
        completed_at: r.completed_at,
        completed_waypoints: (r.completed_waypoints as string[]) ?? [],
        title: r.quests?.title ?? "Quest",
        badge_image_url: r.quests?.badge_image_url ?? null,
        points_reward: r.quests?.points_reward ?? 0,
      })),
    };
  });

// ─── Shared completion logic ─────────────────────────────────────────
async function recordCompletion(
  userId: string,
  questId: string,
  waypointId: string,
) {
  // Total waypoints in this quest
  const { data: allWps, error: allErr } = await supabaseAdmin
    .from("quest_waypoints")
    .select("id")
    .eq("quest_id", questId);
  if (allErr) throw new Error(allErr.message);
  const totalIds = (allWps ?? []).map((r: any) => r.id as string);
  if (!totalIds.includes(waypointId)) {
    throw new Error("Waypoint does not belong to this quest");
  }

  // Existing progress
  const { data: existing } = await supabaseAdmin
    .from("user_quest_progress")
    .select("id, completed_waypoints, is_completed")
    .eq("user_id", userId)
    .eq("quest_id", questId)
    .maybeSingle();

  const prev: string[] =
    (existing?.completed_waypoints as string[] | undefined) ?? [];
  if (prev.includes(waypointId)) {
    return {
      already: true as const,
      is_completed: !!existing?.is_completed,
      completed: prev,
    };
  }

  const next = [...prev, waypointId];
  const justCompleted = totalIds.every((id) => next.includes(id));
  const wasCompleted = !!existing?.is_completed;
  const becomes = !wasCompleted && justCompleted;

  if (existing) {
    const { error } = await supabaseAdmin
      .from("user_quest_progress")
      .update({
        completed_waypoints: next,
        is_completed: justCompleted,
        completed_at: justCompleted
          ? (existing as any).completed_at ?? new Date().toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing as any).id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin.from("user_quest_progress").insert({
      user_id: userId,
      quest_id: questId,
      completed_waypoints: next,
      is_completed: justCompleted,
      completed_at: justCompleted ? new Date().toISOString() : null,
    });
    if (error) throw new Error(error.message);
  }

  // Award points only on the transition to completed.
  if (becomes) {
    const { data: quest } = await supabaseAdmin
      .from("quests")
      .select("points_reward")
      .eq("id", questId)
      .maybeSingle();
    const reward = (quest?.points_reward as number | undefined) ?? 0;
    if (reward > 0) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("points")
        .eq("id", userId)
        .maybeSingle();
      const current = (profile?.points as number | undefined) ?? 0;
      await supabaseAdmin
        .from("profiles")
        .update({ points: current + reward })
        .eq("id", userId);
    }
  }

  // Mint prize ticket + grant raffle entries on the transition to completed.
  let ticket_id: string | null = null;
  let raffle_entries_granted = 0;
  if (becomes) {
    try {
      const { data: tid } = await supabaseAdmin.rpc("mint_quest_prize_ticket", {
        _user_id: userId,
        _quest_id: questId,
      });
      ticket_id = (tid as string | null) ?? null;
    } catch (e) {
      console.error("[quests] mint_quest_prize_ticket failed", e);
    }
    try {
      const { data: granted } = await supabaseAdmin.rpc(
        "grant_raffle_entries_for_quest",
        { _user_id: userId, _quest_id: questId },
      );
      raffle_entries_granted = (granted as number | null) ?? 0;
    } catch (e) {
      console.error("[quests] grant_raffle_entries_for_quest failed", e);
    }
  }

  return {
    already: false as const,
    is_completed: justCompleted,
    completed: next,
    just_completed_quest: becomes,
    ticket_id,
    raffle_entries_granted,
  };
}


function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ─── User: complete waypoint ─────────────────────────────────────────
export const completeWaypoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        questId: z.string().uuid(),
        // Provide one of these depending on completion_type:
        raw: z.string().max(400).optional(), // qr_scan
        waypointId: z.string().uuid().optional(), // honor + geo
        coords: z
          .object({ lat: z.number(), lng: z.number() })
          .optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCivicQuestsEnabled();
    let waypointId = data.waypointId ?? null;
    let secret: string | null = null;

    if (data.raw) {
      // Expected exactly: quest_{waypoint_id}_{secret_code}
      const m = data.raw.trim().match(/^quest_([0-9a-f-]{36})_(.+)$/i);
      if (!m) throw new Error("Invalid quest QR code");
      waypointId = m[1];
      secret = m[2];
    }

    if (!waypointId) throw new Error("Missing waypoint");

    const { data: wp, error } = await supabaseAdmin
      .from("quest_waypoints")
      .select(
        "id, quest_id, completion_type, secret_code, lat, lng, radius_m",
      )
      .eq("id", waypointId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!wp) throw new Error("Waypoint not found");
    if (wp.quest_id !== data.questId) throw new Error("Waypoint/quest mismatch");

    if (wp.completion_type === "qr_scan") {
      if (!secret || secret !== wp.secret_code) {
        throw new Error("QR code did not match this waypoint");
      }
    } else if (wp.completion_type === "geo_location") {
      if (!data.coords) throw new Error("Location required");
      if (wp.lat == null || wp.lng == null) {
        throw new Error("Waypoint has no location set");
      }
      const dist = haversineMeters(data.coords, {
        lat: Number(wp.lat),
        lng: Number(wp.lng),
      });
      const radius = wp.radius_m ?? 50;
      if (dist > radius) {
        throw new Error(
          `You're ${Math.round(dist)}m away — get within ${radius}m to check in.`,
        );
      }
    }
    // honor_system_button: just accept.

    return recordCompletion(context.userId, data.questId, wp.id);
  });

// ─── Admin: list all quests w/ waypoints ─────────────────────────────
export const adminListQuests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("quests")
      .select(
        "id, title, description, badge_image_url, is_active, points_reward, department_id, created_at, quest_waypoints(id, quest_id, title, description, completion_type, secret_code, lat, lng, radius_m, sort_order)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const quests: AdminQuest[] = (data ?? []).map((q: any) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      badge_image_url: q.badge_image_url,
      is_active: q.is_active,
      points_reward: q.points_reward,
      department_id: q.department_id,
      waypoint_count: (q.quest_waypoints ?? []).length,
      waypoints: ((q.quest_waypoints ?? []) as AdminWaypoint[]).sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    }));
    return { quests };
  });

const waypointInput = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  completion_type: z.enum(["qr_scan", "geo_location", "honor_system_button"]),
  secret_code: z.string().min(1).max(128).nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  radius_m: z.number().int().min(5).max(5000).nullable().optional(),
  sort_order: z.number().int().min(0).max(1000),
});

// ─── Admin: upsert quest (with waypoints) ────────────────────────────
export const adminSaveQuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        title: z.string().min(1).max(200),
        description: z.string().max(4000).nullable().optional(),
        badge_image_url: z.string().max(1000).nullable().optional(),
        is_active: z.boolean(),
        points_reward: z.number().int().min(0).max(10_000),
        department_id: z.string().uuid().nullable().optional(),
        waypoints: z.array(waypointInput).max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    let questId = data.id ?? null;
    const payload = {
      title: data.title,
      description: data.description ?? null,
      badge_image_url: data.badge_image_url ?? null,
      is_active: data.is_active,
      points_reward: data.points_reward,
      department_id: data.department_id ?? null,
      updated_at: new Date().toISOString(),
    };

    if (questId) {
      const { error } = await supabaseAdmin
        .from("quests")
        .update(payload)
        .eq("id", questId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("quests")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      questId = ins.id;
    }

    // Replace waypoints (delete-then-insert keeps the editor simple).
    await supabaseAdmin.from("quest_waypoints").delete().eq("quest_id", questId);
    const inserts = data.waypoints.map((w) => ({
      id: w.id ?? crypto.randomUUID(),
      quest_id: questId!,
      title: w.title,
      description: w.description ?? null,
      completion_type: w.completion_type,
      secret_code:
        w.completion_type === "qr_scan" ? (w.secret_code ?? nanoid(10)) : null,
      lat: w.lat ?? null,
      lng: w.lng ?? null,
      radius_m: w.radius_m ?? null,
      sort_order: w.sort_order,
    }));
    if (inserts.length) {
      const { error } = await supabaseAdmin
        .from("quest_waypoints")
        .insert(inserts);
      if (error) throw new Error(error.message);
    }

    return { id: questId };
  });

// ─── Admin: delete quest ─────────────────────────────────────────────
export const adminDeleteQuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("quests")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Staff: per-quest reporting stats ─────────────────────────────────
export type QuestStatsRow = {
  id: string;
  title: string;
  is_active: boolean;
  points_reward: number;
  waypoint_count: number;
  participants: number;
  completions: number;
  completion_rate: number; // 0..1
  avg_waypoints_done: number;
  last_completion_at: string | null;
};

export const staffListQuestStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaffWithQuestReports(context.userId);
    if (!(await isCivicQuestsEnabled())) {
      return { rows: [] as QuestStatsRow[], disabled: true as const, totals: null };
    }
    const { data: quests, error } = await supabaseAdmin
      .from("quests")
      .select("id, title, is_active, points_reward, quest_waypoints(id)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: progress } = await supabaseAdmin
      .from("user_quest_progress")
      .select("quest_id, is_completed, completed_at, completed_waypoints");

    const byQuest = new Map<string, { participants: number; completions: number; doneSum: number; last: string | null }>();
    for (const row of (progress ?? []) as any[]) {
      const bucket = byQuest.get(row.quest_id) ?? { participants: 0, completions: 0, doneSum: 0, last: null };
      bucket.participants += 1;
      if (row.is_completed) {
        bucket.completions += 1;
        if (row.completed_at && (!bucket.last || row.completed_at > bucket.last)) {
          bucket.last = row.completed_at;
        }
      }
      bucket.doneSum += Array.isArray(row.completed_waypoints) ? row.completed_waypoints.length : 0;
      byQuest.set(row.quest_id, bucket);
    }

    const rows: QuestStatsRow[] = (quests ?? []).map((q: any) => {
      const b = byQuest.get(q.id) ?? { participants: 0, completions: 0, doneSum: 0, last: null };
      return {
        id: q.id,
        title: q.title,
        is_active: q.is_active,
        points_reward: q.points_reward,
        waypoint_count: (q.quest_waypoints ?? []).length,
        participants: b.participants,
        completions: b.completions,
        completion_rate: b.participants ? b.completions / b.participants : 0,
        avg_waypoints_done: b.participants ? b.doneSum / b.participants : 0,
        last_completion_at: b.last,
      };
    });

    const totals = {
      active_quests: rows.filter((r) => r.is_active).length,
      total_quests: rows.length,
      total_participants: rows.reduce((a, r) => a + r.participants, 0),
      total_completions: rows.reduce((a, r) => a + r.completions, 0),
      total_points_awarded: rows.reduce((a, r) => a + r.completions * r.points_reward, 0),
    };

    return { rows, disabled: false as const, totals };
  });

// ─── Staff: per-waypoint funnel for one quest ────────────────────────
export const staffGetQuestFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ questId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaffWithQuestReports(context.userId);
    await assertCivicQuestsEnabled();

    const { data: quest } = await supabaseAdmin
      .from("quests")
      .select("id, title")
      .eq("id", data.questId)
      .maybeSingle();
    if (!quest) throw new Error("Quest not found");

    const { data: wps } = await supabaseAdmin
      .from("quest_waypoints")
      .select("id, title, sort_order")
      .eq("quest_id", data.questId)
      .order("sort_order", { ascending: true });

    const { data: progress } = await supabaseAdmin
      .from("user_quest_progress")
      .select("completed_waypoints")
      .eq("quest_id", data.questId);

    const reach = new Map<string, number>();
    for (const row of (progress ?? []) as any[]) {
      for (const wid of (row.completed_waypoints as string[]) ?? []) {
        reach.set(wid, (reach.get(wid) ?? 0) + 1);
      }
    }

    const total_starts = (progress ?? []).length;
    const waypoints = (wps ?? []).map((w: any) => ({
      id: w.id,
      title: w.title,
      sort_order: w.sort_order,
      users_reached: reach.get(w.id) ?? 0,
    }));

    return { quest: { id: quest.id, title: quest.title }, total_starts, waypoints };
  });

// ─── Staff: CSV export of quest activity ─────────────────────────────
function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const staffExportQuestActivityCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ questId: z.string().uuid().optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaffWithQuestReports(context.userId);
    await assertCivicQuestsEnabled();

    let query = supabaseAdmin
      .from("user_quest_progress")
      .select(
        "user_id, quest_id, is_completed, completed_at, completed_waypoints, updated_at, quests(title)",
      );
    if (data.questId) query = query.eq("quest_id", data.questId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const header = [
      "user_id",
      "quest_id",
      "quest_title",
      "is_completed",
      "completed_at",
      "updated_at",
      "waypoints_done",
    ];
    const lines = [header.join(",")];
    for (const r of (rows ?? []) as any[]) {
      lines.push(
        [
          csvCell(r.user_id),
          csvCell(r.quest_id),
          csvCell(r.quests?.title ?? ""),
          csvCell(r.is_completed ? "true" : "false"),
          csvCell(r.completed_at),
          csvCell(r.updated_at),
          csvCell(
            Array.isArray(r.completed_waypoints) ? r.completed_waypoints.length : 0,
          ),
        ].join(","),
      );
    }
    return { csv: lines.join("\n"), count: rows?.length ?? 0 };
  });

