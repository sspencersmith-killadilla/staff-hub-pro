import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Menu, Shield, Home, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useModules } from "@/hooks/use-modules";
import { usePermissions } from "@/hooks/use-permissions";
import { eventOpsNavItems, ActiveDepartmentBadge } from "./event-ops-nav-items";

export function EventOpsMobileNav() {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { isAdmin } = useAuth();
  const { isEnabled } = useModules();
  const { can } = usePermissions();
  const navigate = useNavigate();

  const isActive = (url: string, exact?: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  const visibleItems = eventOpsNavItems.filter(
    (it) => (!it.module || isEnabled(it.module)) && (!it.permission || can(it.permission)),
  );

  const logout = async () => {
    await supabase.auth.signOut();
    setOpen(false);
    navigate({ to: "/" });
  };

  const activeItem = visibleItems.find((it) => isActive(it.url, it.exact));

  return (
    <div className="md:hidden sticky top-0 z-40 flex items-center justify-between bg-[hsl(210_60%_12%)] text-white px-4 py-3 border-b border-white/10">
      <div className="min-w-0">
        <div className="text-sm font-black italic tracking-tight">EVENT OPS</div>
        <div className="text-[10px] uppercase tracking-widest text-white/60 truncate">
          {activeItem?.title ?? "Menu"}
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="Open staff menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 bg-[hsl(210_60%_12%)] text-white border-white/10">
          <SheetHeader className="px-5 py-5 border-b border-white/10 text-left">
            <SheetTitle className="text-white text-lg font-black italic tracking-tight">EVENT OPS</SheetTitle>
            <ActiveDepartmentBadge />
          </SheetHeader>
          <nav className="flex flex-col py-2 overflow-y-auto max-h-[calc(100dvh-180px)]">
            {visibleItems.map((it) => {
              const active = isActive(it.url, it.exact);
              return (
                <SheetClose asChild key={it.url}>
                  <Link
                    to={it.url}
                    className={`flex items-center gap-3 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                      active ? "bg-[hsl(220_90%_55%)] text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <it.icon className="h-4 w-4" />
                    {it.title}
                  </Link>
                </SheetClose>
              );
            })}
            {isAdmin && (
              <SheetClose asChild>
                <Link
                  to="/staff/admin"
                  className={`flex items-center gap-3 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                    isActive("/staff/admin")
                      ? "bg-[hsl(220_90%_55%)] text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Shield className="h-4 w-4" />
                  Admin
                </Link>
              </SheetClose>
            )}
          </nav>
          <div className="border-t border-white/10 mt-auto">
            <SheetClose asChild>
              <Link to="/" className="flex items-center gap-3 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white/70 hover:bg-white/5 hover:text-white">
                <Home className="h-4 w-4" />
                Back to App
              </Link>
            </SheetClose>
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white/70 hover:bg-white/5 hover:text-white border-t border-white/10"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
