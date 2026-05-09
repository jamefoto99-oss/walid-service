"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Plus, Save, Upload } from "lucide-react";
import Image from "next/image";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { saveCompanySettings, saveDocumentCounters } from "@/app/actions/settings";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatDate } from "@/lib/utils";
import { Button } from "../ui/button";

type Row = Record<string, unknown>;

type CompanySettingsFormProps = {
  settings: Row | null;
  counters: Row[];
  logs: Row[];
};

type CounterRow = {
  prefix: string;
  running_number: number;
};

const settingsFormSchema = z.object({
  company_name: z.string().trim().min(1, "กรุณากรอกชื่อกิจการ"),
  logo_url: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  line_id: z.string().trim().optional().nullable(),
  document_footer: z.string().trim().optional().nullable(),
  repair_job_prefix: z.string().trim().min(1).max(12),
  quotation_prefix: z.string().trim().min(1).max(12),
  invoice_prefix: z.string().trim().min(1).max(12),
  receipt_prefix: z.string().trim().min(1).max(12),
  purchase_prefix: z.string().trim().min(1).max(12),
});

type SettingsFormInput = z.input<typeof settingsFormSchema>;
type SettingsFormValues = z.output<typeof settingsFormSchema>;

const defaultCounters: CounterRow[] = [
  { prefix: "JOB", running_number: 0 },
  { prefix: "QT", running_number: 0 },
  { prefix: "INV", running_number: 0 },
  { prefix: "RC", running_number: 0 },
  { prefix: "PO", running_number: 0 },
];

function fieldValue(settings: Row | null, key: string, fallback = "") {
  return String(settings?.[key] ?? fallback);
}

