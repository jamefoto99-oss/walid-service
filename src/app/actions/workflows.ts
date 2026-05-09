"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth";
import { nextDocumentNumber } from "@/lib/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
type QuotationStatus = "draft" | "sent" | "approved" | "rejected" | "cancelled";

const quotationStatuses: QuotationStatus[] = ["draft", "sent", "approved", "rejected", "cancelled"];

function revalidateQuotationFlow(quotationId: string, repairJobId?: unknown, invoiceId?: unknown) {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/invoices");
  revalidatePath("/reports");

  if (repairJobId) revalidatePath(`/repair-jobs/${repairJobId}`);
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
}

async function currentActorId(supabase: SupabaseServerClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function logActivity(
  supabase: SupabaseServerClient,
  action: string,
  tableName: string,
  recordId: string,
  metadata: Record<string, unknown> = {},
) {
  const actorId = await currentActorId(supabase);
  await supabase.from("activity_logs").insert({
    actor_id: actorId,
    action,
    table_name: tableName,
    record_id: recordId,
    metadata,
  });
}

export async function updateQuotationStatus(
  quotationId: string,
  status: QuotationStatus,
): Promise<ActionResult> {
  try {
    await requireModuleAccess("quotations", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    if (!quotationStatuses.includes(status)) {
      return { ok: false, error: "สถานะใบเสนอราคาไม่ถูกต้อง" };
    }

    const { data: quotation, error } = await supabase
      .from("quotations")
      .select("id,quotation_no,status,repair_job_id")
      .eq("id", quotationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !quotation) return { ok: false, error: "ไม่พบใบเสนอราคา" };

    const { error: updateError } = await supabase
      .from("quotations")
      .update({ status })
      .eq("id", quotationId);

    if (updateError) return { ok: false, error: updateError.message };

    if (status === "approved" && quotation.repair_job_id) {
      await supabase
        .from("repair_jobs")
        .update({ status: "in_progress" })
        .eq("id", quotation.repair_job_id);
    }

    await logActivity(supabase, "update_quotation_status", "quotations", quotationId, {
      from: quotation.status,
      to: status,
      quotation_no: quotation.quotation_no,
    });

    revalidateQuotationFlow(quotationId, quotation.repair_job_id);

    return { ok: true, message: "อัปเดตสถานะใบเสนอราคาเรียบร้อย" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}

export async function approveQuotation(quotationId: string): Promise<ActionResult> {
  return updateQuotationStatus(quotationId, "approved");
}

export async function convertQuotationToInvoice(quotationId: string): Promise<ActionResult> {
  try {
    await requireModuleAccess("invoices", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const [{ data: quotation }, { data: items }, { data: existingInvoice }] = await Promise.all([
      supabase
        .from("quotations")
        .select("*")
        .eq("id", quotationId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase.from("quotation_items").select("*").eq("quotation_id", quotationId).order("sort_order"),
      supabase
        .from("invoices")
        .select("id,invoice_no")
        .eq("quotation_id", quotationId)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
    ]);

    if (!quotation) return { ok: false, error: "ไม่พบใบเสนอราคา" };
    if (existingInvoice) {
      return { ok: false, error: `ใบเสนอราคานี้แปลงเป็นใบแจ้งหนี้ ${existingInvoice.invoice_no} แล้ว` };
    }
    if (quotation.status !== "approved") {
      return { ok: false, error: "ต้องอนุมัติใบเสนอราคาก่อนแปลงเป็นใบแจ้งหนี้" };
    }
    if (!(items ?? []).length) {
      return { ok: false, error: "ใบเสนอราคานี้ยังไม่มีรายการ" };
    }

    for (const item of (items ?? []).filter((entry) => entry.item_type === "part" && entry.part_id)) {
      const { data: part } = await supabase
        .from("parts")
        .select("quantity_on_hand,name")
        .eq("id", item.part_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!part) return { ok: false, error: `ไม่พบอะไหล่ ${item.description}` };
      if (Number(part.quantity_on_hand ?? 0) < Number(item.quantity ?? 0)) {
        return { ok: false, error: `สต๊อก ${part.name} ไม่พอสำหรับตัดใช้` };
      }
    }

    const invoiceNo = await nextDocumentNumber("INV");
    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        invoice_no: invoiceNo,
        quotation_id: quotation.id,
        issued_at: new Date().toISOString().slice(0, 10),
        due_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        customer_id: quotation.customer_id,
        vehicle_id: quotation.vehicle_id,
        repair_job_id: quotation.repair_job_id,
        subtotal: quotation.subtotal,
        discount: quotation.discount,
        total: quotation.total,
        paid_amount: 0,
        balance_due: quotation.total,
        payment_status: "unpaid",
        notes: quotation.notes,
      })
      .select("id,invoice_no")
      .single();

    if (error) return { ok: false, error: error.message };

    const { error: itemError } = await supabase.from("invoice_items").insert(
      (items ?? []).map((item) => ({
        invoice_id: invoice.id,
        item_type: item.item_type,
        part_id: item.part_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        total: item.total,
        sort_order: item.sort_order,
      })),
    );

    if (itemError) return { ok: false, error: itemError.message };

    for (const item of (items ?? []).filter((entry) => entry.item_type === "part" && entry.part_id)) {
      const { data: part } = await supabase
        .from("parts")
        .select("quantity_on_hand,name")
        .eq("id", item.part_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!part) return { ok: false, error: `ไม่พบอะไหล่ ${item.description}` };
      if (Number(part.quantity_on_hand ?? 0) < Number(item.quantity ?? 0)) {
        return { ok: false, error: `สต๊อก ${part.name} ไม่พอสำหรับตัดใช้` };
      }

      await supabase
        .from("parts")
        .update({ quantity_on_hand: Number(part.quantity_on_hand ?? 0) - Number(item.quantity ?? 0) })
        .eq("id", item.part_id);

      await supabase.from("stock_movements").insert({
        part_id: item.part_id,
        movement_type: "use",
        quantity: -Number(item.quantity ?? 0),
        unit_cost: item.unit_price,
        reference_type: "invoice",
        reference_id: invoice.id,
        notes: `ตัดสต๊อกจากใบแจ้งหนี้ ${invoice.invoice_no}`,
      });
    }

    if (quotation.repair_job_id) {
      await supabase
        .from("repair_jobs")
        .update({ status: "waiting_payment" })
        .eq("id", quotation.repair_job_id);
    }

    await logActivity(supabase, "convert_quotation_to_invoice", "quotations", quotation.id, {
      quotation_no: quotation.quotation_no,
      invoice_id: invoice.id,
      invoice_no: invoice.invoice_no,
    });

    revalidateQuotationFlow(quotation.id, quotation.repair_job_id, invoice.id);

    return { ok: true, message: `แปลงเป็นใบแจ้งหนี้ ${invoice.invoice_no} แล้ว` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}
