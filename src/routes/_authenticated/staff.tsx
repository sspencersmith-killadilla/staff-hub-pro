import { createFileRoute, Outlet } from "@tanstack/react-router";
import { EventOpsSidebar } from "@/components/event-ops-sidebar";

export const Route = createFileRoute("/_authenticated/staff")({
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