function nextDocumentPreview(prefix: string, counters: CounterRow[]) {
  const counter = counters.find((entry) => entry.prefix === prefix);
  const running = Number(counter?.running_number ?? 0) + 1;
  const now = new Date();
  const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}${month}-${String(running).padStart(5, "0")}`;
}

function logActor(row: Row) {
  const profile = row.profiles;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return String(row.actor_id ?? "-");
  const profileRow = profile as Row;
  return String(profileRow.full_name ?? profileRow.email ?? "-");
}

export function CompanySettingsForm({ settings, counters, logs }: CompanySettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [counterRows, setCounterRows] = useState<CounterRow[]>(() => {
    const existing = counters.map((counter) => ({
      prefix: String(counter.prefix ?? ""),
      running_number: Number(counter.running_number ?? 0),
    }));
    const merged = [...existing];
    for (const entry of defaultCounters) {
      if (!merged.some((counter) => counter.prefix === entry.prefix)) merged.push(entry);
    }
    return merged.sort((a, b) => a.prefix.localeCompare(b.prefix));
  });

  const form = useForm<SettingsFormInput, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      company_name: fieldValue(settings, "company_name", "อู่วาลิดการช่าง"),
      logo_url: fieldValue(settings, "logo_url"),
      address: fieldValue(settings, "address"),
      phone: fieldValue(settings, "phone"),
      line_id: fieldValue(settings, "line_id"),
      document_footer: fieldValue(settings, "document_footer"),
      repair_job_prefix: fieldValue(settings, "repair_job_prefix", "JOB"),
      quotation_prefix: fieldValue(settings, "quotation_prefix", "QT"),
      invoice_prefix: fieldValue(settings, "invoice_prefix", "INV"),
      receipt_prefix: fieldValue(settings, "receipt_prefix", "RC"),
      purchase_prefix: fieldValue(settings, "purchase_prefix", "PO"),
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const watched = form.watch();

  function submit(values: SettingsFormValues) {
    startTransition(async () => {
      const result = await saveCompanySettings(values);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error ?? "บันทึกตั้งค่าไม่สำเร็จ");
      }
    });
  }

  function submitCounters() {
    startTransition(async () => {
      const result = await saveDocumentCounters({ counters: counterRows });
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error ?? "บันทึก Running Number ไม่สำเร็จ");
      }
    });
  }

  async function uploadLogo(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("ไฟล์โลโก้ต้องเป็นรูปภาพ");
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `logos/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("company-assets").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw error;

      const { data } = supabase.storage.from("company-assets").getPublicUrl(path);
      form.setValue("logo_url", data.publicUrl, { shouldDirty: true, shouldValidate: true });
      toast.success("อัปโหลดโลโก้เรียบร้อย");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "อัปโหลดโลโก้ไม่สำเร็จ");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">ข้อมูลกิจการ</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-sm font-semibold">ชื่อกิจการ *</span>
              <input className={inputClass()} {...form.register("company_name")} />
              <FieldError message={form.formState.errors.company_name?.message} />
            </label>
            <label>
              <span className="text-sm font-semibold">เบอร์โทร</span>
              <input className={inputClass()} {...form.register("phone")} />
            </label>
            <label>
              <span className="text-sm font-semibold">LINE</span>
              <input className={inputClass()} {...form.register("line_id")} />
            </label>
            <label>
              <span className="text-sm font-semibold">โลโก้ URL</span>
              <input className={inputClass()} {...form.register("logo_url")} />
            </label>
            <label className="md:col-span-2">
              <span className="text-sm font-semibold">ที่อยู่</span>
              <textarea className={inputClass("min-h-24 py-2")} {...form.register("address")} />
            </label>
            <label className="md:col-span-2">
              <span className="text-sm font-semibold">ข้อความท้ายเอกสาร</span>
              <textarea className={inputClass("min-h-24 py-2")} {...form.register("document_footer")} />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-md border border-dashed border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {watched.logo_url ? (
                <Image
                  src={String(watched.logo_url)}
                  alt="โลโก้กิจการ"
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-md border border-border object-contain"
                  unoptimized
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-md border border-border bg-surface-soft">
                  <ImagePlus className="h-5 w-5 text-muted" />
                </div>
              )}
              <div>
                <p className="font-semibold">โลโก้บนเอกสาร</p>
                <p className="text-sm text-muted">JPG, PNG, WebP หรือ SVG</p>
              </div>
            </div>
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-semibold transition hover:bg-surface-soft">
              <Upload className="h-4 w-4" />
              {isUploading ? "กำลังอัปโหลด..." : "อัปโหลดโลโก้"}
              <input
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={isUploading}
                onChange={(event) => uploadLogo(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-4 font-semibold">Prefix เอกสาร</h2>
          <div className="grid gap-4 md:grid-cols-5">
            <PrefixField label="งานซ่อม" name="repair_job_prefix" form={form} />
            <PrefixField label="เสนอราคา" name="quotation_prefix" form={form} />
            <PrefixField label="แจ้งหนี้" name="invoice_prefix" form={form} />
            <PrefixField label="ใบเสร็จ" name="receipt_prefix" form={form} />
            <PrefixField label="ใบซื้อ" name="purchase_prefix" form={form} />
          </div>
        </section>

        <div className="flex justify-end">
          <Button disabled={isPending || isUploading} type="submit">
            <Save className="h-4 w-4" />
            {isPending ? "กำลังบันทึก..." : "บันทึกตั้งค่ากิจการ"}
          </Button>
        </div>
      </form>

      <div className="space-y-5">
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-4 font-semibold">Preview เอกสาร</h2>
          <div className="rounded-md border border-border bg-white p-4">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-start gap-3">
                {watched.logo_url ? (
                  <Image
                    src={String(watched.logo_url)}
                    alt="โลโก้กิจการ"
                    width={64}
                    height={64}
                    className="h-16 w-16 object-contain"
                    unoptimized
                  />
                ) : null}
                <div>
                  <p className="text-lg font-bold">{watched.company_name || "อู่วาลิดการช่าง"}</p>
                  <p className="mt-1 max-w-sm text-sm text-muted">{watched.address || "-"}</p>
                  <p className="text-sm text-muted">
                    โทร {watched.phone || "-"} LINE {watched.line_id || "-"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold">ใบแจ้งหนี้</p>
                <p className="font-mono text-sm">{nextDocumentPreview(watched.invoice_prefix || "INV", counterRows)}</p>
              </div>
            </div>
            <p className="mt-4 min-h-12 whitespace-pre-wrap text-sm text-muted">
              {watched.document_footer || "ขอบคุณที่ใช้บริการ"}
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Running Number</h2>
            <Button
              type="button"
              variant="secondary"
              className="h-9"
              onClick={() => setCounterRows((rows) => [...rows, { prefix: "", running_number: 0 }])}
            >
              <Plus className="h-4 w-4" />
              เพิ่ม
            </Button>
          </div>
          <div className="space-y-3">
            {counterRows.map((counter, index) => (
              <div className="grid grid-cols-[1fr_1fr] gap-3" key={`${counter.prefix}-${index}`}>
                <input
                  className={inputClass()}
                  value={counter.prefix}
                  onChange={(event) =>
                    setCounterRows((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, prefix: event.target.value.toUpperCase().replace(/\s+/g, "") } : row,
                      ),
                    )
                  }
                />
                <input
                  className={inputClass()}
                  min={0}
                  type="number"
                  value={counter.running_number}
                  onChange={(event) =>
                    setCounterRows((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, running_number: Number(event.target.value || 0) } : row,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <Button className="mt-4 w-full" disabled={isPending} type="button" onClick={submitCounters}>
            <Save className="h-4 w-4" />
            บันทึก Running Number
          </Button>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-4 font-semibold">Activity Log</h2>
          <div className="space-y-3">
            {logs.map((log) => (
              <div className="rounded-md border border-border p-3" key={String(log.id)}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{String(log.action ?? "-")}</p>
                  <p className="text-xs text-muted">{formatDate(log.created_at)}</p>
                </div>
                <p className="mt-1 text-sm text-muted">{logActor(log)}</p>
              </div>
            ))}
            {!logs.length ? <p className="rounded-md bg-surface-soft p-4 text-sm text-muted">ยังไม่มีประวัติการแก้ไข</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function PrefixField({
  label,
  name,
  form,
}: {
  label: string;
  name: keyof SettingsFormValues;
  form: ReturnType<typeof useForm<SettingsFormInput, unknown, SettingsFormValues>>;
}) {
  return (
    <label>
      <span className="text-sm font-semibold">{label}</span>
      <input
        className={inputClass("font-mono uppercase")}
        {...form.register(name)}
        onChange={(event) => form.setValue(name, event.target.value.toUpperCase().replace(/\s+/g, ""), { shouldDirty: true })}
      />
    </label>
  );
}

function inputClass(extra?: string) {
  return `mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary ${extra ?? ""}`;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-sm text-danger">{message}</p> : null;
}
