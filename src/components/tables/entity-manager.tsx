"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Download, Edit3, Eye, FileDown, FileText, FileUp, Plus, Search, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useController, useForm, type Control } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createRecord, deleteRecord, updateRecord } from "@/app/actions/crud";
import { importCsvAction } from "@/app/actions/import-csv";
import { approveQuotation, convertQuotationToInvoice } from "@/app/actions/workflows";
import { buildModuleSchema } from "@/lib/validation";
import type { FieldConfig, LineItemInput, ModuleConfig, ReferenceData, UserRole } from "@/lib/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Button, ButtonLink } from "../ui/button";
import { LineItemsField } from "../forms/line-items-field";
import { SearchableSelect } from "../forms/searchable-select";

type EntityManagerProps = {
  config: ModuleConfig;
  rows: Record<string, unknown>[];
  references: ReferenceData;
  role: UserRole;
  initialValues?: Record<string, string>;
};

const approvalProtectedModules = new Set(["purchases", "quotations", "invoices", "receipts"]);
const csvImportModules = new Set(["customers", "vehicles", "parts"]);
const csvTemplates: Record<string, { filename: string; content: string; help: string }> = {
  customers: {
    filename: "customers-template.csv",
    content: [
      "full_name,phone,address,line_id,notes",
      "สมชาย ใจดี,0812345678,99/1 ขอนแก่น,@somchai,ลูกค้าประจำ",
    ].join("\n"),
    help: "full_name และ phone เว้นว่างได้ และข้อมูลลูกค้าซ้ำกันได้ตามข้อมูลในไฟล์",
  },
  vehicles: {
    filename: "vehicles-template.csv",
    content: [
      "customer_name,customer_phone,license_plate,province,brand,model,year,color,mileage,vin,engine_no,notes",
      "สมชาย ใจดี,0812345678,กข 1234,ขอนแก่น,Toyota,Vigo,2012,ขาว,185200,VINTEST001,ENG001,รถลูกค้าเดิม",
      "-,-,-,-,-,-,-,-,-,-,แถวตัวอย่างที่เว้นข้อมูลได้",
    ].join("\n"),
    help: "ทุกช่องเว้นว่างหรือใส่ - ได้ ถ้าไม่พบลูกค้า ระบบจะสร้างลูกค้าไม่ระบุให้อัตโนมัติ และเติมทะเบียน/ยี่ห้อ/รุ่นเริ่มต้นให้",
  },
  parts: {
    filename: "parts-template.csv",
    content: [
      "part_code,name,category_name,cost_price,sale_price,quantity_on_hand,unit,supplier_name,low_stock_threshold,notes",
      "CL-NEW-001,ชุดคลัทช์ Vigo,ระบบส่งกำลัง,3200,4500,6,ชุด,ร้านอะไหล่เมืองขอนแก่น,2,นำเข้าเริ่มต้น",
    ].join("\n"),
    help: "ต้องมี part_code, name, cost_price, sale_price และ quantity_on_hand ถ้ามี category_name ระบบจะสร้างหมวดหมู่ให้เมื่อยังไม่มี",
  },
};

function requiresDeleteApproval(moduleKey: string) {
  return approvalProtectedModules.has(moduleKey);
}

function csvTemplateHref(moduleKey: string) {
  const template = csvTemplates[moduleKey];
  if (!template) return "#";
  return `data:text/csv;charset=utf-8,${encodeURIComponent(template.content)}`;
}

function defaultValue(field: FieldConfig, row?: Record<string, unknown>, initialValues?: Record<string, string>) {
  if (row?.[field.name] !== undefined && row?.[field.name] !== null) return String(row[field.name]);
  if (initialValues?.[field.name] !== undefined) return String(initialValues[field.name]);
  if (field.type === "date") return new Date().toISOString().slice(0, 10);
  if (field.name === "payment_status") return "unpaid";
  if (field.name === "payment_method") return "cash";
  if (field.name === "category") return "other";
  if (field.name === "status" && field.options?.length) return field.options[0].value;
  if (field.name === "status") return "draft";
  if (field.name === "is_active") return "true";
  if (field.type === "select" && field.options?.length) return field.options[0].value;
  if (field.type === "number") return "0";
  return "";
}

