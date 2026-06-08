import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/apple-touch-icon.png")({
  server: {
    handlers: {
      GET: async () => {
        const { data } = await supabaseAdmin
          .from("global_settings")
          .select("favicon_180_url, favicon_512_url, favicon_url")
          .eq("singleton", true)
          .maybeSingle();

        const target =
          data?.favicon_180_url ??
          data?.favicon_512_url ??
          data?.favicon_url ??
          null;

        if (!target) {
          return new Response("No icon configured", { status: 404 });
        }

        return new Response(null, {
          status: 302,
          headers: {
            Location: target,
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
