import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/auth.functions";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import {
  generateGuidebook,
  previewGuidebookCounts,
  createStandaloneGuidebookSponsor,
  listGuidebookSponsors,
  deleteGuidebookSponsor,
} from "@/lib/guidebook.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
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

      <GuidebookSponsorsCard />

      <Card>
        <CardHeader>
          <CardTitle>How sponsor ads work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Sponsors with the <strong>Guidebook Ad Space</strong> tier (status
            approved or paid) appear in the generated PDF:
          </p>
          <ul className="ml-5 list-disc">
            <li>Hero logo on the cover page</li>
            <li>Full-page ad after the cover</li>
            <li>Rotating half-page ads between sections</li>
            <li>Footer credit on every content page</li>
            <li>Sponsor thank-you index at the back</li>
          </ul>
          <p>
            Sponsors added below are <strong>standalone</strong> — they aren't
            tied to any event, so you can sell guidebook ad space directly.
            Sponsors who applied through the public sponsor flow with the
            Guidebook tier are also included automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function GuidebookSponsorsCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listGuidebookSponsors);
  const createFn = useServerFn(createStandaloneGuidebookSponsor);
  const deleteFn = useServerFn(deleteGuidebookSponsor);

  const sponsorsQ = useQuery({
    queryKey: ["guidebook-sponsors"],
    queryFn: () => listFn(),
  });

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [adCopy, setAdCopy] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          companyName,
          contactName: contactName || null,
          contactEmail: contactEmail || null,
          logoUrl: logoUrl || null,
          adCopy: adCopy || null,
        },
      }),
    onSuccess: () => {
      toast.success("Sponsor added.");
      setCompanyName("");
      setContactName("");
      setContactEmail("");
      setLogoUrl("");
      setAdCopy("");
      qc.invalidateQueries({ queryKey: ["guidebook-sponsors"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add sponsor"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Sponsor removed.");
      qc.invalidateQueries({ queryKey: ["guidebook-sponsors"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guidebook sponsors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add a sponsor directly here — no event required. They'll be marked as
          approved and automatically included in the PDF and Layout Builder.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="sp-co">Company name *</Label>
            <Input id="sp-co" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sp-cn">Contact name</Label>
            <Input id="sp-cn" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sp-em">Contact email</Label>
            <Input id="sp-em" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="sp-logo">Logo URL</Label>
            <Input id="sp-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="sp-ad">Ad copy</Label>
            <Textarea id="sp-ad" rows={3} value={adCopy} onChange={(e) => setAdCopy(e.target.value)} />
          </div>
        </div>
        <Button
          type="button"
          disabled={!companyName || createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? "Adding…" : "Add guidebook sponsor"}
        </Button>

        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-2">Current guidebook sponsors</h4>
          {sponsorsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sponsorsQ.data?.sponsors.length ? (
            <ul className="space-y-2">
              {sponsorsQ.data.sponsors.map((s: any) => (
                <li key={s.id} className="flex items-center gap-3 rounded border p-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.company_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.session_id ? "Event sponsor" : "Standalone"} · {s.status}
                    </div>
                  </div>
                  <Badge variant={s.status === "approved" || s.status === "paid" ? "default" : "secondary"}>
                    {s.status}
                  </Badge>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete sponsor "${s.company_name}"?`)) deleteMut.mutate(s.id);
                    }}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No guidebook sponsors yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
