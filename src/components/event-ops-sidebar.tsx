import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Calendar,
  Building2,
  Map,
  Users,
  Store,
  Sparkles,
  Music,
  CalendarDays,
  BedDouble,
  Settings,
  Shield,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const items = [
  { title: "Events", url: "/staff", icon: Calendar, exact: true },
  { title: "Venues & Stages", url: "/staff/venues", icon: Building2 },
  { title: "Map", url: "/staff/map", icon: Map },
  { title: "Attendees", url: "/staff/attendees", icon: Users },
  { title: "Vendors", url: "/staff/vendors", icon: Store },
  { title: "Sponsors", url: "/staff/sponsors", icon: Sparkles },
  { title: "Community Music", url: "/staff/community-music", icon: Music },
  { title: "Community Events", url: "/staff/community-events", icon: CalendarDays },
  { title: "Room Reservations", url: "/staff/room-reservations", icon: BedDouble },
  { title: "Platform Settings", url: "/staff/settings", icon: Settings },
] as const;

export function EventOpsSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const isActive = (url: string, exact?: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-[hsl(210_60%_12%)] text-white">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-lg font-black italic tracking-tight">EVENT OPS</div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {items.map((it) => {
          const active = isActive(it.url, "exact" in it ? it.exact : false);
          return (
            <Link
              key={it.url}
              to={it.url}
              className={`flex items-center gap-3 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                active
                  ? "bg-[hsl(220_90%_55%)] text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <it.icon className="h-4 w-4" />
              {it.title}
            </Link>
          );
        })}
        {isAdmin && (
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
        )}
      </nav>
      <button
        onClick={logout}
        className="flex items-center gap-3 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white/70 hover:bg-white/5 hover:text-white border-t border-white/10"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </button>
    </aside>
  );
}
