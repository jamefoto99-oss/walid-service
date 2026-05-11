import { modules } from "./constants";
import {
  buildFlowChecks,
  fetchAllBackupRows,
  summarizeBackupRows,
  totalBackupRows,
} from "./backup";
import { getLatestCompanySettings } from "./company-settings";
import { isSupabaseAdminConfigured } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";
import type { DashboardData, ModuleConfig, PurchasePageData, ReferenceData } from "./types";
import { toNumber } from "./utils";

const emptyRefs: ReferenceData = {
  customers: [],
  vehicles: [],
  repairJobs: [],
  parts: [],
  partCategories: [],
  suppliers: [],
  quotations: [],
  invoices: [],
  profiles: [],
};

function option(label: unknown, value: unknown, meta?: Record<string, string | number | boolean | null | undefined>) {
  return { label: String(label ?? "-"), value: String(value ?? ""), meta };
}

export async function getReferenceData(): Promise<ReferenceData> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return emptyRefs;

  const [
    customers,
    vehicles,
    repairJobs,
    parts,
    partCategories,
    suppliers,
    quotations,
    invoices,
    profiles,
  ] = await Promise.all([
    supabase.from("customers").select("id,full_name,phone").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("vehicles").select("id,license_plate,brand,model").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("repair_jobs").select("id,job_number,status").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("parts").select("id,part_code,name,quantity_on_hand,unit").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("part_categories").select("id,name").order("created_at", { ascending: false }),
    supabase.from("suppliers").select("id,name").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("quotations").select("id,quotation_no,total,status").is("deleted_at", null).neq("status", "cancelled").order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id,invoice_no,total,balance_due,payment_status")
      .is("deleted_at", null)
      .is("voided_at", null)
      .neq("payment_status", "cancelled")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id,full_name,email,role").order("created_at", { ascending: false }),
  ]);

  return {
    customers: (customers.data ?? []).map((row) => option(`${row.full_name} (${row.phone ?? "-"})`, row.id)),
    vehicles: (vehicles.data ?? []).map((row) => option(`${row.license_plate} ${row.brand ?? ""} ${row.model ?? ""}`, row.id)),
    repairJobs: (repairJobs.data ?? []).map((row) => option(`${row.job_number} - ${row.status}`, row.id)),
    parts: (parts.data ?? []).map((row) =>
      option(`${row.part_code} ${row.name} (เหลือ ${row.quantity_on_hand} ${row.unit ?? "ชิ้น"})`, row.id, { unit: row.unit ?? "ชิ้น" }),
    ),
    partCategories: (partCategories.data ?? []).map((row) => option(row.name, row.id)),
    suppliers: (suppliers.data ?? []).map((row) => option(row.name, row.id)),
    quotations: (quotations.data ?? []).map((row) => option(`${row.quotation_no} - ${row.status}`, row.id)),
    invoices: (invoices.data ?? []).map((row) => option(`${row.invoice_no} ค้าง ${row.balance_due}`, row.id)),
    profiles: (profiles.data ?? []).map((row) => option(`${row.full_name ?? row.email} - ${row.role}`, row.id)),
  };
}

