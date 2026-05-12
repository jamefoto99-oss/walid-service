import type { createSupabaseServerClient } from "./supabase/server";
import { toNumber } from "./utils";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
export type BackupRowsByKey = Record<string, Record<string, unknown>[]>;
export type FlowCheckStatus = "pass" | "warning" | "pending";

export const backupDatasets = [
  { key: "roles", table: "roles", label: "Roles", category: "system" },
  { key: "users", table: "users", label: "Users", category: "system" },
  { key: "profiles", table: "profiles", label: "Profiles / ผู้ใช้", category: "system" },
  { key: "company_settings", table: "company_settings", label: "ตั้งค่ากิจการ", category: "system" },
  { key: "document_counters", table: "document_counters", label: "Running Number", category: "system" },
  { key: "customers", table: "customers", label: "ลูกค้า", category: "operation" },
  { key: "vehicles", table: "vehicles", label: "รถยนต์", category: "operation" },
  { key: "repair_jobs", table: "repair_jobs", label: "งานซ่อม", category: "operation" },
  { key: "repair_job_items", table: "repair_job_items", label: "รายการซ่อม", category: "operation" },
  { key: "part_categories", table: "part_categories", label: "หมวดหมู่อะไหล่", category: "inventory" },
  { key: "parts", table: "parts", label: "อะไหล่ / สต๊อก", category: "inventory" },
  { key: "stock_movements", table: "stock_movements", label: "ประวัติสต๊อก", category: "inventory" },
  { key: "suppliers", table: "suppliers", label: "Supplier / เจ้าหนี้", category: "purchasing" },
  { key: "purchases", table: "purchases", label: "ซื้ออะไหล่", category: "purchasing" },
  { key: "purchase_items", table: "purchase_items", label: "รายการซื้ออะไหล่", category: "purchasing" },
  { key: "quotations", table: "quotations", label: "ใบเสนอราคา", category: "documents" },
  { key: "quotation_items", table: "quotation_items", label: "รายการใบเสนอราคา", category: "documents" },
  { key: "invoices", table: "invoices", label: "ใบแจ้งหนี้", category: "documents" },
  { key: "invoice_items", table: "invoice_items", label: "รายการใบแจ้งหนี้", category: "documents" },
  { key: "receipts", table: "receipts", label: "ใบเสร็จรับเงิน", category: "documents" },
  { key: "receipt_items", table: "receipt_items", label: "รายการใบเสร็จรับเงิน", category: "documents" },
  { key: "billing_statements", table: "billing_statements", label: "ใบวางบิล", category: "documents" },
  { key: "billing_statement_items", table: "billing_statement_items", label: "รายการใบวางบิล", category: "documents" },
  { key: "cash_bills", table: "cash_bills", label: "บิลเงินสด", category: "documents" },
  { key: "cash_bill_items", table: "cash_bill_items", label: "รายการบิลเงินสด", category: "documents" },
  { key: "income_records", table: "income_records", label: "รายรับ", category: "accounting" },
  { key: "expense_records", table: "expense_records", label: "รายจ่าย", category: "accounting" },
  { key: "payment_records", table: "payment_records", label: "ประวัติรับชำระเงิน", category: "accounting" },
  { key: "notifications", table: "notifications", label: "Notifications", category: "system" },
  { key: "notification_reads", table: "notification_reads", label: "Notification Reads", category: "system" },
  { key: "approval_requests", table: "approval_requests", label: "Approval Requests", category: "audit" },
  { key: "activity_logs", table: "activity_logs", label: "Activity Log", category: "audit" },
] as const;

export type BackupDataset = (typeof backupDatasets)[number];
export type BackupDatasetKey = BackupDataset["key"];

export function getBackupDataset(key: string | null) {
  return backupDatasets.find((dataset) => dataset.key === key) ?? null;
}

export async function fetchBackupRows(client: SupabaseServerClient, dataset: BackupDataset) {
  const batchSize = 1000;
  let from = 0;
  const rows: Record<string, unknown>[] = [];

  while (true) {
    const { data, error } = await client
      .from(dataset.table)
      .select("*")
      .range(from, from + batchSize - 1);

    if (error) throw new Error(`${dataset.label}: ${error.message}`);

    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}

export async function fetchAllBackupRows(client: SupabaseServerClient) {
  const entries = await Promise.all(
    backupDatasets.map(async (dataset) => [dataset.key, await fetchBackupRows(client, dataset)] as const),
  );

  return Object.fromEntries(entries) as BackupRowsByKey;
}

export function createBackupPayload(rowsByKey: BackupRowsByKey) {
  return {
    exported_at: new Date().toISOString(),
    app: "อู่วาลิดการช่าง",
    format_version: 1,
    datasets: Object.fromEntries(
      backupDatasets.map((dataset) => [
        dataset.key,
        {
          table: dataset.table,
          label: dataset.label,
          row_count: rowsByKey[dataset.key]?.length ?? 0,
          rows: rowsByKey[dataset.key] ?? [],
        },
      ]),
    ),
  };
}

export function createCsv(rows: Record<string, unknown>[]) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (!columns.length) return "";

  const escape = (value: unknown) => {
    const normalized =
      value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
    return `"${normalized.replaceAll('"', '""')}"`;
  };

  return [
    columns.map(escape).join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
  ].join("\n");
}

