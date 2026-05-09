"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const settingsSchema = z.object({
  company_name: z.string().trim().min(1, "กรุณากรอกชื่อกิจการ"),
  logo_url: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  line_id: z.string().trim().optional().nullable(),
  document_footer: z.string().trim().optional().nullable(),
  repair_job_prefix: z.string().trim().min(1, "กรุณากรอก Prefix งานซ่อม").max(12),
  quotation_prefix: z.string().trim().min(1, "กรุณากรอก Prefix ใบเสนอราคา").max(12),
  invoice_prefix: z.string().trim().min(1, "กรุณากรอก Prefix ใบแจ้งหนี้").max(12),
  receipt_prefix: z.string().trim().min(1, "กรุณากรอก Prefix ใบเสร็จ").max(12),
  purchase_prefix: z.string().trim().min(1, "กรุณากรอก Prefix ใบซื้อ").max(12),
});

const countersSchema = z.object({
  counters: z
    .array(
      z.object({
        prefix: z.string().trim().min(1).max(12),
        running_number: z.coerce.number().int().min(0),
      }),
    )
    .min(1),
});

async function actorId() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function normalizePrefix(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function refreshSettings() {
  revalidatePath("/settings");
  revalidatePath("/print/[type]/[id]", "page");
}

export async function saveCompanySettings(input: unknown): Promise<ActionResult> {
  try {
    await requireModuleAccess("settings", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = settingsSchema.parse(input);
    const normalized = {
      ...payload,
      repair_job_prefix: normalizePrefix(payload.repair_job_prefix),
      quotation_prefix: normalizePrefix(payload.quotation_prefix),
      invoice_prefix: normalizePrefix(payload.invoice_prefix),
      receipt_prefix: normalizePrefix(payload.receipt_prefix),
      purchase_prefix: normalizePrefix(payload.purchase_prefix),
    };

    const { data: current } = await supabase
      .from("company_settings")
      .select("id")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const mutation = current?.id
      ? supabase.from("company_settings").update(normalized).eq("id", current.id).select("id").single()
      : supabase.from("company_settings").insert(normalized).select("id").single();

    const { data, error } = await mutation;
    if (error) return { ok: false, error: error.message };

    const prefixes = [
      normalized.repair_job_prefix,
      normalized.quotation_prefix,
      normalized.invoice_prefix,
      normalized.receipt_prefix,
      normalized.purchase_prefix,
    ];

    const { error: counterError } = await supabase.from("document_counters").upsert(
      prefixes.map((prefix) => ({ prefix, running_number: 0 })),
      { onConflict: "prefix", ignoreDuplicates: true },
    );
    if (counterError) return { ok: false, error: counterError.message };

    await supabase.from("activity_logs").insert({
      actor_id: await actorId(),
      action: current?.id ? "update_company_settings" : "create_company_settings",
      table_name: "company_settings",
      record_id: data.id,
      metadata: normalized,
    });

    refreshSettings();
    return { ok: true, message: "บันทึกตั้งค่ากิจการเรียบร้อย" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "บันทึกตั้งค่าไม่สำเร็จ" };
  }
}

export async function saveDocumentCounters(input: unknown): Promise<ActionResult> {
  try {
    await requireModuleAccess("settings", "write");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const payload = countersSchema.parse(input);
    const counters = payload.counters.map((counter) => ({
      prefix: normalizePrefix(counter.prefix),
      running_number: counter.running_number,
    }));

    const { error } = await supabase.from("document_counters").upsert(counters, { onConflict: "prefix" });
    if (error) return { ok: false, error: error.message };

    await supabase.from("activity_logs").insert({
      actor_id: await actorId(),
      action: "update_document_counters",
      table_name: "document_counters",
      record_id: null,
      metadata: { counters },
    });

    refreshSettings();
    return { ok: true, message: "บันทึก Running Number เรียบร้อย" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "บันทึก Running Number ไม่สำเร็จ" };
  }
}
