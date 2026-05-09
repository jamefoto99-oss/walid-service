import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const BATCH_SIZE = 1000;

const TABLES = [
  "roles",
  "users",
  "profiles",
  "company_settings",
  "document_counters",
  "customers",
  "vehicles",
  "repair_jobs",
  "repair_job_items",
  "part_categories",
  "parts",
  "stock_movements",
  "suppliers",
  "purchases",
  "purchase_items",
  "quotations",
  "quotation_items",
  "invoices",
  "invoice_items",
  "receipts",
  "income_records",
  "expense_records",
  "payment_records",
  "notifications",
  "notification_reads",
  "approval_requests",
  "activity_logs",
];

function loadEnvFile(filename) {
  const filepath = path.join(ROOT, filename);
  if (!fs.existsSync(filepath)) return;

  for (const rawLine of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (!key || process.env[key] !== undefined) continue;

    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function safeTableName(table) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new Error(`Unsafe table name: ${table}`);
  }
  return table;
}

function shouldUseSsl(connectionString) {
  if (process.env.PGSSLMODE === "disable") return false;
  return !/(@|\/\/)(localhost|127\.0\.0\.1|\[::1\])/i.test(connectionString);
}

async function createPostgresReader(connectionString) {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
  });

  await client.connect();

  return {
    mode: "postgres",
    async rows(table) {
      const safeTable = safeTableName(table);
      const { rows } = await client.query(`select * from public.${safeTable}`);
      return rows;
    },
    async close() {
      await client.end();
    },
  };
}

async function createSupabaseReader(url, serviceRoleKey) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return {
    mode: "supabase-service-role",
    async rows(table) {
      const safeTable = safeTableName(table);
      const rows = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from(safeTable)
          .select("*")
          .range(from, from + BATCH_SIZE - 1);

        if (error) throw new Error(`${safeTable}: ${error.message}`);

        rows.push(...(data ?? []));
        if (!data || data.length < BATCH_SIZE) break;
        from += BATCH_SIZE;
      }

      return rows;
    },
    async close() {},
  };
}

async function createReader() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const databaseUrl = requiredEnvValue("DATABASE_URL");
  const supabaseUrl = requiredEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  if (databaseUrl) {
    return createPostgresReader(databaseUrl);
  }

  if (supabaseUrl && serviceRoleKey) {
    return createSupabaseReader(supabaseUrl, serviceRoleKey);
  }

  throw new Error(
    "Set DATABASE_URL, or set NEXT_PUBLIC_SUPABASE_URL with SUPABASE_SERVICE_ROLE_KEY, before running this smoke test.",
  );
}

function requiredEnvValue(name) {
  const value = process.env[name]?.trim() ?? "";
  if (!value || value.startsWith("optional-") || value.includes("your-")) return "";
  return value;
}

function active(rows) {
  return rows.filter((row) => !Object.hasOwn(row, "deleted_at") || row.deleted_at === null);
}

function byId(rows) {
  return new Set(rows.map((row) => String(row.id ?? "")).filter(Boolean));
}

