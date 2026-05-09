"use server";

import { revalidatePath } from "next/cache";
import { createDeleteApprovalRequest, isApprovalProtectedModule } from "@/lib/approvals";
import { modules } from "@/lib/constants";
import { documentNoField, nextDocumentNumber } from "@/lib/documents";
import { requireModuleAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult, LineItemInput, ModuleKey, RecordInput } from "@/lib/types";
import { parseLineItems, sumLineItems, validateModuleInput } from "@/lib/validation";
import { toNumber } from "@/lib/utils";

async function logActivity(action: string, tableName: string, recordId: string, payload: unknown) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("activity_logs").insert({
    actor_id: user?.id ?? null,
    action,
    table_name: tableName,
    record_id: recordId,
    metadata: payload,
  });
}

async function createLineItems(
  moduleKey: ModuleKey,
  documentId: string,
  items: LineItemInput[],
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured");
  if (!items.length) return;

  if (moduleKey === "quotations") {
    await supabase.from("quotation_items").insert(
      items.map((item, index) => ({
        quotation_id: documentId,
        item_type: item.item_type,
        part_id: item.part_id || null,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        total: item.quantity * item.unit_price - item.discount,
        sort_order: index + 1,
      })),
    );
  }

  if (moduleKey === "invoices") {
    await supabase.from("invoice_items").insert(
      items.map((item, index) => ({
        invoice_id: documentId,
        item_type: item.item_type,
        part_id: item.part_id || null,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        total: item.quantity * item.unit_price - item.discount,
        sort_order: index + 1,
      })),
    );

    for (const item of items.filter((entry) => entry.item_type === "part" && entry.part_id)) {
      const { data: part } = await supabase
        .from("parts")
        .select("quantity_on_hand,name")
        .eq("id", item.part_id!)
        .maybeSingle();
      if (!part) throw new Error(`ไม่พบอะไหล่ ${item.description}`);
      if (toNumber(part.quantity_on_hand) < item.quantity) {
        throw new Error(`สต๊อก ${part.name} ไม่พอสำหรับตัดใช้`);
      }

      await supabase
        .from("parts")
        .update({ quantity_on_hand: toNumber(part.quantity_on_hand) - item.quantity })
        .eq("id", item.part_id!);
      await supabase.from("stock_movements").insert({
        part_id: item.part_id,
        movement_type: "use",
        quantity: -item.quantity,
        unit_cost: item.unit_price,
        reference_type: "invoice",
        reference_id: documentId,
        notes: `ตัดสต๊อกจากใบแจ้งหนี้ ${documentId}`,
      });
    }
  }
}

async function createReceipt(payload: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

  const amount = toNumber(payload.amount);
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id,invoice_no,total,paid_amount,balance_due,payment_status,repair_job_id,customer_id")
    .eq("id", String(payload.invoice_id))
    .maybeSingle();

  if (invoiceError || !invoice) return { ok: false, error: "ไม่พบใบแจ้งหนี้ที่เลือก" };
  if (amount > toNumber(invoice.balance_due)) return { ok: false, error: "ยอดรับชำระมากกว่ายอดค้าง" };

  const receiptNo = await nextDocumentNumber("RC");
  const { data: receipt, error } = await supabase
    .from("receipts")
    .insert({ ...payload, customer_id: invoice.customer_id, receipt_no: receiptNo })
    .select("id,receipt_no")
    .single();
  if (error) return { ok: false, error: error.message };

  const paidAmount = toNumber(invoice.paid_amount) + amount;
  const balanceDue = Math.max(toNumber(invoice.total) - paidAmount, 0);
  const paymentStatus = balanceDue <= 0 ? "paid" : "partial";

  await Promise.all([
    supabase.from("payment_records").insert({
      invoice_id: invoice.id,
      receipt_id: receipt.id,
      paid_at: payload.received_at,
      amount,
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
      amount,
      payment_method: payload.payment_method,
      reference_no: receipt.receipt_no,
      receipt_id: receipt.id,
    }),
  ]);

  if (paymentStatus === "paid" && invoice.repair_job_id) {
    await supabase.from("repair_jobs").update({ status: "delivered" }).eq("id", invoice.repair_job_id);
  }

  await logActivity("create_receipt", "receipts", receipt.id, payload);
  revalidatePath("/");
  return { ok: true, message: `ออกใบเสร็จ ${receipt.receipt_no} แล้ว` };
}

export async function createRecord(moduleKey: ModuleKey, input: RecordInput): Promise<ActionResult> {
  try {
    await requireModuleAccess(moduleKey, "write");
    const config = modules[moduleKey];
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = validateModuleInput(moduleKey, input, { applyDefaults: true });

    if (moduleKey === "receipts") return createReceipt(payload);

    const documentField = documentNoField(config.table);
    if (config.numberPrefix && documentField) {
      payload[documentField] = await nextDocumentNumber(config.numberPrefix);
    }

    if (moduleKey === "quotations" || moduleKey === "invoices") {
      const items = parseLineItems(payload.items);
      const discount = toNumber(payload.discount);
      const { subtotal, total } = sumLineItems(items, discount);
      delete payload.items;
      payload.subtotal = subtotal;
      payload.discount = discount;
      payload.total = total;
      if (moduleKey === "invoices") {
        payload.paid_amount = 0;
        payload.balance_due = total;
      }

      const { data, error } = await supabase.from(config.table).insert(payload).select("id").single();
      if (error) return { ok: false, error: error.message };
      await createLineItems(moduleKey, data.id, items);
      await logActivity("create", config.table, data.id, payload);
      revalidatePath("/");
      return { ok: true, message: "บันทึกเอกสารเรียบร้อย" };
    }

    const { data, error } = await supabase.from(config.table).insert(payload).select("id").single();
    if (error) return { ok: false, error: error.message };
    await logActivity("create", config.table, data.id, payload);
    revalidatePath("/");
    return { ok: true, message: "บันทึกข้อมูลเรียบร้อย" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}

export async function updateRecord(moduleKey: ModuleKey, id: string, input: RecordInput): Promise<ActionResult> {
  try {
    await requireModuleAccess(moduleKey, "write");
    const config = modules[moduleKey];
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = validateModuleInput(moduleKey, input);
    delete payload.items;

    const { error } = await supabase.from(config.table).update(payload).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await logActivity("update", config.table, id, payload);
    revalidatePath("/");
    return { ok: true, message: "อัปเดตข้อมูลเรียบร้อย" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}

export async function deleteRecord(moduleKey: ModuleKey, id: string, reason?: string): Promise<ActionResult> {
  try {
    const session = await requireModuleAccess(moduleKey, "delete");
    const config = modules[moduleKey];
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    if (isApprovalProtectedModule(moduleKey)) {
      if (session.setupRequired || !session.profile) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
      const result = await createDeleteApprovalRequest({
        supabase,
        profile: session.profile,
        moduleKey,
        id,
        reason,
      });

      if (result.ok) {
        revalidatePath("/");
        revalidatePath("/approvals");
        revalidatePath(`/${moduleKey}`);
      }

      return result;
    }

    const query =
      config.table === "profiles"
        ? supabase.from(config.table).update({ is_active: false }).eq("id", id)
        : supabase.from(config.table).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    const { error } = await query;
    if (error) return { ok: false, error: error.message };

    await logActivity("soft_delete", config.table, id, {});
    revalidatePath("/");
    return { ok: true, message: "ลบข้อมูลเรียบร้อย" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}
