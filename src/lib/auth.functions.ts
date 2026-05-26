import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getSuperAdminEmail(): string | null {
  const v = process.env.SUPER_ADMIN_EMAIL;
  return v && v.trim() ? v.trim().toLowerCase() : null;
}

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    // Self-heal: super admin always has the admin role.
    if (
      typeof claims.email === "string" &&
      claims.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
    ) {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: userId, role: "admin" },
          { onConflict: "user_id,role" },
        );
    }

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return {
      userId,
      email: claims.email,
      roles: (data ?? []).map((r) => r.role as "admin" | "staff"),
    };
  });
