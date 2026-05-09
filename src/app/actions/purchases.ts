"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const paymentMethodSchema = z.enum(["cash", "transfer", "qr", "other"]);

const purchaseItemSchema = z.object({
  part_id: z.string().uuid("กรุณาเลือกอะไหล่"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unit_cost: z.coerce.number().min(0, "ราคาทุนต้องไม่ติดลบ"),
});

const createPurchaseSchema = z.object({
  supplier_id: z.string().uuid("กรุณาเลือก Supplier"),
  purchased_at: z.string().min(1, "กรุณาระบุวันที่ซื้อ"),
  discount: z.coerce.number().min(0, "ส่วนลดต้องไม่ติดลบ").default(0),
  paid_amount: z.coerce.number().min(0, "ยอดจ่ายแล้วต้องไม่ติดลบ").default(0),
  payment_method: paymentMethodSchema.default("transfer"),
  notes: z.string().trim().optional().nullable(),
  items: z.array(purchaseItemSchema).min(1, "กรุณาเพิ่มรายการอะไหล่อย่างน้อย 1 รายการ"),
});

const payPurchaseSchema = z.object({
  purchase_id: z.string().uuid("ไม่พบใบซื้อ"),
  paid_at: z.string().min(1, "กรุณาระบุวันที่จ่าย"),
  amount: z.coerce.number().min(0.01, "ยอดจ่ายต้องมากกว่า 0"),
  payment_method: paymentMethodSchema.default("transfer"),
  notes: z.string().trim().optional().nullable(),
});

function refreshPurchaseFlow(purchaseId?: string) {
  revalidatePath("/purchases");
  revalidatePath("/parts");
  revalidatePath("/suppliers");
  revalidatePath("/expenses");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  if (purchaseId) revalidatePath(`/purchases/${purchaseId}`);
}

function rpcPayload(data: unknown) {
  return (data ?? {}) as Record<string, unknown>;
}

export async function createPurchaseWithStock(input: unknown): Promise<ActionResult> {
  try {
    await requireModuleAccess("purchases", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = createPurchaseSchema.parse(input);
    const subtotal = payload.items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
    const total = Math.max(subtotal - payload.discount, 0);
    if (payload.paid_amount > total) {
      return { ok: false, error: "ยอดจ่ายแล้วมากกว่ายอดรวมใบซื้อ" };
    }

    const { data, error } = await supabase.rpc("create_purchase_with_stock", {
      p_supplier_id: payload.supplier_id,
      p_purchased_at: payload.purchased_at,
      p_discount: payload.discount,
      p_paid_amount: payload.paid_amount,
      p_payment_method: payload.payment_method,
      p_notes: payload.notes ?? null,
      p_items: payload.items,
    });

    if (error) return { ok: false, error: error.message };

    const result = rpcPayload(data);
    refreshPurchaseFlow(String(result.id ?? ""));
    return {
      ok: true,
      message: `บันทึกใบซื้อ ${String(result.purchase_no ?? "")} และรับสต๊อกเข้าแล้ว`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "บันทึกใบซื้อไม่สำเร็จ" };
  }
}

export async function paySupplierPurchase(input: unknown): Promise<ActionResult> {
  try {
    await requireModuleAccess("purchases", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = payPurchaseSchema.parse(input);
    const { data, error } = await supabase.rpc("pay_supplier_purchase", {
      p_purchase_id: payload.purchase_id,
      p_paid_at: payload.paid_at,
      p_amount: payload.amount,
      p_payment_method: payload.payment_method,
      p_notes: payload.notes ?? null,
    });

    if (error) return { ok: false, error: error.message };

    const result = rpcPayload(data);
    refreshPurchaseFlow(String(result.id ?? payload.purchase_id));
    return {
      ok: true,
      message: `บันทึกชำระใบซื้อ ${String(result.purchase_no ?? "")} แล้ว`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "บันทึกชำระ Supplier ไม่สำเร็จ" };
  }
}
