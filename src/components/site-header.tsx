import { Link, useRouter } from "@tanstack/react-router";
import { Home, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const { me, isAuthenticated, isStaff, isAdmin, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.navigate({ to: "/login" });
  };

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Home className="h-4 w-4" /> Home
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            to="/streetbeats"
            className="text-muted-foreground hover:text-foreground"
          >
            Streetbeats
          </Link>
          <Link
            to="/community"
            className="text-muted-foreground hover:text-foreground"
          >
            Community
          </Link>
          {isAuthenticated && (
            <Link
              to="/my-reservations"
              className="text-muted-foreground hover:text-foreground"
            >
              My Reservations
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
