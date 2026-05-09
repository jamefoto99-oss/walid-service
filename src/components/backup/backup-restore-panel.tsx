"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, FileJson, RotateCcw, ShieldAlert, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RestoreStatus = "ready" | "restored" | "skipped" | "failed";

type RestoreTableSummary = {
  key: string;
  table: string;
  label: string;
  incomingRows: number;
  existingRows: number;
  readyRows: number;
  insertedRows: number;
  skippedRows: number;
  status: RestoreStatus;
  message: string;
};

type RestoreResult = {
  mode: "dry_run" | "restore";
  exportedAt: string | null;
  formatVersion: number | null;
  totalIncomingRows: number;
  totalReadyRows: number;
  totalInsertedRows: number;
  summaries: RestoreTableSummary[];
  skippedDatasets: string[];
  warnings: string[];
  errors: string[];
};

const statusStyles: Record<RestoreStatus, string> = {
  ready: "bg-blue-50 text-blue-700",
  restored: "bg-emerald-50 text-emerald-700",
  skipped: "bg-zinc-100 text-zinc-700",
  failed: "bg-red-50 text-red-700",
};

const statusLabels: Record<RestoreStatus, string> = {
  ready: "พร้อมนำเข้า",
  restored: "นำเข้าแล้ว",
  skipped: "ข้าม",
  failed: "ผิดพลาด",
};

function emptyResult(message: string): RestoreResult {
  return {
    mode: "dry_run",
    exportedAt: null,
    formatVersion: null,
    totalIncomingRows: 0,
    totalReadyRows: 0,
    totalInsertedRows: 0,
    summaries: [],
    skippedDatasets: [],
    warnings: [],
    errors: [message],
  };
}

function formatNumber(value: number) {
  return value.toLocaleString("th-TH");
}

async function parseRestoreResponse(response: Response) {
  const body = (await response.json().catch(() => null)) as Partial<RestoreResult> & {
    error?: string;
  } | null;

  if (!body || !Array.isArray(body.errors) || !Array.isArray(body.summaries)) {
    return emptyResult(body?.error ?? "ไม่สามารถอ่านผลลัพธ์จาก server ได้");
  }

  return body as RestoreResult;
}

