import { createSupabaseServerClient } from "./supabase/server";

export type DocumentPrefix = "JOB" | "QT" | "INV" | "RC" | "PO" | "CB";

export async function nextDocumentNumber(prefix: DocumentPrefix) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const prefixColumn: Record<DocumentPrefix, string> = {
    JOB: "repair_job_prefix",
    QT: "quotation_prefix",
    INV: "invoice_prefix",
    RC: "receipt_prefix",
    PO: "purchase_prefix",
    CB: "cash_bill_prefix",
  };
  const { data: settings } = await supabase
    .from("company_settings")
    .select("repair_job_prefix,quotation_prefix,invoice_prefix,receipt_prefix,purchase_prefix,cash_bill_prefix")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const configuredPrefix = String((settings as Record<string, unknown> | null)?.[prefixColumn[prefix]] ?? prefix);

  const { data, error } = await supabase.rpc("next_document_number", { p_prefix: configuredPrefix });
  if (error) throw error;
  return String(data);
}

export function documentNoField(table: string) {
  if (table === "repair_jobs") return "job_number";
  if (table === "quotations") return "quotation_no";
  if (table === "invoices") return "invoice_no";
  if (table === "receipts") return "receipt_no";
  if (table === "purchases") return "purchase_no";
  if (table === "cash_bills") return "cash_bill_no";
  return null;
}
