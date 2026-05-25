import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  getMyArtistProfile,
  upsertMyArtistProfile,
} from "@/lib/streetbeats-public.functions";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/streetbeats/apply")({
  head: () => ({
    meta: [
      { title: "Apply to perform — Streetbeats" },
      { property: "og:title", content: "Apply to perform — Streetbeats" },
    ],
  }),
  component: ApplyPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
};

function ApplyPage() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyArtistProfile);
  const save = useServerFn(upsertMyArtistProfile);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["streetbeats", "me", "artist"],
    queryFn: () => fetchProfile(),
  });

  const [form, setForm] = useState({
    stage_name: "",
    contact_email: "",
    phone: "",
    genre: "",
    bio: "",
    website: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        stage_name: profile.stage_name ?? "",
        contact_email: profile.contact_email ?? "",
        phone: profile.phone ?? "",
        genre: profile.genre ?? "",
        bio: profile.bio ?? "",
        website: profile.website ?? "",
      });
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: (vars: typeof form) => save({ data: vars }),
    onSuccess: () => {
      toast.success(
        profile
          ? "Profile updated."
          : "Application submitted — staff will review it shortly.",
      );
      qc.invalidateQueries({ queryKey: ["streetbeats", "me", "artist"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to save"),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate(form);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Link
          to="/streetbeats"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Streetbeats
        </Link>
        <h1 className="mt-3 text-4xl font-black uppercase tracking-tight text-slate-900">
          {profile ? "My artist profile" : "Apply to perform"}
        </h1>

        {isLoading ? (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            {profile && (
              <div className="mt-6 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Status
                  </div>
                  <span
                    className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                      STATUS_STYLES[profile.status] ??
                      "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {profile.status}
                  </span>
                  {profile.staff_notes && (
                    <p className="mt-2 text-sm text-slate-600">
                      Staff note: {profile.staff_notes}
                    </p>
                  )}
                </div>
                {profile.status === "approved" && (
                  <Link
                    to="/streetbeats/my-gigs"
                    className="rounded-md bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-700"
                  >
                    My gigs
                  </Link>
                )}
              </div>
            )}

            <form
              onSubmit={onSubmit}
              className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6"
            >
              <Field label="Stage name" required>
                <Input
                  required
                  maxLength={120}
                  value={form.stage_name}
                  onChange={(e) =>
                    setForm({ ...form, stage_name: e.target.value })
                  }
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Contact email" required>
                  <Input
                    type="email"
                    required
                    maxLength={255}
                    value={form.contact_email}
                    onChange={(e) =>
                      setForm({ ...form, contact_email: e.target.value })
                    }
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    maxLength={40}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Genre">
                  <Input
                    maxLength={120}
                    placeholder="Folk, jazz, hip-hop…"
                    value={form.genre}
                    onChange={(e) => setForm({ ...form, genre: e.target.value })}
                  />
                </Field>
                <Field label="Website">
                  <Input
                    type="url"
                    maxLength={500}
                    placeholder="https://…"
                    value={form.website}
                    onChange={(e) =>
                      setForm({ ...form, website: e.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Bio / about your act">
                <Textarea
                  rows={4}
                  maxLength={2000}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                />
              </Field>

              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending
                  ? "Saving…"
                  : profile
                    ? "Save changes"
                    : "Submit application"}
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </Label>
      {children}
    </div>
  );
}
