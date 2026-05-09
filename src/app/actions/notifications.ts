"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { refreshSystemNotifications } from "@/lib/notifications";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

function revalidateNotifications() {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
}

export async function syncNotificationsAction(): Promise<ActionResult> {
  try {
    const session = await requireProfile();
    if (session.setupRequired) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
    if (!session.profile) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    await refreshSystemNotifications(supabase);
    revalidateNotifications();
    return { ok: true, message: "อัปเดตแจ้งเตือนล่าสุดแล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "อัปเดตแจ้งเตือนไม่สำเร็จ" };
  }
}

export async function syncNotificationsFormAction() {
  await syncNotificationsAction();
}

export async function markNotificationReadAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireProfile();
    if (session.setupRequired) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
    if (!session.profile) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
    const profile = session.profile;

    const notificationId = String(formData.get("notification_id") ?? "");
    if (!notificationId) return { ok: false, error: "ไม่พบแจ้งเตือน" };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .select("id")
      .eq("id", notificationId)
      .contains("target_roles", [profile.role])
      .is("resolved_at", null)
      .maybeSingle();

    if (notificationError || !notification) {
      return { ok: false, error: "ไม่พบแจ้งเตือนที่อ่านได้" };
    }

    const { error } = await supabase.from("notification_reads").upsert(
      {
        notification_id: notificationId,
        profile_id: profile.id,
        read_at: new Date().toISOString(),
      },
      { onConflict: "notification_id,profile_id" },
    );

    if (error) return { ok: false, error: error.message };

    revalidateNotifications();
    return { ok: true, message: "อ่านแล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "บันทึกอ่านแล้วไม่สำเร็จ" };
  }
}

export async function markNotificationReadFormAction(formData: FormData) {
  await markNotificationReadAction(formData);
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  try {
    const session = await requireProfile();
    if (session.setupRequired) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
    if (!session.profile) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
    const profile = session.profile;

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    await refreshSystemNotifications(supabase);

    const { data: notifications, error: notificationError } = await supabase
      .from("notifications")
      .select("id")
      .contains("target_roles", [profile.role])
      .is("resolved_at", null)
      .limit(500);

    if (notificationError) return { ok: false, error: notificationError.message };
    if (!(notifications ?? []).length) return { ok: true, message: "ไม่มีแจ้งเตือนใหม่" };

    const now = new Date().toISOString();
    const { error } = await supabase.from("notification_reads").upsert(
      (notifications ?? []).map((notification) => ({
        notification_id: notification.id,
        profile_id: profile.id,
        read_at: now,
      })),
      { onConflict: "notification_id,profile_id" },
    );

    if (error) return { ok: false, error: error.message };

    revalidateNotifications();
    return { ok: true, message: "อ่านแจ้งเตือนทั้งหมดแล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "บันทึกอ่านทั้งหมดไม่สำเร็จ" };
  }
}

export async function markAllNotificationsReadFormAction() {
  await markAllNotificationsReadAction();
}
