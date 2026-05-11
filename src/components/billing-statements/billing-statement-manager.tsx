"use client";

import { Eye, FileDown, Plus } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createBillingStatement } from "@/app/actions/billing-statements";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import type { ActionResult } from "@/lib/types";
import { cn, formatCurrency, formatDate, toNumber } from "@/lib/utils";

type Row = Record<string, unknown>;

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function relation(row: Row, key: string) {
  const value = row[key];
  if (Array.isArray(value)) return (value[0] as Row | undefined) ?? null;
  if (value && typeof value === "object") return value as Row;
  return null;
}

function text(value: unknown, fallback = "-") {
  const result = String(value ?? "").trim();
  return result && result !== "-" ? result : fallback;
}

function customerLabel(invoice: Row) {
  const customer = relation(invoice, "customers");
  const name = text(customer?.full_name, "ไม่ระบุชื่อลูกค้า");
  const phone = text(customer?.phone, "");
  return phone ? `${name} (${phone})` : name;
}

function statementItems(statement: Row) {
  const items = statement.billing_statement_items;
  return Array.isArray(items)
    ? [...(items as Row[])].sort((a, b) => toNumber(a.sort_order) - toNumber(b.sort_order))
    : [];
}

const statusLabels: Record<string, string> = {
  draft: "ร่าง",
  issued: "ออกเอกสารแล้ว",
  paid: "ชำระแล้ว",
  cancelled: "ยกเลิก",
};

