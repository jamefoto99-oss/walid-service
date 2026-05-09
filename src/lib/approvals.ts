import { revalidatePath } from "next/cache";
import { modules } from "./constants";
import type { createSupabaseServerClient } from "./supabase/server";
import type { ActionResult, ModuleKey, Profile, TableName, UserRole } from "./types";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ApprovalAction = "soft_delete";
export type ApprovalProtectedModule = "purchases" | "quotations" | "invoices" | "receipts";

type ApprovalTargetConfig = {
  moduleKey: ApprovalProtectedModule;
  table: Extract<TableName, "purchases" | "quotations" | "invoices" | "receipts">;
  labelField: "purchase_no" | "quotation_no" | "invoice_no" | "receipt_no";
  href: string;
  title: string;
  amountField: "total" | "amount";
  statusField: "payment_status" | "status" | "payment_method";
};

export type ApprovalProfileSummary = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
};

export type ApprovalRequestItem = {
  id: string;
  request_type: "delete_document";
  action: ApprovalAction;
  target_table: ApprovalTargetConfig["table"];
  target_id: string;
  target_label: string;
  reason: string;
  status: ApprovalStatus;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  requester: ApprovalProfileSummary | null;
  reviewer: ApprovalProfileSummary | null;
};

export type ApprovalPageData = {
  setupRequired: boolean;
  unavailable: boolean;
  approvals: ApprovalRequestItem[];
  summary: Record<ApprovalStatus, number>;
};

export const approvalTargetConfigs: Record<ApprovalProtectedModule, ApprovalTargetConfig> = {
  purchases: {
    moduleKey: "purchases",
    table: "purchases",
    labelField: "purchase_no",
    href: "/purchases",
    title: "ซื้ออะไหล่",
    amountField: "total",
    statusField: "payment_status",
  },
  quotations: {
    moduleKey: "quotations",
    table: "quotations",
    labelField: "quotation_no",
    href: "/quotations",
    title: "ใบเสนอราคา",
    amountField: "total",
    statusField: "status",
  },
  invoices: {
    moduleKey: "invoices",
    table: "invoices",
    labelField: "invoice_no",
    href: "/invoices",
    title: "ใบแจ้งหนี้",
    amountField: "total",
    statusField: "payment_status",
  },
  receipts: {
    moduleKey: "receipts",
    table: "receipts",
    labelField: "receipt_no",
    href: "/receipts",
    title: "ใบเสร็จรับเงิน",
    amountField: "amount",
    statusField: "payment_method",
  },
};

const approvalTargetByTable = new Map(
  Object.values(approvalTargetConfigs).map((config) => [config.table, config]),
);

const emptySummary: Record<ApprovalStatus, number> = {
  pending: 0,
  approved: 0,
  rejected: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingApprovalTableError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || String(error?.message ?? "").includes("approval_requests");
}

function duplicatePendingApprovalMessage(error: { code?: string; message?: string } | null) {
  if (error?.code === "23505") return "มีคำขออนุมัติรายการนี้ค้างอยู่แล้ว";
  return null;
}

export function isApprovalProtectedModule(moduleKey: string): moduleKey is ApprovalProtectedModule {
  return moduleKey in approvalTargetConfigs;
}

export function getApprovalTargetPath(item: Pick<ApprovalRequestItem, "target_table" | "target_id">) {
  const config = approvalTargetByTable.get(item.target_table);
  if (!config) return "/";
  if (config.table === "purchases") return "/purchases";
  return `${config.href}/${item.target_id}`;
}

export function approvalTargetTitle(table: string) {
  return approvalTargetByTable.get(table as ApprovalTargetConfig["table"])?.title ?? table;
}

async function logApprovalActivity(
  supabase: SupabaseServerClient,
  profileId: string,
  action: string,
  tableName: string,
  recordId: string,
  metadata: Record<string, unknown>,
) {
  await supabase.from("activity_logs").insert({
    actor_id: profileId,
    action,
    table_name: tableName,
    record_id: recordId,
    metadata,
  });
}

async function getApprovalTargetInfo(
  supabase: SupabaseServerClient,
  moduleKey: ApprovalProtectedModule,
  id: string,
) {
  const targetConfig = approvalTargetConfigs[moduleKey];
  const { labelField, amountField, statusField } = targetConfig;
  const selectFields = `id,${labelField},${amountField},${statusField},deleted_at`;
  const { data, error } = await supabase
    .from(targetConfig.table)
    .select(selectFields)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "ไม่พบเอกสาร หรือเอกสารถูกลบไปแล้ว" };

  const row = data as unknown as Record<string, unknown>;
  return {
    ok: true as const,
    target: {
      label: String(row[labelField] ?? id),
      amount: row[amountField],
      status: row[statusField],
      table: targetConfig.table,
    },
  };
}