export async function getModuleRows(config: ModuleConfig) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, rows: [] as Record<string, unknown>[] };

  const selectColumns = config.key === "cash-bills" ? "*, cash_bill_items(*)" : "*";
  const query = supabase.from(config.table).select(selectColumns).order("created_at", { ascending: false });
  if (config.table !== "profiles") query.is("deleted_at", null);

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return { setupRequired: false, rows: [] as Record<string, unknown>[] };
  }

  return { setupRequired: false, rows: (data ?? []) as unknown as Record<string, unknown>[] };
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createSupabaseServerClient();
  const empty: DashboardData = {
    setupRequired: !supabase,
    metrics: {
      todayIncome: 0,
      monthIncome: 0,
      monthExpense: 0,
      profit: 0,
      activeJobs: 0,
      waitingParts: 0,
      completedJobs: 0,
      unpaidInvoices: 0,
      receivables: 0,
    },
    monthly: [],
    recentJobs: [],
    unpaid: [],
  };

  if (!supabase) return empty;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString();

  const [income, expenses, jobs, invoices, recentJobs] = await Promise.all([
    supabase.from("income_records").select("amount,recorded_at").is("deleted_at", null).is("voided_at", null).gte("recorded_at", sixMonthsAgo),
    supabase.from("expense_records").select("amount,recorded_at").is("deleted_at", null).is("voided_at", null).gte("recorded_at", sixMonthsAgo),
    supabase.from("repair_jobs").select("id,status,job_number,reported_problem,created_at").is("deleted_at", null),
    supabase.from("invoices").select("id,invoice_no,total,balance_due,payment_status,due_at").is("deleted_at", null).is("voided_at", null),
    supabase
      .from("repair_jobs")
      .select("id,job_number,status,reported_problem,created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const incomeRows = income.data ?? [];
  const expenseRows = expenses.data ?? [];
  const jobRows = jobs.data ?? [];
  const invoiceRows = invoices.data ?? [];

  const todayIncome = incomeRows
    .filter((row) => String(row.recorded_at) >= startOfToday)
    .reduce((sum, row) => sum + toNumber(row.amount), 0);
  const monthIncome = incomeRows
    .filter((row) => String(row.recorded_at) >= startOfMonth)
    .reduce((sum, row) => sum + toNumber(row.amount), 0);
  const monthExpense = expenseRows
    .filter((row) => String(row.recorded_at) >= startOfMonth)
    .reduce((sum, row) => sum + toNumber(row.amount), 0);

  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });

  const monthly = monthKeys.map((month) => ({
    month,
    income: incomeRows
      .filter((row) => String(row.recorded_at).startsWith(month))
      .reduce((sum, row) => sum + toNumber(row.amount), 0),
    expense: expenseRows
      .filter((row) => String(row.recorded_at).startsWith(month))
      .reduce((sum, row) => sum + toNumber(row.amount), 0),
  }));

  const unpaid = invoiceRows.filter((row) => ["unpaid", "partial", "overdue"].includes(String(row.payment_status)));

  return {
    setupRequired: false,
    metrics: {
      todayIncome,
      monthIncome,
      monthExpense,
      profit: monthIncome - monthExpense,
      activeJobs: jobRows.filter((row) => !["delivered", "cancelled", "completed"].includes(String(row.status))).length,
      waitingParts: jobRows.filter((row) => row.status === "waiting_parts").length,
      completedJobs: jobRows.filter((row) => row.status === "completed").length,
      unpaidInvoices: unpaid.length,
      receivables: unpaid.reduce((sum, row) => sum + toNumber(row.balance_due), 0),
    },
    monthly,
    recentJobs: (recentJobs.data ?? []) as Record<string, unknown>[],
    unpaid: unpaid as Record<string, unknown>[],
  };
}

