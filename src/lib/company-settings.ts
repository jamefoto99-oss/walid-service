import type { createSupabaseServerClient } from "./supabase/server";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export async function getLatestCompanySettings(client: SupabaseServerClient) {
  const { data, error } = await client
    .from("company_settings")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as Record<string, unknown> | null;
}