function money(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function isClose(actual, expected) {
  return Math.abs(money(actual) - money(expected)) < 0.01;
}

function duplicateValues(rows, field) {
  const seen = new Set();
  const duplicates = new Set();

  for (const row of rows) {
    const value = String(row[field] ?? "").trim();
    if (!value) continue;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return [...duplicates];
}

function missingParentRows(children, childField, parentIds) {
  return children.filter((row) => {
    const parentId = String(row[childField] ?? "");
    return parentId && !parentIds.has(parentId);
  });
}

function result(status, area, message, detail) {
  return { status, area, message, detail };
}

function assertCheck(checks, condition, area, message, detail, severity = "FAIL") {
  checks.push(result(condition ? "PASS" : severity, area, message, detail));
}

function count(value) {
  const total = Array.isArray(value) ? value.length : Number(value ?? 0);
  return total.toLocaleString("en-US");
}

function buildChecks(data) {
  const checks = [];
  const rows = Object.fromEntries(Object.entries(data).map(([table, tableRows]) => [table, active(tableRows)]));

  const roles = rows.roles ?? [];
  const profiles = rows.profiles ?? [];
  const settings = rows.company_settings ?? [];
  const counters = rows.document_counters ?? [];
  const customers = rows.customers ?? [];
  const vehicles = rows.vehicles ?? [];
  const repairJobs = rows.repair_jobs ?? [];
  const repairJobItems = rows.repair_job_items ?? [];
  const parts = rows.parts ?? [];
  const stockMovements = rows.stock_movements ?? [];
  const suppliers = rows.suppliers ?? [];
  const purchases = rows.purchases ?? [];
  const purchaseItems = rows.purchase_items ?? [];
  const quotations = rows.quotations ?? [];
  const quotationItems = rows.quotation_items ?? [];
  const invoices = rows.invoices ?? [];
  const invoiceItems = rows.invoice_items ?? [];
  const receipts = rows.receipts ?? [];
  const incomeRecords = rows.income_records ?? [];
  const expenseRecords = rows.expense_records ?? [];
  const paymentRecords = rows.payment_records ?? [];
  const approvalRequests = rows.approval_requests ?? [];
  const activityLogs = rows.activity_logs ?? [];
  const activeInvoices = invoices.filter((row) => !row.voided_at && String(row.payment_status ?? "") !== "cancelled");
  const activeReceipts = receipts.filter((row) => !row.voided_at);
  const activeIncomeRecords = incomeRecords.filter((row) => !row.deleted_at && !row.voided_at);
  const activeExpenseRecords = expenseRecords.filter((row) => !row.deleted_at && !row.voided_at);
  const activePaymentRecords = paymentRecords.filter((row) => !row.voided_at);
  const activePurchases = purchases.filter((row) => !row.voided_at && String(row.payment_status ?? "") !== "cancelled");

  const allPartIds = byId(data.parts ?? []);
  const roleNames = new Set(roles.map((row) => String(row.name ?? "")));
  const customerIds = byId(customers);
  const vehicleIds = byId(vehicles);
  const repairJobIds = byId(repairJobs);
  const partIds = byId(parts);
  const supplierIds = byId(suppliers);
  const activeQuotations = quotations.filter((row) => String(row.status ?? "") !== "cancelled");
  const activeQuotationIds = byId(activeQuotations);
  const activePurchaseIds = byId(activePurchases);
  const activeInvoiceIds = byId(activeInvoices);
  const activeReceiptIds = byId(activeReceipts);
  const activeQuotationItems = quotationItems.filter((row) => activeQuotationIds.has(String(row.quotation_id ?? "")));
  const activeInvoiceItems = invoiceItems.filter((row) => activeInvoiceIds.has(String(row.invoice_id ?? "")));
  const activePurchaseItems = purchaseItems.filter((row) => activePurchaseIds.has(String(row.purchase_id ?? "")));

  const requiredRoles = ["owner", "manager", "staff", "accountant"];
  const missingRoles = requiredRoles.filter((role) => !roleNames.has(role));
  const requiredCounters = ["JOB", "QT", "INV", "RC", "PO"];
  const counterPrefixes = new Set(counters.map((row) => String(row.prefix ?? "")));
  const missingCounters = requiredCounters.filter((prefix) => !counterPrefixes.has(prefix));

  assertCheck(
    checks,
    missingRoles.length === 0,
    "Auth/RBAC",
    "required roles are seeded",
    missingRoles.length ? `missing: ${missingRoles.join(", ")}` : `${requiredRoles.length} roles`,
  );
  assertCheck(
    checks,
    profiles.some((row) => row.role === "owner" && row.is_active === true),
    "Auth/RBAC",
    "active owner profile exists",
    `${count(profiles)} active profiles`,
  );
  assertCheck(checks, settings.length > 0, "Settings", "company settings exist", `${count(settings)} rows`);
  assertCheck(
    checks,
    missingCounters.length === 0,
    "Documents",
    "document counters exist for all core prefixes",
    missingCounters.length ? `missing: ${missingCounters.join(", ")}` : requiredCounters.join(", "),
  );

  assertCheck(checks, customers.length > 0, "Flow 1", "customers exist", `${count(customers)} rows`);
  assertCheck(checks, vehicles.length > 0, "Flow 1", "vehicles exist", `${count(vehicles)} rows`);
  assertCheck(checks, repairJobs.length > 0, "Flow 1", "repair jobs exist", `${count(repairJobs)} rows`);
  assertCheck(
    checks,
    missingParentRows(vehicles, "customer_id", customerIds).length === 0,
    "Flow 1",
    "vehicles reference existing customers",
    `${count(missingParentRows(vehicles, "customer_id", customerIds))} orphan rows`,
  );
  assertCheck(
    checks,
    missingParentRows(repairJobs, "customer_id", customerIds).length === 0 &&
      missingParentRows(repairJobs, "vehicle_id", vehicleIds).length === 0,
    "Flow 1",
    "repair jobs reference existing customers and vehicles",
    `${count(missingParentRows(repairJobs, "customer_id", customerIds).length + missingParentRows(repairJobs, "vehicle_id", vehicleIds).length)} invalid references`,
  );
  assertCheck(
    checks,
    repairJobs.some((row) => Array.isArray(row.images) && row.images.length > 0),
    "Flow 1",
    "at least one intake has car images",
    "image upload is optional in seed but required in real intake flow",
    "WARN",
  );

  assertCheck(checks, activeQuotations.length > 0, "Flow 2", "active quotations exist", `${count(activeQuotations)} rows`);
  assertCheck(checks, activeQuotationItems.length > 0, "Flow 2", "active quotation items exist", `${count(activeQuotationItems)} rows`);
  assertCheck(
    checks,
    activeQuotations.some((row) => row.repair_job_id && repairJobIds.has(String(row.repair_job_id))),
    "Flow 2",
    "quotation can reference a repair job",
    "repair job to quotation flow",
  );
  assertCheck(
    checks,
    activeQuotations.some((row) => row.status === "approved"),
    "Flow 2",
    "at least one quotation is approved",
    "complete approval flow after seed to clear this warning",
    "WARN",
  );
  assertCheck(
    checks,
    missingParentRows(activeQuotationItems, "quotation_id", activeQuotationIds).length === 0,
    "Flow 2",
    "quotation items reference existing quotations",
    `${count(missingParentRows(activeQuotationItems, "quotation_id", activeQuotationIds))} orphan rows`,
  );
  assertCheck(
    checks,
    activeQuotationItems.filter((row) => row.part_id && !partIds.has(String(row.part_id))).length === 0,
    "Flow 2",
    "quotation part items reference existing parts",
    `${count(activeQuotationItems.filter((row) => row.part_id && !partIds.has(String(row.part_id))).length)} invalid part references`,
  );

  const purchaseMovements = stockMovements.filter((row) => row.movement_type === "purchase");
  const usageMovements = stockMovements.filter(
    (row) =>
      row.movement_type === "use" ||
      money(row.quantity) < 0 ||
      ["invoice", "repair_job"].includes(String(row.reference_type ?? "")),
  );

  assertCheck(checks, parts.length > 0, "Flow 3", "parts exist", `${count(parts)} rows`);
  assertCheck(checks, repairJobItems.length > 0, "Flow 3", "repair job items exist", `${count(repairJobItems)} rows`);
  assertCheck(checks, stockMovements.length > 0, "Flow 3", "stock movements exist", `${count(stockMovements)} rows`);
  assertCheck(checks, purchaseMovements.length > 0, "Flow 3", "purchase stock-in movements exist", `${count(purchaseMovements)} rows`);
  assertCheck(
    checks,
    usageMovements.length > 0,
    "Flow 3",
    "stock usage movements exist",
    "create an invoice/repair flow with part items to clear this warning",
    "WARN",
  );
  assertCheck(
    checks,
    parts.every((row) => money(row.quantity_on_hand) >= 0),
    "Flow 3",
    "no part has negative stock",
    `${count(parts.filter((row) => money(row.quantity_on_hand) < 0))} negative parts`,
  );
  assertCheck(
    checks,
    stockMovements.filter((row) => !allPartIds.has(String(row.part_id ?? ""))).length === 0,
    "Flow 3",
    "stock movements reference existing parts",
    `${count(stockMovements.filter((row) => !allPartIds.has(String(row.part_id ?? ""))).length)} invalid references`,
  );

  assertCheck(checks, activeInvoices.length > 0, "Flow 4", "active invoices exist", `${count(activeInvoices)} rows`);
  assertCheck(checks, activeInvoiceItems.length > 0, "Flow 4", "active invoice items exist", `${count(activeInvoiceItems)} rows`);
  assertCheck(checks, activeReceipts.length > 0, "Flow 4", "active receipts exist", `${count(activeReceipts)} rows`);
  assertCheck(checks, activePaymentRecords.length > 0, "Flow 4", "active payment records exist", `${count(activePaymentRecords)} rows`);
  assertCheck(checks, activeIncomeRecords.length > 0, "Flow 4", "active income records exist", `${count(activeIncomeRecords)} rows`);
  assertCheck(
    checks,
    missingParentRows(activeInvoiceItems, "invoice_id", activeInvoiceIds).length === 0,
    "Flow 4",
    "invoice items reference existing invoices",
    `${count(missingParentRows(activeInvoiceItems, "invoice_id", activeInvoiceIds))} orphan rows`,
  );
  assertCheck(
    checks,
    missingParentRows(activeReceipts, "invoice_id", activeInvoiceIds).length === 0,
    "Flow 4",
    "receipts reference existing invoices",
    `${count(missingParentRows(activeReceipts, "invoice_id", activeInvoiceIds))} orphan rows`,
  );
  assertCheck(
    checks,
    activeIncomeRecords.some((row) => row.receipt_id && activeReceiptIds.has(String(row.receipt_id))),
    "Flow 4",
    "receipt creates an income record",
    "receipt_id linkage",
  );

  const inconsistentInvoices = activeInvoices.filter((invoice) => {
    const expectedBalance = Math.max(money(invoice.total) - money(invoice.paid_amount), 0);
    return !isClose(invoice.balance_due, expectedBalance);
  });
  const paymentSumMismatch = activeInvoices.filter((invoice) => {
    const sum = activePaymentRecords
      .filter((payment) => String(payment.invoice_id ?? "") === String(invoice.id ?? ""))
      .reduce((total, payment) => total + money(payment.amount), 0);

    return sum > 0 && !isClose(sum, invoice.paid_amount);
  });

  assertCheck(
    checks,
    inconsistentInvoices.length === 0,
    "Flow 4",
    "invoice balance equals total minus paid amount",
    `${count(inconsistentInvoices)} inconsistent invoices`,
  );
  assertCheck(
    checks,
    paymentSumMismatch.length === 0,
    "Flow 4",
    "invoice paid amount matches payment records",
    `${count(paymentSumMismatch)} mismatched invoices`,
  );

  assertCheck(checks, suppliers.length > 0, "Flow 5", "suppliers exist", `${count(suppliers)} rows`);
  assertCheck(checks, activePurchases.length > 0, "Flow 5", "active purchases exist", `${count(activePurchases)} rows`);
  assertCheck(checks, activePurchaseItems.length > 0, "Flow 5", "active purchase items exist", `${count(activePurchaseItems)} rows`);
  assertCheck(checks, activeExpenseRecords.length > 0, "Flow 5", "active expense records exist", `${count(activeExpenseRecords)} rows`);
  assertCheck(
    checks,
    missingParentRows(purchases, "supplier_id", supplierIds).length === 0,
    "Flow 5",
    "purchases reference existing suppliers",
    `${count(missingParentRows(purchases, "supplier_id", supplierIds))} orphan rows`,
  );
  assertCheck(
    checks,
    missingParentRows(activePurchaseItems, "purchase_id", activePurchaseIds).length === 0,
    "Flow 5",
    "purchase items reference existing purchases",
    `${count(missingParentRows(activePurchaseItems, "purchase_id", activePurchaseIds))} orphan rows`,
  );
  assertCheck(
    checks,
    activePurchaseItems.filter((row) => !partIds.has(String(row.part_id ?? ""))).length === 0,
    "Flow 5",
    "purchase items reference existing parts",
    `${count(activePurchaseItems.filter((row) => !partIds.has(String(row.part_id ?? ""))).length)} invalid part references`,
  );
  assertCheck(
    checks,
    activeExpenseRecords.some((row) => row.category === "parts_purchase" && row.supplier_id && supplierIds.has(String(row.supplier_id))),
    "Flow 5",
    "purchase payment creates supplier expense",
    "parts_purchase expense linked to supplier",
  );

  const inconsistentPurchases = activePurchases.filter((purchase) => {
    const expectedBalance = Math.max(money(purchase.total) - money(purchase.paid_amount), 0);
    return !isClose(purchase.balance_due, expectedBalance);
  });

  assertCheck(
    checks,
    inconsistentPurchases.length === 0,
    "Flow 5",
    "purchase balance equals total minus paid amount",
    `${count(inconsistentPurchases)} inconsistent purchases`,
  );

  for (const [area, tableRows, field] of [
    ["Documents", repairJobs, "job_number"],
    ["Documents", quotations, "quotation_no"],
    ["Documents", invoices, "invoice_no"],
    ["Documents", receipts, "receipt_no"],
    ["Documents", purchases, "purchase_no"],
  ]) {
    const duplicates = duplicateValues(tableRows, field);
    assertCheck(
      checks,
      duplicates.length === 0,
      area,
      `${field} values are unique`,
      duplicates.length ? duplicates.join(", ") : `${count(tableRows)} checked`,
    );
  }

  assertCheck(
    checks,
    [...activeIncomeRecords, ...activeExpenseRecords].every((row) => money(row.amount) >= 0),
    "Accounting",
    "income and expense amounts are non-negative",
    `${count(activeIncomeRecords.length + activeExpenseRecords.length)} records checked`,
  );
  assertCheck(
    checks,
    [...activeReceipts, ...activePaymentRecords].every((row) => money(row.amount) > 0),
    "Accounting",
    "receipt and payment amounts are positive",
    `${count(activeReceipts.length + activePaymentRecords.length)} records checked`,
  );
  assertCheck(
    checks,
    [...invoices, ...receipts, ...purchases].every((row) => !row.voided_at || row.void_reason),
    "Audit",
    "voided documents keep a reason",
    `${count(invoices.length + receipts.length + purchases.length)} documents checked`,
  );
  assertCheck(checks, activityLogs.length > 0, "Audit", "activity logs exist", `${count(activityLogs)} rows`, "WARN");
  assertCheck(
    checks,
    approvalRequests.length > 0,
    "Audit",
    "approval requests exist for protected document deletion",
    `${count(approvalRequests)} rows`,
    "WARN",
  );
  assertCheck(
    checks,
    approvalRequests.every((row) => ["pending", "approved", "rejected"].includes(String(row.status ?? ""))),
    "Audit",
    "approval request statuses are valid",
    `${count(approvalRequests)} approval rows checked`,
  );
  assertCheck(
    checks,
    approvalRequests.every((row) =>
      ["purchases", "quotations", "invoices", "receipts"].includes(String(row.target_table ?? "")),
    ),
    "Audit",
    "approval requests target protected document tables",
    `${count(approvalRequests)} approval rows checked`,
  );
  assertCheck(
    checks,
    activityLogs.some((row) => ["create_purchase", "create_receipt", "receive_invoice_payment", "seed"].includes(String(row.action ?? ""))),
    "Audit",
    "important workflow activity is logged",
    "expected create_purchase, create_receipt, receive_invoice_payment, or seed",
    "WARN",
  );

  return checks;
}

function printReport({ checks, connectorMode, tableCounts, startedAt }) {
  const counts = checks.reduce(
    (accumulator, check) => {
      accumulator[check.status] += 1;
      return accumulator;
    },
    { PASS: 0, WARN: 0, FAIL: 0 },
  );

  console.log("E2E Smoke Test - Walid Garage");
  console.log(`Connector: ${connectorMode}`);
  console.log(`Started: ${startedAt.toISOString()}`);
  console.log(`Tables loaded: ${Object.entries(tableCounts).map(([table, rows]) => `${table}=${rows}`).join(", ")}`);
  console.log(`Summary: PASS ${counts.PASS} | WARN ${counts.WARN} | FAIL ${counts.FAIL}`);
  console.log("");

  for (const check of checks) {
    const detail = check.detail ? ` (${check.detail})` : "";
    console.log(`[${check.status}] ${check.area}: ${check.message}${detail}`);
  }

  if (counts.FAIL > 0) {
    console.log("");
    console.log("Smoke test failed. Fix FAIL items before deploying or demoing the production flow.");
    process.exitCode = 1;
  } else if (counts.WARN > 0) {
    console.log("");
    console.log("Smoke test passed with warnings. Complete the warned business flows when validating a fresh environment.");
  } else {
    console.log("");
    console.log("Smoke test passed cleanly.");
  }
}

async function main() {
  const startedAt = new Date();
  const reader = await createReader();

  try {
    const entries = [];

    for (const table of TABLES) {
      entries.push([table, await reader.rows(table)]);
    }

    const data = Object.fromEntries(entries);
    const tableCounts = Object.fromEntries(entries.map(([table, rows]) => [table, rows.length]));
    const checks = buildChecks(data);

    printReport({
      checks,
      connectorMode: reader.mode,
      tableCounts,
      startedAt,
    });
  } finally {
    await reader.close();
  }
}

main().catch((error) => {
  console.error("[FAIL] Setup: smoke test could not run");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
