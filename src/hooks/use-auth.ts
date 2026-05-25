import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import { getMyRoles } from "@/lib/auth.functions";

export type Me = {
  userId: string;
  email: string | null | undefined;
  roles: ("admin" | "staff")[];
} | null;

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me>(null);

  const refresh = useCallback(async () => {
    const session = await waitForSupabaseSession();
    if (!session) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const res = await getMyRoles();
      setMe(res);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  return {
    me,
    loading,
    isAuthenticated: !!me,
    isAdmin: !!me?.roles.includes("admin"),
    isStaff: !!me && (me.roles.includes("staff") || me.roles.includes("admin")),
    logout: async () => {
      await supabase.auth.signOut();
      setMe(null);
    },
    refresh,
  };
}
