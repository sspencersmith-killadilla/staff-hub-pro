import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { updateRoom } from "@/lib/venues.functions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Upload, Loader2 } from "lucide-react";

type Room = {
  id: string;
  image_url?: string | null;
  description?: string | null;
  tags?: string[] | null;
};

export function RoomDetailsEditor({
  room,
  onChanged,
}: {
  room: Room;
  onChanged: () => void;
}) {
  const [description, setDescription] = useState(room.description ?? "");
  const [tags, setTags] = useState<string[]>(room.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(room.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: (patch: Partial<Room>) =>
      updateRoom({ data: { id: room.id, patch } as any }),
    onSuccess: () => onChanged(),
  });

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t || tags.includes(t) || tags.length >= 4) return;
    const next = [...tags, t];
    setTags(next);
    setTagDraft("");
    save.mutate({ tags: next });
  };
  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    save.mutate({ tags: next });
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${room.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("room-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("room-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      save.mutate({ image_url: data.publicUrl });
    } catch (e: any) {
      alert(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-2 ml-2 rounded-md border border-slate-200 bg-slate-50/50 p-3 space-y-3">
      {/* Image */}
      <div className="flex items-start gap-3">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded border bg-white">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              No image
            </div>
          )}
        </div>
        <div className="flex-1 space-y-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
          <div className="flex gap-2">
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => fileRef.current?.click()} disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Upload className="h-3 w-3 mr-1" />
              )}
              {imageUrl ? "Replace image" : "Upload image"}
            </Button>
            {imageUrl && (
              <Button
                type="button" size="sm" variant="ghost"
                onClick={() => { setImageUrl(null); save.mutate({ image_url: null }); }}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">PNG/JPG, displayed on public room page.</p>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">Description</label>
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== (room.description ?? "")) save.mutate({ description });
          }}
          placeholder="Short description shown to the public…"
          className="mt-1"
        />
      </div>

      {/* Tags */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          Tags <span className="text-slate-400">({tags.length}/4)</span>
        </label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">
              {t}
              <button type="button" onClick={() => removeTag(t)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {tags.length < 4 && (
            <form
              onSubmit={(e) => { e.preventDefault(); addTag(); }}
              className="flex gap-1"
            >
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="Add tag…"
                className="h-7 w-32 text-xs"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!tagDraft.trim()}>
                Add
              </Button>
            </form>
          )}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          E.g. Projector, WiFi, Whiteboard, Accessible (max 4).
        </p>
      </div>
    </div>
  );
}
