import { Clock3, History, UserRound } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

type AuditRow = Record<string, unknown>;

type AuditTrailPanelProps = {
  logs?: AuditRow[];
  title?: string;
  empty?: string;
  compact?: boolean;
  className?: string;
};

const actionLabels: Record<string, string> = {
  approve_delete_approval: "อนุมัติคำขอลบข้อมูล",
  convert_quotation_to_invoice: "แปลงใบเสนอราคาเป็นใบแจ้งหนี้",
  create: "สร้างข้อมูล",
  create_purchase: "สร้างใบซื้อและรับสต๊อก",
  create_receipt: "ออกใบเสร็จรับเงิน",
  pay_supplier_purchase: "จ่ายชำระ Supplier",
  receive_invoice_payment: "รับชำระใบแจ้งหนี้",
  reject_delete_approval: "ปฏิเสธคำขอลบข้อมูล",
  request_delete_approval: "ขออนุมัติลบข้อมูล",
  reverse_invoice_payment: "คืนยอดชำระใบแจ้งหนี้",
  seed: "สร้างข้อมูลตั้งต้น",
  seed_smoke: "ทดสอบข้อมูลตั้งต้น",
  update: "แก้ไขข้อมูล",
  update_quotation_status: "เปลี่ยนสถานะใบเสนอราคา",
  use_part: "เบิกใช้อะไหล่",
  void_invoice: "ยกเลิกใบแจ้งหนี้",
  void_purchase: "ยกเลิกใบซื้อ",
  void_receipt: "ยกเลิกใบเสร็จรับเงิน",
};

const tableLabels: Record<string, string> = {
  company_settings: "ตั้งค่ากิจการ",
  invoices: "ใบแจ้งหนี้",
  parts: "อะไหล่",
  profiles: "ผู้ใช้",
  purchases: "ใบซื้อ",
  quotations: "ใบเสนอราคา",
  receipts: "ใบเสร็จ",
  repair_jobs: "งานซ่อม",
  users: "ผู้ใช้",
};

const metadataLabels: Record<string, string> = {
  amount: "จำนวนเงิน",
  balance_due: "ยอดค้าง",
  invoice_no: "เลขที่ใบแจ้งหนี้",
  notes: "หมายเหตุ",
  paid_amount: "ชำระแล้ว",
  part_name: "ชื่ออะไหล่",
  payment_method: "ช่องทางชำระ",
  payment_status: "สถานะชำระเงิน",
  purchase_no: "เลขที่ใบซื้อ",
  quantity: "จำนวน",
  quotation_no: "เลขที่ใบเสนอราคา",
  reason: "เหตุผล",
  receipt_no: "เลขที่ใบเสร็จ",
  reversed_amount: "ยอดที่คืน",
  reversed_stock_items: "รายการสต๊อกที่ย้อนกลับ",
  status: "สถานะ",
  total: "ยอดรวม",
  voided_expense_records: "รายจ่ายที่ยกเลิก",
  voided_income_records: "รายรับที่ยกเลิก",
  voided_payment_records: "รายการรับชำระที่ยกเลิก",
};

const hiddenMetadataKeys = new Set(["transactional"]);
const currencyKeys = new Set(["amount", "balance_due", "paid_amount", "reversed_amount", "total"]);

function isRecord(value: unknown): value is AuditRow {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nested(row: AuditRow, key: string): AuditRow | null {
  const value = row[key];
  return isRecord(value) ? value : null;
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function humanizeKey(key: string) {
  return key
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function formatMetadataValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (currencyKeys.has(key)) return formatCurrency(value);
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  if (Array.isArray(value)) return `${value.length} รายการ`;
  if (isRecord(value)) return JSON.stringify(value) ?? "-";
  return String(value);
}

function metadataEntries(metadata: unknown) {
  if (!isRecord(metadata)) return [];

  return Object.entries(metadata)
    .filter(([key]) => !hiddenMetadataKeys.has(key))
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      key,
      label: metadataLabels[key] ?? humanizeKey(key),
      value: formatMetadataValue(key, value),
    }));
}

function actorName(log: AuditRow) {
  const profile = nested(log, "profiles");
  return text(profile?.full_name ?? profile?.email ?? log.actor_id);
}

export function AuditTrailPanel({
  logs = [],
  title = "ประวัติการทำรายการ",
  empty = "ยังไม่มีประวัติการทำรายการ",
  compact = false,
  className,
}: AuditTrailPanelProps) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-border bg-surface shadow-sm", className)}>
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-soft">
          <History className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted">{logs.length ? `${logs.length} รายการล่าสุด` : empty}</p>
        </div>
      </div>

      {logs.length ? (
        <ol className={cn("divide-y divide-border", compact && "max-h-[520px] overflow-y-auto")}>
          {logs.map((log, index) => {
            const entries = metadataEntries(log.metadata).slice(0, 8);
            const action = String(log.action ?? "");
            const tableName = String(log.table_name ?? "");

            return (
              <li className="p-4" key={String(log.id ?? `${log.created_at ?? "log"}-${index}`)}>
                <div className="flex gap-3">
                  <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">{actionLabels[action] ?? humanizeKey(action)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatDateTime(log.created_at)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="h-3.5 w-3.5" />
                            {actorName(log)}
                          </span>
                        </div>
                      </div>
                      <span className="w-fit rounded-full border border-border bg-surface-soft px-2.5 py-1 text-xs font-semibold text-muted">
                        {tableLabels[tableName] ?? humanizeKey(tableName)}
                      </span>
                    </div>

                    {entries.length ? (
                      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                        {entries.map((entry) => (
                          <div className="rounded-md bg-surface-soft px-3 py-2" key={entry.key}>
                            <dt className="text-xs font-semibold text-muted">{entry.label}</dt>
                            <dd className="mt-1 break-words text-sm font-medium">{entry.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mt-3 rounded-md bg-surface-soft px-3 py-2 text-sm text-muted">
                        ไม่มีรายละเอียดเพิ่มเติม
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="p-10 text-center text-sm text-muted">{empty}</div>
      )}
    </section>
  );
}