export function BackupRestorePanel() {
  const router = useRouter();
  const [backupPayload, setBackupPayload] = useState<unknown>(null);
  const [confirmText, setConfirmText] = useState("");
  const [filename, setFilename] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setResult(null);
    setConfirmText("");
    setBackupPayload(null);
    setFilename(file?.name ?? "");

    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      toast.error("กรุณาเลือกไฟล์ .json");
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      setBackupPayload(parsed);
      toast.success("อ่านไฟล์ backup แล้ว");
    } catch {
      toast.error("ไฟล์ JSON ไม่ถูกต้อง");
    }
  }

  async function sendRestoreRequest(mode: "dry_run" | "restore") {
    if (!backupPayload) {
      toast.error("กรุณาเลือกไฟล์ backup ก่อน");
      return;
    }

    const restoring = mode === "restore";
    if (restoring) {
      const confirmed = window.confirm("ยืนยันนำเข้า backup เข้าระบบจริงหรือไม่");
      if (!confirmed) return;
      setIsRestoring(true);
    } else {
      setIsChecking(true);
    }

    try {
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, payload: backupPayload }),
      });
      const nextResult = await parseRestoreResponse(response);
      setResult(nextResult);

      if (nextResult.errors.length > 0 || !response.ok) {
        toast.error(restoring ? "Restore ไม่สำเร็จ" : "ตรวจไฟล์ไม่ผ่าน");
        return;
      }

      toast.success(restoring ? "Restore สำเร็จ" : "ตรวจไฟล์ผ่าน");
      if (restoring) {
        setConfirmText("");
        router.refresh();
      }
    } catch {
      toast.error("เชื่อมต่อ server ไม่สำเร็จ");
    } finally {
      setIsChecking(false);
      setIsRestoring(false);
    }
  }

  const canRestore =
    result !== null &&
    result.errors.length === 0 &&
    result.totalReadyRows > 0 &&
    confirmText.trim() === "RESTORE" &&
    !isRestoring;

  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <div className="border-b border-border p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-semibold">Restore ข้อมูลสำรอง</h2>
            <p className="text-sm text-muted">
              นำเข้าไฟล์ backup JSON แบบ merge-only โดยข้ามข้อมูลผู้ใช้และแถวที่มีอยู่แล้ว
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            <ShieldAlert className="h-4 w-4" />
            Owner เท่านั้น
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-soft p-5 text-center transition hover:border-primary">
            <UploadCloud className="h-8 w-8 text-primary" />
            <span className="mt-3 text-sm font-semibold">เลือกไฟล์ Backup JSON</span>
            <span className="mt-1 max-w-sm text-xs text-muted">
              ใช้ไฟล์ที่ export จากปุ่ม Backup JSON ทั้งระบบ
            </span>
            <input accept="application/json,.json" className="sr-only" type="file" onChange={handleFileChange} />
          </label>

          <div className="rounded-lg border border-border bg-surface-soft p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileJson className="h-4 w-4 text-primary" />
              {filename || "ยังไม่ได้เลือกไฟล์"}
            </div>
            {result ? (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <Metric label="ทั้งหมด" value={formatNumber(result.totalIncomingRows)} />
                <Metric label="พร้อมเข้า" value={formatNumber(result.totalReadyRows)} />
                <Metric label="นำเข้าแล้ว" value={formatNumber(result.totalInsertedRows)} />
              </div>
            ) : null}
          </div>

          <Button className="w-full" disabled={!backupPayload || isChecking} type="button" onClick={() => sendRestoreRequest("dry_run")}>
            <CheckCircle2 className="h-4 w-4" />
            {isChecking ? "กำลังตรวจไฟล์..." : "ตรวจสอบไฟล์"}
          </Button>

          <div className="space-y-2">
            <label className="text-sm font-semibold" htmlFor="restore-confirm">
              พิมพ์ RESTORE เพื่อยืนยัน
            </label>
            <input
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary"
              id="restore-confirm"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
            />
            <Button
              className="w-full"
              disabled={!canRestore}
              type="button"
              variant="danger"
              onClick={() => sendRestoreRequest("restore")}
            >
              <RotateCcw className="h-4 w-4" />
              {isRestoring ? "กำลัง Restore..." : "Restore เข้าระบบจริง"}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {result ? (
            <>
              <NoticeList title="ข้อผิดพลาด" tone="danger" values={result.errors} />
              <NoticeList title="คำเตือน" tone="warning" values={result.warnings} />
              {result.skippedDatasets.length > 0 ? (
                <NoticeList
                  title="ชุดข้อมูลที่ข้าม"
                  tone="neutral"
                  values={result.skippedDatasets.map((dataset) => `${dataset} ถูกข้ามเพื่อความปลอดภัย`)}
                />
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-surface-soft text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-3 font-semibold">ชุดข้อมูล</th>
                      <th className="px-3 py-3 text-right font-semibold">ในไฟล์</th>
                      <th className="px-3 py-3 text-right font-semibold">มีแล้ว</th>
                      <th className="px-3 py-3 text-right font-semibold">พร้อมเข้า</th>
                      <th className="px-3 py-3 text-right font-semibold">นำเข้าแล้ว</th>
                      <th className="px-3 py-3 font-semibold">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.summaries.map((summary) => (
                      <tr className="border-t border-border" key={summary.key}>
                        <td className="px-3 py-3">
                          <p className="font-semibold">{summary.label}</p>
                          <p className="font-mono text-xs text-muted">{summary.table}</p>
                        </td>
                        <td className="px-3 py-3 text-right">{formatNumber(summary.incomingRows)}</td>
                        <td className="px-3 py-3 text-right">{formatNumber(summary.existingRows)}</td>
                        <td className="px-3 py-3 text-right font-semibold">{formatNumber(summary.readyRows)}</td>
                        <td className="px-3 py-3 text-right font-semibold">{formatNumber(summary.insertedRows)}</td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                              statusStyles[summary.status],
                            )}
                          >
                            {statusLabels[summary.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-border bg-surface-soft p-6 text-center">
              <FileJson className="h-10 w-10 text-muted" />
              <p className="mt-3 font-semibold">รอไฟล์ Backup</p>
              <p className="mt-1 max-w-md text-sm text-muted">
                เลือกไฟล์ JSON แล้วกดตรวจสอบ ระบบจะแสดงจำนวนแถวที่พร้อมนำเข้าก่อน Restore จริง
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface px-2 py-2">
      <p className="font-semibold">{value}</p>
      <p className="text-muted">{label}</p>
    </div>
  );
}

function NoticeList({
  title,
  tone,
  values,
}: {
  title: string;
  tone: "danger" | "warning" | "neutral";
  values: string[];
}) {
  if (values.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        tone === "danger" && "border-red-200 bg-red-50 text-red-700",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "neutral" && "border-zinc-200 bg-zinc-50 text-zinc-700",
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        {title}
      </div>
      <div className="mt-2 space-y-1">
        {values.map((value) => (
          <p key={value}>{value}</p>
        ))}
      </div>
    </div>
  );
}
