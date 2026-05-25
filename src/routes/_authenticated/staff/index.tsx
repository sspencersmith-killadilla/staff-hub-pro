import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/staff/")({
  component: StaffHome,
});

function StaffHome() {
  const { me, isAdmin } = useAuth();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Staff Portal</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Signed in as {me?.email} ({me?.roles.join(", ") || "no role"})
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Gigs</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Approve / deny submissions. (Coming in next round.)
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Events</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Create and manage events. (Coming in next round.)
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Venues, Stages &amp; Rooms</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Addresses, features, hours, closures. (Coming in next round.)
          </CardContent>
        </Card>
        {isAdmin && (
          <Card>
            <CardHeader><CardTitle>Manage Staff</CardTitle></CardHeader>
            <CardContent>
              <Link to="/staff/admin" className="text-sm underline">
                Open admin →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
