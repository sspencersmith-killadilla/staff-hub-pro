import type { Session } from "@supabase/supabase-js";
import { supabase } from "./client";

let pendingSessionPromise: Promise<Session | null> | null = null;

export async function waitForSupabaseSession(timeoutMs = 1500) {
  if (pendingSessionPromise) return pendingSessionPromise;

  pendingSessionPromise = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;

    if (typeof window === "undefined") return null;

    return await new Promise<Session | null>((resolve) => {
      let unsubscribe = () => {};
      const timer = window.setTimeout(() => {
        unsubscribe();
        resolve(null);
      }, timeoutMs);

      const authListener = supabase.auth.onAuthStateChange((_event, session) => {
        window.clearTimeout(timer);
        unsubscribe();
        resolve(session);
      });

      unsubscribe = () => authListener.data.subscription.unsubscribe();
    });
  })().finally(() => {
    pendingSessionPromise = null;
  });

  return pendingSessionPromise;
}