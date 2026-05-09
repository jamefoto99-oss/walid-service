"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createBrowserClient(url, anonKey);
}
