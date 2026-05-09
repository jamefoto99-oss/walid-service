"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult, UserRole } from "@/lib/types";

const userRoles = ["owner", "manager", "staff", "accountant"] as const;

const updateUserSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2, "กรุณากรอกชื่อผู้ใช้"),
  role: z.enum(userRoles),
  is_active: z.coerce.boolean(),
});

const inviteUserSchema = z.object({
  email: z.string().trim().email("อีเมลไม่ถูกต้อง"),
  full_name: z.string().trim().min(2, "กรุณากรอกชื่อผู้ใช้"),
  role: z.enum(userRoles).default("staff"),
});

async function currentActor() {
  const session = await requireModuleAccess("users", "write");
  if (session.setupRequired) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  if (!session.profile) throw new Error("Unauthenticated");
  return session.profile;
}

async function logUserActivity(action: string, recordId: string | null, metadata: Record<string, unknown>) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  const actor = await currentActor();
  await supabase.from("activity_logs").insert({
    actor_id: actor.id,
    action,
    table_name: "profiles",
    record_id: recordId,
    metadata,
  });
}

async function activeOwnerCount() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("is_active", true);
  return count ?? 0;
}

export async function updateUserProfile(input: unknown): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = updateUserSchema.parse(input);
    const { data: target, error: targetError } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,is_active")
      .eq("id", payload.id)
      .maybeSingle();

    if (targetError || !target) return { ok: false, error: "ไม่พบผู้ใช้" };
    if (payload.id === actor.id && !payload.is_active) {
      return { ok: false, error: "ไม่สามารถปิดการใช้งานบัญชีตัวเองได้" };
    }

    const targetIsActiveOwner = target.role === "owner" && target.is_active;
    const willStopBeingActiveOwner = payload.role !== "owner" || !payload.is_active;
    if (targetIsActiveOwner && willStopBeingActiveOwner && (await activeOwnerCount()) <= 1) {
      return { ok: false, error: "ต้องมี Owner ที่ใช้งานอยู่ในระบบอย่างน้อย 1 คน" };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: payload.full_name,
        role: payload.role,
        is_active: payload.is_active,
      })
      .eq("id", payload.id);

    if (error) return { ok: false, error: error.message };

    await logUserActivity("update_user_profile", payload.id, {
      before: target,
      after: payload,
    });

    revalidatePath("/users");
    return { ok: true, message: "อัปเดตผู้ใช้เรียบร้อย" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "อัปเดตผู้ใช้ไม่สำเร็จ" };
  }
}

export async function inviteUser(input: unknown): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
    if (!admin) {
      return {
        ok: false,
        error: "ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน Environment Variables ก่อนใช้ฟังก์ชันเชิญผู้ใช้",
      };
    }

    const payload = inviteUserSchema.parse(input);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const { data, error } = await admin.auth.admin.inviteUserByEmail(payload.email, {
      redirectTo: `${appUrl}/login`,
      data: {
        full_name: payload.full_name,
        role: payload.role,
        invited_by: actor.id,
      },
    });

    if (error) return { ok: false, error: error.message };

    if (data.user?.id) {
      await supabase
        .from("profiles")
        .update({
          full_name: payload.full_name,
          role: payload.role as UserRole,
          is_active: true,
        })
        .eq("id", data.user.id);
    }

    await logUserActivity("invite_user", data.user?.id ?? null, {
      email: payload.email,
      full_name: payload.full_name,
      role: payload.role,
    });

    revalidatePath("/users");
    return { ok: true, message: `ส่งคำเชิญไปที่ ${payload.email} แล้ว` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เชิญผู้ใช้ไม่สำเร็จ" };
  }
}
