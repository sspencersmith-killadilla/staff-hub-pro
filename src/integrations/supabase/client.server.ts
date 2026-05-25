import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

// SERVER ONLY — bypasses RLS. Never import from client code.
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  process.env.EXT_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
