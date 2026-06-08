import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Home, LogOut, Building2, Check, Menu } from "lucide-react";
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function SheetLink({
  to,
  params,
  children,
  className,
}: {
  to: string;
  params?: Record<string, string>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <SheetClose asChild>
      <Link
        to={to}
        params={params as any}
        className={cn(
          "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
          className,
        )}
      >
        {children}
      </Link>
    </SheetClose>
  );
}

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

        {/* Right Side: Hamburger Navigation */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 sm:w-80">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <nav className="mt-6 flex flex-col gap-1">
              <SheetLink to="/events">Events</SheetLink>
              <SheetLink to="/classes">Classes</SheetLink>
              <SheetLink to="/departments">Departments</SheetLink>
              <SheetLink to="/report">Report 311</SheetLink>
              {isEnabled("room_reservations") && (
                <SheetLink to="/rooms">Rooms</SheetLink>
              )}
              {isEnabled("streetbeats") && (
                <SheetLink to="/streetbeats">Streetbeats</SheetLink>
              )}
              {isAuthenticated && (
                <SheetLink to="/hub" className="font-semibold">
                  My Hub
                </SheetLink>
              )}
              {isStaff && memberships.length > 1 && (
                <div className="mt-2">
                  <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Active Department
                  </p>
                  {memberships.map((m) => (
                    <button
                      key={m.department.id}
                      onClick={() => setActiveDepartmentId(m.department.id)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                        activeDepartment?.id === m.department.id
                          ? "bg-accent/50 text-accent-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      <span className="flex flex-col items-start">
                        <span>{m.department.name}</span>
                        <span className="text-xs text-muted-foreground">{m.role}</span>
                      </span>
                      {activeDepartment?.id === m.department.id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              {isStaff && (
                <SheetLink to="/staff">Staff Portal</SheetLink>
              )}
              {activeDepartment && (
                <SheetLink to="/departments/$id" params={{ id: activeDepartment.id }}>
                  Dept Hub
                </SheetLink>
              )}
              {isAdmin && <SheetLink to="/staff/admin">Admin</SheetLink>}
              <div className="my-2 h-px bg-border" />
              {isAuthenticated ? (
                <>
                  <span className="px-3 py-2 text-xs text-muted-foreground">
                    {me?.email}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </>
              ) : (
                <SheetLink to="/login">Log in</SheetLink>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
