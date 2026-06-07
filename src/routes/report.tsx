import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LocationPicker } from "@/components/tickets/LocationPicker";
import {
  createTicket,
  listIssueCategories,
} from "@/lib/tickets.functions";
import { toast } from "sonner";
import { Upload, Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Report an Issue · 311" },
      {
        name: "description",
        content:
          "Report a non-emergency issue (pothole, graffiti, streetlight, park, dumping) to the city and track its progress.",
      },
      { property: "og:title", content: "Report an Issue · 311" },
      {
        property: "og:description",
        content:
          "Submit a non-emergency issue to the city and follow it from received through resolved.",
      },
    ],
  }),
  component: ReportPage,
});

const schema = z.object({
  category_id: z.string().uuid({ message: "Pick a category" }),
  description: z
    .string()
    .min(10, "Add at least a sentence describing the issue")
    .max(2000),
});
type FormVals = z.infer<typeof schema>;

function ReportPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const fetchCategories = useServerFn(listIssueCategories);
  const submit = useServerFn(createTicket);

  const { data: categories } = useQuery({
    queryKey: ["issue-categories"],
    queryFn: () => fetchCategories(),
  });

  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: { category_id: "", description: "" },
  });

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Photo must be 10 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sign in required");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `tickets/${uid}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("ticket-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("ticket-photos").getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function onSubmit(vals: FormVals) {
    if (!photoUrl) {
      toast.error("A photo is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await submit({
        data: {
          category_id: vals.category_id,
          description: vals.description,
          photo_url: photoUrl,
          location_address: address || null,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        },
      });
      toast.success("Report submitted — we'll keep you posted.");
      navigate({ to: "/my-reports", search: { new: res.id } as any });
    } catch (e: any) {
      toast.error(e.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-700">
            311 · Non-Emergency
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#002f49]">
            Report an Issue
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Snap a photo, drop a pin, and let the right department know. You'll be
            able to track progress from <em>received</em> through <em>resolved</em>.
          </p>
        </header>

        {!isAuthenticated ? (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <h2 className="font-bold text-[#002f49]">Sign in to report an issue</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We require an account so you can follow your report and get
                  updates from city staff.
                </p>
                <div className="mt-4 flex gap-2">
                  <Link to="/login">
                    <Button>Sign in</Button>
                  </Link>
                  <Link to="/signup">
                    <Button variant="outline">Create an account</Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6 rounded-xl border bg-white p-6 shadow-sm"
          >
            <div className="space-y-2">
              <Label htmlFor="category">What's the issue?</Label>
              <Select
                value={form.watch("category_id")}
                onValueChange={(v) => form.setValue("category_id", v, { shouldValidate: true })}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.category_id && (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.category_id.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Describe what you're seeing</Label>
              <Textarea
                id="description"
                rows={4}
                placeholder="Be specific — size, location detail, when you noticed it…"
                {...form.register("description")}
              />
              {form.formState.errors.description && (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Photo <span className="text-rose-600">*</span></Label>
              <div className="flex items-center gap-3">
                <Button asChild type="button" variant="outline" disabled={uploading}>
                  <label className="cursor-pointer">
                    {uploading ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-1 h-4 w-4" />
                    )}
                    {photoUrl ? "Replace photo" : "Upload photo"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                  </label>
                </Button>
                {!photoUrl && (
                  <span className="text-xs text-muted-foreground">Required</span>
                )}
              </div>
              {photoUrl && (
                <img
                  src={photoUrl}
                  alt="Issue"
                  className="max-h-56 rounded border object-contain bg-muted/30"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <LocationPicker
                address={address}
                coords={coords}
                onChange={({ address, coords }) => {
                  setAddress(address);
                  setCoords(coords);
                }}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting || uploading} size="lg">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Report
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
