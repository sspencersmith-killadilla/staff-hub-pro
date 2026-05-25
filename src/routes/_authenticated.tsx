import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyRoles } from "@/lib/auth.functions";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
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
    } catch (e: any) {
      if (e?.isRedirect) throw e;
      throw redirect({ to: "/login" });
    }
  },
  component: () => (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <Outlet />
    </div>
  ),
});
