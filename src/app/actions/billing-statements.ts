"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth";
import { nextDocumentNumber } from "@/lib/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { toNumber } from "@/lib/utils";

const billingStatementSchema = z.object({
  customer_id: z.string().uuid("กรุณาเลือกลูกค้า"),
  issued_at: z.string().trim().min(1, "กรุณาระบุวันที่ออกเอกสาร"),
  due_at: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  show_payment_info: z.boolean().default(false),
  show_paid_stamp: z.boolean().default(false),
});

async function currentActorId() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function createBillingStatement(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireModuleAccess("billing-statements", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = billingStatementSchema.parse({
      customer_id: formData.get("customer_id"),
      issued_at: formData.get("issued_at"),
      due_at: formData.get("due_at") || null,
      notes: formData.get("notes") || null,
      show_payment_info: formData.get("show_payment_info") === "on",
      show_paid_stamp: formData.get("show_paid_stamp") === "on",
    });

    const invoiceIds = Array.from(
      new Set(
        formData
          .getAll("invoice_ids")
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    );

    if (!invoiceIds.length) return { ok: false, error: "กรุณาเลือกใบแจ้งหนี้อย่างน้อย 1 รายการ" };

    const { data: invoices, error: invoiceError } = await supabase
      .from("invoices")
      .select("id,invoice_no,issued_at,due_at,customer_id,total,paid_amount,balance_due,payment_status,deleted_at,voided_at")
      .in("id", invoiceIds);

    if (invoiceError) return { ok: false, error: invoiceError.message };
    const invoiceRows = invoices ?? [];
    if (invoiceRows.length !== invoiceIds.length) return { ok: false, error: "พบใบแจ้งหนี้ไม่ครบตามที่เลือก" };

    const orderedInvoices = [...invoiceRows].sort(
      (a, b) => invoiceIds.indexOf(String(a.id)) - invoiceIds.indexOf(String(b.id)),
    );

    for (const invoice of orderedInvoices) {
      if (String(invoice.customer_id) !== payload.customer_id) {
        return { ok: false, error: "ใบแจ้งหนี้ที่เลือกต้องเป็นของลูกค้าคนเดียวกันทั้งหมด" };
      }
      if (invoice.deleted_at || invoice.voided_at || invoice.payment_status === "cancelled") {
        return { ok: false, error: `ใบแจ้งหนี้ ${invoice.invoice_no} ถูกยกเลิกหรือไม่พร้อมวางบิล` };
      }
      if (toNumber(invoice.balance_due) <= 0) {
        return { ok: false, error: `ใบแจ้งหนี้ ${invoice.invoice_no} ไม่มียอดค้างชำระ` };
      }
    }

    const total = orderedInvoices.reduce((sum, invoice) => sum + toNumber(invoice.balance_due), 0);
    const billingStatementNo = await nextDocumentNumber("BS");
    const actor = await currentActorId();

    const { data: statement, error } = await supabase
      .from("billing_statements")
      .insert({
        billing_statement_no: billingStatementNo,
        issued_at: payload.issued_at,
        due_at: payload.due_at || null,
        customer_id: payload.customer_id,
        subtotal: total,
        discount: 0,
        total,
        status: "issued",
        notes: payload.notes || null,
        show_payment_info: payload.show_payment_info,
        show_paid_stamp: payload.show_paid_stamp,
        created_by: actor,
      })
      .select("id,billing_statement_no")
      .single();

    if (error) return { ok: false, error: error.message };

    const { error: itemError } = await supabase.from("billing_statement_items").insert(
      orderedInvoices.map((invoice, index) => ({
        billing_statement_id: statement.id,
        invoice_id: invoice.id,
        invoice_no: invoice.invoice_no,
        issued_at: invoice.issued_at,
        due_at: invoice.due_at,
        total: toNumber(invoice.total),
        paid_amount: toNumber(invoice.paid_amount),
        balance_due: toNumber(invoice.balance_due),
        sort_order: index + 1,
      })),
    );

    if (itemError) return { ok: false, error: itemError.message };

    await supabase.from("activity_logs").insert({
      actor_id: actor,
      action: "create_billing_statement",
      table_name: "billing_statements",
      record_id: statement.id,
      metadata: {
        billing_statement_no: statement.billing_statement_no,
        invoice_ids: invoiceIds,
        total,
      },
    });

    revalidatePath("/");
    revalidatePath("/billing-statements");
    revalidatePath(`/print/billing-statements/${statement.id}`);

    return { ok: true, message: `สร้างใบวางบิล ${statement.billing_statement_no} เรียบร้อย` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "สร้างใบวางบิลไม่สำเร็จ" };
  }
}
