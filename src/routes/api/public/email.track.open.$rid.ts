// 1x1 transparent GIF tracking pixel
import { createFileRoute } from "@tanstack/react-router";

// Minimal 43-byte transparent GIF
const GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

export const Route = createFileRoute("/api/public/email/track/open/$rid")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const rid = params.rid;
        // Validate uuid shape cheaply
        if (rid && /^[0-9a-f-]{36}$/i.test(rid)) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const now = new Date().toISOString();
            const { data: row } = await supabaseAdmin
              .from("campaign_recipients")
              .select("opens_count, first_opened_at")
              .eq("id", rid)
              .maybeSingle();
            if (row) {
              await supabaseAdmin
                .from("campaign_recipients")
                .update({
                  opens_count: (row.opens_count ?? 0) + 1,
                  first_opened_at: row.first_opened_at ?? now,
                  last_opened_at: now,
                })
                .eq("id", rid);
            }
          } catch {
            // tracking must never fail the pixel response
          }
        }
        return new Response(GIF, {
          status: 200,
          headers: {
            "Content-Type": "image/gif",
            "Content-Length": String(GIF.byteLength),
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            Pragma: "no-cache",
          },
        });
      },
    },
  },
});
