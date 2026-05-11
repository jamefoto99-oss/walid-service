"use client";

import { ButtonLink } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";

const labels: Record<string, string> = {
  "repair-job": "ใบรับรถ",
  quotations: "ใบเสนอราคา",
  invoices: "ใบแจ้งหนี้",
  receipts: "ใบเสร็จรับเงิน",
  "cash-bills": "บิลเงินสด",
};

function documentNumber(type: string, document: Record<string, unknown>) {
  if (type === "repair-job") return document.job_number;
  if (type === "quotations") return document.quotation_no;
  if (type === "invoices") return document.invoice_no;
  if (type === "receipts") return document.receipt_no;
  if (type === "cash-bills") return document.cash_bill_no;
  return document.id;
}

function hasPaymentInfo(company: Record<string, unknown> | null) {
  return Boolean(company?.bank_name || company?.bank_account_number || company?.bank_account_name);
}

function isCancelledDocument(document: Record<string, unknown>) {
  return Boolean(document.voided_at) || document.status === "cancelled" || document.payment_status === "cancelled";
}

function cancellationReason(document: Record<string, unknown>) {
  return String(document.void_reason ?? document.notes ?? "เอกสารถูกยกเลิกในระบบ");
}

export function DocumentPrint({
  data,
}: {
  data: {
    type: string;
    document: Record<string, unknown>;
    company: Record<string, unknown> | null;
    customer: Record<string, unknown> | null;
    vehicle: Record<string, unknown> | null;
    items: Record<string, unknown>[];
  };
}) {
  const { type, document, company, customer, vehicle, items } = data;
  const title = labels[type] ?? "เอกสาร";
  const cancelled = isCancelledDocument(document);

  return (
    <main className="min-h-screen bg-background p-4 print:bg-white">
      <div className="no-print mx-auto mb-4 flex max-w-4xl justify-end gap-2">
        <ButtonLink href={`/api/documents/${type}/${document.id}`} target="_blank">
          ดาวน์โหลด PDF
        </ButtonLink>
        <button className="rounded-md border border-border bg-surface px-4 py-2 font-semibold" onClick={() => window.print()}>
          พิมพ์
        </button>
      </div>
      <section className="relative mx-auto max-w-4xl rounded-lg bg-white p-8 shadow-sm print:shadow-none">
        {cancelled ? (
          <div className="pointer-events-none absolute inset-x-0 top-72 z-0 flex rotate-[-18deg] justify-center opacity-10 print:opacity-15">
            <span className="border-8 border-red-700 px-8 py-3 text-7xl font-black uppercase tracking-normal text-red-700">
              ยกเลิก
            </span>
          </div>
        ) : null}
        <header className="flex items-start justify-between gap-6 border-b border-zinc-300 pb-6">
          <div className="flex items-start gap-4">
            {company?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="โลโก้กิจการ" className="h-20 w-20 object-contain" src={String(company.logo_url)} />
            ) : null}
            <div>
              <p className="text-2xl font-bold">{String(company?.company_name ?? "อู่วาลิดการช่าง")}</p>
              <p className="mt-2 max-w-lg text-sm text-zinc-600">{String(company?.address ?? "-")}</p>
              <p className="text-sm text-zinc-600">โทร {String(company?.phone ?? "-")} LINE {String(company?.line_id ?? "-")}</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="mt-2 font-mono text-sm">{String(documentNumber(type, document))}</p>
            <p className="text-sm text-zinc-600">วันที่ {formatDate(document.issued_at ?? document.received_at ?? document.created_at)}</p>
            {cancelled ? (
              <div className="mt-3 inline-flex rounded-md border-2 border-red-700 px-3 py-1 text-sm font-bold text-red-700">
                ยกเลิกแล้ว
              </div>
            ) : null}
          </div>
        </header>

        {cancelled ? (
          <section className="relative z-10 my-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-red-900">
            <h2 className="text-lg font-bold">เอกสารนี้ถูกยกเลิกแล้ว</h2>
            <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
              <p>วันที่ยกเลิก: {formatDate(document.voided_at ?? document.updated_at ?? document.created_at)}</p>
              <p>เลขที่เอกสาร: {String(documentNumber(type, document))}</p>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">เหตุผล: {cancellationReason(document)}</p>
            <p className="mt-2 text-sm font-semibold">ห้ามใช้เอกสารฉบับนี้เป็นเอกสารเรียกเก็บเงินหรือรับชำระที่ยังมีผลอยู่</p>
          </section>
        ) : null}

        <section className="grid gap-6 border-b border-zinc-300 py-6 md:grid-cols-2">
          <div>
            <h2 className="font-semibold">ข้อมูลลูกค้า</h2>
            <p className="mt-2">{String(customer?.full_name ?? "-")}</p>
            <p className="text-sm text-zinc-600">โทร {String(customer?.phone ?? "-")}</p>
            <p className="text-sm text-zinc-600">{String(customer?.address ?? "")}</p>
          </div>
          <div>
            <h2 className="font-semibold">ข้อมูลรถ</h2>
            <p className="mt-2">{String(vehicle?.license_plate ?? "-")} {String(vehicle?.province ?? "")}</p>
            <p className="text-sm text-zinc-600">
              {String(vehicle?.brand ?? "")} {String(vehicle?.model ?? "")} {String(vehicle?.color ?? "")}
            </p>
            <p className="text-sm text-zinc-600">เลขไมล์ {String(document.intake_mileage ?? vehicle?.mileage ?? "-")}</p>
          </div>
        </section>

        {type === "repair-job" ? (
          <section className="space-y-4 border-b border-zinc-300 py-6">
            <div>
              <h2 className="font-semibold">อาการเสียที่ลูกค้าแจ้ง</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{String(document.reported_problem ?? "-")}</p>
            </div>
            <div>
              <h2 className="font-semibold">รายการตรวจเช็กเบื้องต้น</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{String(document.preliminary_check ?? "-")}</p>
            </div>
            <div>
              <h2 className="font-semibold">ของมีค่าในรถ</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{String(document.valuables ?? "-")}</p>
            </div>
          </section>
        ) : (
          <section className="border-b border-zinc-300 py-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left">
                  <th className="py-2">รายการ</th>
                  <th className="py-2 text-right">จำนวน</th>
                  <th className="py-2 text-right">หน่วย</th>
                  <th className="py-2 text-right">ราคา</th>
                  <th className="py-2 text-right">ส่วนลด</th>
                  <th className="py-2 text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr className="border-b border-zinc-200" key={String(item.id)}>
                    <td className="py-3">{String(item.description ?? "-")}</td>
                    <td className="py-3 text-right">{String(item.quantity ?? 1)}</td>
                    <td className="py-3 text-right">{String(item.unit ?? "ชิ้น")}</td>
                    <td className="py-3 text-right">{formatCurrency(item.unit_price)}</td>
                    <td className="py-3 text-right">{formatCurrency(item.discount)}</td>
                    <td className="py-3 text-right">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ml-auto mt-6 w-full max-w-sm space-y-2 text-sm">
              <div className="flex justify-between">
                <span>ยอดรวม</span>
                <span>{formatCurrency(document.subtotal ?? document.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>ส่วนลด</span>
                <span>{formatCurrency(document.discount)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-300 pt-2 text-lg font-bold">
                <span>ยอดสุทธิ</span>
                <span>{formatCurrency(document.total ?? document.amount)}</span>
              </div>
            </div>
          </section>
        )}

        {type !== "repair-job" && hasPaymentInfo(company) ? (
          <section className="border-b border-zinc-300 py-6">
            <h2 className="font-semibold">ช่องทางการชำระเงิน</h2>
            <div className="mt-3 grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm md:grid-cols-[auto_1fr]">
              <div className="flex h-14 w-14 items-center justify-center rounded-md border border-zinc-200 bg-white">
                {company?.bank_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="โลโก้ธนาคาร" className="h-10 w-10 object-contain" src={String(company.bank_logo_url)} />
                ) : (
                  <span className="text-xs font-bold text-zinc-500">BANK</span>
                )}
              </div>
              <div className="space-y-1">
                <p>
                  <span className="font-semibold">ธนาคาร :</span> {String(company?.bank_name ?? "-")}
                </p>
                <p>
                  <span className="font-semibold">เลขที่บัญชี :</span>{" "}
                  <span className="text-xl font-black text-red-700">{String(company?.bank_account_number ?? "-")}</span>
                </p>
                <p>
                  <span className="font-semibold">ชื่อบัญชี :</span>{" "}
                  <span className="rounded bg-yellow-100 px-2 py-1 font-bold text-zinc-950">{String(company?.bank_account_name ?? "-")}</span>
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="py-6">
          <h2 className="font-semibold">หมายเหตุ</h2>
          <p className="mt-2 min-h-12 whitespace-pre-wrap text-sm text-zinc-600">
            {String(document.notes ?? company?.document_footer ?? "-")}
          </p>
        </section>

        <footer className="mt-12 grid gap-10 md:grid-cols-2">
          <div className="border-t border-zinc-400 pt-3 text-center text-sm">ผู้จ่ายเงิน</div>
          <div className="border-t border-zinc-400 pt-3 text-center text-sm">ผู้รับเงิน</div>
        </footer>
      </section>
    </main>
  );
}
