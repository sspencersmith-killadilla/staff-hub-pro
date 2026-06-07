import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async () => {
        const { data } = await supabaseAdmin
          .from("global_settings")
          .select(
            "city_name, primary_color, background_color, favicon_180_url, favicon_512_url, favicon_32_url, favicon_url",
          )
          .eq("singleton", true)
          .maybeSingle();

        const name = data?.city_name ?? "City Platform";
        const icons: Array<{ src: string; sizes: string; type: string }> = [];

        if (data?.favicon_32_url ?? data?.favicon_url) {
          icons.push({
            src: (data?.favicon_32_url ?? data?.favicon_url)!,
            sizes: "32x32",
            type: "image/png",
          });
        }
        if (data?.favicon_180_url) {
          icons.push({
            src: data.favicon_180_url,
            sizes: "180x180",
            type: "image/png",
          });
        }
        if (data?.favicon_512_url) {
          icons.push({
            src: data.favicon_512_url,
            sizes: "512x512",
            type: "image/png",
          });
        }

        return Response.json(
          {
            name,
            short_name: name.slice(0, 12),
            start_url: "/",
            display: "standalone",
            background_color: data?.background_color ?? "#ffffff",
            theme_color: data?.primary_color ?? "#2563eb",
            icons,
          },
          {
            headers: {
              "Content-Type": "application/manifest+json; charset=utf-8",
              "Cache-Control": "public, max-age=300",
            },
          },
        );
      },
    },
  },
});