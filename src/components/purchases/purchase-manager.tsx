"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CreditCard, Download, History, PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { createPurchaseWithStock, paySupplierPurchase } from "@/app/actions/purchases";
import { VoidDocumentAction } from "@/components/documents/void-document-action";
import { AuditTrailPanel } from "@/components/records/audit-trail-panel";
import type { PurchasePageData, PurchasePart, PurchaseRow, UserRole } from "@/lib/types";
import { financeRoles, paymentMethods } from "@/lib/constants";
import { cn, formatCurrency, formatDate, toNumber } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Button, ButtonLink } from "../ui/button";

const purchaseFormSchema = z.object({
  supplier_id: z.string().uuid("กรุณาเลือก Supplier"),
  purchased_at: z.string().min(1, "กรุณาระบุวันที่ซื้อ"),
  discount: z.coerce.number().min(0, "ส่วนลดต้องไม่ติดลบ").default(0),
  paid_amount: z.coerce.number().min(0, "ยอดจ่ายแล้วต้องไม่ติดลบ").default(0),
  payment_method: z.enum(["cash", "transfer", "qr", "other"]).default("transfer"),
  notes: z.string().optional(),
});

const payFormSchema = z.object({
  paid_at: z.string().min(1, "กรุณาระบุวันที่จ่าย"),
  amount: z.coerce.number().min(0.01, "ยอดจ่ายต้องมากกว่า 0"),
  payment_method: z.enum(["cash", "transfer", "qr", "other"]).default("transfer"),
  notes: z.string().optional(),
});

type PurchaseFormInput = z.input<typeof purchaseFormSchema>;
type PurchaseFormValues = z.output<typeof purchaseFormSchema>;
type PayFormInput = z.input<typeof payFormSchema>;
type PayFormValues = z.output<typeof payFormSchema>;

type DraftPurchaseItem = {
  rowId: string;
  part_id: string;
  quantity: number;
  unit_cost: number;
};

function blankItem(): DraftPurchaseItem {
  return {
    rowId: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    part_id: "",
    quantity: 1,
    unit_cost: 0,
  };
}

function partLabel(part: PurchasePart) {
  return `${part.part_code} ${part.name} | เหลือ ${part.quantity_on_hand} ${part.unit}`;
}

