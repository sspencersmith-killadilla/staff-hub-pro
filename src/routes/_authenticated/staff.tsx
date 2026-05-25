import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { EventOpsSidebar } from "@/components/event-ops-sidebar";
import { getMyRoles } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated/staff")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    try {
      const me = await getMyRoles();
      const isStaff = me.roles.includes("staff") || me.roles.includes("admin");
      if (!isStaff) throw redirect({ to: "/no-access" });
    } catch (e) {
      if (isRedirect(e)) throw e;
      throw redirect({ to: "/no-access" });
    }
  },
  component: StaffLayout,
});

function StaffLayout() {
  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      <EventOpsSidebar />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
