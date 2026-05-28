import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import {
  generateGuidebook,
  previewGuidebookCounts,
} from "@/lib/guidebook.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/staff/admin/guidebook")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: GuidebookPage,
});

function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function GuidebookPage() {
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today(30));
  const preview = useServerFn(previewGuidebookCounts);
  const generate = useServerFn(generateGuidebook);

  const previewMut = useMutation({
    mutationFn: () => preview({ data: { startDate, endDate } }),
    onError: (e: any) => toast.error(e?.message ?? "Failed to preview"),
  });

  const generateMut = useMutation({
    mutationFn: () => generate({ data: { startDate, endDate } }),
    onSuccess: (result) => {
      // Decode base64 → blob → download
      const bin = atob(result.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        `Generated PDF with ${result.counts.events} events, ${result.counts.gigs} gigs, ${(result.counts as any).classes ?? 0} classes, ${result.counts.sponsors} sponsor ads.`,
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to generate"),
  });

  const dateError =
    startDate && endDate && startDate > endDate ? "End date must be after start date." : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <div>
        <Link
          to="/staff/admin"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Generate Program Guidebook
        </h1>
        <p className="text-sm text-muted-foreground">
          Compile approved events, StreetBeats performances, and sponsor ads
          into a print-ready PDF.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="start">Start date</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="end">End date</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {dateError && (
            <p className="text-sm text-destructive">{dateError}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!!dateError || previewMut.isPending}
              onClick={() => previewMut.mutate()}
            >
              {previewMut.isPending ? "Counting…" : "Preview counts"}
            </Button>
            <Button
              type="button"
              disabled={!!dateError || generateMut.isPending}
              onClick={() => generateMut.mutate()}
            >
              {generateMut.isPending ? "Generating PDF…" : "Generate PDF"}
            </Button>
            <Button asChild type="button" variant="secondary" disabled={!!dateError}>
              <Link
                to="/staff/admin/guidebook-canvas"
                search={{ start: startDate, end: endDate }}
              >
                Open in Layout Builder
              </Link>
            </Button>
          </div>

          {previewMut.data && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div>
                Events: <strong>{previewMut.data.events}</strong>
              </div>
              <div>
                StreetBeats performances: <strong>{previewMut.data.gigs}</strong>
              </div>
              <div>
                Classes: <strong>{(previewMut.data as any).classes ?? 0}</strong>
              </div>
              <div>
                Guidebook sponsor ads: <strong>{previewMut.data.sponsors}</strong>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sponsor ad slots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Sponsors who purchase the <strong>Guidebook Ad Space</strong> tier
            (status approved or paid) appear in the generated PDF:
          </p>
          <ul className="ml-5 list-disc">
            <li>Hero logo on the cover page</li>
            <li>Full-page ad after the cover</li>
            <li>Rotating half-page ads between sections</li>
            <li>Footer credit on every content page</li>
            <li>Sponsor thank-you index at the back</li>
          </ul>
          <p>
            To add the tier, create a sponsorship tier whose name contains
            "Guidebook" (or set its <code>placement</code> column to
            <code> guidebook</code>).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
