import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listMyOrgs,
  createMyOrg,
  updateMyOrg,
} from "@/lib/community-public.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";

import { requireModule } from "@/lib/require-module";

export const Route = createFileRoute("/_authenticated/community/apply")({
  beforeLoad: () => requireModule("community_orgs"),
  component: ApplyPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
};

type Org = {
  id: string;
  name: string;
  org_type: string | null;
  contact_email: string;
  contact_phone: string | null;
  website: string | null;
  description: string | null;
  status: string;
  staff_notes: string | null;
};

function ApplyPage() {
  const router = useRouter();
  const fetchOrgs = useServerFn(listMyOrgs);
  const create = useServerFn(createMyOrg);
  const update = useServerFn(updateMyOrg);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["community", "my-orgs"],
    queryFn: () => fetchOrgs(),
  });
  const orgs: Org[] = (data as Org[]) ?? [];

  // null = closed; "new" = create form; or an org object = edit
  const [mode, setMode] = useState<null | "new" | Org>(
    orgs.length === 0 ? "new" : null,
  );
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
      if (mode && mode !== "new") {
        await update({ data: { ...values, id: mode.id } });
        toast.success("Organization updated.");
      } else {
        await create({ data: values });
        toast.success("Organization submitted. The city will review it.");
      }
      setMode(null);
      await refetch();
      router.invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading)
    return <div className="p-8 text-sm text-slate-500">Loading…</div>;

  const editing = mode && mode !== "new" ? mode : null;
  const initial: Partial<Org> = editing ?? {};

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">
        Your community organizations
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        You can register <strong>as many organizations as you need</strong> from
        this single account — one per church, school, nonprofit, or program you
        run. Each is reviewed separately and gets its own venues and event
        submissions.
      </p>

      {/* List of existing orgs */}
      {orgs.length > 0 && (
        <div className="mt-6 space-y-3">
          {orgs.map((o) => (
            <div
              key={o.id}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {o.name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        STATUS_STYLES[o.status] ?? "bg-slate-100"
                      }`}
                    >
                      {o.status}
                    </span>
                  </div>
                  {o.org_type && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {o.org_type}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-slate-500">
                    {o.contact_email}
                  </div>
                  {o.staff_notes && (
                    <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                      Staff note: {o.staff_notes}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMode(o)}
                  >
                    Edit details
                  </Button>
                  {o.status === "approved" && (
                    <Link
                      to="/community/manage"
                      search={{ org: o.id }}
                      className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-700"
                    >
                      Manage →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new CTA */}
      {mode === null && (
        <div className="mt-6">
          <Button onClick={() => setMode("new")}>
            <Plus className="mr-2 h-4 w-4" />
            {orgs.length === 0
              ? "Register your first organization"
              : "Register another organization"}
          </Button>
        </div>
      )}

      {/* Create / edit form */}
      {mode !== null && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">
              {editing
                ? `Edit ${editing.name}`
                : orgs.length === 0
                  ? "New organization"
                  : "Add another organization"}
            </h2>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-1.5">
            <Label>Organization name</Label>
            <Input
              name="name"
              required
              maxLength={200}
              defaultValue={initial.name ?? ""}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type (optional)</Label>
              <Input
                name="org_type"
                maxLength={120}
                defaultValue={initial.org_type ?? ""}
                placeholder="Church, school, nonprofit…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Website (optional)</Label>
              <Input
                name="website"
                maxLength={500}
                defaultValue={initial.website ?? ""}
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
                defaultValue={initial.contact_email ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contact phone (optional)</Label>
              <Input
                name="contact_phone"
                maxLength={40}
                defaultValue={initial.contact_phone ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>About this organization</Label>
            <Textarea
              name="description"
              rows={4}
              maxLength={2000}
              defaultValue={initial.description ?? ""}
              placeholder="What you do, who you serve, why you'd like to be part of the lineup."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : "Submit for review"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