function FieldControl({
  field,
  control,
  register,
  references,
}: {
  field: FieldConfig;
  control: Control<Record<string, unknown>>;
  register: ReturnType<typeof useForm<Record<string, unknown>>>["register"];
  references: ReferenceData;
}) {
  const baseClass = "mt-1 min-h-11 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary";
  const listId = field.options?.length && field.type !== "select" ? `${field.name}-options` : undefined;

  if (field.type === "textarea") {
    return <textarea className={cn(baseClass, "min-h-24")} placeholder={field.placeholder} {...register(field.name)} />;
  }

  if (field.type === "select") {
    const options = field.optionsKey ? references[field.optionsKey] : field.options ?? [];
    return <SearchableFieldControl baseClass={baseClass} control={control} fieldName={field.name} options={options} />;
  }

  return (
    <>
      <input
        className={baseClass}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        min={field.min}
        step={field.step}
        list={listId}
        placeholder={field.placeholder}
        {...register(field.name)}
      />
      {listId ? (
        <datalist id={listId}>
          {field.options?.map((option) => (
            <option key={`${field.name}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </datalist>
      ) : null}
    </>
  );
}

function SearchableFieldControl({
  baseClass,
  control,
  fieldName,
  options,
}: {
  baseClass: string;
  control: Control<Record<string, unknown>>;
  fieldName: string;
  options: FieldConfig["options"];
}) {
  const { field } = useController({ control, name: fieldName });
  return (
    <SearchableSelect
      className={baseClass.replace("mt-1 ", "")}
      containerClassName="mt-1"
      emptyText="ไม่พบข้อมูล"
      onBlur={field.onBlur}
      onValueChange={(value) => field.onChange(value)}
      options={options ?? []}
      placeholder="พิมพ์ค้นหาแล้วเลือก"
      value={String(field.value ?? "")}
    />
  );
}

function DeleteApprovalDialog({
  config,
  row,
  onClose,
}: {
  config: ModuleConfig;
  row: Record<string, unknown>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const displayColumn = config.columns[0]?.key;
  const displayLabel = displayColumn ? String(row[displayColumn] ?? row.id) : String(row.id);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 8) {
      toast.error("กรุณาระบุเหตุผลอย่างน้อย 8 ตัวอักษร");
      return;
    }

    startTransition(async () => {
      const result = await deleteRecord(config.key, String(row.id), reason);
      if (result.ok) {
        toast.success(result.message ?? "ส่งคำขออนุมัติแล้ว");
        onClose();
      } else {
        toast.error(result.error ?? "ส่งคำขอไม่สำเร็จ");
      }
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="mt-12 w-full max-w-xl rounded-lg border border-border bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">ขออนุมัติการลบเอกสาร</h2>
            <p className="mt-1 text-sm text-muted">
              {config.title} / {displayLabel} จะยังไม่ถูกลบทันที ระบบจะส่งคำขอให้ Owner ตรวจสอบก่อน
            </p>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-sm font-semibold">
            เหตุผลการลบ <span className="text-danger">*</span>
          </span>
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เช่น ออกเอกสารซ้ำ เลขที่ผิด หรือบันทึกรายการผิด"
          />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button disabled={isPending}>{isPending ? "กำลังส่งคำขอ..." : "ส่งคำขออนุมัติ"}</Button>
        </div>
      </form>
    </div>
  );
}

function CsvImportDialog({
  config,
  onClose,
}: {
  config: ModuleConfig;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(importCsvAction, null);
  const template = csvTemplates[config.key];

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message ?? "นำเข้า CSV สำเร็จ");
      onClose();
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [onClose, router, state]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form
        action={formAction}
        className="mt-12 w-full max-w-2xl rounded-lg border border-border bg-surface p-5 shadow-xl"
      >
        <input name="moduleKey" type="hidden" value={config.key} />

        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileUp className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">นำเข้า {config.title} ด้วย CSV</h2>
            <p className="mt-1 text-sm text-muted">
              ใช้ไฟล์ CSV แบบ UTF-8 ระบบจะตรวจข้อมูลทุกแถวก่อนบันทึก และจะไม่บันทึกถ้ามีข้อมูลซ้ำหรือข้อมูลจำเป็นไม่ครบ
            </p>
          </div>
        </div>

        {template ? (
          <div className="mt-5 rounded-md border border-border bg-surface-soft p-4">
            <p className="text-sm font-semibold">รูปแบบไฟล์ที่รองรับ</p>
            <p className="mt-1 text-sm text-muted">{template.help}</p>
            <div className="mt-3 overflow-x-auto rounded-md bg-white p-3 font-mono text-xs text-muted">
              {template.content.split("\n")[0]}
            </div>
            <a
              className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-semibold transition hover:bg-surface-soft"
              download={template.filename}
              href={csvTemplateHref(config.key)}
            >
              <Download className="h-4 w-4" />
              ดาวน์โหลดเทมเพลต
            </a>
          </div>
        ) : null}

        <label className="mt-5 block">
          <span className="text-sm font-semibold">
            ไฟล์ CSV <span className="text-danger">*</span>
          </span>
          <input
            accept=".csv,text/csv"
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-surface-soft file:px-3 file:py-2 file:text-sm file:font-semibold focus:border-primary"
            name="file"
            required
            type="file"
          />
        </label>

        {state?.error ? (
          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-red-50 p-3 text-sm text-danger">
            {state.error}
          </pre>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button disabled={pending}>
            <FileUp className="h-4 w-4" />
            {pending ? "กำลังนำเข้า..." : "นำเข้า CSV"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function EntityFormDialog({
  config,
  references,
  row,
  initialValues,
  onClose,
}: {
  config: ModuleConfig;
  references: ReferenceData;
  row?: Record<string, unknown>;
  initialValues?: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<LineItemInput[]>([
    { item_type: "labor", description: "", quantity: 1, unit: "ชิ้น", unit_price: 0, discount: 0 },
  ]);
  const schema = useMemo(() => buildModuleSchema(config), [config]);
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(
      config.fields.map((field) => [field.name, defaultValue(field, row, initialValues)]),
    ),
  });

  useEffect(() => {
    form.setValue("items", JSON.stringify(items), { shouldValidate: false });
  }, [form, items]);

  function submit(values: Record<string, unknown>) {
    const payload = { ...values, items: JSON.stringify(items) };
    startTransition(async () => {
      const result = row?.id
        ? await updateRecord(config.key, String(row.id), payload)
        : await createRecord(config.key, payload);
      if (result.ok) {
        toast.success(result.message ?? "บันทึกข้อมูลเรียบร้อย");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error ?? "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form
        onSubmit={form.handleSubmit(submit)}
        className="mt-8 w-full max-w-3xl rounded-lg border border-border bg-surface p-5 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{row ? "แก้ไขข้อมูล" : config.createLabel}</h2>
            <p className="text-sm text-muted">{config.title}</p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            ปิด
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {config.fields.map((field) => {
            if (field.type === "line-items") {
              return (
                <div className="md:col-span-2" key={field.name}>
                  <input type="hidden" value={JSON.stringify(items)} {...form.register(field.name)} />
                  <LineItemsField items={items} onChange={setItems} partOptions={references.parts} />
                  {form.formState.errors[field.name] ? (
                    <p className="mt-1 text-sm text-danger">{String(form.formState.errors[field.name]?.message)}</p>
                  ) : null}
                </div>
              );
            }

            return (
              <label className={cn(field.type === "textarea" && "md:col-span-2")} key={field.name}>
                <span className="text-sm font-semibold">
                  {field.label}
                </span>
                <FieldControl control={form.control} field={field} register={form.register} references={references} />
                {form.formState.errors[field.name] ? (
                  <p className="mt-1 text-sm text-danger">{String(form.formState.errors[field.name]?.message)}</p>
                ) : null}
              </label>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button disabled={isPending}>{isPending ? "กำลังบันทึก..." : "บันทึก"}</Button>
        </div>
      </form>
    </div>
  );
}

export function EntityManager({ config, rows, references, role, initialValues }: EntityManagerProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const [dialogRow, setDialogRow] = useState<Record<string, unknown> | "create" | null>(
    initialValues && Object.keys(initialValues).length ? "create" : null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const writable = config.policy.write.includes(role);
  const deletable = config.policy.delete.includes(role);
  const canCreate = writable && config.allowCreate !== false;
  const canImportCsv = writable && csvImportModules.has(config.key);
  const supportsInlineEdit = !config.fields.some((field) => field.type === "line-items");

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const base = config.columns.map((column) => ({
      accessorKey: column.key,
      header: column.label,
      cell: ({ getValue, row }: { getValue: () => unknown; row: { original: Record<string, unknown> } }) => {
        const value = getValue();
        if (config.key === "parts" && ["part_code", "name"].includes(column.key)) {
          return (
            <Link className="font-semibold text-primary hover:underline" href={`/parts/${row.original.id}`}>
              {String(value ?? "-")}
            </Link>
          );
        }
        if (column.type === "money") return formatCurrency(value);
        if (column.type === "date") return formatDate(value);
        if (column.type === "badge") return <Badge value={value} />;
        return String(value ?? "-");
      },
    }));

    return [
      ...base,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const original = row.original;
          return (
            <div className="flex justify-end gap-1">
              {["quotations", "invoices", "receipts"].includes(config.key) ? (
                <Link
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-soft"
                  href={`/print/${config.key}/${original.id}`}
                  title="พิมพ์เอกสาร"
                >
                  <FileDown className="h-4 w-4" />
                </Link>
              ) : null}
              {config.key === "repair-jobs" ? (
                <>
                  <Link
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-soft"
                    href={`/repair-jobs/${original.id}`}
                    title="ดูรายละเอียดงานซ่อม"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                  <Link
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-soft"
                    href={`/print/repair-job/${original.id}`}
                    title="พิมพ์ใบรับรถ"
                  >
                    <FileText className="h-4 w-4" />
                  </Link>
                </>
              ) : null}
              {config.key === "invoices" ? (
                <Link
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-soft"
                  href={`/invoices/${original.id}`}
                  title="รับชำระ / รายละเอียดใบแจ้งหนี้"
                >
                  <Eye className="h-4 w-4" />
                </Link>
              ) : null}
              {config.key === "receipts" ? (
                <Link
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-soft"
                  href={`/receipts/${original.id}`}
                  title="ดูรายละเอียดใบเสร็จรับเงิน"
                >
                  <Eye className="h-4 w-4" />
                </Link>
              ) : null}
              {["customers", "vehicles", "suppliers", "parts"].includes(config.key) ? (
                <Link
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-soft"
                  href={`/${config.key}/${original.id}`}
                  title="ดูรายละเอียด"
                >
                  <Eye className="h-4 w-4" />
                </Link>
              ) : null}
              {config.key === "quotations" ? (
                <>
                  <Link
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-soft"
                    href={`/quotations/${original.id}`}
                    title="ดูรายละเอียดใบเสนอราคา"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                  <button
                    className="inline-flex h-9 items-center rounded-md px-2 text-xs font-semibold hover:bg-surface-soft"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await approveQuotation(String(original.id));
                        if (result.ok) toast.success(result.message);
                        else toast.error(result.error);
                        router.refresh();
                      })
                    }
                    type="button"
                  >
                    อนุมัติ
                  </button>
                  <button
                    className="inline-flex h-9 items-center rounded-md px-2 text-xs font-semibold hover:bg-surface-soft"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await convertQuotationToInvoice(String(original.id));
                        if (result.ok) toast.success(result.message);
                        else toast.error(result.error);
                        router.refresh();
                      })
                    }
                    type="button"
                  >
                    Convert
                  </button>
                </>
              ) : null}
              {writable && supportsInlineEdit ? (
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-soft"
                  onClick={() => setDialogRow(original)}
                  type="button"
                  title="แก้ไข"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              ) : null}
              {deletable ? (
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-red-50"
                  onClick={() => {
                    if (requiresDeleteApproval(config.key)) {
                      setDeleteTarget(original);
                      return;
                    }
                    if (!window.confirm("ยืนยันลบข้อมูลนี้?")) return;
                    startTransition(async () => {
                      const result = await deleteRecord(config.key, String(original.id));
                      if (result.ok) toast.success(result.message);
                      else toast.error(result.error);
                      router.refresh();
                    });
                  }}
                  type="button"
                  title="ลบ"
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </button>
              ) : null}
            </div>
          );
        },
      },
    ];
  }, [config, deletable, router, startTransition, supportsInlineEdit, writable]);

  // TanStack Table intentionally returns stable table helpers from this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const csvHref = useMemo(() => {
    const header = config.columns.map((column) => column.label).join(",");
    const body = rows
      .map((row) => config.columns.map((column) => JSON.stringify(row[column.key] ?? "")).join(","))
      .join("\n");
    return `data:text/csv;charset=utf-8,${encodeURIComponent(`${header}\n${body}`)}`;
  }, [config.columns, rows]);

  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
          <input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="ค้นหา..."
            className="h-11 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {canImportCsv ? (
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <FileUp className="h-4 w-4" />
              นำเข้า CSV
            </Button>
          ) : null}
          <ButtonLink href={csvHref} variant="secondary" download={`${config.key}.csv`}>
            <Download className="h-4 w-4" />
            CSV
          </ButtonLink>
          {canCreate ? (
            <Button onClick={() => setDialogRow("create")}>
              <Plus className="h-4 w-4" />
              {config.createLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-surface-soft text-left text-xs uppercase tracking-wide text-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 font-semibold">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-muted">
                  ยังไม่มีข้อมูล หรือไม่พบรายการที่ค้นหา
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border p-4 text-sm">
        <span className="text-muted">
          หน้า {table.getState().pagination.pageIndex + 1} จาก {table.getPageCount() || 1}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            ก่อนหน้า
          </Button>
          <Button variant="secondary" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            ถัดไป
          </Button>
        </div>
      </div>

      {dialogRow ? (
        <EntityFormDialog
          config={config}
          references={references}
          row={dialogRow === "create" ? undefined : dialogRow}
          initialValues={dialogRow === "create" ? initialValues : undefined}
          onClose={() => setDialogRow(null)}
        />
      ) : null}
      {deleteTarget ? <DeleteApprovalDialog config={config} row={deleteTarget} onClose={() => setDeleteTarget(null)} /> : null}
      {importOpen ? <CsvImportDialog config={config} onClose={() => setImportOpen(false)} /> : null}
      {isPending ? <div className="sr-only">กำลังประมวลผล</div> : null}
    </section>
  );
}
