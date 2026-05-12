export const ROLES = ["owner", "manager", "staff", "accountant"] as const;

export type UserRole = (typeof ROLES)[number];

export type RolePolicy = {
  read: UserRole[];
  write: UserRole[];
  delete: UserRole[];
};

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "checkbox"
  | "select"
  | "line-items";

export type FieldOption = {
  label: string;
  value: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

export type FieldConfig = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: FieldOption[];
  optionsKey?: ReferenceKey;
  min?: number;
  step?: string;
};

export type ModuleKey =
  | "customers"
  | "vehicles"
  | "repair-jobs"
  | "parts"
  | "purchases"
  | "suppliers"
  | "quotations"
  | "invoices"
  | "receipts"
  | "billing-statements"
  | "cash-bills"
  | "income"
  | "expenses"
  | "settings"
  | "users";

export type TableName =
  | "customers"
  | "vehicles"
  | "repair_jobs"
  | "parts"
  | "purchases"
  | "suppliers"
  | "quotations"
  | "invoices"
  | "receipts"
  | "billing_statements"
  | "cash_bills"
  | "income_records"
  | "expense_records"
  | "company_settings"
  | "profiles";

export type ReferenceKey =
  | "customers"
  | "vehicles"
  | "repairJobs"
  | "parts"
  | "partCategories"
  | "suppliers"
  | "quotations"
  | "invoices"
  | "profiles";

export type ModuleConfig = {
  key: ModuleKey;
  table: TableName;
  title: string;
  description: string;
  createLabel: string;
  allowCreate?: boolean;
  numberPrefix?: "JOB" | "QT" | "INV" | "RC" | "PO" | "CB" | "BS";
  policy: RolePolicy;
  searchFields: string[];
  columns: { key: string; label: string; type?: "money" | "date" | "badge" }[];
  fields: FieldConfig[];
};

export type ReferenceData = Record<ReferenceKey, FieldOption[]>;

export type RecordInput = Record<string, unknown>;

export type ActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
};

export type DashboardData = {
  setupRequired: boolean;
  metrics: {
    todayIncome: number;
    monthIncome: number;
    monthExpense: number;
    profit: number;
    activeJobs: number;
    waitingParts: number;
    completedJobs: number;
    unpaidInvoices: number;
    receivables: number;
  };
  monthly: { month: string; income: number; expense: number }[];
  recentJobs: Record<string, unknown>[];
  unpaid: Record<string, unknown>[];
};

export type LineItemInput = {
  item_type: "labor" | "part" | "other";
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount: number;
  part_id?: string | null;
};

export type PurchasePart = {
  id: string;
  part_code: string;
  name: string;
  cost_price: number | string;
  sale_price: number | string;
  quantity_on_hand: number | string;
  unit: string;
  supplier_id?: string | null;
};

export type PurchaseSupplier = {
  id: string;
  name: string;
  phone?: string | null;
  credit_balance: number | string;
};

export type PurchaseLineItem = {
  id: string;
  part_id: string;
  quantity: number | string;
  unit_cost: number | string;
  total: number | string;
  parts?: Pick<PurchasePart, "part_code" | "name" | "unit"> | null;
};

export type PurchaseRow = {
  id: string;
  purchase_no: string;
  purchased_at: string;
  supplier_id: string;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  paid_amount: number | string;
  balance_due: number | string;
  payment_status: "unpaid" | "partial" | "paid" | "cancelled";
  notes?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  created_at: string;
  suppliers?: Pick<PurchaseSupplier, "name" | "phone"> | null;
  purchase_items?: PurchaseLineItem[];
};

export type PurchasePageData = {
  setupRequired: boolean;
  purchases: PurchaseRow[];
  suppliers: PurchaseSupplier[];
  parts: PurchasePart[];
  purchaseActivityLogs: Record<string, unknown>[];
};