export async function getReportsData() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      setupRequired: true,
      income: [],
      expenses: [],
      invoices: [],
      receipts: [],
      jobs: [],
      parts: [],
      purchases: [],
      suppliers: [],
      stockMovements: [],
    };
  }

  const [income, expenses, invoices, receipts, jobs, parts, purchases, suppliers, stockMovements] = await Promise.all([
    supabase
      .from("income_records")
      .select("*, receipts(receipt_no,invoice_id)")
      .is("deleted_at", null)
      .is("voided_at", null)
      .order("recorded_at", { ascending: false }),
    supabase
      .from("expense_records")
      .select("*, suppliers(name,phone)")
      .is("deleted_at", null)
      .is("voided_at", null)
      .order("recorded_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("*, customers(full_name,phone), vehicles(license_plate,brand,model), repair_jobs(job_number,status)")
      .is("deleted_at", null)
      .is("voided_at", null)
      .neq("payment_status", "cancelled")
      .order("issued_at", { ascending: false }),
    supabase
      .from("receipts")
      .select("*, customers(full_name,phone), invoices(invoice_no,total,balance_due,payment_status)")
      .is("deleted_at", null)
      .is("voided_at", null)
      .order("received_at", { ascending: false }),
    supabase
      .from("repair_jobs")
      .select("*, customers(full_name,phone), vehicles(license_plate,brand,model)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("parts")
      .select("*, suppliers(name)")
      .is("deleted_at", null)
      .order("quantity_on_hand"),
    supabase
      .from("purchases")
      .select("*, suppliers(name,phone)")
      .is("deleted_at", null)
      .is("voided_at", null)
      .neq("payment_status", "cancelled")
      .order("purchased_at", { ascending: false }),
    supabase
      .from("suppliers")
      .select("*")
      .is("deleted_at", null)
      .order("credit_balance", { ascending: false }),
    supabase
      .from("stock_movements")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  return {
    setupRequired: false,
    income: income.data ?? [],
    expenses: expenses.data ?? [],
    invoices: invoices.data ?? [],
    receipts: receipts.data ?? [],
    jobs: jobs.data ?? [],
    parts: parts.data ?? [],
    purchases: purchases.data ?? [],
    suppliers: suppliers.data ?? [],
    stockMovements: stockMovements.data ?? [],
  };
}

type ActivityLogFilters = {
  from?: string;
  to?: string;
  table?: string;
  actor?: string;
  action?: string;
};

function dayBoundary(value?: string, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export async function getActivityLogPageData(filters: ActivityLogFilters) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      setupRequired: true,
      logs: [],
      actors: [],
      actions: [],
      tableNames: [],
    };
  }

  let logsQuery = supabase
    .from("activity_logs")
    .select("*, profiles(full_name,email,role)")
    .order("created_at", { ascending: false })
    .limit(500);

  const from = dayBoundary(filters.from);
  const to = dayBoundary(filters.to, true);
  if (from) logsQuery = logsQuery.gte("created_at", from);
  if (to) logsQuery = logsQuery.lt("created_at", to);
  if (filters.table && filters.table !== "all") logsQuery = logsQuery.eq("table_name", filters.table);
  if (filters.actor && filters.actor !== "all") logsQuery = logsQuery.eq("actor_id", filters.actor);
  if (filters.action && filters.action !== "all") logsQuery = logsQuery.eq("action", filters.action);

  const [logs, options, actors] = await Promise.all([
    logsQuery,
    supabase
      .from("activity_logs")
      .select("action,table_name")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("profiles")
      .select("id,full_name,email,role")
      .order("full_name", { ascending: true }),
  ]);

  const optionRows = (options.data ?? []) as Record<string, unknown>[];
  const actions = Array.from(new Set(optionRows.map((row) => String(row.action ?? "")).filter(Boolean))).sort();
  const tableNames = Array.from(new Set(optionRows.map((row) => String(row.table_name ?? "")).filter(Boolean))).sort();

  return {
    setupRequired: false,
    logs: (logs.data ?? []) as Record<string, unknown>[],
    actors: (actors.data ?? []) as Record<string, unknown>[],
    actions,
    tableNames,
  };
}

export async function getBackupPageData() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      setupRequired: true,
      datasets: [],
      flowChecks: [],
      totalRows: 0,
      generatedAt: null,
    };
  }

  const rowsByKey = await fetchAllBackupRows(supabase);
  const flowChecks = buildFlowChecks(rowsByKey);

  return {
    setupRequired: false,
    datasets: summarizeBackupRows(rowsByKey),
    flowChecks,
    totalRows: totalBackupRows(rowsByKey),
    generatedAt: new Date().toISOString(),
  };
}

