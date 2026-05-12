"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth";
import { nextDocumentNumber } from "@/lib/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { toNumber } from "@/lib/utils";

const laborItemSchema = z.object({
  title: z.string().trim().min(1, "กรุณาระบุชื่องานซ่อม"),
  description: z.string().trim().optional().nullable(),
  labor_price: z.coerce.number().min(0, "ค่าแรงต้องไม่ติดลบ"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  discount: z.coerce.number().min(0, "ส่วนลดต้องไม่ติดลบ").default(0),
});

const partUsageSchema = z.object({
  part_id: z.string().uuid("กรุณาเลือกอะไหล่"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  discount: z.coerce.number().min(0, "ส่วนลดต้องไม่ติดลบ").default(0),
});

const imagePathSchema = z
  .string()
  .trim()
  .min(1, "ไม่พบ path รูปภาพ")
  .refine((value) => value.startsWith("repair-jobs/"), "path รูปภาพไม่ถูกต้อง");

const instantBillingSchema = z.object({
  document_type: z.enum(["receipt", "cash_bill"]),
  payment_method: z.enum(["cash", "transfer", "qr", "other"]).default("cash"),
  discount: z.coerce.number().min(0, "ส่วนลดต้องไม่ติดลบ").default(0),
  show_payment_info: z.preprocess(
    (value) => value === true || value === "true" || value === "on" || value === "1",
    z.boolean(),
  ).default(false),
  show_paid_stamp: z.preprocess(
    (value) => value === true || value === "true" || value === "on" || value === "1",
    z.boolean(),
  ).default(true),
  notes: z.string().trim().optional().nullable(),
});

type InstantBillingResult = ActionResult & {
  documentId?: string;
  documentNo?: string;
  documentType?: "receipts" | "cash-bills";
  href?: string;
};

async function logRepairActivity(jobId: string, action: string, metadata: Record<string, unknown>) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("activity_logs").insert({
    actor_id: user?.id ?? null,
    action,
    table_name: "repair_jobs",
    record_id: jobId,
    metadata,
  });
}

async function recalculateRepairJobTotal(jobId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  const { data } = await supabase
    .from("repair_job_items")
    .select("total")
    .eq("repair_job_id", jobId)
    .is("deleted_at", null);
  const estimatedTotal = (data ?? []).reduce((sum, item) => sum + toNumber(item.total), 0);
  await supabase.from("repair_jobs").update({ estimated_total: estimatedTotal }).eq("id", jobId);
}

function refreshRepairJob(jobId: string) {
  revalidatePath(`/repair-jobs/${jobId}`);
  revalidatePath("/repair-jobs");
  revalidatePath("/dashboard");
}

function repairItemDescription(item: Record<string, unknown>) {
  return [item.title, item.description].filter(Boolean).join(" - ") || "รายการซ่อม";
}

function itemTypeFromRepairTitle(title: unknown) {
  return String(title ?? "").startsWith("อะไหล่:") ? "part" : "labor";
}

function vehicleLabel(vehicle: Record<string, unknown> | null) {
  if (!vehicle) return null;
  return [vehicle.license_plate, vehicle.province, vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(" ") || null;
}

function refreshInstantBilling(jobId: string, documentType: "receipts" | "cash-bills", documentId: string) {
  refreshRepairJob(jobId);
  revalidatePath(`/${documentType}`);
  revalidatePath(`/${documentType}/${documentId}`);
  revalidatePath(`/print/${documentType}/${documentId}`);
  revalidatePath("/income");
  revalidatePath("/reports");
}

export async function updateRepairJobStatus(
  jobId: string,
  payload: { status: string; internal_notes?: string },
): Promise<ActionResult> {
  try {
    await requireModuleAccess("repair-jobs", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const { error } = await supabase
      .from("repair_jobs")
      .update({ status: payload.status, internal_notes: payload.internal_notes ?? null })
      .eq("id", jobId);
    if (error) return { ok: false, error: error.message };

    await logRepairActivity(jobId, "update_status", {
      status: payload.status,
      internal_notes: payload.internal_notes ?? null,
    });
    refreshRepairJob(jobId);
    return { ok: true, message: "อัปเดตสถานะงานซ่อมแล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}

export async function addRepairJobLaborItem(jobId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireModuleAccess("repair-jobs", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
    const payload = laborItemSchema.parse(input);

    const { data, error } = await supabase
      .from("repair_job_items")
      .insert({ repair_job_id: jobId, ...payload })
      .select("id,title,total")
      .single();
    if (error) return { ok: false, error: error.message };

    await recalculateRepairJobTotal(jobId);
    await logRepairActivity(jobId, "add_labor_item", data);
    refreshRepairJob(jobId);
    return { ok: true, message: "เพิ่มรายการซ่อมแล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}

export async function consumeRepairJobPart(jobId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireModuleAccess("parts", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
    const payload = partUsageSchema.parse(input);

    const { data: part, error: partError } = await supabase
      .from("parts")
      .select("id,part_code,name,sale_price,quantity_on_hand,unit")
      .eq("id", payload.part_id)
      .maybeSingle();
    if (partError || !part) return { ok: false, error: "ไม่พบอะไหล่ที่เลือก" };
    if (toNumber(part.quantity_on_hand) < payload.quantity) {
      return { ok: false, error: `สต๊อก ${part.name} ไม่พอ เหลือ ${part.quantity_on_hand} ${part.unit}` };
    }

    const nextQuantity = toNumber(part.quantity_on_hand) - payload.quantity;
    const itemTitle = `อะไหล่: ${part.name}`;
    const itemDescription = `${part.part_code} เบิกใช้ ${payload.quantity} ${part.unit}`;
    const unitPrice = toNumber(part.sale_price);

    const { data: item, error } = await supabase
      .from("repair_job_items")
      .insert({
        repair_job_id: jobId,
        title: itemTitle,
        description: itemDescription,
        labor_price: unitPrice,
        quantity: payload.quantity,
        discount: payload.discount,
      })
      .select("id,title,total")
      .single();
    if (error) return { ok: false, error: error.message };

    await supabase.from("parts").update({ quantity_on_hand: nextQuantity }).eq("id", payload.part_id);
    await supabase.from("stock_movements").insert({
      part_id: payload.part_id,
      movement_type: "use",
      quantity: -payload.quantity,
      unit_cost: unitPrice,
      reference_type: "repair_job",
      reference_id: jobId,
      notes: `เบิกใช้ในงานซ่อม ${jobId}`,
    });

    await recalculateRepairJobTotal(jobId);
    await logRepairActivity(jobId, "use_part", {
      part_id: payload.part_id,
      part_name: part.name,
      quantity: payload.quantity,
      item_id: item.id,
    });
    refreshRepairJob(jobId);
    return { ok: true, message: "เบิกอะไหล่และตัดสต๊อกแล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}

export async function addRepairJobNote(jobId: string, note: string): Promise<ActionResult> {
  try {
    await requireModuleAccess("repair-jobs", "write");
    const cleanNote = note.trim();
    if (!cleanNote) return { ok: false, error: "กรุณากรอกหมายเหตุ" };
    await logRepairActivity(jobId, "internal_note", { note: cleanNote });
    refreshRepairJob(jobId);
    return { ok: true, message: "เพิ่มหมายเหตุใน timeline แล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}

export async function createQuotationFromRepairJob(jobId: string): Promise<ActionResult> {
  try {
    await requireModuleAccess("quotations", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const [{ data: job }, { data: items }] = await Promise.all([
      supabase.from("repair_jobs").select("*").eq("id", jobId).maybeSingle(),
      supabase
        .from("repair_job_items")
        .select("*")
        .eq("repair_job_id", jobId)
        .is("deleted_at", null)
        .order("created_at"),
    ]);
    if (!job) return { ok: false, error: "ไม่พบงานซ่อม" };
    if (!items?.length) return { ok: false, error: "กรุณาเพิ่มรายการซ่อมหรืออะไหล่ก่อนสร้างใบเสนอราคา" };

    const subtotal = items.reduce((sum, item) => sum + toNumber(item.total), 0);
    const quotationNo = await nextDocumentNumber("QT");
    const { data: quotation, error } = await supabase
      .from("quotations")
      .insert({
        quotation_no: quotationNo,
        issued_at: new Date().toISOString().slice(0, 10),
        customer_id: job.customer_id,
        vehicle_id: job.vehicle_id,
        repair_job_id: jobId,
        subtotal,
        discount: 0,
        total: subtotal,
        status: "draft",
        notes: `สร้างจากงานซ่อม ${job.job_number}`,
        terms: "ใบเสนอราคามีผล 7 วัน",
      })
      .select("id,quotation_no")
      .single();
    if (error) return { ok: false, error: error.message };

    await supabase.from("quotation_items").insert(
      items.map((item, index) => ({
        quotation_id: quotation.id,
        item_type: String(item.title ?? "").startsWith("อะไหล่:") ? "part" : "labor",
        description: [item.title, item.description].filter(Boolean).join(" - "),
        quantity: item.quantity,
        unit: "ชิ้น",
        unit_price: item.labor_price,
        discount: item.discount,
        total: item.total,
        sort_order: index + 1,
      })),
    );

    await supabase.from("repair_jobs").update({ status: "quoted", estimated_total: subtotal }).eq("id", jobId);
    await logRepairActivity(jobId, "create_quotation", {
      quotation_id: quotation.id,
      quotation_no: quotation.quotation_no,
      total: subtotal,
    });
    refreshRepairJob(jobId);
    revalidatePath("/quotations");
    return { ok: true, message: `สร้างใบเสนอราคา ${quotation.quotation_no} แล้ว` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}

export async function createInstantRepairJobBill(jobId: string, input: unknown): Promise<InstantBillingResult> {
  try {
    await requireModuleAccess("receipts", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = instantBillingSchema.parse(input);
    const [{ data: job }, { data: items }, { data: customer }, { data: vehicle }] = await Promise.all([
      supabase.from("repair_jobs").select("*").eq("id", jobId).is("deleted_at", null).maybeSingle(),
      supabase
        .from("repair_job_items")
        .select("*")
        .eq("repair_job_id", jobId)
        .is("deleted_at", null)
        .order("created_at"),
      supabase
        .from("repair_jobs")
        .select("customers(full_name,phone,address)")
        .eq("id", jobId)
        .maybeSingle()
        .then((result) => ({ data: (result.data?.customers ?? null) as Record<string, unknown> | null })),
      supabase
        .from("repair_jobs")
        .select("vehicles(license_plate,province,brand,model,color)")
        .eq("id", jobId)
        .maybeSingle()
        .then((result) => ({ data: (result.data?.vehicles ?? null) as Record<string, unknown> | null })),
    ]);

    if (!job) return { ok: false, error: "ไม่พบงานซ่อม" };
    if (!items?.length) return { ok: false, error: "กรุณาเพิ่มรายการซ่อมก่อนเปิดบิลทันที" };

    const actorId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const subtotal = items.reduce((sum, item) => sum + toNumber(item.total), 0);
    const total = Math.max(subtotal - payload.discount, 0);
    if (total <= 0) return { ok: false, error: "ยอดสุทธิต้องมากกว่า 0" };

    const today = new Date().toISOString().slice(0, 10);
    const noteText = payload.notes || `สร้างจากงานซ่อม ${job.job_number}`;

    if (payload.document_type === "cash_bill") {
      const cashBillNo = await nextDocumentNumber("CB");
      const { data: bill, error } = await supabase
        .from("cash_bills")
        .insert({
          cash_bill_no: cashBillNo,
          issued_at: today,
          customer_id: job.customer_id,
          vehicle_id: job.vehicle_id,
          repair_job_id: jobId,
          customer_name: customer?.full_name ?? "ลูกค้าเงินสด",
          customer_phone: customer?.phone ?? null,
          customer_address: customer?.address ?? null,
          vehicle_text: vehicleLabel(vehicle),
          subtotal,
          discount: payload.discount,
          total,
          payment_method: payload.payment_method,
          show_payment_info: payload.show_payment_info,
          show_paid_stamp: payload.show_paid_stamp,
          notes: noteText,
          created_by: actorId,
        })
        .select("id,cash_bill_no")
        .single();
      if (error || !bill) return { ok: false, error: error?.message ?? "ออกบิลเงินสดไม่สำเร็จ" };

      const { error: cashBillItemsError } = await supabase.from("cash_bill_items").insert(
        items.map((item, index) => ({
          cash_bill_id: bill.id,
          item_type: itemTypeFromRepairTitle(item.title),
          description: repairItemDescription(item),
          quantity: item.quantity,
          unit: "รายการ",
          unit_price: item.labor_price,
          discount: item.discount,
          total: item.total,
          sort_order: index + 1,
        })),
      );
      if (cashBillItemsError) {
        await supabase.from("cash_bills").delete().eq("id", bill.id);
        return { ok: false, error: cashBillItemsError.message };
      }

      await Promise.all([
        supabase.from("income_records").insert({
          recorded_at: today,
          category: "repair_service",
          description: `บิลเงินสด ${bill.cash_bill_no}`,
          amount: total,
          payment_method: payload.payment_method,
          reference_no: bill.cash_bill_no,
          cash_bill_id: bill.id,
          created_by: actorId,
        }),
        supabase.from("repair_jobs").update({ status: "delivered", estimated_total: subtotal }).eq("id", jobId),
        supabase.from("activity_logs").insert({
          actor_id: actorId,
          action: "create_cash_bill",
          table_name: "cash_bills",
          record_id: bill.id,
          metadata: { repair_job_id: jobId, cash_bill_no: bill.cash_bill_no, total, instant: true },
        }),
      ]);

      await logRepairActivity(jobId, "create_instant_cash_bill", {
        cash_bill_id: bill.id,
        cash_bill_no: bill.cash_bill_no,
        total,
      });
      refreshInstantBilling(jobId, "cash-bills", bill.id);
      return {
        ok: true,
        message: `ออกบิลเงินสด ${bill.cash_bill_no} แล้ว`,
        documentId: bill.id,
        documentNo: bill.cash_bill_no,
        documentType: "cash-bills",
        href: `/print/cash-bills/${bill.id}`,
      };
    }

    const receiptNo = await nextDocumentNumber("RC");
    const { data: receipt, error } = await supabase
      .from("receipts")
      .insert({
        receipt_no: receiptNo,
        received_at: today,
        customer_id: job.customer_id,
        vehicle_id: job.vehicle_id,
        repair_job_id: jobId,
        invoice_id: null,
        subtotal,
        discount: payload.discount,
        total,
        payment_method: payload.payment_method,
        amount: total,
        show_payment_info: payload.show_payment_info,
        show_paid_stamp: payload.show_paid_stamp,
        notes: noteText,
        created_by: actorId,
      })
      .select("id,receipt_no")
      .single();
    if (error || !receipt) return { ok: false, error: error?.message ?? "ออกใบเสร็จไม่สำเร็จ" };

    const { error: receiptItemsError } = await supabase.from("receipt_items").insert(
      items.map((item, index) => ({
        receipt_id: receipt.id,
        item_type: itemTypeFromRepairTitle(item.title),
        description: repairItemDescription(item),
        quantity: item.quantity,
        unit: "รายการ",
        unit_price: item.labor_price,
        discount: item.discount,
        total: item.total,
        sort_order: index + 1,
      })),
    );
    if (receiptItemsError) {
      await supabase.from("receipts").delete().eq("id", receipt.id);
      return { ok: false, error: receiptItemsError.message };
    }

    await Promise.all([
      supabase.from("income_records").insert({
        recorded_at: today,
        category: "repair_service",
        description: `ใบเสร็จรับเงิน ${receipt.receipt_no}`,
        amount: total,
        payment_method: payload.payment_method,
        reference_no: receipt.receipt_no,
        receipt_id: receipt.id,
        created_by: actorId,
      }),
      supabase.from("repair_jobs").update({ status: "delivered", estimated_total: subtotal }).eq("id", jobId),
      supabase.from("activity_logs").insert({
        actor_id: actorId,
        action: "create_receipt",
        table_name: "receipts",
        record_id: receipt.id,
        metadata: { repair_job_id: jobId, receipt_no: receipt.receipt_no, total, instant: true },
      }),
    ]);

    await logRepairActivity(jobId, "create_instant_receipt", {
      receipt_id: receipt.id,
      receipt_no: receipt.receipt_no,
      total,
    });
    refreshInstantBilling(jobId, "receipts", receipt.id);
    return {
      ok: true,
      message: `ออกใบเสร็จ ${receipt.receipt_no} แล้ว`,
      documentId: receipt.id,
      documentNo: receipt.receipt_no,
      documentType: "receipts",
      href: `/print/receipts/${receipt.id}`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เปิดบิลทันทีไม่สำเร็จ" };
  }
}

export async function appendRepairJobImage(jobId: string, path: string): Promise<ActionResult> {
  try {
    await requireModuleAccess("repair-jobs", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
    const imagePath = imagePathSchema.parse(path);
    if (!imagePath.startsWith(`repair-jobs/${jobId}/`)) {
      return { ok: false, error: "path รูปภาพไม่ตรงกับงานซ่อม" };
    }

    const { data: job, error } = await supabase.from("repair_jobs").select("images").eq("id", jobId).maybeSingle();
    if (error || !job) return { ok: false, error: "ไม่พบงานซ่อม" };

    const images = Array.isArray(job.images) ? (job.images as string[]) : [];
    const nextImages = Array.from(new Set([...images, imagePath]));
    const { error: updateError } = await supabase.from("repair_jobs").update({ images: nextImages }).eq("id", jobId);
    if (updateError) return { ok: false, error: updateError.message };

    await logRepairActivity(jobId, "upload_image", { path: imagePath });
    refreshRepairJob(jobId);
    return { ok: true, message: "บันทึกรูปรถในงานซ่อมแล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}

export async function removeRepairJobImage(jobId: string, path: string): Promise<ActionResult> {
  try {
    await requireModuleAccess("repair-jobs", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
    const imagePath = imagePathSchema.parse(path);

    const { data: job, error } = await supabase.from("repair_jobs").select("images").eq("id", jobId).maybeSingle();
    if (error || !job) return { ok: false, error: "ไม่พบงานซ่อม" };

    const images = Array.isArray(job.images) ? (job.images as string[]) : [];
    const nextImages = images.filter((item) => item !== imagePath);
    const { error: updateError } = await supabase.from("repair_jobs").update({ images: nextImages }).eq("id", jobId);
    if (updateError) return { ok: false, error: updateError.message };

    if (!imagePath.startsWith("http")) {
      await supabase.storage.from("repair-job-images").remove([imagePath]);
    }

    await logRepairActivity(jobId, "remove_image", { path: imagePath });
    refreshRepairJob(jobId);
    return { ok: true, message: "ลบรูปจากงานซ่อมแล้ว" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" };
  }
}
