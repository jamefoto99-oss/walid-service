"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import {
  approveApprovalRequest as approveApprovalRequestService,
  rejectApprovalRequest as rejectApprovalRequestService,
} from "@/lib/approvals";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

function revalidateApprovals() {
  revalidatePath("/");
  revalidatePath("/approvals");
  revalidatePath("/activity-logs");
}

export async function approveApprovalRequestAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireProfile();
    if (session.setupRequired) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
    if (!session.profile) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

    const approvalId = String(formData.get("approval_id") ?? "");
    const reviewNote = String(formData.get("review_note") ?? "");
    if (!approvalId) return { ok: false, error: "ไม่พบคำขออนุมัติ" };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const result = await approveApprovalRequestService({
      supabase,
      profile: session.profile,
      approvalId,
      reviewNote,
    });

    revalidateApprovals();
    return result;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "อนุมัติคำขอไม่สำเร็จ" };
  }
}

export async function rejectApprovalRequestAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireProfile();
    if (session.setupRequired) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
    if (!session.profile) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

    const approvalId = String(formData.get("approval_id") ?? "");
    const reviewNote = String(formData.get("review_note") ?? "");
    if (!approvalId) return { ok: false, error: "ไม่พบคำขออนุมัติ" };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const result = await rejectApprovalRequestService({
      supabase,
      profile: session.profile,
      approvalId,
      reviewNote,
    });

    revalidateApprovals();
    return result;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ปฏิเสธคำขอไม่สำเร็จ" };
  }
}

export async function approveApprovalRequestFormAction(formData: FormData) {
  await approveApprovalRequestAction(formData);
}

export async function rejectApprovalRequestFormAction(formData: FormData) {
  await rejectApprovalRequestAction(formData);
}
