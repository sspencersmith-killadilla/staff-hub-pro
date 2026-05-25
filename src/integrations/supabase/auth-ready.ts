import type { Session } from "@supabase/supabase-js";
import { supabase } from "./client";

let pendingSessionPromise: Promise<Session | null> | null = null;

async function clearInvalidLocalSession() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    await supabase.auth.signOut();
  }
}

async function getValidatedSession() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) {
    await clearInvalidLocalSession();
    return null;
  }

  const { data: refreshedSessionData } = await supabase.auth.getSession();
  return refreshedSessionData.session;
}

export async function waitForSupabaseSession(timeoutMs = 1500) {
  if (pendingSessionPromise) return pendingSessionPromise;

  pendingSessionPromise = (async () => {
    const currentSession = await getValidatedSession();
    if (currentSession) return currentSession;

    if (typeof window === "undefined") return null;

    const restoredSession = await new Promise<Session | null>((resolve) => {
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

    if (!restoredSession) return null;
    return await getValidatedSession();
  })().finally(() => {
    pendingSessionPromise = null;
  });

  return pendingSessionPromise;
}