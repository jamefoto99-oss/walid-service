"use client";

import { CalendarClock, Download, Filter, RotateCcw, Search, ShieldCheck, UserRound } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;

type ActivityLogFilters = {
  from?: string;
  to?: string;
  table?: string;
  actor?: string;
  action?: string;
};

type ActivityLogsClientProps = {
  logs: Row[];
  actors: Row[];
  actions: string[];
  tableNames: string[];
  filters: ActivityLogFilters;
};

const tableLabels: Record<string, string> = {
  activity_logs: "Activity Log",
  backup_exports: "Backup / Export",
  company_settings: "ตั้งค่ากิจการ",
  customers: "ลูกค้า",
  document_counters: "เลขที่เอกสาร",
  expense_records: "รายจ่าย",
  income_records: "รายรับ",
  invoice_items: "รายการใบแจ้งหนี้",
  invoices: "ใบแจ้งหนี้",
  part_categories: "หมวดหมู่อะไหล่",
  parts: "อะไหล่",
  payment_records: "การชำระเงิน",
  profiles: "ผู้ใช้",
  purchase_items: "รายการซื้อ",
  purchases: "ซื้ออะไหล่",
  quotation_items: "รายการใบเสนอราคา",
  quotations: "ใบเสนอราคา",
  receipts: "ใบเสร็จรับเงิน",
  repair_job_items: "รายการซ่อม",
  repair_jobs: "งานซ่อม",
  roles: "Role",
  stock_movements: "สต๊อก",
  suppliers: "Supplier",
  users: "ผู้ใช้",
  vehicles: "รถยนต์",
};

const actionLabels: Record<string, string> = {
  approve_quotation: "อนุมัติใบเสนอราคา",
  convert_quotation_to_invoice: "แปลงเป็นใบแจ้งหนี้",
  create: "สร้างข้อมูล",
  create_company_settings: "สร้างตั้งค่ากิจการ",
  create_receipt: "ออกใบเสร็จ",
  delete: "ลบข้อมูล",
  export_backup: "Export Backup",
  invite_user: "เชิญผู้ใช้",
  receive_invoice_payment: "รับชำระเงิน",
  update: "แก้ไขข้อมูล",
  update_company_settings: "แก้ไขตั้งค่ากิจการ",
  update_document_counters: "แก้ไขเลขที่เอกสาร",
  update_repair_job_items: "แก้ไขรายการซ่อม",
  update_repair_job_status: "อัปเดตสถานะงานซ่อม",
  update_user_profile: "แก้ไขผู้ใช้",
  upload_repair_job_image: "แนบรูปงานซ่อม",
};

function text(value: unknown) {
  return String(value ?? "-");
}

function labelForTable(tableName: unknown) {
  const key = String(tableName ?? "");
  return tableLabels[key] ?? (key || "-");
}

function labelForAction(action: unknown) {
  const key = String(action ?? "");
  return actionLabels[key] ?? (key || "-");
}

function profileFrom(row: Row) {
  const profile = row.profiles;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  return profile as Row;
}

function actorLabel(row: Row) {
  const profile = profileFrom(row);
  if (!profile) return text(row.actor_id);
  return text(profile.full_name ?? profile.email);
}

