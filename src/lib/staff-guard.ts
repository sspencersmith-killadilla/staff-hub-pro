import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertStaff(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["staff", "admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: staff role required");
}
