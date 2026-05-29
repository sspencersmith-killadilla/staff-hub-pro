import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload } from "lucide-react";

export function ImageUploader({
  label = "Image",
  value,
  onChange,
  bucket = "branding",
  folder = "home",
}: {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  bucket?: string;
  folder?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${folder}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Image uploaded.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… or upload"
          className="flex-1"
        />
        <Button asChild type="button" variant="outline" size="sm" disabled={busy}>
          <label className="cursor-pointer">
            <Upload className="h-4 w-4 mr-1" />
            {busy ? "Uploading…" : "Upload"}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </Button>
      </div>
      {value && (
        <img
          src={value}
          alt=""
          className="max-h-40 rounded border object-contain bg-muted/30"
        />
      )}
    </div>
  );
}
