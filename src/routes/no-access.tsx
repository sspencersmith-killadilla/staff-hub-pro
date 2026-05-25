import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/no-access")({ component: NoAccess });

function NoAccess() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">No access</h1>
        <p className="mt-2 text-muted-foreground">
          Your account doesn't have a staff role yet. Ask an admin to grant you access.
        </p>
        <Link to="/" className="mt-6 inline-block underline">Back to home</Link>
      </div>
    </div>
  );
}
