"use client";

import { Download, FileText, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cn, formatCurrency, formatDate, toNumber } from "@/lib/utils";

type Row = Record<string, unknown>;

type ReportsData = {
  income: Row[];
  expenses: Row[];
  invoices: Row[];
  receipts: Row[];
  jobs: Row[];
  parts: Row[];
  purchases: Row[];
  suppliers: Row[];
  stockMovements: Row[];
};

type TabKey = "overview" | "income" | "expenses" | "receivables" | "payables" | "stock" | "jobs";
type StockFilter = "all" | "low" | "out" | "available" | "moving";

type TableColumn = {
  header: string;
  className?: string;
  cell: (row: Row) => React.ReactNode;
};

type ReportShape = {
  income: Row[];
  expenses: Row[];
  invoices: Row[];
  receipts: Row[];
  purchases: Row[];
  jobs: Row[];
  parts: Row[];
  suppliers: Row[];
  receivables: Row[];
  payables: Row[];
  supplierPayables: Row[];
  stockRows: Row[];
  lowStock: Row[];
  outOfStock: Row[];
  activeStockMovements: Row[];
  monthly: Row[];
  incomeCategories: Row[];
  expenseCategories: Row[];
  jobStatuses: Row[];
};

const tabLabels: { key: TabKey; label: string }[] = [
  { key: "overview", label: "ภาพรวม" },
  { key: "income", label: "รายรับ" },
  { key: "expenses", label: "รายจ่าย" },
  { key: "receivables", label: "ลูกหนี้" },
  { key: "payables", label: "เจ้าหนี้" },
  { key: "stock", label: "สต๊อก" },
  { key: "jobs", label: "งานซ่อม" },
];

const chartColors = ["#0f766e", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#475569"];

const stockFilterLabels: { key: StockFilter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "low", label: "ใกล้หมด" },
  { key: "out", label: "หมดสต๊อก" },
  { key: "available", label: "พร้อมใช้" },
  { key: "moving", label: "มีความเคลื่อนไหว" },
];

function nested(row: Row, key: string) {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

function text(value: unknown) {
  return String(value ?? "-");
}

function rowDate(row: Row, dateKey: string) {
  return String(row[dateKey] ?? "").slice(0, 10);
}

function rowMatches(row: Row, query: string) {
  if (!query.trim()) return true;
  return JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase());
}

function filterRows(rows: Row[], query: string, from: string, to: string, dateKey: string) {
  return rows.filter((row) => {
    const date = rowDate(row, dateKey);
    return rowMatches(row, query) && (!from || date >= from) && (!to || date <= to);
  });
}

function flattenValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function makeCsv(rows: Row[], preferredKeys?: string[]) {
  const headers = preferredKeys?.length ? preferredKeys : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const body = rows
    .map((row) =>
      headers
        .map((key) => {
          const value = flattenValue(row[key]).replaceAll('"', '""');
          return `"${value}"`;
        })
        .join(","),
    )
    .join("\n");

  return `data:text/csv;charset=utf-8,${encodeURIComponent(`${headers.join(",")}\n${body}`)}`;
}

function monthKey(value: unknown) {
  const raw = String(value ?? "");
  if (!raw) return "ไม่ระบุ";
  return raw.slice(0, 7);
}

function groupSum(rows: Row[], key: string, amountKey: string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = text(row[key]);
    map.set(name, (map.get(name) ?? 0) + toNumber(row[amountKey]));
  }
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function countBy(rows: Row[], key: string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = text(row[key]);
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function stockStatus(row: Row) {
  const quantity = toNumber(row.quantity_on_hand);
  const threshold = toNumber(row.low_stock_threshold);
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= threshold) return "low_stock";
  return "in_stock";
}

