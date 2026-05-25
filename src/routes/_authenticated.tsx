import { createFileRoute, redirect, Outlet, isRedirect } from "@tanstack/react-router";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const session = await waitForSupabaseSession();
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    try {
      const me = await getMyRoles();
      const isStaff = me.roles.includes("staff") || me.roles.includes("admin");
      if (!isStaff) {
        throw redirect({ to: "/no-access" });
      }
      return { me };
    } catch (e) {
      if (isRedirect(e)) throw e;
      console.error("auth guard error", e);
      throw redirect({ to: "/no-access" });
    }
  },
  component: () => <Outlet />,
});