export async function getPurchasePageData(): Promise<PurchasePageData> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { setupRequired: true, purchases: [], suppliers: [], parts: [], purchaseActivityLogs: [] };
  }

  const [purchases, suppliers, parts, purchaseActivityLogs] = await Promise.all([
    supabase
      .from("purchases")
      .select("*, suppliers(name,phone), purchase_items(*, parts(part_code,name,unit))")
      .is("deleted_at", null)
      .order("purchased_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("suppliers")
      .select("id,name,phone,credit_balance")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("parts")
      .select("id,part_code,name,cost_price,sale_price,quantity_on_hand,unit,supplier_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_logs")
      .select("*, profiles(full_name,email,role)")
      .eq("table_name", "purchases")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  return {
    setupRequired: false,
    purchases: (purchases.data ?? []) as PurchasePageData["purchases"],
    suppliers: (suppliers.data ?? []) as PurchasePageData["suppliers"],
    parts: (parts.data ?? []) as PurchasePageData["parts"],
    purchaseActivityLogs: (purchaseActivityLogs.data ?? []) as PurchasePageData["purchaseActivityLogs"],
  };
}

export async function getPurchaseDetail(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, detail: null };

  const { data: purchase, error } = await supabase
    .from("purchases")
    .select("*, suppliers(id,name,phone,address,credit_balance,regular_items,notes)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !purchase) return { setupRequired: false, detail: null };

  const purchaseNo = String((purchase as Record<string, unknown>).purchase_no ?? "");
  const supplierId = String((purchase as Record<string, unknown>).supplier_id ?? "");

  const [items, expenses, stockMovements, logs] = await Promise.all([
    supabase
      .from("purchase_items")
      .select("*, parts(part_code,name,unit,cost_price,sale_price,quantity_on_hand,low_stock_threshold)")
      .eq("purchase_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("expense_records")
      .select("*")
      .eq("supplier_id", supplierId)
      .ilike("description", `%${purchaseNo}%`)
      .order("recorded_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("stock_movements")
      .select("*, parts(part_code,name,unit)")
      .eq("reference_id", id)
      .in("reference_type", ["purchase", "purchase_void"])
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_logs")
      .select("*, profiles(full_name,email,role)")
      .eq("table_name", "purchases")
      .eq("record_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return {
    setupRequired: false,
    detail: {
      purchase: purchase as Record<string, unknown>,
      items: (items.data ?? []) as Record<string, unknown>[],
      expenses: (expenses.data ?? []) as Record<string, unknown>[],
      stockMovements: (stockMovements.data ?? []) as Record<string, unknown>[],
      logs: (logs.data ?? []) as Record<string, unknown>[],
    },
  };
}

export async function getPartDetail(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, detail: null };

  const { data: part, error } = await supabase
    .from("parts")
    .select("*, part_categories(name), suppliers(id,name,phone,address,credit_balance,regular_items,notes)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !part) return { setupRequired: false, detail: null };

  const [stockMovements, purchaseItems, quotationItems, invoiceItems, partLogs, repairLogs] = await Promise.all([
    supabase
      .from("stock_movements")
      .select("*, profiles(full_name,email,role)")
      .eq("part_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_items")
      .select("*, purchases(id,purchase_no,purchased_at,total,payment_status,supplier_id,suppliers(name))")
      .eq("part_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quotation_items")
      .select(
        "*, quotations(id,quotation_no,issued_at,status,total,customer_id,repair_job_id,customers(full_name),repair_jobs(job_number,status))",
      )
      .eq("part_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoice_items")
      .select(
        "*, invoices(id,invoice_no,issued_at,total,payment_status,voided_at,customer_id,repair_job_id,customers(full_name),repair_jobs(job_number,status))",
      )
      .eq("part_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_logs")
      .select("*, profiles(full_name,email,role)")
      .eq("table_name", "parts")
      .eq("record_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("activity_logs")
      .select("*, profiles(full_name,email,role)")
      .eq("table_name", "repair_jobs")
      .contains("metadata", { part_id: id })
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const logs = [...((partLogs.data ?? []) as Record<string, unknown>[]), ...((repairLogs.data ?? []) as Record<string, unknown>[])].sort(
    (a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );

  return {
    setupRequired: false,
    detail: {
      part: part as Record<string, unknown>,
      stockMovements: (stockMovements.data ?? []) as Record<string, unknown>[],
      purchaseItems: (purchaseItems.data ?? []) as Record<string, unknown>[],
      quotationItems: (quotationItems.data ?? []) as Record<string, unknown>[],
      invoiceItems: (invoiceItems.data ?? []) as Record<string, unknown>[],
      logs,
    },
  };
}

export async function getSettingsPageData() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, settings: null, counters: [], logs: [] };

  const countersQuery = supabase
    .from("document_counters")
    .select("*")
    .order("prefix", { ascending: true });

  const [settings, { data: counters }] = await Promise.all([getLatestCompanySettings(supabase), countersQuery]);

  const logs = settings?.id
    ? await supabase
        .from("activity_logs")
        .select("*, profiles(full_name,email,role)")
        .eq("table_name", "company_settings")
        .eq("record_id", settings.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  return {
    setupRequired: false,
    settings,
    counters: (counters ?? []) as Record<string, unknown>[],
    logs: (logs.data ?? []) as Record<string, unknown>[],
  };
}

export async function getUsersPageData() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      setupRequired: true,
      profiles: [],
      logs: [],
      serviceRoleConfigured: false,
    };
  }

  const [profiles, logs] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,full_name,role,is_active,created_at,updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("activity_logs")
      .select("*, profiles(full_name,email,role)")
      .in("table_name", ["profiles", "users"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    setupRequired: false,
    profiles: (profiles.data ?? []) as Record<string, unknown>[],
    logs: (logs.data ?? []) as Record<string, unknown>[],
    serviceRoleConfigured: isSupabaseAdminConfigured(),
  };
}

export async function getCustomerDetail(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, detail: null };

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !customer) return { setupRequired: false, detail: null };

  const [vehicles, jobs, quotations, invoices] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*")
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("repair_jobs")
      .select("*, vehicles(license_plate,province,brand,model)")
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("quotations")
      .select("*, vehicles(license_plate,brand,model), repair_jobs(job_number,status)")
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("*, vehicles(license_plate,brand,model), repair_jobs(job_number,status)")
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const invoiceIds = (invoices.data ?? []).map((invoice) => invoice.id);
  const receipts = invoiceIds.length
    ? await supabase
        .from("receipts")
        .select("*, invoices(invoice_no,total,balance_due)")
        .in("invoice_id", invoiceIds)
        .is("deleted_at", null)
        .is("voided_at", null)
        .order("received_at", { ascending: false })
    : { data: [] };

  return {
    setupRequired: false,
    detail: {
      customer: customer as Record<string, unknown>,
      vehicles: (vehicles.data ?? []) as Record<string, unknown>[],
      jobs: (jobs.data ?? []) as Record<string, unknown>[],
      quotations: (quotations.data ?? []) as Record<string, unknown>[],
      invoices: (invoices.data ?? []) as Record<string, unknown>[],
      receipts: (receipts.data ?? []) as Record<string, unknown>[],
    },
  };
}

export async function getVehicleDetail(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, detail: null };

  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .select("*, customers(full_name,phone,line_id,address,outstanding_balance)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !vehicle) return { setupRequired: false, detail: null };

  const [jobs, quotations, invoices] = await Promise.all([
    supabase
      .from("repair_jobs")
      .select("*")
      .eq("vehicle_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("quotations")
      .select("*, repair_jobs(job_number,status)")
      .eq("vehicle_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("*, repair_jobs(job_number,status)")
      .eq("vehicle_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const invoiceIds = (invoices.data ?? []).map((invoice) => invoice.id);
  const receipts = invoiceIds.length
    ? await supabase
        .from("receipts")
        .select("*, invoices(invoice_no,total,balance_due)")
        .in("invoice_id", invoiceIds)
        .is("deleted_at", null)
        .is("voided_at", null)
        .order("received_at", { ascending: false })
    : { data: [] };

  return {
    setupRequired: false,
    detail: {
      vehicle: vehicle as Record<string, unknown>,
      jobs: (jobs.data ?? []) as Record<string, unknown>[],
      quotations: (quotations.data ?? []) as Record<string, unknown>[],
      invoices: (invoices.data ?? []) as Record<string, unknown>[],
      receipts: (receipts.data ?? []) as Record<string, unknown>[],
    },
  };
}

export async function getQuotationDetail(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, detail: null };

  const { data: quotation, error } = await supabase
    .from("quotations")
    .select(
      "*, customers(full_name,phone,line_id,address), vehicles(license_plate,province,brand,model,year,color,mileage), repair_jobs(job_number,status,reported_problem)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !quotation) return { setupRequired: false, detail: null };

  const [items, invoices, logs] = await Promise.all([
    supabase
      .from("quotation_items")
      .select("*, parts(part_code,name,unit,quantity_on_hand,sale_price)")
      .eq("quotation_id", id)
      .order("sort_order"),
    supabase
      .from("invoices")
      .select("*")
      .eq("quotation_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_logs")
      .select("*, profiles(full_name,email,role)")
      .eq("table_name", "quotations")
      .eq("record_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    setupRequired: false,
    detail: {
      quotation: quotation as Record<string, unknown>,
      items: (items.data ?? []) as Record<string, unknown>[],
      invoices: (invoices.data ?? []) as Record<string, unknown>[],
      logs: (logs.data ?? []) as Record<string, unknown>[],
    },
  };
}

export async function getInvoiceDetail(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, detail: null };

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      "*, customers(full_name,phone,line_id,address), vehicles(license_plate,province,brand,model,year,color,mileage), repair_jobs(job_number,status,reported_problem), quotations(quotation_no,status,total)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !invoice) return { setupRequired: false, detail: null };

  const [items, payments, receipts, allReceipts, invoiceLogs] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("*, parts(part_code,name,unit)")
      .eq("invoice_id", id)
      .order("sort_order"),
    supabase
      .from("payment_records")
      .select("*, receipts(receipt_no,received_at,amount,payment_method)")
      .eq("invoice_id", id)
      .is("voided_at", null)
      .order("paid_at", { ascending: false }),
    supabase
      .from("receipts")
      .select("*")
      .eq("invoice_id", id)
      .is("deleted_at", null)
      .is("voided_at", null)
      .order("received_at", { ascending: false }),
    supabase.from("receipts").select("id").eq("invoice_id", id).is("deleted_at", null),
    supabase
      .from("activity_logs")
      .select("*, profiles(full_name,email,role)")
      .eq("table_name", "invoices")
      .eq("record_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const receiptIds = ((allReceipts.data ?? []) as { id: string }[]).map((receipt) => receipt.id);
  const receiptLogs = receiptIds.length
    ? await supabase
        .from("activity_logs")
        .select("*, profiles(full_name,email,role)")
        .eq("table_name", "receipts")
        .in("record_id", receiptIds)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] };

  const logs = [
    ...((invoiceLogs.data ?? []) as Record<string, unknown>[]),
    ...((receiptLogs.data ?? []) as Record<string, unknown>[]),
  ].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));

  return {
    setupRequired: false,
    detail: {
      invoice: invoice as Record<string, unknown>,
      items: (items.data ?? []) as Record<string, unknown>[],
      payments: (payments.data ?? []) as Record<string, unknown>[],
      receipts: (receipts.data ?? []) as Record<string, unknown>[],
      logs,
    },
  };
}

export async function getReceiptDetail(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, detail: null };

  const { data: receipt, error } = await supabase
    .from("receipts")
    .select(
      "*, customers(full_name,phone,line_id,address), invoices(invoice_no,issued_at,due_at,total,paid_amount,balance_due,payment_status,vehicle_id,repair_job_id,quotation_id,notes, vehicles(license_plate,province,brand,model,year,color,mileage), repair_jobs(job_number,status,reported_problem), quotations(quotation_no,status,total))",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !receipt) return { setupRequired: false, detail: null };

  const invoiceId = String((receipt as Record<string, unknown>).invoice_id);
  const [items, payments, incomeRecords, receiptLogs, invoiceLogs] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("*, parts(part_code,name,unit)")
      .eq("invoice_id", invoiceId)
      .order("sort_order"),
    supabase
      .from("payment_records")
      .select("*")
      .eq("receipt_id", id)
      .order("paid_at", { ascending: false }),
    supabase
      .from("income_records")
      .select("*")
      .eq("receipt_id", id)
      .is("deleted_at", null)
      .is("voided_at", null)
      .order("recorded_at", { ascending: false }),
    supabase
      .from("activity_logs")
      .select("*, profiles(full_name,email,role)")
      .eq("table_name", "receipts")
      .eq("record_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("activity_logs")
      .select("*, profiles(full_name,email,role)")
      .eq("table_name", "invoices")
      .eq("record_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const relatedInvoiceLogs = ((invoiceLogs.data ?? []) as Record<string, unknown>[]).filter((log) => {
    const metadata = log.metadata;
    return Boolean(
      metadata &&
        typeof metadata === "object" &&
        !Array.isArray(metadata) &&
        String((metadata as Record<string, unknown>).receipt_id) === id,
    );
  });

  const logs = [...((receiptLogs.data ?? []) as Record<string, unknown>[]), ...relatedInvoiceLogs].sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );

  return {
    setupRequired: false,
    detail: {
      receipt: receipt as Record<string, unknown>,
      items: (items.data ?? []) as Record<string, unknown>[],
      payments: (payments.data ?? []) as Record<string, unknown>[],
      incomeRecords: (incomeRecords.data ?? []) as Record<string, unknown>[],
      logs,
    },
  };
}

export async function getSupplierDetail(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, detail: null };

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !supplier) return { setupRequired: false, detail: null };

  const [purchases, parts, expenses, stockMovements, logs] = await Promise.all([
    supabase
      .from("purchases")
      .select("*, purchase_items(*, parts(part_code,name,unit,sale_price,quantity_on_hand))")
      .eq("supplier_id", id)
      .is("deleted_at", null)
      .order("purchased_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("parts")
      .select("id,part_code,name,cost_price,sale_price,quantity_on_hand,unit,low_stock_threshold,notes")
      .eq("supplier_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("expense_records")
      .select("*")
      .eq("supplier_id", id)
      .is("deleted_at", null)
      .order("recorded_at", { ascending: false }),
    supabase
      .from("stock_movements")
      .select("*, parts!inner(part_code,name,unit,supplier_id)")
      .eq("parts.supplier_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("activity_logs")
      .select("*, profiles(full_name,email,role)")
      .eq("table_name", "suppliers")
      .eq("record_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    setupRequired: false,
    detail: {
      supplier: supplier as Record<string, unknown>,
      purchases: (purchases.data ?? []) as Record<string, unknown>[],
      parts: (parts.data ?? []) as Record<string, unknown>[],
      expenses: (expenses.data ?? []) as Record<string, unknown>[],
      stockMovements: (stockMovements.data ?? []) as Record<string, unknown>[],
      logs: (logs.data ?? []) as Record<string, unknown>[],
    },
  };
}

export async function getDocumentForPrint(type: string, id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const config = type === "repair-job" ? modules["repair-jobs"] : modules[type];
  if (!config) return null;

  const { data: document } = await supabase.from(config.table).select("*").eq("id", id).maybeSingle();
  if (!document) return null;

  const settings = await getLatestCompanySettings(supabase);
  const receiptInvoice =
    type === "receipts" && (document as Record<string, unknown>).invoice_id
      ? await supabase
          .from("invoices")
          .select("*")
          .eq("id", String((document as Record<string, unknown>).invoice_id))
          .maybeSingle()
      : { data: null };
  const invoiceSource = (receiptInvoice.data as Record<string, unknown> | null) ?? null;
  const customerId = (document as Record<string, unknown>).customer_id ?? invoiceSource?.customer_id;
  const vehicleId = (document as Record<string, unknown>).vehicle_id ?? invoiceSource?.vehicle_id;
  const invoiceId = type === "receipts" ? (document as Record<string, unknown>).invoice_id : id;
  const [customer, vehicle, quotationItems, invoiceItems, cashBillItems] = await Promise.all([
    customerId ? supabase.from("customers").select("*").eq("id", String(customerId)).maybeSingle() : Promise.resolve({ data: null }),
    vehicleId ? supabase.from("vehicles").select("*").eq("id", String(vehicleId)).maybeSingle() : Promise.resolve({ data: null }),
    type === "quotations"
      ? supabase.from("quotation_items").select("*").eq("quotation_id", id).order("sort_order")
      : Promise.resolve({ data: [] }),
    type === "invoices" || type === "receipts"
      ? supabase.from("invoice_items").select("*").eq("invoice_id", String(invoiceId)).order("sort_order")
      : Promise.resolve({ data: [] }),
    type === "cash-bills"
      ? supabase.from("cash_bill_items").select("*").eq("cash_bill_id", id).order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);
  const manualCustomer: Record<string, unknown> | null =
    type === "cash-bills"
      ? {
          full_name: (document as Record<string, unknown>).customer_name,
          phone: (document as Record<string, unknown>).customer_phone,
          address: (document as Record<string, unknown>).customer_address,
        }
      : null;
  const manualVehicle: Record<string, unknown> | null =
    type === "cash-bills"
      ? {
          license_plate: (document as Record<string, unknown>).vehicle_text,
        }
      : null;

  return {
    type,
    document: document as Record<string, unknown>,
    company: settings,
    customer: (customer.data as Record<string, unknown> | null) ?? manualCustomer,
    vehicle: (vehicle.data as Record<string, unknown> | null) ?? manualVehicle,
    items:
      type === "quotations"
        ? quotationItems.data ?? []
        : type === "invoices" || type === "receipts"
          ? invoiceItems.data ?? []
          : type === "cash-bills"
            ? cashBillItems.data ?? []
            : [],
  };
}

export async function getRepairJobDetail(id: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { setupRequired: true, detail: null };

  const { data: job, error } = await supabase
    .from("repair_jobs")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !job) return { setupRequired: false, detail: null };

  const [customer, vehicle, items, movements, logs, quotations, invoices, parts] = await Promise.all([
    supabase.from("customers").select("*").eq("id", job.customer_id).maybeSingle(),
    supabase.from("vehicles").select("*").eq("id", job.vehicle_id).maybeSingle(),
    supabase
      .from("repair_job_items")
      .select("*")
      .eq("repair_job_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("stock_movements")
      .select("*, parts(part_code,name,unit,sale_price)")
      .eq("reference_type", "repair_job")
      .eq("reference_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_logs")
      .select("*, profiles(full_name,email,role)")
      .eq("record_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quotations")
      .select("*")
      .eq("repair_job_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("*")
      .eq("repair_job_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("parts")
      .select("id,part_code,name,sale_price,quantity_on_hand,unit")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const invoiceIds = (invoices.data ?? []).map((invoice) => invoice.id);
  const receipts = invoiceIds.length
    ? await supabase
        .from("receipts")
        .select("*")
        .in("invoice_id", invoiceIds)
        .is("deleted_at", null)
        .is("voided_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };

  const imagePaths = Array.isArray(job.images) ? (job.images.filter(Boolean) as string[]) : [];
  const imageUrls = await Promise.all(
    imagePaths.map(async (path) => {
      if (path.startsWith("http")) return { path, url: path };
      const { data } = await supabase.storage.from("repair-job-images").createSignedUrl(path, 60 * 60);
      return { path, url: data?.signedUrl ?? "" };
    }),
  );

  return {
    setupRequired: false,
    detail: {
      job: job as Record<string, unknown>,
      customer: customer.data as Record<string, unknown> | null,
      vehicle: vehicle.data as Record<string, unknown> | null,
      items: (items.data ?? []) as Record<string, unknown>[],
      movements: (movements.data ?? []) as Record<string, unknown>[],
      logs: (logs.data ?? []) as Record<string, unknown>[],
      quotations: (quotations.data ?? []) as Record<string, unknown>[],
      invoices: (invoices.data ?? []) as Record<string, unknown>[],
      receipts: (receipts.data ?? []) as Record<string, unknown>[],
      parts: (parts.data ?? []) as Record<string, unknown>[],
      imageUrls: imageUrls.filter((image) => image.url),
    },
  };
}