function buildStockRows(parts: Row[], stockMovements: Row[]) {
  const movementsByPart = new Map<string, Row[]>();
  for (const movement of stockMovements) {
    const partId = String(movement.part_id ?? "");
    if (!partId) continue;
    movementsByPart.set(partId, [...(movementsByPart.get(partId) ?? []), movement]);
  }

  return parts.map((part) => {
    const partMovements = movementsByPart.get(String(part.id)) ?? [];
    const incoming = partMovements.filter((movement) => toNumber(movement.quantity) > 0).reduce((sum, movement) => sum + toNumber(movement.quantity), 0);
    const outgoing = Math.abs(partMovements.filter((movement) => toNumber(movement.quantity) < 0).reduce((sum, movement) => sum + toNumber(movement.quantity), 0));
    const lastMovementAt = partMovements
      .map((movement) => String(movement.created_at ?? ""))
      .filter(Boolean)
      .sort()
      .at(-1);
    const quantity = toNumber(part.quantity_on_hand);
    const cost = toNumber(part.cost_price);
    const sale = toNumber(part.sale_price);
    const supplier = nested(part, "suppliers");

    return {
      ...part,
      supplier_name: supplier?.name ?? "",
      incoming_qty: incoming,
      outgoing_qty: outgoing,
      movement_count: partMovements.length,
      last_movement_at: lastMovementAt ?? null,
      stock_value: quantity * cost,
      sale_value: quantity * sale,
      potential_margin: quantity * Math.max(sale - cost, 0),
      stock_status: stockStatus(part),
    };
  });
}

function filterStockRows(rows: Row[], filter: StockFilter) {
  if (filter === "low") return rows.filter((row) => String(row.stock_status) === "low_stock" || String(row.stock_status) === "out_of_stock");
  if (filter === "out") return rows.filter((row) => String(row.stock_status) === "out_of_stock");
  if (filter === "available") return rows.filter((row) => String(row.stock_status) === "in_stock");
  if (filter === "moving") return rows.filter((row) => toNumber(row.movement_count) > 0);
  return rows;
}

function buildMonthlyData(income: Row[], expenses: Row[], invoices: Row[]) {
  const keys = new Set<string>();
  for (const row of income) keys.add(monthKey(row.recorded_at));
  for (const row of expenses) keys.add(monthKey(row.recorded_at));
  for (const row of invoices) keys.add(monthKey(row.issued_at));

  return Array.from(keys)
    .sort()
    .map((month) => ({
      month,
      income: income.filter((row) => monthKey(row.recorded_at) === month).reduce((sum, row) => sum + toNumber(row.amount), 0),
      expense: expenses.filter((row) => monthKey(row.recorded_at) === month).reduce((sum, row) => sum + toNumber(row.amount), 0),
      sales: invoices.filter((row) => monthKey(row.issued_at) === month).reduce((sum, row) => sum + toNumber(row.total), 0),
    }));
}

function amountCell(value: unknown) {
  return <span className="font-semibold">{formatCurrency(value)}</span>;
}

function dateCell(value: unknown) {
  return <span>{formatDate(value)}</span>;
}

function documentLink(href: string, label: unknown) {
  return (
    <Link className="inline-flex items-center gap-1 font-semibold text-primary hover:underline" href={href}>
      <FileText className="h-4 w-4" />
      {text(label)}
    </Link>
  );
}

