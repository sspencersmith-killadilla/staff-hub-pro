import { Link, useRouter } from "@tanstack/react-router";
import { Home, LogOut, Building2, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useModules } from "@/hooks/use-modules";
import { useDepartment } from "@/contexts/department-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SiteHeader() {
  const { me, isAuthenticated, isStaff, isAdmin, logout } = useAuth();
  const { isEnabled } = useModules();
  const { memberships, activeDepartment, setActiveDepartmentId } = useDepartment();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.navigate({ to: "/login" });
  };

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        
        {/* Left Side: Brand & Quick Links */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Home className="h-4 w-4" /> Home
          </Link>
          <Link to="/manual" className="flex items-center gap-2 font-semibold text-muted-foreground hover:text-foreground">
          |  Help Manual
          </Link>
          <Link to="https://totaleventsystemsolutions.lovable.app/ReproductionInstruction.pdf" className="flex items-center gap-2 font-semibold text-muted-foreground hover:text-foreground">
          |  Reproduction Instruction
          </Link>
        </div>

        {/* Right Side: Navigation */}
        <nav className="flex items-center gap-3 text-sm">
          <Link
            to="/events"
            className="text-muted-foreground hover:text-foreground"
          >
            Events
          </Link>
          {isEnabled("room_reservations") && (
            <Link
              to="/rooms"
              className="text-muted-foreground hover:text-foreground"
            >
              Rooms
            </Link>
          )}
          {isEnabled("streetbeats") && (
            <Link
              to="/streetbeats"
              className="text-muted-foreground hover:text-foreground"
            >
              Streetbeats
            </Link>
          )}
          {isAuthenticated && (
            <Link
              to="/hub"
              className="font-semibold text-foreground hover:underline"
            >
              My Hub
            </Link>
          )}
          {isStaff && (
            <Link to="/staff" className="text-muted-foreground hover:text-foreground">
              Staff Portal
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/staff/admin"
              className="text-muted-foreground hover:text-foreground"
            >
              Admin
            </Link>
          )}
          {isAuthenticated ? (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {me?.email}
              </span>
              <Button size="sm" variant="ghost" onClick={handleLogout}>
                <LogOut className="mr-1 h-4 w-4" /> Log out
              </Button>
            </>
          ) : (
            <Link to="/login">
              <Button size="sm">Log in</Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
