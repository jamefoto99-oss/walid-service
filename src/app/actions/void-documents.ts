"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
type VoidRpcResult = {
  message?: string;
  invoice_id?: string;
  receipt_id?: string;
  purchase_id?: string;
  repair_job_id?: string | null;
};

const voidSchema = z.object({
  id: z.string().uuid("ไม่พบเอกสาร"),
  reason: z.string().trim().min(8, "กรุณาระบุเหตุผลอย่างน้อย 8 ตัวอักษร"),
});

function refreshInvoicePaths(invoiceId?: string, receiptId?: string, repairJobId?: string | null) {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/income");
  revalidatePath("/invoices");
  revalidatePath("/receipts");
  revalidatePath("/parts");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  if (receiptId) revalidatePath(`/receipts/${receiptId}`);
  if (repairJobId) revalidatePath(`/repair-jobs/${repairJobId}`);
}

function refreshPurchasePaths(purchaseId?: string) {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/purchases");
  revalidatePath("/parts");
  revalidatePath("/expenses");
  revalidatePath("/suppliers");
  if (purchaseId) revalidatePath(`/purchases/${purchaseId}`);
}

function rpcResult(data: unknown): VoidRpcResult {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as VoidRpcResult) : {};
}

async function callVoidRpc(
  supabase: SupabaseServerClient,
  fn:
    | "void_receipt_transaction"
    | "void_invoice_transaction"
    | "void_purchase_transaction",
  params: Record<string, string>,
): Promise<VoidRpcResult> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw new Error(error.message);
  return rpcResult(data);
}

export async function voidReceipt(input: unknown): Promise<ActionResult> {
  try {
    await requireModuleAccess("receipts", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = voidSchema.parse(input);
    const result = await callVoidRpc(supabase, "void_receipt_transaction", {
      p_receipt_id: payload.id,
      p_reason: payload.reason,
    });

    refreshInvoicePaths(result.invoice_id, result.receipt_id, result.repair_job_id);
    return { ok: true, message: result.message ?? "ยกเลิกใบเสร็จและคืนยอดใบแจ้งหนี้แล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ยกเลิกใบเสร็จไม่สำเร็จ" };
  }
}

export async function voidInvoice(input: unknown): Promise<ActionResult> {
  try {
    await requireModuleAccess("invoices", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = voidSchema.parse(input);
    const result = await callVoidRpc(supabase, "void_invoice_transaction", {
      p_invoice_id: payload.id,
      p_reason: payload.reason,
    });

    refreshInvoicePaths(result.invoice_id, undefined, result.repair_job_id);
    return { ok: true, message: result.message ?? "ยกเลิกใบแจ้งหนี้และคืนสต๊อกแล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ยกเลิกใบแจ้งหนี้ไม่สำเร็จ" };
  }
}

export async function voidPurchase(input: unknown): Promise<ActionResult> {
  try {
    await requireModuleAccess("purchases", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = voidSchema.parse(input);
    const result = await callVoidRpc(supabase, "void_purchase_transaction", {
      p_purchase_id: payload.id,
      p_reason: payload.reason,
    });

    refreshPurchasePaths(result.purchase_id);
    return { ok: true, message: result.message ?? "ยกเลิกใบซื้อและกลับสต๊อกแล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ยกเลิกใบซื้อไม่สำเร็จ" };
  }
}