export async function createDeleteApprovalRequest({
  supabase,
  profile,
  moduleKey,
  id,
  reason,
}: {
  supabase: SupabaseServerClient;
  profile: Profile;
  moduleKey: ModuleKey;
  id: string;
  reason?: string;
}): Promise<ActionResult & { approvalId?: string }> {
  if (!isApprovalProtectedModule(moduleKey)) {
    return { ok: false, error: "โมดูลนี้ไม่ต้องขออนุมัติก่อนลบ" };
  }

  const cleanReason = String(reason ?? "").trim();
  if (cleanReason.length < 8) {
    return { ok: false, error: "กรุณาระบุเหตุผลการลบอย่างน้อย 8 ตัวอักษร" };
  }

  const targetInfo = await getApprovalTargetInfo(supabase, moduleKey, id);
  if (!targetInfo.ok) return { ok: false, error: targetInfo.error };

  const targetConfig = approvalTargetConfigs[moduleKey];
  const { data: existing, error: existingError } = await supabase
    .from("approval_requests")
    .select("id")
    .eq("target_table", targetConfig.table)
    .eq("target_id", id)
    .eq("action", "soft_delete")
    .eq("status", "pending")
    .maybeSingle();

  if (existingError) {
    if (isMissingApprovalTableError(existingError)) {
      return { ok: false, error: "ยังไม่พบตาราง approval_requests ให้รัน migration ล่าสุดก่อน" };
    }
    return { ok: false, error: existingError.message };
  }

  if (existing) {
    return { ok: true, message: "มีคำขออนุมัติรายการนี้ค้างอยู่แล้ว", approvalId: String(existing.id) };
  }

  const { data, error } = await supabase
    .from("approval_requests")
    .insert({
      request_type: "delete_document",
      action: "soft_delete",
      target_table: targetConfig.table,
      target_id: id,
      target_label: targetInfo.target.label,
      reason: cleanReason,
      status: "pending",
      requested_by: profile.id,
      metadata: {
        module_key: moduleKey,
        module_title: modules[moduleKey].title,
        amount: targetInfo.target.amount,
        current_status: targetInfo.target.status,
        requested_role: profile.role,
      },
    })
    .select("id")
    .single();

  if (error) {
    const duplicateMessage = duplicatePendingApprovalMessage(error);
    if (duplicateMessage) return { ok: true, message: duplicateMessage };
    if (isMissingApprovalTableError(error)) {
      return { ok: false, error: "ยังไม่พบตาราง approval_requests ให้รัน migration ล่าสุดก่อน" };
    }
    return { ok: false, error: error.message };
  }

  const approvalId = String(data.id);
  await logApprovalActivity(supabase, profile.id, "request_delete_approval", targetConfig.table, id, {
    approval_id: approvalId,
    reason: cleanReason,
    target_label: targetInfo.target.label,
  });

  return { ok: true, message: "ส่งคำขออนุมัติการลบแล้ว", approvalId };
}

export async function getPendingApprovalCount(supabase: SupabaseServerClient, profile: Profile) {
  let query = supabase
    .from("approval_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (profile.role !== "owner") query = query.eq("requested_by", profile.id);

  const { count, error } = await query;
  if (error) {
    if (!isMissingApprovalTableError(error)) console.error(error);
    return 0;
  }

  return count ?? 0;
}

async function fetchProfileSummaries(
  supabase: SupabaseServerClient,
  ids: string[],
): Promise<Map<string, ApprovalProfileSummary>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role")
    .in("id", uniqueIds);

  if (error) {
    console.error(error);
    return new Map();
  }

  return new Map(
    (data ?? []).map((profile) => [
      String(profile.id),
      {
        id: String(profile.id),
        email: profile.email as string | null,
        full_name: profile.full_name as string | null,
        role: profile.role as UserRole,
      },
    ]),
  );
}

