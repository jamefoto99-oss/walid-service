"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth";
import { nextDocumentNumber } from "@/lib/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { toNumber } from "@/lib/utils";

const paymentSchema = z.object({
  invoice_id: z.string().uuid("ไม่พบใบแจ้งหนี้"),
  received_at: z.string().min(1, "กรุณาระบุวันที่รับเงิน"),
  amount: z.coerce.number().min(0.01, "ยอดรับชำระต้องมากกว่า 0"),
  payment_method: z.enum(["cash", "transfer", "qr", "other"]).default("transfer"),
  notes: z.string().trim().optional().nullable(),
});

function refreshInvoiceFlow(invoiceId: string, receiptId?: string, repairJobId?: string | null) {
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/receipts");
  revalidatePath("/income");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  if (receiptId) revalidatePath(`/receipts/${receiptId}`);
  if (receiptId) revalidatePath(`/print/receipts/${receiptId}`);
  if (repairJobId) revalidatePath(`/repair-jobs/${repairJobId}`);
}

export async function receiveInvoicePayment(input: unknown): Promise<ActionResult & { receiptId?: string }> {
  try {
    await requireModuleAccess("receipts", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = paymentSchema.parse(input);
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id,invoice_no,total,paid_amount,balance_due,payment_status,repair_job_id,customer_id")
      .eq("id", payload.invoice_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (invoiceError || !invoice) return { ok: false, error: "ไม่พบใบแจ้งหนี้ที่เลือก" };
    if (String(invoice.payment_status) === "cancelled") return { ok: false, error: "ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว" };
    if (toNumber(invoice.balance_due) <= 0) return { ok: false, error: "ใบแจ้งหนี้นี้ชำระครบแล้ว" };
    if (payload.amount > toNumber(invoice.balance_due)) {
      return { ok: false, error: "ยอดรับชำระมากกว่ายอดค้าง" };
    }

    const receiptNo = await nextDocumentNumber("RC");
    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .insert({
        receipt_no: receiptNo,
        received_at: payload.received_at,
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        payment_method: payload.payment_method,
        amount: payload.amount,
        notes: payload.notes ?? null,
      })
      .select("id,receipt_no")
      .single();

    if (receiptError || !receipt) return { ok: false, error: receiptError?.message ?? "ออกใบเสร็จไม่สำเร็จ" };

    const paidAmount = toNumber(invoice.paid_amount) + payload.amount;
    const balanceDue = Math.max(toNumber(invoice.total) - paidAmount, 0);
    const paymentStatus = balanceDue <= 0 ? "paid" : "partial";

    const [paymentResult, invoiceResult, incomeResult] = await Promise.all([
      supabase.from("payment_records").insert({
        invoice_id: invoice.id,
        receipt_id: receipt.id,
        paid_at: payload.received_at,
        amount: payload.amount,
        payment_method: payload.payment_method,
        notes: payload.notes ?? null,
      }),
      supabase
        .from("invoices")
        .update({ paid_amount: paidAmount, balance_due: balanceDue, payment_status: paymentStatus })
        .eq("id", invoice.id),
      supabase.from("income_records").insert({
        recorded_at: payload.received_at,
        category: "repair_service",
        description: `รับชำระ ${invoice.invoice_no}`,
        amount: payload.amount,
        payment_method: payload.payment_method,
        reference_no: receipt.receipt_no,
        receipt_id: receipt.id,
      }),
    ]);

    const mutationError = paymentResult.error ?? invoiceResult.error ?? incomeResult.error;
    if (mutationError) return { ok: false, error: mutationError.message };

    if (paymentStatus === "paid" && invoice.repair_job_id) {
      await supabase.from("repair_jobs").update({ status: "delivered" }).eq("id", invoice.repair_job_id);
    }

    const actorId = (await supabase.auth.getUser()).data.user?.id ?? null;
    await supabase.from("activity_logs").insert([
      {
        actor_id: actorId,
        action: "receive_invoice_payment",
        table_name: "invoices",
        record_id: invoice.id,
        metadata: {
          receipt_id: receipt.id,
          receipt_no: receipt.receipt_no,
          amount: payload.amount,
          payment_method: payload.payment_method,
          balance_due: balanceDue,
        },
      },
      {
        actor_id: actorId,
        action: "create_receipt",
        table_name: "receipts",
        record_id: receipt.id,
        metadata: {
          invoice_id: invoice.id,
          invoice_no: invoice.invoice_no,
          receipt_no: receipt.receipt_no,
          amount: payload.amount,
          payment_method: payload.payment_method,
        },
      },
    ]);

    refreshInvoiceFlow(invoice.id, receipt.id, invoice.repair_job_id);
    return {
      ok: true,
      message: `รับชำระและออกใบเสร็จ ${receipt.receipt_no} แล้ว`,
      receiptId: receipt.id,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "รับชำระไม่สำเร็จ" };
  }
}