function makeCsv(rows: PurchaseRow[]) {
  const headers = [
    "purchase_no",
    "purchased_at",
    "supplier",
    "payment_status",
    "subtotal",
    "discount",
    "total",
    "paid_amount",
    "balance_due",
  ];
  const body = rows
    .map((row) =>
      [
        row.purchase_no,
        row.purchased_at,
        row.suppliers?.name ?? "",
        row.payment_status,
        row.subtotal,
        row.discount,
        row.total,
        row.paid_amount,
        row.balance_due,
      ]
        .map((value) => JSON.stringify(value ?? ""))
        .join(","),
    )
    .join("\n");
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`${headers.join(",")}\n${body}`)}`;
}

function paymentLabel(value?: string) {
  return paymentMethods.find((method) => method.value === value)?.label ?? value;
}

export function PurchaseManager({
  data,
  role,
  initialSupplierId,
}: {
  data: PurchasePageData;
  role: UserRole;
  initialSupplierId?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<DraftPurchaseItem[]>([blankItem()]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [payTarget, setPayTarget] = useState<PurchaseRow | null>(null);
  const [auditTarget, setAuditTarget] = useState<PurchaseRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const pageSize = 8;
  const canWrite = financeRoles.includes(role);

  const form = useForm<PurchaseFormInput, unknown, PurchaseFormValues>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: {
      supplier_id: initialSupplierId ?? "",
      purchased_at: new Date().toISOString().slice(0, 10),
      discount: 0,
      paid_amount: 0,
      payment_method: "transfer",
      notes: "",
    },
  });

  const payForm = useForm<PayFormInput, unknown, PayFormValues>({
    resolver: zodResolver(payFormSchema),
    defaultValues: {
      paid_at: new Date().toISOString().slice(0, 10),
      amount: 0,
      payment_method: "transfer",
      notes: "",
    },
  });

  const watchedDiscount = useWatch({ control: form.control, name: "discount" });
  const watchedPaidAmount = useWatch({ control: form.control, name: "paid_amount" });
  const watchedPaymentMethod = useWatch({ control: payForm.control, name: "payment_method" });

  const partById = useMemo(
    () => new Map(data.parts.map((part) => [part.id, part])),
    [data.parts],
  );

  const purchaseLogsById = useMemo(() => {
    const grouped = new Map<string, Record<string, unknown>[]>();

    for (const log of data.purchaseActivityLogs) {
      const recordId = String(log.record_id ?? "");
      if (!recordId) continue;
      grouped.set(recordId, [...(grouped.get(recordId) ?? []), log]);
    }

    return grouped;
  }, [data.purchaseActivityLogs]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unit_cost), 0);
    const discount = toNumber(watchedDiscount);
    const total = Math.max(subtotal - discount, 0);
    const paid = toNumber(watchedPaidAmount);
    return { subtotal, total, balance: Math.max(total - paid, 0) };
  }, [items, watchedDiscount, watchedPaidAmount]);

  const metrics = useMemo(() => {
    const purchasePayable = data.purchases.reduce((sum, row) => sum + toNumber(row.balance_due), 0);
    const supplierCredit = data.suppliers.reduce((sum, supplier) => sum + toNumber(supplier.credit_balance), 0);
    const inventoryCost = data.parts.reduce(
      (sum, part) => sum + toNumber(part.quantity_on_hand) * toNumber(part.cost_price),
      0,
    );

    return {
      purchasePayable,
      supplierCredit,
      inventoryCost,
      openPurchases: data.purchases.filter((row) => toNumber(row.balance_due) > 0).length,
    };
  }, [data.parts, data.purchases, data.suppliers]);

  const filteredPurchases = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data.purchases;
    return data.purchases.filter((row) => JSON.stringify(row).toLowerCase().includes(normalized));
  }, [data.purchases, query]);

  const visiblePurchases = filteredPurchases.slice(page * pageSize, page * pageSize + pageSize);
  const maxPage = Math.max(Math.ceil(filteredPurchases.length / pageSize), 1);

  function updateItem(rowId: string, patch: Partial<DraftPurchaseItem>) {
    setItems((current) =>
      current.map((item) => {
        if (item.rowId !== rowId) return item;
        const next = { ...item, ...patch };
        if (patch.part_id) {
          next.unit_cost = toNumber(partById.get(patch.part_id)?.cost_price);
        }
        return next;
      }),
    );
  }

  function removeItem(rowId: string) {
    setItems((current) => (current.length <= 1 ? current : current.filter((item) => item.rowId !== rowId)));
  }

  function submitPurchase(values: PurchaseFormValues) {
    const cleanItems = items.map(({ part_id, quantity, unit_cost }) => ({ part_id, quantity, unit_cost }));
    if (cleanItems.some((item) => !item.part_id)) {
      toast.error("กรุณาเลือกอะไหล่ให้ครบทุกแถว");
      return;
    }
    if (toNumber(values.paid_amount) > totals.total) {
      toast.error("ยอดจ่ายแล้วมากกว่ายอดรวมใบซื้อ");
      return;
    }

    startTransition(async () => {
      const result = await createPurchaseWithStock({ ...values, items: cleanItems });
      if (result.ok) {
        toast.success(result.message);
        form.reset({
          supplier_id: initialSupplierId ?? "",
          purchased_at: new Date().toISOString().slice(0, 10),
          discount: 0,
          paid_amount: 0,
          payment_method: "transfer",
          notes: "",
        });
        setItems([blankItem()]);
        router.refresh();
      } else {
        toast.error(result.error ?? "บันทึกใบซื้อไม่สำเร็จ");
      }
    });
  }

  function openPayDialog(purchase: PurchaseRow) {
    setPayTarget(purchase);
    payForm.reset({
      paid_at: new Date().toISOString().slice(0, 10),
      amount: toNumber(purchase.balance_due),
      payment_method: "transfer",
      notes: "",
    });
  }

  function submitPayment(values: PayFormValues) {
    if (!payTarget) return;
    if (toNumber(values.amount) > toNumber(payTarget.balance_due)) {
      toast.error("ยอดจ่ายมากกว่ายอดค้างชำระ");
      return;
    }

    startTransition(async () => {
      const result = await paySupplierPurchase({ ...values, purchase_id: payTarget.id });
      if (result.ok) {
        toast.success(result.message);
        setPayTarget(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "บันทึกชำระไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="เจ้าหนี้จากใบซื้อ" value={formatCurrency(metrics.purchasePayable)} />
        <SummaryTile label="เครดิตคงค้าง Supplier" value={formatCurrency(metrics.supplierCredit)} />
        <SummaryTile label="ใบซื้อที่ยังไม่ปิด" value={`${metrics.openPurchases} ใบ`} />
        <SummaryTile label="มูลค่าสต๊อกตามทุน" value={formatCurrency(metrics.inventoryCost)} />
      </section>

      {canWrite ? (
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-soft">
              <PackagePlus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">บันทึกซื้ออะไหล่เข้าสต๊อก</h2>
              <p className="text-sm text-muted">บันทึกครั้งเดียวแล้วระบบจะเพิ่มสต๊อก สร้างใบซื้อ และปรับเจ้าหนี้ให้ทันที</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={form.handleSubmit(submitPurchase)}>
            <div className="grid gap-4 lg:grid-cols-4">
              <label>
                <span className="text-sm font-semibold">Supplier</span>
                <select className={inputClass()} {...form.register("supplier_id")}>
                  <option value="">เลือก Supplier</option>
                  {data.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <FieldError message={form.formState.errors.supplier_id?.message} />
              </label>
              <label>
                <span className="text-sm font-semibold">วันที่ซื้อ</span>
                <input className={inputClass()} type="date" {...form.register("purchased_at")} />
                <FieldError message={form.formState.errors.purchased_at?.message} />
              </label>
              <label>
                <span className="text-sm font-semibold">ส่วนลดรวม</span>
                <input className={inputClass()} min="0" step="0.01" type="number" {...form.register("discount")} />
                <FieldError message={form.formState.errors.discount?.message} />
              </label>
              <label>
                <span className="text-sm font-semibold">จ่ายแล้ว</span>
                <input className={inputClass()} min="0" step="0.01" type="number" {...form.register("paid_amount")} />
                <FieldError message={form.formState.errors.paid_amount?.message} />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <label>
                <span className="text-sm font-semibold">ช่องทางจ่าย</span>
                <select className={inputClass()} {...form.register("payment_method")}>
                  {paymentMethods.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-sm font-semibold">หมายเหตุ</span>
                <input className={inputClass()} placeholder="เช่น ซื้อเชื่อ 30 วัน / เลขบิล Supplier" {...form.register("notes")} />
              </label>
            </div>

            <div className="space-y-3 rounded-md border border-border bg-surface-soft p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold">รายการอะไหล่ที่รับเข้า</p>
                <Button type="button" variant="secondary" className="h-9" onClick={() => setItems((current) => [...current, blankItem()])}>
                  <Plus className="h-4 w-4" />
                  เพิ่มรายการ
                </Button>
              </div>

              <div className="space-y-2">
                {items.map((item) => {
                  const part = partById.get(item.part_id);
                  return (
                    <div key={item.rowId} className="grid gap-2 rounded-md border border-border bg-surface p-3 lg:grid-cols-12">
                      <select
                        className={cn(inputClass(), "lg:col-span-6")}
                        value={item.part_id}
                        onChange={(event) => updateItem(item.rowId, { part_id: event.target.value })}
                      >
                        <option value="">เลือกอะไหล่</option>
                        {data.parts.map((partOption) => (
                          <option key={partOption.id} value={partOption.id}>
                            {partLabel(partOption)}
                          </option>
                        ))}
                      </select>
                      <input
                        className={cn(inputClass(), "lg:col-span-2")}
                        min="0.01"
                        step="0.01"
                        type="number"
                        value={item.quantity}
                        onChange={(event) => updateItem(item.rowId, { quantity: toNumber(event.target.value) })}
                        aria-label="จำนวน"
                      />
                      <input
                        className={cn(inputClass(), "lg:col-span-2")}
                        min="0"
                        step="0.01"
                        type="number"
                        value={item.unit_cost}
                        onChange={(event) => updateItem(item.rowId, { unit_cost: toNumber(event.target.value) })}
                        aria-label="ราคาทุนต่อหน่วย"
                      />
                      <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border bg-white px-3 text-sm lg:col-span-1">
                        <span className="font-semibold">{formatCurrency(toNumber(item.quantity) * toNumber(item.unit_cost))}</span>
                        <span className="text-muted">{part?.unit ?? ""}</span>
                      </div>
                      <Button type="button" variant="ghost" className="h-11 px-0 lg:col-span-1" onClick={() => removeItem(item.rowId)}>
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
                <TotalLine label="รวมก่อนส่วนลด" value={formatCurrency(totals.subtotal)} />
                <TotalLine label="ยอดสุทธิ" value={formatCurrency(totals.total)} />
                <TotalLine label="ค้างชำระ" value={formatCurrency(totals.balance)} tone={totals.balance > 0 ? "danger" : "ok"} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button disabled={isPending} type="submit">
                {isPending ? "กำลังบันทึก..." : "บันทึกซื้อและรับสต๊อก"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="ค้นหาเลขที่ใบซื้อ, Supplier, สถานะ..."
              className="h-11 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <ButtonLink href={makeCsv(filteredPurchases)} download="purchases.csv" variant="secondary">
            <Download className="h-4 w-4" />
            CSV
          </ButtonLink>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-surface-soft text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">เลขที่</th>
                <th className="px-4 py-3 font-semibold">วันที่</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">รายการ</th>
                <th className="px-4 py-3 font-semibold">สถานะ</th>
                <th className="px-4 py-3 text-right font-semibold">ยอดรวม</th>
                <th className="px-4 py-3 text-right font-semibold">จ่ายแล้ว</th>
                <th className="px-4 py-3 text-right font-semibold">ค้างชำระ</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {visiblePurchases.map((purchase) => (
                <tr className="border-t border-border" key={purchase.id}>
                  <td className="px-4 py-3 font-semibold">
                    <Link className="text-primary hover:underline" href={`/purchases/${purchase.id}`}>
                      {purchase.purchase_no}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{formatDate(purchase.purchased_at)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{purchase.suppliers?.name ?? "-"}</p>
                    <p className="text-xs text-muted">{purchase.suppliers?.phone ?? ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {(purchase.purchase_items ?? []).slice(0, 3).map((item) => (
                        <p key={item.id} className="text-xs">
                          {item.parts?.part_code} {item.parts?.name} x {String(item.quantity)} {item.parts?.unit}
                        </p>
                      ))}
                      {(purchase.purchase_items ?? []).length > 3 ? (
                        <p className="text-xs text-muted">+{(purchase.purchase_items ?? []).length - 3} รายการ</p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge value={purchase.payment_status} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(purchase.total)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(purchase.paid_amount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-danger">{formatCurrency(purchase.balance_due)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="ghost" className="h-9 border border-border px-3" onClick={() => setAuditTarget(purchase)}>
                        <History className="h-4 w-4" />
                        ประวัติ
                      </Button>
                      {canWrite && toNumber(purchase.balance_due) > 0 ? (
                        <Button type="button" variant="secondary" className="h-9" onClick={() => openPayDialog(purchase)}>
                          <CreditCard className="h-4 w-4" />
                          ชำระ
                        </Button>
                      ) : null}
                      {canWrite ? (
                        <VoidDocumentAction
                          compact
                          documentType="purchase"
                          documentId={purchase.id}
                          documentNo={purchase.purchase_no}
                          disabled={purchase.payment_status === "cancelled" || Boolean((purchase as Record<string, unknown>).voided_at)}
                          disabledReason="ใบซื้อนี้ถูกยกเลิกแล้ว"
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!visiblePurchases.length ? (
                <tr>
                  <td className="px-4 py-12 text-center text-muted" colSpan={9}>
                    ยังไม่มีใบซื้อหรือไม่พบรายการที่ค้นหา
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border p-4 text-sm">
          <span className="text-muted">
            หน้า {page + 1} จาก {maxPage}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 0} onClick={() => setPage((value) => Math.max(value - 1, 0))}>
              ก่อนหน้า
            </Button>
            <Button variant="secondary" disabled={page + 1 >= maxPage} onClick={() => setPage((value) => value + 1)}>
              ถัดไป
            </Button>
          </div>
        </div>
      </section>

      {payTarget ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <form
            onSubmit={payForm.handleSubmit(submitPayment)}
            className="mt-10 w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">จ่ายชำระ Supplier</h2>
                <p className="text-sm text-muted">
                  {payTarget.purchase_no} ค้าง {formatCurrency(payTarget.balance_due)}
                </p>
              </div>
              <Button type="button" variant="ghost" onClick={() => setPayTarget(null)}>
                ปิด
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="text-sm font-semibold">วันที่จ่าย</span>
                <input className={inputClass()} type="date" {...payForm.register("paid_at")} />
                <FieldError message={payForm.formState.errors.paid_at?.message} />
              </label>
              <label>
                <span className="text-sm font-semibold">จำนวนเงิน</span>
                <input className={inputClass()} min="0.01" step="0.01" type="number" {...payForm.register("amount")} />
                <FieldError message={payForm.formState.errors.amount?.message} />
              </label>
              <label>
                <span className="text-sm font-semibold">ช่องทางจ่าย</span>
                <select className={inputClass()} {...payForm.register("payment_method")}>
                  {paymentMethods.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-sm font-semibold">หมายเหตุ</span>
                <input className={inputClass()} placeholder="เช่น โอนงวดที่ 1" {...payForm.register("notes")} />
              </label>
            </div>

            <div className="mt-5 rounded-md bg-surface-soft p-3 text-sm">
              บันทึกนี้จะสร้างรายจ่ายหมวดซื้ออะไหล่โดยอัตโนมัติ ช่องทางจ่าย: {paymentLabel(watchedPaymentMethod)}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPayTarget(null)}>
                ยกเลิก
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? "กำลังบันทึก..." : "บันทึกชำระ"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {auditTarget ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="mt-10 w-full max-w-3xl rounded-lg border border-border bg-surface p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">ประวัติใบซื้อ {auditTarget.purchase_no}</h2>
                <p className="text-sm text-muted">
                  แสดงการสร้างใบซื้อ การจ่ายชำระ Supplier และการยกเลิกแบบย้อนกลับสต๊อก
                </p>
              </div>
              <Button type="button" variant="ghost" onClick={() => setAuditTarget(null)}>
                ปิด
              </Button>
            </div>
            <AuditTrailPanel
              compact
              logs={purchaseLogsById.get(auditTarget.id) ?? []}
              empty="ยังไม่มีประวัติของใบซื้อนี้"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function inputClass() {
  return "mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary";
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-sm text-danger">{message}</p> : null;
}

function TotalLine({ label, value, tone }: { label: string; value: string; tone?: "ok" | "danger" }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-surface px-3 py-2">
      <span className="text-muted">{label}</span>
      <span className={cn("font-semibold", tone === "ok" && "text-primary", tone === "danger" && "text-danger")}>{value}</span>
    </div>
  );
}