export async function getApprovalPageData(
  supabase: SupabaseServerClient | null,
  profile: Profile,
): Promise<ApprovalPageData> {
  if (!supabase) {
    return { setupRequired: true, unavailable: false, approvals: [], summary: { ...emptySummary } };
  }

  let query = supabase.from("approval_requests").select("*").order("created_at", { ascending: false }).limit(300);
  if (profile.role !== "owner") query = query.eq("requested_by", profile.id);

  const { data, error } = await query;
  if (error) {
    if (!isMissingApprovalTableError(error)) console.error(error);
    return { setupRequired: false, unavailable: true, approvals: [], summary: { ...emptySummary } };
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const profileMap = await fetchProfileSummaries(
    supabase,
    rows.flatMap((row) => [String(row.requested_by ?? ""), String(row.reviewed_by ?? "")]),
  );

  const approvals: ApprovalRequestItem[] = rows.map((row) => {
    const requestedBy = String(row.requested_by);
    const reviewedBy = row.reviewed_by ? String(row.reviewed_by) : null;
    return {
      id: String(row.id),
      request_type: "delete_document",
      action: "soft_delete",
      target_table: row.target_table as ApprovalTargetConfig["table"],
      target_id: String(row.target_id),
      target_label: String(row.target_label ?? row.target_id),
      reason: String(row.reason ?? ""),
      status: row.status as ApprovalStatus,
      requested_by: requestedBy,
      reviewed_by: reviewedBy,
      reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
      review_note: row.review_note ? String(row.review_note) : null,
      metadata: isRecord(row.metadata) ? row.metadata : {},
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      requester: profileMap.get(requestedBy) ?? null,
      reviewer: reviewedBy ? (profileMap.get(reviewedBy) ?? null) : null,
    };
  });

  const summary = approvals.reduce(
    (counts, approval) => {
      counts[approval.status] += 1;
      return counts;
    },
    { ...emptySummary },
  );

  return { setupRequired: false, unavailable: false, approvals, summary };
}

async function fetchPendingApproval(
  supabase: SupabaseServerClient,
  approvalId: string,
): Promise<{ ok: true; approval: ApprovalRequestItem } | { ok: false; error: string; unavailable?: boolean }> {
  const { data, error } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("id", approvalId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    if (isMissingApprovalTableError(error)) {
      return { ok: false, error: "ยังไม่พบตาราง approval_requests ให้รัน migration ล่าสุดก่อน", unavailable: true };
    }
    return { ok: false, error: error.message };
  }

  if (!data) return { ok: false, error: "ไม่พบคำขออนุมัติที่รอดำเนินการ" };
  const row = data as unknown as Record<string, unknown>;
  return {
    ok: true,
    approval: {
      id: String(row.id),
      request_type: "delete_document",
      action: "soft_delete",
      target_table: row.target_table as ApprovalTargetConfig["table"],
      target_id: String(row.target_id),
      target_label: String(row.target_label ?? row.target_id),
      reason: String(row.reason ?? ""),
      status: row.status as ApprovalStatus,
      requested_by: String(row.requested_by),
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      metadata: isRecord(row.metadata) ? row.metadata : {},
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      requester: null,
      reviewer: null,
    },
  };
}

function assertOwner(profile: Profile): ActionResult | null {
  if (profile.role !== "owner") return { ok: false, error: "เฉพาะ Owner เท่านั้นที่อนุมัติคำขอได้" };
  return null;
}

function revalidateApprovalPaths() {
  revalidatePath("/");
  revalidatePath("/approvals");
  revalidatePath("/activity-logs");
}

export async function approveApprovalRequest({
  supabase,
  profile,
  approvalId,
  reviewNote,
}: {
  supabase: SupabaseServerClient;
  profile: Profile;
  approvalId: string;
  reviewNote?: string;
}): Promise<ActionResult> {
  const ownerError = assertOwner(profile);
  if (ownerError) return ownerError;

  const pending = await fetchPendingApproval(supabase, approvalId);
  if (!pending.ok) return { ok: false, error: pending.error };

  const approval = pending.approval;
  const targetConfig = approvalTargetByTable.get(approval.target_table);
  if (!targetConfig) return { ok: false, error: "ไม่รองรับเอกสารประเภทนี้" };

  const now = new Date().toISOString();
  const { data: updatedTarget, error: targetError } = await supabase
    .from(targetConfig.table)
    .update({ deleted_at: now })
    .eq("id", approval.target_id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (targetError) return { ok: false, error: targetError.message };
  if (!updatedTarget) return { ok: false, error: "เอกสารถูกลบไปแล้ว หรือไม่พบเอกสารต้นทาง" };

  const { error } = await supabase
    .from("approval_requests")
    .update({
      status: "approved",
      reviewed_by: profile.id,
      reviewed_at: now,
      review_note: String(reviewNote ?? "").trim() || null,
    })
    .eq("id", approval.id)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message };

  await logApprovalActivity(supabase, profile.id, "approve_delete_request", "approval_requests", approval.id, {
    target_table: approval.target_table,
    target_id: approval.target_id,
    target_label: approval.target_label,
  });
  await logApprovalActivity(supabase, profile.id, "soft_delete_approved", approval.target_table, approval.target_id, {
    approval_id: approval.id,
    target_label: approval.target_label,
  });

  revalidateApprovalPaths();
  revalidatePath(targetConfig.href);
  if (targetConfig.table !== "purchases") revalidatePath(`${targetConfig.href}/${approval.target_id}`);

  return { ok: true, message: "อนุมัติและลบเอกสารแล้ว" };
}

export async function rejectApprovalRequest({
  supabase,
  profile,
  approvalId,
  reviewNote,
}: {
  supabase: SupabaseServerClient;
  profile: Profile;
  approvalId: string;
  reviewNote?: string;
}): Promise<ActionResult> {
  const ownerError = assertOwner(profile);
  if (ownerError) return ownerError;

  const pending = await fetchPendingApproval(supabase, approvalId);
  if (!pending.ok) return { ok: false, error: pending.error };

  const approval = pending.approval;
  const now = new Date().toISOString();
  const note = String(reviewNote ?? "").trim();

  const { error } = await supabase
    .from("approval_requests")
    .update({
      status: "rejected",
      reviewed_by: profile.id,
      reviewed_at: now,
      review_note: note || null,
    })
    .eq("id", approval.id)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message };

  await logApprovalActivity(supabase, profile.id, "reject_delete_request", "approval_requests", approval.id, {
    target_table: approval.target_table,
    target_id: approval.target_id,
    target_label: approval.target_label,
    review_note: note || null,
  });

  revalidateApprovalPaths();
  return { ok: true, message: "ปฏิเสธคำขอแล้ว" };
}
