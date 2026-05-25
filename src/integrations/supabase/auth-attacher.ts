import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;

    if (!token) {
      const { data: userData, error } = await supabase.auth.getUser();
      if (!error && userData.user) {
        const { data: refreshed } = await supabase.auth.getSession();
        token = refreshed.session?.access_token;
      }
    }

    return token
      ? next({ headers: { Authorization: `Bearer ${token}` } })
      : next();
  },
);