export function summarizeBackupRows(rowsByKey: BackupRowsByKey) {
  return backupDatasets.map((dataset) => {
    const rows = rowsByKey[dataset.key] ?? [];
    const lastUpdated = rows
      .map((row) => row.updated_at ?? row.created_at ?? row.received_at ?? row.issued_at ?? row.recorded_at)
      .filter(Boolean)
      .map((value) => new Date(String(value)))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return {
      key: dataset.key,
      table: dataset.table,
      label: dataset.label,
      category: dataset.category,
      rowCount: rows.length,
      lastUpdated: lastUpdated?.toISOString() ?? null,
    };
  });
}

function flowStatus(conditions: boolean[]): FlowCheckStatus {
  const passed = conditions.filter(Boolean).length;
  if (passed === conditions.length) return "pass";
  if (passed > 0) return "warning";
  return "pending";
}

function count(rowsByKey: BackupRowsByKey, key: string) {
  return rowsByKey[key]?.length ?? 0;
}

export function buildFlowChecks(rowsByKey: BackupRowsByKey) {
  const customers = rowsByKey.customers ?? [];
  const vehicles = rowsByKey.vehicles ?? [];
  const repairJobs = rowsByKey.repair_jobs ?? [];
  const repairJobItems = rowsByKey.repair_job_items ?? [];
  const parts = rowsByKey.parts ?? [];
  const stockMovements = rowsByKey.stock_movements ?? [];
  const quotations = rowsByKey.quotations ?? [];
  const quotationItems = rowsByKey.quotation_items ?? [];
  const invoices = rowsByKey.invoices ?? [];
  const invoiceItems = rowsByKey.invoice_items ?? [];
  const receipts = rowsByKey.receipts ?? [];
  const cashBills = rowsByKey.cash_bills ?? [];
  const cashBillItems = rowsByKey.cash_bill_items ?? [];
  const incomeRecords = rowsByKey.income_records ?? [];
  const purchases = rowsByKey.purchases ?? [];
  const purchaseItems = rowsByKey.purchase_items ?? [];
  const expenses = rowsByKey.expense_records ?? [];
  const suppliers = rowsByKey.suppliers ?? [];

  const approvedQuote = quotations.some((row) => row.status === "approved");
  const paidInvoice = invoices.some((row) => ["paid", "partial"].includes(String(row.payment_status)) || toNumber(row.paid_amount) > 0);
  const receiptIncome = receipts.some((receipt) =>
    incomeRecords.some((income) => String(income.receipt_id ?? "") === String(receipt.id ?? "")),
  );
  const cashBillIncome = cashBills.some((bill) =>
    incomeRecords.some((income) => String(income.cash_bill_id ?? "") === String(bill.id ?? "")),
  );
  const purchaseExpense = expenses.some(
    (expense) =>
      String(expense.category ?? "") === "parts_purchase" &&
      suppliers.some((supplier) => String(supplier.id ?? "") === String(expense.supplier_id ?? "")),
  );
  const stockLinkedToRepair = stockMovements.some(
    (row) =>
      String(row.movement_type ?? "") === "use" ||
      ["repair_job", "invoice", "cash_bill"].includes(String(row.reference_type ?? "")),
  );

  return [
    {
      key: "intake",
      title: "Flow 1: รับรถเข้าซ่อม",
      status: flowStatus([customers.length > 0, vehicles.length > 0, repairJobs.length > 0]),
      evidence: `${customers.length} ลูกค้า, ${vehicles.length} รถ, ${repairJobs.length} งานซ่อม`,
      href: "/repair-jobs",
    },
    {
      key: "quotation",
      title: "Flow 2: เสนอราคา",
      status: flowStatus([repairJobs.length > 0, quotations.length > 0, quotationItems.length > 0, approvedQuote]),
      evidence: `${quotations.length} ใบเสนอราคา, ${quotationItems.length} รายการ, ${approvedQuote ? "มีใบอนุมัติแล้ว" : "ยังไม่มีใบอนุมัติ"}`,
      href: "/quotations",
    },
    {
      key: "stock",
      title: "Flow 3: ซ่อมและตัดสต๊อก",
      status: flowStatus([parts.length > 0, repairJobItems.length > 0, stockMovements.length > 0, stockLinkedToRepair]),
      evidence: `${parts.length} อะไหล่, ${repairJobItems.length} รายการซ่อม, ${stockMovements.length} stock movements`,
      href: "/parts",
    },
    {
      key: "billing",
      title: "Flow 4: วางบิลและรับเงิน",
      status: flowStatus([
        invoices.length > 0,
        invoiceItems.length > 0,
        paidInvoice,
        receipts.length > 0,
        receiptIncome,
        cashBills.length > 0,
        cashBillItems.length > 0,
        cashBillIncome,
      ]),
      evidence: `${invoices.length} ใบแจ้งหนี้, ${receipts.length} ใบเสร็จ, ${cashBills.length} บิลเงินสด, ${incomeRecords.length} รายรับ`,
      href: "/invoices",
    },
    {
      key: "profit-loss",
      title: "Flow 5: รายจ่ายและกำไรขาดทุน",
      status: flowStatus([suppliers.length > 0, purchases.length > 0, purchaseItems.length > 0, expenses.length > 0, purchaseExpense]),
      evidence: `${suppliers.length} supplier, ${purchases.length} ใบซื้อ, ${expenses.length} รายจ่าย`,
      href: "/reports",
    },
  ];
}

export function totalBackupRows(rowsByKey: BackupRowsByKey) {
  return backupDatasets.reduce((sum, dataset) => sum + count(rowsByKey, dataset.key), 0);
}
