import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";
import { waitForSupabaseSession } from "./auth-ready";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const session = await waitForSupabaseSession();
    const token = session?.access_token;

    return token
      ? next({ headers: { Authorization: `Bearer ${token}` } })
      : next();
  },
);