export function ReportsClient({ data }: { data: ReportsData }) {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");

  const report = useMemo(() => {
    const income = filterRows(data.income, query, from, to, "recorded_at");
    const expenses = filterRows(data.expenses, query, from, to, "recorded_at");
    const invoices = filterRows(data.invoices, query, from, to, "issued_at");
    const receipts = filterRows(data.receipts, query, from, to, "received_at");
    const purchases = filterRows(data.purchases, query, from, to, "purchased_at");
    const jobs = filterRows(data.jobs, query, from, to, "created_at");
    const parts = data.parts.filter((row) => rowMatches(row, query));
    const suppliers = data.suppliers.filter((row) => rowMatches(row, query));
    const activeStockMovements = filterRows(data.stockMovements, "", from, to, "created_at");
    const stockRows = buildStockRows(parts, activeStockMovements);
    const filteredStockRows = filterStockRows(stockRows, stockFilter);
    const receivables = invoices.filter((row) => toNumber(row.balance_due) > 0 && String(row.payment_status) !== "cancelled");
    const payables = purchases.filter((row) => toNumber(row.balance_due) > 0 && String(row.payment_status) !== "cancelled");
    const supplierPayables = suppliers.filter((row) => toNumber(row.credit_balance) > 0);
    const lowStock = stockRows.filter((row) => ["low_stock", "out_of_stock"].includes(String(row.stock_status)));
    const outOfStock = stockRows.filter((row) => String(row.stock_status) === "out_of_stock");

    return {
      income,
      expenses,
      invoices,
      receipts,
      purchases,
      jobs,
      parts: filteredStockRows,
      suppliers,
      receivables,
      payables,
      supplierPayables,
      stockRows,
      lowStock,
      outOfStock,
      activeStockMovements,
      monthly: buildMonthlyData(income, expenses, invoices),
      incomeCategories: groupSum(income, "category", "amount"),
      expenseCategories: groupSum(expenses, "category", "amount"),
      jobStatuses: countBy(jobs, "status"),
    };
  }, [data, from, query, stockFilter, to]);

  const totals = {
    income: report.income.reduce((sum, row) => sum + toNumber(row.amount), 0),
    expenses: report.expenses.reduce((sum, row) => sum + toNumber(row.amount), 0),
    sales: report.invoices.reduce((sum, row) => sum + toNumber(row.total), 0),
    receipts: report.receipts.reduce((sum, row) => sum + toNumber(row.amount), 0),
    receivables: report.receivables.reduce((sum, row) => sum + toNumber(row.balance_due), 0),
    payables:
      report.payables.reduce((sum, row) => sum + toNumber(row.balance_due), 0) +
      report.supplierPayables.reduce((sum, row) => sum + toNumber(row.credit_balance), 0),
    stockValue: report.stockRows.reduce((sum, row) => sum + toNumber(row.stock_value), 0),
    stockPotentialMargin: report.stockRows.reduce((sum, row) => sum + toNumber(row.potential_margin), 0),
    lowStock: report.lowStock.length,
    outOfStock: report.outOfStock.length,
    stockMovements: report.activeStockMovements.length,
    activeJobs: report.jobs.filter((row) => !["completed", "delivered", "cancelled"].includes(String(row.status))).length,
  };

  const activeRows = getActiveRows(activeTab, report);
  const activeCsvKeys = getCsvKeys(activeTab);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_170px_170px_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาเอกสาร ลูกค้า รถ Supplier หรือสถานะ"
              className="h-11 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <input
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            type="date"
            className="h-11 rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={to}
            onChange={(event) => setTo(event.target.value)}
            type="date"
            className="h-11 rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
          />
          <ButtonLink href={makeCsv(activeRows, activeCsvKeys)} download={`walid-garage-${activeTab}.csv`} variant="secondary">
            <Download className="h-4 w-4" />
            Export CSV
          </ButtonLink>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {tabLabels.map((tab) => (
            <button
              className={cn(
                "h-10 shrink-0 rounded-md border px-3 text-sm font-semibold transition",
                activeTab === tab.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-foreground hover:bg-surface-soft",
              )}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportCard label="รายรับตามช่วง" value={formatCurrency(totals.income)} />
        <ReportCard label="รายจ่ายตามช่วง" value={formatCurrency(totals.expenses)} />
        <ReportCard label="กำไรโดยประมาณ" value={formatCurrency(totals.income - totals.expenses)} tone={totals.income - totals.expenses >= 0 ? "good" : "danger"} />
        <ReportCard label="ยอดขายจากใบแจ้งหนี้" value={formatCurrency(totals.sales)} />
        <ReportCard label="เงินรับจริง" value={formatCurrency(totals.receipts)} />
        <ReportCard label="ลูกหนี้ค้างชำระ" value={formatCurrency(totals.receivables)} tone="warn" />
        <ReportCard label="เจ้าหนี้ค้างชำระ" value={formatCurrency(totals.payables)} tone="danger" />
        <ReportCard label="งานซ่อมที่กำลังเปิด" value={`${totals.activeJobs} งาน`} />
      </section>

      {activeTab === "stock" ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ReportCard label="มูลค่าสต๊อกตามทุน" value={formatCurrency(totals.stockValue)} />
          <ReportCard label="กำไรคาดการณ์จากสต๊อก" value={formatCurrency(totals.stockPotentialMargin)} tone="good" />
          <ReportCard label="อะไหล่ใกล้หมด" value={`${totals.lowStock} รายการ`} tone="warn" />
          <ReportCard label="หมดสต๊อก / Movement" value={`${totals.outOfStock} / ${totals.stockMovements}`} tone={totals.outOfStock > 0 ? "danger" : undefined} />
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <ChartPanel title="รายรับ รายจ่าย และยอดขายรายเดือน">
          <ResponsiveContainer>
            <LineChart data={report.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d8dbd0" />
              <XAxis dataKey="month" stroke="#6f7468" />
              <YAxis stroke="#6f7468" tickFormatter={(value) => `${Number(value) / 1000}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Line dataKey="income" name="รายรับ" stroke="#0f766e" strokeWidth={2} />
              <Line dataKey="expense" name="รายจ่าย" stroke="#dc2626" strokeWidth={2} />
              <Line dataKey="sales" name="ยอดขาย" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="งานซ่อมตามสถานะ">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={report.jobStatuses} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2}>
                {report.jobStatuses.map((entry, index) => (
                  <Cell fill={chartColors[index % chartColors.length]} key={entry.name} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value} งาน`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <ChartPanel title="รายรับตามหมวดหมู่">
          <ResponsiveContainer>
            <BarChart data={report.incomeCategories}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d8dbd0" />
              <XAxis dataKey="name" stroke="#6f7468" />
              <YAxis stroke="#6f7468" tickFormatter={(value) => `${Number(value) / 1000}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="value" name="รายรับ" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="รายจ่ายตามหมวดหมู่">
          <ResponsiveContainer>
            <BarChart data={report.expenseCategories}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d8dbd0" />
              <XAxis dataKey="name" stroke="#6f7468" />
              <YAxis stroke="#6f7468" tickFormatter={(value) => `${Number(value) / 1000}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="value" name="รายจ่าย" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>

      {activeTab === "overview" ? <OverviewTables report={report} /> : null}
      {activeTab === "income" ? <IncomeReport rows={report.income} /> : null}
      {activeTab === "expenses" ? <ExpenseReport rows={report.expenses} /> : null}
      {activeTab === "receivables" ? <ReceivableReport rows={report.receivables} /> : null}
      {activeTab === "payables" ? <PayableReport purchases={report.payables} suppliers={report.supplierPayables} /> : null}
      {activeTab === "stock" ? (
        <StockReport
          rows={report.parts}
          allRows={report.stockRows}
          lowStockCount={totals.lowStock}
          stockFilter={stockFilter}
          onStockFilterChange={setStockFilter}
          showInsights
        />
      ) : null}
      {activeTab === "jobs" ? <JobsReport rows={report.jobs} /> : null}
    </div>
  );
}

function getActiveRows(activeTab: TabKey, report: ReportShape) {
  if (activeTab === "income") return report.income;
  if (activeTab === "expenses") return report.expenses;
  if (activeTab === "receivables") return report.receivables;
  if (activeTab === "payables") return [...report.payables, ...report.supplierPayables];
  if (activeTab === "stock") return report.parts;
  if (activeTab === "jobs") return report.jobs;
  return [...report.income, ...report.expenses, ...report.invoices, ...report.receipts, ...report.purchases];
}

function getCsvKeys(activeTab: TabKey) {
  if (activeTab === "income") return ["recorded_at", "category", "description", "amount", "payment_method", "reference_no"];
  if (activeTab === "expenses") return ["recorded_at", "category", "description", "amount", "payment_method"];
  if (activeTab === "receivables") return ["invoice_no", "issued_at", "due_at", "payment_status", "total", "paid_amount", "balance_due"];
  if (activeTab === "payables") return ["purchase_no", "purchased_at", "payment_status", "total", "paid_amount", "balance_due", "credit_balance"];
  if (activeTab === "stock") {
    return [
      "part_code",
      "name",
      "supplier_name",
      "stock_status",
      "quantity_on_hand",
      "low_stock_threshold",
      "cost_price",
      "sale_price",
      "stock_value",
      "potential_margin",
      "incoming_qty",
      "outgoing_qty",
      "movement_count",
      "last_movement_at",
    ];
  }
  if (activeTab === "jobs") return ["job_number", "received_at", "status", "reported_problem", "estimated_total"];
  return undefined;
}

function ReportCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold",
          tone === "good" && "text-emerald-700",
          tone === "warn" && "text-amber-700",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="h-80">{children}</div>
    </section>
  );
}

function ReportTable({
  title,
  rows,
  columns,
  empty = "ไม่มีข้อมูลในช่วงที่เลือก",
}: {
  title: string;
  rows: Row[];
  columns: TableColumn[];
  empty?: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge value={`${rows.length} รายการ`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-soft text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              {columns.map((column) => (
                <th className={column.className ?? "px-4 py-3 font-semibold"} key={column.header}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr className="border-t border-border" key={text(row.id ?? `${row.prefix}-${row.purchase_no}`)}>
                  {columns.map((column) => (
                    <td className={column.className ?? "px-4 py-3 align-top"} key={column.header}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-10 text-center text-muted" colSpan={columns.length}>
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OverviewTables({ report }: { report: ReportShape }) {
  return (
    <section className="grid gap-5 xl:grid-cols-2">
      <ReceivableReport rows={report.receivables.slice(0, 8)} title="ลูกหนี้ค้างชำระล่าสุด" />
      <StockReport rows={report.lowStock.slice(0, 8)} lowStockCount={report.lowStock.length} title="อะไหล่ใกล้หมด" />
      <IncomeReport rows={report.income.slice(0, 8)} title="รายรับล่าสุด" />
      <ExpenseReport rows={report.expenses.slice(0, 8)} title="รายจ่ายล่าสุด" />
    </section>
  );
}

function IncomeReport({ rows, title = "รายงานรายรับ" }: { rows: Row[]; title?: string }) {
  return (
    <ReportTable
      title={title}
      rows={rows}
      columns={[
        { header: "วันที่", cell: (row) => dateCell(row.recorded_at) },
        { header: "หมวดหมู่", cell: (row) => <Badge value={row.category} /> },
        {
          header: "รายละเอียด",
          cell: (row) => {
            const receipt = nested(row, "receipts");
            return (
              <div>
                <p className="font-semibold">{text(row.description)}</p>
                {receipt ? (
                  <Link className="text-xs font-semibold text-primary hover:underline" href={`/receipts/${row.receipt_id}`}>
                    {text(receipt.receipt_no)}
                  </Link>
                ) : (
                  <p className="text-xs text-muted">{text(row.reference_no)}</p>
                )}
              </div>
            );
          },
        },
        { header: "ช่องทาง", cell: (row) => text(row.payment_method) },
        { header: "จำนวนเงิน", cell: (row) => amountCell(row.amount), className: "px-4 py-3 text-right" },
      ]}
    />
  );
}

function ExpenseReport({ rows, title = "รายงานรายจ่าย" }: { rows: Row[]; title?: string }) {
  return (
    <ReportTable
      title={title}
      rows={rows}
      columns={[
        { header: "วันที่", cell: (row) => dateCell(row.recorded_at) },
        { header: "หมวดหมู่", cell: (row) => <Badge value={row.category} /> },
        {
          header: "รายละเอียด",
          cell: (row) => {
            const supplier = nested(row, "suppliers");
            return (
              <div>
                <p className="font-semibold">{text(row.description)}</p>
                {supplier ? (
                  <Link className="text-xs font-semibold text-primary hover:underline" href={`/suppliers/${row.supplier_id}`}>
                    {text(supplier.name)}
                  </Link>
                ) : (
                  <p className="text-xs text-muted">-</p>
                )}
              </div>
            );
          },
        },
        { header: "ช่องทาง", cell: (row) => text(row.payment_method) },
        { header: "จำนวนเงิน", cell: (row) => amountCell(row.amount), className: "px-4 py-3 text-right" },
      ]}
    />
  );
}

function ReceivableReport({ rows, title = "รายงานลูกหนี้ค้างชำระ" }: { rows: Row[]; title?: string }) {
  return (
    <ReportTable
      title={title}
      rows={rows}
      columns={[
        {
          header: "ใบแจ้งหนี้",
          cell: (row) => documentLink(`/invoices/${row.id}`, row.invoice_no),
        },
        {
          header: "ลูกค้า / รถ",
          cell: (row) => {
            const customer = nested(row, "customers");
            const vehicle = nested(row, "vehicles");
            return (
              <div>
                <p className="font-semibold">{text(customer?.full_name)}</p>
                <p className="text-xs text-muted">
                  {text(vehicle?.license_plate)} {text(vehicle?.brand)} {text(vehicle?.model)}
                </p>
              </div>
            );
          },
        },
        { header: "ครบกำหนด", cell: (row) => dateCell(row.due_at) },
        { header: "สถานะ", cell: (row) => <Badge value={row.payment_status} /> },
        { header: "ค้างชำระ", cell: (row) => amountCell(row.balance_due), className: "px-4 py-3 text-right text-danger" },
      ]}
    />
  );
}

function PayableReport({ purchases, suppliers }: { purchases: Row[]; suppliers: Row[] }) {
  const supplierRows = suppliers.map((supplier) => ({
    ...supplier,
    purchase_no: "-",
    purchased_at: supplier.updated_at ?? supplier.created_at,
    payment_status: "supplier_credit",
    balance_due: supplier.credit_balance,
  }));

  return (
    <ReportTable
      title="รายงานเจ้าหนี้ค้างชำระ"
      rows={[...purchases, ...supplierRows]}
      columns={[
        {
          header: "เอกสาร / Supplier",
          cell: (row) => {
            return row.id && row.purchase_no && row.purchase_no !== "-" ? (
              <Link className="font-semibold text-primary hover:underline" href={`/purchases/${row.id}`}>
                {text(row.purchase_no)}
              </Link>
            ) : (
              <Link className="font-semibold text-primary hover:underline" href={`/suppliers/${row.id}`}>
                {text(row.name)}
              </Link>
            );
          },
        },
        {
          header: "Supplier",
          cell: (row) => {
            const supplier = nested(row, "suppliers");
            return text(supplier?.name ?? row.name);
          },
        },
        { header: "วันที่", cell: (row) => dateCell(row.purchased_at) },
        { header: "สถานะ", cell: (row) => <Badge value={row.payment_status} /> },
        { header: "ค้างชำระ", cell: (row) => amountCell(row.balance_due), className: "px-4 py-3 text-right text-danger" },
      ]}
    />
  );
}

function stockStatusLabel(value: unknown) {
  if (value === "out_of_stock") return "หมดสต๊อก";
  if (value === "low_stock") return "ใกล้หมด";
  return "พร้อมใช้";
}

function StockReport({
  rows,
  allRows,
  lowStockCount,
  stockFilter,
  onStockFilterChange,
  showInsights = false,
  title = "รายงานสต๊อกอะไหล่",
}: {
  rows: Row[];
  allRows?: Row[];
  lowStockCount: number;
  stockFilter?: StockFilter;
  onStockFilterChange?: (filter: StockFilter) => void;
  showInsights?: boolean;
  title?: string;
}) {
  const rankedByValue = (allRows ?? rows)
    .slice()
    .sort((a, b) => toNumber(b.stock_value) - toNumber(a.stock_value))
    .slice(0, 8)
    .map((row) => ({
      name: `${text(row.part_code)} ${text(row.name)}`.trim(),
      value: toNumber(row.stock_value),
    }));

  return (
    <div className="space-y-5">
      {showInsights && onStockFilterChange && stockFilter ? (
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold">ตัวกรองสต๊อก</h2>
              <p className="text-sm text-muted">เลือกดูเฉพาะรายการที่ต้องเติมของ รายการหมดสต๊อก หรือรายการที่มี movement ในช่วงวันที่เลือก</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {stockFilterLabels.map((filter) => (
                <button
                  className={cn(
                    "h-10 rounded-md border px-3 text-sm font-semibold transition",
                    stockFilter === filter.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-foreground hover:bg-surface-soft",
                  )}
                  key={filter.key}
                  onClick={() => onStockFilterChange(filter.key)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {showInsights && rankedByValue.length ? (
        <ChartPanel title="มูลค่าสต๊อกสูงสุดตามทุน">
          <ResponsiveContainer>
            <BarChart data={rankedByValue} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d8dbd0" />
              <XAxis type="number" stroke="#6f7468" tickFormatter={(value) => `${Number(value) / 1000}k`} />
              <YAxis dataKey="name" type="category" width={160} stroke="#6f7468" />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="value" name="มูลค่าทุน" fill="#0f766e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      ) : null}

      <ReportTable
        title={`${title} (${lowStockCount} รายการใกล้หมด)`}
        rows={rows}
        columns={[
          {
            header: "อะไหล่",
            cell: (row) => {
              const supplier = nested(row, "suppliers");
              return (
                <div>
                  <Link className="font-semibold text-primary hover:underline" href={`/parts/${row.id}`}>
                    {text(row.part_code)} {text(row.name)}
                  </Link>
                  <p className="text-xs text-muted">{text(supplier?.name ?? row.supplier_name)}</p>
                </div>
              );
            },
          },
          {
            header: "สถานะ",
            cell: (row) => <Badge value={stockStatusLabel(row.stock_status)} />,
          },
          { header: "คงเหลือ", cell: (row) => <Badge value={`${text(row.quantity_on_hand)} ${text(row.unit)}`} /> },
          { header: "จุดเตือน", cell: (row) => text(row.low_stock_threshold) },
          { header: "มูลค่าทุน", cell: (row) => amountCell(row.stock_value), className: "px-4 py-3 text-right" },
          { header: "กำไรคาดการณ์", cell: (row) => amountCell(row.potential_margin), className: "px-4 py-3 text-right" },
          { header: "รับเข้า", cell: (row) => text(row.incoming_qty), className: "px-4 py-3 text-right" },
          { header: "เบิกใช้/คืนออก", cell: (row) => text(row.outgoing_qty), className: "px-4 py-3 text-right" },
          { header: "Movement", cell: (row) => text(row.movement_count), className: "px-4 py-3 text-right" },
          { header: "ล่าสุด", cell: (row) => dateCell(row.last_movement_at) },
        ]}
      />
    </div>
  );
}

function JobsReport({ rows }: { rows: Row[] }) {
  return (
    <ReportTable
      title="รายงานงานซ่อมตามสถานะ"
      rows={rows}
      columns={[
        { header: "เลขงาน", cell: (row) => documentLink(`/repair-jobs/${row.id}`, row.job_number) },
        {
          header: "ลูกค้า / รถ",
          cell: (row) => {
            const customer = nested(row, "customers");
            const vehicle = nested(row, "vehicles");
            return (
              <div>
                <p className="font-semibold">{text(customer?.full_name)}</p>
                <p className="text-xs text-muted">
                  {text(vehicle?.license_plate)} {text(vehicle?.brand)} {text(vehicle?.model)}
                </p>
              </div>
            );
          },
        },
        { header: "วันที่รับรถ", cell: (row) => dateCell(row.received_at ?? row.created_at) },
        { header: "สถานะ", cell: (row) => <Badge value={row.status} /> },
        { header: "อาการเสีย", cell: (row) => text(row.reported_problem) },
        { header: "ยอดประมาณ", cell: (row) => amountCell(row.estimated_total), className: "px-4 py-3 text-right" },
      ]}
    />
  );
}