export function BillingStatementManager({
  invoices,
  statements,
}: {
  invoices: Row[];
  statements: Row[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(createBillingStatement, null);
  const customers = useMemo(() => {
    const map = new Map<string, string>();
    for (const invoice of invoices) {
      const id = String(invoice.customer_id ?? "");
      if (!id || map.has(id)) continue;
      map.set(id, customerLabel(invoice));
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [invoices]);

  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [invoiceQuery, setInvoiceQuery] = useState("");

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message ?? "สร้างใบวางบิลเรียบร้อย");
      router.refresh();
    } else {
      toast.error(state.error ?? "สร้างใบวางบิลไม่สำเร็จ");
    }
  }, [router, state]);

  const customerInvoices = useMemo(() => {
    const query = invoiceQuery.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (customerId && String(invoice.customer_id) !== customerId) return false;
      if (!query) return true;
      const haystack = [
        invoice.invoice_no,
        invoice.issued_at,
        invoice.due_at,
        invoice.balance_due,
        customerLabel(invoice),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [customerId, invoiceQuery, invoices]);

  const selectedTotal = customerInvoices
    .filter((invoice) => selectedInvoices.includes(String(invoice.id)))
    .reduce((sum, invoice) => sum + toNumber(invoice.balance_due), 0);

  function toggleInvoice(id: string, checked: boolean) {
    setSelectedInvoices((current) => (checked ? Array.from(new Set([...current, id])) : current.filter((entry) => entry !== id)));
  }

  function changeCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    setSelectedInvoices([]);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold">สร้างใบวางบิล</h2>
            <p className="mt-1 text-sm text-muted">เลือกใบแจ้งหนี้ที่ยังค้างชำระหลายรายการของลูกค้าคนเดียวกัน</p>
          </div>
          <div className="rounded-md bg-surface-soft px-4 py-2 text-right">
            <p className="text-xs text-muted">ยอดที่เลือก</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(selectedTotal)}</p>
          </div>
        </div>

        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_160px_160px]">
            <label>
              <span className="text-sm font-semibold">ลูกค้า</span>
              <select
                className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                name="customer_id"
                value={customerId}
                onChange={(event) => changeCustomer(event.target.value)}
              >
                {customers.length ? null : <option value="">ยังไม่มีใบแจ้งหนี้ค้างชำระ</option>}
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold">วันที่ออกเอกสาร</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                defaultValue={todayInputValue()}
                name="issued_at"
                type="date"
              />
            </label>
            <label>
              <span className="text-sm font-semibold">วันครบกำหนด</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                name="due_at"
                type="date"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-semibold">หมายเหตุบนเอกสาร</span>
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              name="notes"
              placeholder="ไม่กรอกก็ได้ ระบบจะไม่แสดงหัวข้อหมายเหตุบนเอกสาร"
            />
          </label>

          <div className="rounded-md border border-border">
            <div className="border-b border-border p-3">
              <label>
                <span className="sr-only">ค้นหาใบแจ้งหนี้</span>
                <input
                  className="h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  value={invoiceQuery}
                  onChange={(event) => setInvoiceQuery(event.target.value)}
                  placeholder="ค้นหาเลขใบแจ้งหนี้ / วันที่ / ยอดค้าง"
                />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-surface-soft text-left">
                  <tr>
                    <th className="w-12 px-3 py-3"></th>
                    <th className="px-3 py-3">ใบแจ้งหนี้</th>
                    <th className="px-3 py-3">วันที่ออก</th>
                    <th className="px-3 py-3">ครบกำหนด</th>
                    <th className="px-3 py-3 text-right">ยอดรวม</th>
                    <th className="px-3 py-3 text-right">ชำระแล้ว</th>
                    <th className="px-3 py-3 text-right">ยอดค้าง</th>
                  </tr>
                </thead>
                <tbody>
                  {customerInvoices.map((invoice) => {
                    const id = String(invoice.id);
                    const checked = selectedInvoices.includes(id);
                    return (
                      <tr className={cn("border-t border-border", checked && "bg-primary/5")} key={id}>
                        <td className="px-3 py-3">
                          <input
                            checked={checked}
                            className="h-5 w-5 accent-primary"
                            name="invoice_ids"
                            type="checkbox"
                            value={id}
                            onChange={(event) => toggleInvoice(id, event.target.checked)}
                          />
                        </td>
                        <td className="px-3 py-3 font-semibold">{text(invoice.invoice_no)}</td>
                        <td className="px-3 py-3">{formatDate(invoice.issued_at)}</td>
                        <td className="px-3 py-3">{formatDate(invoice.due_at)}</td>
                        <td className="px-3 py-3 text-right">{formatCurrency(invoice.total)}</td>
                        <td className="px-3 py-3 text-right">{formatCurrency(invoice.paid_amount)}</td>
                        <td className="px-3 py-3 text-right font-bold text-primary">{formatCurrency(invoice.balance_due)}</td>
                      </tr>
                    );
                  })}
                  {customerInvoices.length ? null : (
                    <tr>
                      <td className="px-3 py-8 text-center text-muted" colSpan={7}>
                        ไม่พบใบแจ้งหนี้ค้างชำระของลูกค้าคนนี้
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">เลือกแล้ว {selectedInvoices.length} รายการ</p>
            <Button disabled={pending || !customerId || selectedInvoices.length === 0} type="submit">
              <Plus className="h-4 w-4" />
              {pending ? "กำลังสร้าง..." : "สร้างใบวางบิล"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold">ใบวางบิลล่าสุด</h2>
          <p className="mt-1 text-sm text-muted">เอกสารที่สร้างแล้วสามารถพรีวิวและดาวน์โหลด PDF ได้ทันที</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-surface-soft text-left">
              <tr>
                <th className="px-3 py-3">เลขที่</th>
                <th className="px-3 py-3">ลูกค้า</th>
                <th className="px-3 py-3">วันที่ออก</th>
                <th className="px-3 py-3">ครบกำหนด</th>
                <th className="px-3 py-3">สถานะ</th>
                <th className="px-3 py-3 text-right">จำนวนใบแจ้งหนี้</th>
                <th className="px-3 py-3 text-right">ยอดวางบิล</th>
                <th className="px-3 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((statement) => {
                const customer = relation(statement, "customers");
                const items = statementItems(statement);
                const status = String(statement.status ?? "issued");
                return (
                  <tr className="border-t border-border" key={String(statement.id)}>
                    <td className="px-3 py-3 font-semibold">{text(statement.billing_statement_no)}</td>
                    <td className="px-3 py-3">{text(customer?.full_name)}</td>
                    <td className="px-3 py-3">{formatDate(statement.issued_at)}</td>
                    <td className="px-3 py-3">{formatDate(statement.due_at)}</td>
                    <td className="px-3 py-3">
                      <Badge value={statusLabels[status] ?? status} />
                    </td>
                    <td className="px-3 py-3 text-right">{items.length}</td>
                    <td className="px-3 py-3 text-right font-bold">{formatCurrency(statement.total)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <ButtonLink
                          className="h-9 px-3"
                          href={`/print/billing-statements/${statement.id}`}
                          target="_blank"
                          variant="secondary"
                        >
                          <Eye className="h-4 w-4" />
                          พรีวิว
                        </ButtonLink>
                        <ButtonLink
                          className="h-9 px-3"
                          href={`/api/documents/billing-statements/${statement.id}`}
                          target="_blank"
                        >
                          <FileDown className="h-4 w-4" />
                          PDF
                        </ButtonLink>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {statements.length ? null : (
                <tr>
                  <td className="px-3 py-8 text-center text-muted" colSpan={8}>
                    ยังไม่มีใบวางบิล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
