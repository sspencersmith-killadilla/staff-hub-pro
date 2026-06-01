// Generates a fallback image for a submission when the user didn't upload one.
// Calls Lovable AI Gateway (/v1/images/generations) and uploads the resulting
// PNG to the public `auto-images` Supabase Storage bucket. Returns the public
// URL on success, or null on any failure (so the submission still saves).

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AutoImageKind =
  | "event"
  | "community-event"
  | "course"
  | "room"
  | "venue";

const PROMPTS: Record<AutoImageKind, (title: string, desc?: string | null) => string> = {
  event: (t, d) =>
    `A clean, modern event flyer illustration for "${t}". ${d ? `Theme: ${d}. ` : ""}Vibrant but tasteful colors, minimal flat illustration style, no text or typography, centered composition, suitable as a hero image.`,
  "community-event": (t, d) =>
    `A warm, community-oriented illustrated poster for "${t}". ${d ? `About: ${d}. ` : ""}Friendly flat illustration, inclusive scene, soft palette, no text, centered composition.`,
  course: (t, d) =>
    `A polished course thumbnail for "${t}". ${d ? `Topic: ${d}. ` : ""}Editorial flat illustration, educational mood, balanced composition, no text or typography.`,
  room: (t, d) =>
    `A clean architectural render of a versatile room called "${t}". ${d ? `Notes: ${d}. ` : ""}Bright, modern interior, neutral palette, wide angle, no people, no text.`,
  venue: (t, d) =>
    `A clean exterior architectural render of a venue called "${t}". ${d ? `Notes: ${d}. ` : ""}Daylight, inviting, no people, no text or signage.`,
};

function safeSegment(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "item";
}

export async function generateFallbackImage(params: {
  kind: AutoImageKind;
  title: string;
  description?: string | null;
  id?: string | number | null;
}): Promise<string | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[auto-image] LOVABLE_API_KEY missing; skipping");
    return null;
  }
  const title = (params.title || "").trim();
  if (!title) return null;

  const prompt = PROMPTS[params.kind](title, params.description ?? null);

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "openai/gpt-image-2",
        prompt,
        size: "1024x1024",
        quality: "low",
        n: 1,
      }),
    });
    if (!res.ok) {
      console.error("[auto-image] gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
      console.error("[auto-image] no b64_json in response");
      return null;
    }
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const idPart = params.id != null ? String(params.id) : crypto.randomUUID();
    const path = `${params.kind}/${safeSegment(idPart)}-${Date.now()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("auto-images")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) {
      console.error("[auto-image] upload error", upErr.message);
      return null;
    }
    const { data } = supabaseAdmin.storage.from("auto-images").getPublicUrl(path);
    return data.publicUrl;
  } catch (e: any) {
    console.error("[auto-image] failed", e?.message ?? e);
    return null;
  }
}
