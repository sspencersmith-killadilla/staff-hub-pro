import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    // Skip auth check during SSR — localStorage isn't available, so we'd
    // wrongly redirect to /login on every page refresh. The client will
    // re-run beforeLoad after hydration with the restored session.
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: () => <Outlet />,
});