function actorOptionLabel(row: Row) {
  return text(row.full_name ?? row.email);
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function metadataSummary(value: unknown) {
  if (!value) return "-";
  const raw = JSON.stringify(value);
  if (!raw) return "-";
  return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw;
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function buildCsv(rows: Row[]) {
  const headers = ["วันที่", "ผู้ใช้", "Module", "Action", "Record ID", "Metadata"];
  const lines = rows.map((row) =>
    [
      formatDateTime(row.created_at),
      actorLabel(row),
      labelForTable(row.table_name),
      labelForAction(row.action),
      text(row.record_id),
      JSON.stringify(row.metadata ?? {}),
    ]
      .map(csvEscape)
      .join(","),
  );
  return [headers.map(csvEscape).join(","), ...lines].join("\n");
}

export function ActivityLogsClient({
  logs,
  actors,
  actions,
  tableNames,
  filters,
}: ActivityLogsClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [localFilters, setLocalFilters] = useState({
    from: filters.from ?? "",
    to: filters.to ?? "",
    table: filters.table ?? "all",
    actor: filters.actor ?? "all",
    action: filters.action ?? "all",
  });

  const actorOptions = useMemo(() => {
    const seen = new Set<string>();
    const options = actors
      .map((actor) => ({ id: text(actor.id), label: actorOptionLabel(actor) }))
      .filter((actor) => {
        if (!actor.id || seen.has(actor.id)) return false;
        seen.add(actor.id);
        return true;
      });

    logs.forEach((log) => {
      const id = text(log.actor_id);
      if (id === "-" || seen.has(id)) return;
      seen.add(id);
      options.push({ id, label: actorLabel(log) });
    });

    return options.sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [actors, logs]);

  const filteredLogs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return logs;
    return logs.filter((log) =>
      [
        actorLabel(log),
        labelForTable(log.table_name),
        labelForAction(log.action),
        text(log.record_id),
        metadataSummary(log.metadata),
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [logs, query]);

  const summary = {
    all: logs.length,
    visible: filteredLogs.length,
    actors: new Set(logs.map((log) => text(log.actor_id)).filter((value) => value !== "-")).size,
    modules: new Set(logs.map((log) => text(log.table_name)).filter((value) => value !== "-")).size,
    latest: logs[0]?.created_at,
  };

  function updateFilter(key: keyof typeof localFilters, value: string) {
    setLocalFilters((current) => ({ ...current, [key]: value }));
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    Object.entries(localFilters).forEach(([key, value]) => {
      if (value && value !== "all") params.set(key, value);
    });
    const queryString = params.toString();
    router.push(queryString ? `/activity-logs?${queryString}` : "/activity-logs");
  }

  function resetFilters() {
    setLocalFilters({ from: "", to: "", table: "all", actor: "all", action: "all" });
    setQuery("");
    router.push("/activity-logs");
  }

  function exportCsv() {
    const blob = new Blob([`\uFEFF${buildCsv(filteredLogs)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon="shield" label="Log ตามช่วงที่เลือก" value={`${summary.all} รายการ`} />
        <SummaryCard icon="filter" label="ผลลัพธ์หลังค้นหา" value={`${summary.visible} รายการ`} />
        <SummaryCard icon="user" label="ผู้ใช้งานที่เกี่ยวข้อง" value={`${summary.actors} คน`} />
        <SummaryCard icon="clock" label="รายการล่าสุด" value={formatDateTime(summary.latest)} />
      </section>

      <form
        className="rounded-lg border border-border bg-surface p-4 shadow-sm"
        onSubmit={submitFilters}
      >
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="font-semibold">ตัวกรอง Activity Log</h2>
            <p className="text-sm text-muted">เลือกช่วงวันที่ ผู้ใช้ module และ action เพื่อตรวจย้อนหลัง</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit">
              <Filter className="h-4 w-4" />
              กรอง
            </Button>
            <Button onClick={resetFilters} type="button" variant="secondary">
              <RotateCcw className="h-4 w-4" />
              ล้าง
            </Button>
            <Button disabled={!filteredLogs.length} onClick={exportCsv} type="button" variant="secondary">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label>
            <span className="text-sm font-semibold">จากวันที่</span>
            <input
              className={inputClass()}
              onChange={(event) => updateFilter("from", event.target.value)}
              type="date"
              value={localFilters.from}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">ถึงวันที่</span>
            <input
              className={inputClass()}
              onChange={(event) => updateFilter("to", event.target.value)}
              type="date"
              value={localFilters.to}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Module</span>
            <select
              className={inputClass()}
              onChange={(event) => updateFilter("table", event.target.value)}
              value={localFilters.table}
            >
              <option value="all">ทั้งหมด</option>
              {tableNames.map((tableName) => (
                <option key={tableName} value={tableName}>
                  {labelForTable(tableName)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-semibold">Action</span>
            <select
              className={inputClass()}
              onChange={(event) => updateFilter("action", event.target.value)}
              value={localFilters.action}
            >
              <option value="all">ทั้งหมด</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {labelForAction(action)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-semibold">ผู้ใช้</span>
            <select
              className={inputClass()}
              onChange={(event) => updateFilter("actor", event.target.value)}
              value={localFilters.actor}
            >
              <option value="all">ทั้งหมด</option>
              {actorOptions.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      <section className="rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold">รายการ Activity Log</h2>
            <p className="text-sm text-muted">แสดงสูงสุด 500 รายการล่าสุดตามตัวกรอง เพื่อให้หน้าโหลดเร็วในงานประจำวัน</p>
          </div>
          <label className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
            <input
              className="h-11 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-primary"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหา module, action, ผู้ใช้, record id"
              value={query}
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-surface-soft text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">เวลา</th>
                <th className="px-4 py-3 font-semibold">ผู้ใช้</th>
                <th className="px-4 py-3 font-semibold">Module</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Record</th>
                <th className="px-4 py-3 font-semibold">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr className="border-t border-border align-top" key={text(log.id)}>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{actorLabel(log)}</p>
                    <p className="text-xs text-muted">{text(profileFrom(log)?.role ?? log.actor_id)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge value={labelForTable(log.table_name)} />
                    <p className="mt-1 text-xs text-muted">{text(log.table_name)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <ActionPill action={text(log.action)} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{text(log.record_id)}</td>
                  <td className="px-4 py-3">
                    <p className="max-w-xl break-all rounded-md bg-surface-soft p-2 font-mono text-xs text-muted">
                      {metadataSummary(log.metadata)}
                    </p>
                  </td>
                </tr>
              ))}
              {!filteredLogs.length ? (
                <tr>
                  <td className="px-4 py-12 text-center text-muted" colSpan={6}>
                    ไม่พบ Activity Log ตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: "clock" | "filter" | "shield" | "user";
}) {
  const Icon = icon === "clock" ? CalendarClock : icon === "filter" ? Filter : icon === "user" ? UserRound : ShieldCheck;
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function ActionPill({ action }: { action: string }) {
  const tone =
    action.includes("delete") || action.includes("cancel")
      ? "danger"
      : action.includes("create") || action.includes("receive")
        ? "success"
        : "normal";
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
        tone === "normal" && "border-sky-200 bg-sky-50 text-sky-700",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "danger" && "border-red-200 bg-red-50 text-red-700",
      )}
    >
      {labelForAction(action)}
    </span>
  );
}

function inputClass() {
  return "mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary";
}
