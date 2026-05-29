import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";
import { waitForSupabaseSession } from "./auth-ready";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    // Prefer the already-restored session (non-destructive, no network call).
    // Fall back to waitForSupabaseSession only when nothing is hydrated yet.
    let token: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    } catch {
      // ignore
    }
    if (!token) {
      const session = await waitForSupabaseSession();
      token = session?.access_token;
    }

    return token
      ? next({ headers: { Authorization: `Bearer ${token}` } })
      : next();
  },
);

