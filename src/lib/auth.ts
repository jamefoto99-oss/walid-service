import { redirect } from "next/navigation";
import { modules, roleLabels } from "./constants";
import { createSupabaseServerClient } from "./supabase/server";
import type { ModuleKey, Profile, UserRole } from "./types";

export async function getSessionProfile(): Promise<{
  setupRequired: boolean;
  profile: Profile | null;
}> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, profile: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { setupRequired: false, profile: null };

  const { data } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) {
    return {
      setupRequired: false,
      profile: {
        id: user.id,
        email: user.email ?? null,
        full_name: user.user_metadata?.full_name ?? user.email ?? null,
        role: "staff",
        is_active: true,
      },
    };
  }

  return { setupRequired: false, profile: data as Profile };
}

export async function requireProfile() {
  const session = await getSessionProfile();
  if (session.setupRequired) return session;
  if (!session.profile) redirect("/login");
  if (!session.profile.is_active) redirect("/login?error=inactive");
  return session as { setupRequired: false; profile: Profile };
}

export function canRead(role: UserRole, moduleKey: ModuleKey) {
  return modules[moduleKey].policy.read.includes(role);
}

export function canWrite(role: UserRole, moduleKey: ModuleKey) {
  return modules[moduleKey].policy.write.includes(role);
}

export function canDelete(role: UserRole, moduleKey: ModuleKey) {
  return modules[moduleKey].policy.delete.includes(role);
}

export async function requireModuleAccess(moduleKey: ModuleKey, mode: "read" | "write" | "delete") {
  const session = await requireProfile();
  if (session.setupRequired) return session;
  if (!session.profile) throw new Error("Unauthenticated");

  const allowed =
    mode === "read"
      ? canRead(session.profile.role, moduleKey)
      : mode === "write"
        ? canWrite(session.profile.role, moduleKey)
        : canDelete(session.profile.role, moduleKey);

  if (!allowed) {
    throw new Error(`Role ${roleLabels[session.profile.role]} ไม่มีสิทธิ์สำหรับการทำรายการนี้`);
  }

  return session;
}
