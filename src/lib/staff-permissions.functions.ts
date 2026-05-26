import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ALL_PERMISSIONS,
  type PermissionKey,
  type PermissionsSnapshot,
} from "./staff-permissions";

async function isAdmin(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

async function assertAdmin(userId: string) {
  if (!(await isAdmin(userId))) throw new Error("Forbidden: admin role required");
}

export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PermissionsSnapshot> => {
    const { supabase, userId } = context;
    const admin = await isAdmin(userId);

    const [{ data: globalRows }, { data: eventRows }] = await Promise.all([
      supabase.from("staff_permissions").select("permission").eq("user_id", userId),
      supabase
        .from("staff_event_permissions")
        .select("event_id, permission, granted")
        .eq("user_id", userId),
    ]);

    const perEvent: PermissionsSnapshot["perEvent"] = {};
    for (const r of eventRows ?? []) {
      const bucket = (perEvent[r.event_id] ||= { grant: [], revoke: [] });
      if (r.granted) bucket.grant.push(r.permission as PermissionKey);
      else bucket.revoke.push(r.permission as PermissionKey);
    }

    return {
      isAdmin: admin,
      global: (globalRows ?? []).map((r) => r.permission as PermissionKey),
      perEvent,
    };
  });

export const listStaffWithPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));

    const [users, perms, eventPerms] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      supabaseAdmin.from("staff_permissions").select("user_id, permission"),
      supabaseAdmin
        .from("staff_event_permissions")
        .select("user_id, event_id, permission, granted"),
    ]);

    const userMap = new Map(users.data.users.map((u) => [u.id, u]));

    return ids.map((id) => {
      const u = userMap.get(id);
      const userRoles = (roles ?? [])
        .filter((r) => r.user_id === id)
        .map((r) => r.role as "admin" | "staff");
      const global = (perms.data ?? [])
        .filter((p) => p.user_id === id)
        .map((p) => p.permission as PermissionKey);
      const perEvent: Record<
        string,
        { grant: PermissionKey[]; revoke: PermissionKey[] }
      > = {};
      for (const r of eventPerms.data ?? []) {
        if (r.user_id !== id) continue;
        const bucket = (perEvent[r.event_id] ||= { grant: [], revoke: [] });
        if (r.granted) bucket.grant.push(r.permission as PermissionKey);
        else bucket.revoke.push(r.permission as PermissionKey);
      }
      return {
        userId: id,
        email: u?.email ?? "(unknown)",
        roles: userRoles,
        isAdmin: userRoles.includes("admin"),
        global,
        perEvent,
      };
    });
  });

export const setGlobalPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        permissions: z.array(z.string()).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const valid = data.permissions.filter((p) =>
      ALL_PERMISSIONS.includes(p as PermissionKey),
    );

    await supabaseAdmin
      .from("staff_permissions")
      .delete()
      .eq("user_id", data.userId);
    if (valid.length > 0) {
      const { error } = await supabaseAdmin
        .from("staff_permissions")
        .insert(valid.map((p) => ({ user_id: data.userId, permission: p })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setEventPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        eventId: z.string().uuid(),
        grants: z.array(z.string()).max(100),
        revokes: z.array(z.string()).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const grants = data.grants.filter((p) =>
      ALL_PERMISSIONS.includes(p as PermissionKey),
    );
    const revokes = data.revokes.filter((p) =>
      ALL_PERMISSIONS.includes(p as PermissionKey),
    );

    await supabaseAdmin
      .from("staff_event_permissions")
      .delete()
      .eq("user_id", data.userId)
      .eq("event_id", data.eventId);

    const rows = [
      ...grants.map((p) => ({
        user_id: data.userId,
        event_id: data.eventId,
        permission: p,
        granted: true,
      })),
      ...revokes.map((p) => ({
        user_id: data.userId,
        event_id: data.eventId,
        permission: p,
        granted: false,
      })),
    ];
    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from("staff_event_permissions")
        .insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const listEventsForPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("sessions")
      .select("id, title, start_time")
      .order("start_time", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      title: (r.title as string) ?? "(untitled)",
      start_time: r.start_time as string | null,
    }));
  });
