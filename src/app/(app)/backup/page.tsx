import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseBackup,
  Download,
  FileJson,
  ShieldCheck,
  Table,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { BackupRestorePanel } from "@/components/backup/backup-restore-panel";
import { SetupRequired } from "@/components/ui/setup-required";
import { requireProfile } from "@/lib/auth";
import { getBackupPageData } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { FlowCheckStatus } from "@/lib/backup";

function downloadHref(dataset: string, format: "csv" | "json") {
  return `/api/backup?dataset=${encodeURIComponent(dataset)}&format=${format}`;
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

const statusStyles: Record<FlowCheckStatus, string> = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  pending: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

const statusLabels: Record<FlowCheckStatus, string> = {
  pass: "พร้อม",
  warning: "ตรวจเพิ่ม",
  pending: "ยังไม่ครบ",
};

function statusIcon(status: FlowCheckStatus) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4" />;
  return <Clock3 className="h-4 w-4" />;
}

function DownloadButton({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <a
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-teal-800"
          : "border border-border bg-surface text-foreground hover:bg-surface-soft",
      )}
      href={href}
    >
      {children}
    </a>
  );
}

export default async function BackupPage() {
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (session.profile.role !== "owner") redirect("/dashboard");

  const data = await getBackupPageData();
  if (data.setupRequired) return <SetupRequired />;

  const readyFlows = data.flowChecks.filter((check) => check.status === "pass").length;
  const warningFlows = data.flowChecks.filter((check) => check.status === "warning").length;
  const pendingFlows = data.flowChecks.filter((check) => check.status === "pending").length;

  return (
    <>
      <PageHeader
        action={
          <DownloadButton href={downloadHref("all", "json")} variant="primary">
            <FileJson className="h-4 w-4" />
            Backup JSON ทั้งระบบ
          </DownloadButton>
        }
        title="Backup / Export"
        description="สำรองข้อมูลธุรกิจทั้งหมดและตรวจความพร้อมของ Flow หลักก่อนใช้งานจริงหรือหลัง deploy"
      />

      <div className="space-y-5">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={<DatabaseBackup className="h-4 w-4" />} label="ชุดข้อมูลทั้งหมด" value={`${data.datasets.length} ชุด`} />
          <SummaryCard icon={<Table className="h-4 w-4" />} label="จำนวนแถวรวม" value={`${data.totalRows.toLocaleString("th-TH")} แถว`} />
          <SummaryCard icon={<ShieldCheck className="h-4 w-4" />} label="Flow พร้อมใช้งาน" value={`${readyFlows}/${data.flowChecks.length} flow`} />
          <SummaryCard icon={<Clock3 className="h-4 w-4" />} label="สร้างสรุปล่าสุด" value={formatDateTime(data.generatedAt)} />
        </section>

        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">E2E Flow Health</h2>
              <p className="text-sm text-muted">เช็กจากข้อมูลจริงใน Supabase ว่า flow ธุรกิจหลักมีข้อมูลครบพอสำหรับทดสอบหรือยัง</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{readyFlows} พร้อม</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{warningFlows} ตรวจเพิ่ม</span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">{pendingFlows} ยังไม่ครบ</span>
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-5">
            {data.flowChecks.map((check) => (
              <a
                className="rounded-lg border border-border bg-surface-soft p-3 transition hover:border-primary"
                href={check.href}
                key={check.key}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{check.title}</p>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold",
                      statusStyles[check.status],
                    )}
                  >
                    {statusIcon(check.status)}
                    {statusLabels[check.status]}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted">{check.evidence}</p>
              </a>
            ))}
          </div>
        </section>

        <BackupRestorePanel />

        <section className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">Export รายชุดข้อมูล</h2>
              <p className="text-sm text-muted">CSV เหมาะกับ Excel/Google Sheets ส่วน JSON เหมาะสำหรับ backup แบบนำกลับมาตรวจสอบเชิงระบบ</p>
            </div>
            <p className="rounded-md bg-surface-soft px-3 py-2 text-xs font-semibold text-muted">
              Owner เท่านั้นที่เข้าหน้านี้และเรียก API export ได้
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-surface-soft text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">ชุดข้อมูล</th>
                  <th className="px-4 py-3 font-semibold">หมวด</th>
                  <th className="px-4 py-3 text-right font-semibold">จำนวนแถว</th>
                  <th className="px-4 py-3 font-semibold">อัปเดตล่าสุด</th>
                  <th className="px-4 py-3 text-right font-semibold">Export</th>
                </tr>
              </thead>
              <tbody>
                {data.datasets.map((dataset) => (
                  <tr className="border-t border-border" key={dataset.key}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{dataset.label}</p>
                      <p className="font-mono text-xs text-muted">{dataset.table}</p>
                    </td>
                    <td className="px-4 py-3">{dataset.category}</td>
                    <td className="px-4 py-3 text-right font-semibold">{dataset.rowCount.toLocaleString("th-TH")}</td>
                    <td className="px-4 py-3">{formatDateTime(dataset.lastUpdated)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <DownloadButton href={downloadHref(dataset.key, "csv")}>
                          <Download className="h-4 w-4" />
                          CSV
                        </DownloadButton>
                        <DownloadButton href={downloadHref(dataset.key, "json")}>
                          <FileJson className="h-4 w-4" />
                          JSON
                        </DownloadButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
