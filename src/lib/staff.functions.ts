import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Hard-coded super admin — cannot be demoted or deleted by other admins.
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? "ssmith3@mckinneytexas.org";

async function isSuperAdmin(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
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
    const map = new Map(users.users.map((u) => [u.id, u]));

    return ids.map((id) => {
      const u = map.get(id);
      const userRoles = (roles ?? [])
        .filter((r) => r.user_id === id)
        .map((r) => r.role as "admin" | "staff");
      return {
        userId: id,
        email: u?.email ?? "(unknown)",
        roles: userRoles,
        createdAt: u?.created_at,
      };
    });
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
