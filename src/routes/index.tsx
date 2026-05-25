import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Total Event Systems
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Public site coming soon. Staff sign in to manage gigs, events, venues, and rooms.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/login"><Button>Staff log in</Button></Link>
          <Link to="/staff">
            <Button variant="outline">Staff Portal</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
