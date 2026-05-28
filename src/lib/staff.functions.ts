import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Hard-coded super admin — cannot be demoted or deleted by other admins.
async function isSuperAdmin(userId: string): Promise<boolean> {
  const configured = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!configured) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email?.toLowerCase() === configured;
}

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: meRole } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!meRole) throw new Error("Forbidden: admin role required");

    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const userMap = new Map(users.users.map((u) => [u.id, u]));

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    return ids.map((id) => {
      const u = userMap.get(id);
      const p: any = profMap.get(id) ?? {};
      const userRoles = (roles ?? [])
        .filter((r) => r.user_id === id)
        .map((r) => r.role as "admin" | "staff");
      return {
        userId: id,
        email: u?.email ?? "(unknown)",
        full_name: (p.full_name as string | null) ?? null,
        phone: (p.phone as string | null) ?? null,
        roles: userRoles,
        createdAt: u?.created_at,
      };
    });
  });

export const promoteExistingUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().email(),
      role: z.enum(["admin", "staff"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: meRole } = await context.supabase
      .from("user_roles").select("role")
      .eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!meRole) throw new Error("Forbidden: admin role required");

    const target = data.email.trim().toLowerCase();
    // Find existing user by email
    const { data: list, error: listErr } =
      await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw new Error(listErr.message);
    const user = list.users.find((u) => u.email?.toLowerCase() === target);
    if (!user) {
      throw new Error(
        "No existing account found for that email. Use Invite to send them a signup link.",
      );
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: user.id, role: data.role },
        { onConflict: "user_id,role" },
      );
    if (roleErr) throw new Error(roleErr.message);
    return { ok: true, userId: user.id, email: user.email };
  });

export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().email(),
      role: z.enum(["admin", "staff"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: meRole } = await context.supabase
      .from("user_roles").select("role")
      .eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!meRole) throw new Error("Forbidden: admin role required");

    const { data: invited, error } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
    if (error) throw new Error(error.message);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: invited.user!.id, role: data.role });
    if (roleErr) throw new Error(roleErr.message);
    return { ok: true };
  });

export const bulkInviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      emails: z.array(z.string().email()).min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: meRole } = await context.supabase
      .from("user_roles").select("role")
      .eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!meRole) throw new Error("Forbidden: admin role required");

    const seen = new Set<string>();
    const emails = data.emails
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && !seen.has(e) && (seen.add(e), true));

    const results: { email: string; status: "invited" | "exists" | "error"; message?: string }[] = [];

    for (const email of emails) {
      try {
        let userId: string | undefined;
        const { data: invited, error } =
          await supabaseAdmin.auth.admin.inviteUserByEmail(email);
        if (error) {
          // If already registered, look up the existing user and still grant the role.
          const msg = error.message.toLowerCase();
          if (msg.includes("already") || msg.includes("registered") || msg.includes("exist")) {
            const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
            const existing = list.users.find((u) => u.email?.toLowerCase() === email);
            if (!existing) {
              results.push({ email, status: "error", message: error.message });
              continue;
            }
            userId = existing.id;
            results.push({ email, status: "exists" });
          } else {
            results.push({ email, status: "error", message: error.message });
            continue;
          }
        } else {
          userId = invited.user!.id;
          results.push({ email, status: "invited" });
        }

        if (userId) {
          await supabaseAdmin
            .from("user_roles")
            .upsert({ user_id: userId, role: "staff" }, { onConflict: "user_id,role" });
        }
      } catch (e) {
        results.push({ email, status: "error", message: (e as Error).message });
      }
    }

    return {
      ok: true,
      total: emails.length,
      invited: results.filter((r) => r.status === "invited").length,
      existed: results.filter((r) => r.status === "exists").length,
      errors: results.filter((r) => r.status === "error"),
    };
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["admin", "staff"]),
      enabled: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: meRole } = await context.supabase
      .from("user_roles").select("role")
      .eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!meRole) throw new Error("Forbidden: admin role required");

    // Protect the super admin: nobody else can change their roles.
    if (
      data.userId !== context.userId &&
      (await isSuperAdmin(data.userId))
    ) {
      throw new Error("This account is protected and cannot be modified.");
    }

    if (data.enabled) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role });
    } else {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
    }
    return { ok: true };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: meRole } = await context.supabase
      .from("user_roles").select("role")
      .eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!meRole) throw new Error("Forbidden: admin role required");

    if (data.userId === context.userId)
      throw new Error("You cannot delete yourself");
    if (await isSuperAdmin(data.userId))
      throw new Error("This account is protected and cannot be deleted.");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
