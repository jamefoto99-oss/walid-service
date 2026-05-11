import { createSupabaseServerClient } from "./supabase/server";
import { getLatestCompanySettings } from "./company-settings";

export type DocumentPrefix = "JOB" | "QT" | "INV" | "RC" | "PO" | "CB" | "BS";

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
    BS: "billing_statement_prefix",
  };
  const settings = await getLatestCompanySettings(supabase);
  const configuredPrefix = String(settings?.[prefixColumn[prefix]] ?? prefix);

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
  if (table === "billing_statements") return "billing_statement_no";
  return null;
}
