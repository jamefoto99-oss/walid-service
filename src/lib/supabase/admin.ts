import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

export function isSupabaseAdminConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createSupabaseAdminClient() {
  const { url } = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
