import { Link, useRouter } from "@tanstack/react-router";
import { Home, LogOut, Building2, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useModules } from "@/hooks/use-modules";
import { useDepartment } from "@/contexts/department-context";
import { useGlobalBrand } from "@/contexts/global-brand-context";
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
  const { settings: globalBrand } = useGlobalBrand();
  const router = useRouter();


  const handleLogout = async () => {
    await logout();
    router.navigate({ to: "/" });
  };

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        
        {/* Left Side: Brand & Quick Links */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            {(() => {
              const logo =
                globalBrand?.logo_light_url ??
                globalBrand?.primary_logo_url ??
                null;
              return logo ? (
                <img
                  src={logo}
                  alt={`${globalBrand?.city_name ?? "City"} logo`}
                  className="h-6 w-auto"
                />
              ) : (
                <Home className="h-4 w-4" />
              );
            })()}
            <span>{globalBrand?.city_name ?? "Home"}</span>
          </Link>


          <Link to="/manual" className="text-sm text-muted-foreground hover:text-foreground">
            Help Manual
          </Link>
          <Link to="https://totaleventsystemsolutions.lovable.app/ReproductionInstruction.pdf" className="text-sm text-muted-foreground hover:text-foreground">
            Reproduction Instructions
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
          <Link
            to="/classes"
            className="text-muted-foreground hover:text-foreground"
          >
            Classes
          </Link>
          <Link
            to="/departments"
            className="text-muted-foreground hover:text-foreground"
          >
            Departments
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
          {isStaff && memberships.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="max-w-[140px] truncate">
                    {activeDepartment?.name ?? "Department"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Active Department</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {memberships.map((m) => (
                  <DropdownMenuItem
                    key={m.department.id}
                    onSelect={() => setActiveDepartmentId(m.department.id)}
                    className="flex items-center justify-between"
                  >
                    <span className="flex flex-col">
                      <span className="text-sm">{m.department.name}</span>
                      <span className="text-xs text-muted-foreground">{m.role}</span>
                    </span>
                    {activeDepartment?.id === m.department.id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {isStaff && (
            <Link to="/staff" className="text-muted-foreground hover:text-foreground">
              Staff Portal
            </Link>
          )}
          {activeDepartment && (
            <Link
              to="/departments/$id"
              params={{ id: activeDepartment.id }}
              className="text-muted-foreground hover:text-foreground"
            >
              Dept Hub
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
