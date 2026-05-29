import { createFileRoute } from "@tanstack/react-router";
import { verifyState, completeLinkedInOAuth } from "@/lib/social.functions";

export const Route = createFileRoute("/api/public/oauth/linkedin/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return new Response("Missing code/state", { status: 400 });
        const verified = verifyState(state);
        if (!verified || verified.platform !== "linkedin")
          return new Response("Invalid state", { status: 400 });

        try {
          await completeLinkedInOAuth({
            code,
            departmentId: verified.departmentId,
            userId: verified.userId,
            redirectUri: `${url.protocol}//${url.host}/api/public/oauth/linkedin/callback`,
          });
        } catch (e) {
          return new Response(
            `<html><body><h1>LinkedIn connection failed</h1><pre>${(e as Error).message}</pre><a href="/staff/admin/social/connections">Back</a></body></html>`,
            { status: 500, headers: { "Content-Type": "text/html" } },
          );
        }
        return new Response(
          `<html><body><script>window.location.replace('/staff/admin/social/connections?connected=linkedin');</script></body></html>`,
          { headers: { "Content-Type": "text/html" } },
        );
      },
    },
  },
});
