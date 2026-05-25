import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyOrg, upsertMyOrg } from "@/lib/community-public.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute("/_authenticated/community/apply")({
  beforeLoad: () => requireModule("community_orgs"),
  component: ApplyPage,
});

function ApplyPage() {
  const router = useRouter();
  const fetchOrg = useServerFn(getMyOrg);
  const save = useServerFn(upsertMyOrg);
  const { data: org, isLoading } = useQuery({
    queryKey: ["community", "my-org"],
    queryFn: () => fetchOrg(),
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values = {
      name: String(fd.get("name") ?? "").trim(),
      org_type: String(fd.get("org_type") ?? "").trim() || null,
      contact_email: String(fd.get("contact_email") ?? "").trim(),
      contact_phone: String(fd.get("contact_phone") ?? "").trim() || null,
      website: String(fd.get("website") ?? "").trim() || null,
      description: String(fd.get("description") ?? "").trim() || null,
    };
    setSubmitting(true);
    try {
      await save({ data: values });
      toast.success("Saved. The city will review your organization.");
      router.invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">
        Register a community organization
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Once your org is approved, you can add your own venues and submit events
        to appear on the public lineup.
      </p>
      {org && (
        <div className="mt-4 flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              org.status === "approved"
                ? "bg-emerald-100 text-emerald-900"
                : org.status === "rejected"
                  ? "bg-rose-100 text-rose-900"
                  : "bg-amber-100 text-amber-900"
            }`}
          >
            {org.status}
          </span>
          <span className="text-slate-700">
            Current status of <strong>{org.name}</strong>
          </span>
          {org.status === "approved" && (
            <Link
              to="/community/manage"
              className="ml-auto text-xs font-bold uppercase tracking-wider text-slate-900 underline-offset-4 hover:underline"
            >
              Manage →
            </Link>
          )}
        </div>
      )}
      {org?.staff_notes && (
        <p className="mt-2 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Staff note: {org.staff_notes}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label>Organization name</Label>
          <Input
            name="name"
            required
            maxLength={200}
            defaultValue={org?.name ?? ""}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Type (optional)</Label>
            <Input
              name="org_type"
              maxLength={120}
              defaultValue={org?.org_type ?? ""}
              placeholder="Church, school, nonprofit…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Website (optional)</Label>
            <Input
              name="website"
              maxLength={500}
              defaultValue={org?.website ?? ""}
              placeholder="https://"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Contact email</Label>
            <Input
              type="email"
              name="contact_email"
              required
              maxLength={255}
              defaultValue={org?.contact_email ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Contact phone (optional)</Label>
            <Input
              name="contact_phone"
              maxLength={40}
              defaultValue={org?.contact_phone ?? ""}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>About your organization</Label>
          <Textarea
            name="description"
            rows={4}
            maxLength={2000}
            defaultValue={org?.description ?? ""}
            placeholder="What you do, who you serve, why you'd like to be part of the lineup."
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : org ? "Update application" : "Submit application"}
          </Button>
        </div>
      </form>
    </div>
  );
}
