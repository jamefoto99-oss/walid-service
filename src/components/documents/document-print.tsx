"use client";

import { ButtonLink } from "@/components/ui/button";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

const labels: Record<string, string> = {
  "repair-job": "ใบรับรถ",
  quotations: "ใบเสนอราคา",
  invoices: "ใบแจ้งหนี้",
  receipts: "ใบเสร็จรับเงิน",
  "billing-statements": "ใบวางบิล",
  "cash-bills": "บิลเงินสด",
};

type SignatureDefinition = { label: string; date?: boolean };

function documentNumber(type: string, document: Record<string, unknown>) {
  if (type === "repair-job") return document.job_number;
  if (type === "quotations") return document.quotation_no;
  if (type === "invoices") return document.invoice_no;
  if (type === "receipts") return document.receipt_no;
  if (type === "billing-statements") return document.billing_statement_no;
  if (type === "cash-bills") return document.cash_bill_no;
  return document.id;
}

function hasPaymentInfo(company: Record<string, unknown> | null) {
  return Boolean(company?.bank_name || company?.bank_account_number || company?.bank_account_name);
}

function displayValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : "";
}

function flagValue(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function signatureDefinitions(type: string): SignatureDefinition[] {
  if (type === "quotations") return [{ label: "ผู้อนุมัติซื้อ" }, { label: "ผู้เสนอราคา" }, { label: "ผู้จัดการ" }];
  if (type === "invoices") return [{ label: "ผู้อนุมัติ" }, { label: "ผู้รับใบแจ้งหนี้" }];
  if (type === "receipts") return [{ label: "ผู้จ่ายเงิน", date: true }, { label: "ผู้รับเงิน", date: true }];
  if (type === "billing-statements") return [{ label: "ผู้วางบิล", date: true }, { label: "ผู้รับวางบิล", date: true }];
  if (type === "cash-bills") return [{ label: "ผู้จ่ายเงิน" }, { label: "ผู้รับเงิน" }];
  return [{ label: "ลูกค้า" }, { label: "ผู้รับผิดชอบ" }];
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
  const companyName = displayValue(company?.company_name) || "อู่วาลิดการช่าง";
  const companyAddress = displayValue(company?.address);
  const companyContact = [
    displayValue(company?.phone) ? `โทร ${displayValue(company?.phone)}` : "",
    displayValue(company?.line_id) ? `LINE ${displayValue(company?.line_id)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const customerPhone = displayValue(customer?.phone);
  const customerAddress = displayValue(customer?.address);
  const vehicleIdentity = [displayValue(vehicle?.license_plate), displayValue(vehicle?.province)].filter(Boolean).join(" ");
  const vehicleDetail = [displayValue(vehicle?.brand), displayValue(vehicle?.model), displayValue(vehicle?.color)].filter(Boolean).join(" ");
  const mileage = displayValue(document.intake_mileage ?? vehicle?.mileage);
  const hasVehicleInfo = Boolean(vehicleIdentity || vehicleDetail || mileage);
  const noteText = displayValue(document.notes);
  const showPaymentInfo = type !== "repair-job" && flagValue(document.show_payment_info);
  const showPaidStamp = type !== "repair-job" && flagValue(document.show_paid_stamp);
  const signatures = signatureDefinitions(type);

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
              <img alt="โลโก้กิจการ" className="h-14 w-14 object-contain" src={String(company.logo_url)} />
            ) : null}
            <div>
              <p className="text-2xl font-bold leading-tight">{companyName}</p>
              {companyAddress ? <p className="mt-1 max-w-lg text-sm text-zinc-600">{companyAddress}</p> : null}
              {companyContact ? <p className="text-sm text-zinc-600">{companyContact}</p> : null}
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="mt-2 font-mono text-sm">{String(documentNumber(type, document))}</p>
            <p className="text-sm text-zinc-600">วันที่ {formatDate(document.issued_at ?? document.received_at ?? document.created_at)}</p>
            {showPaidStamp ? (
              <div className="mt-3 inline-flex rotate-[-3deg] rounded-sm border-2 border-emerald-700 px-4 py-1 text-base font-black text-emerald-700">
                จ่ายแล้ว
              </div>
            ) : null}
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

        <section className={cn("grid gap-4 border-b border-zinc-300 py-6", hasVehicleInfo && "md:grid-cols-2")}>
          <div className="rounded-md border border-zinc-300 p-4">
            <h2 className="font-semibold">ข้อมูลลูกค้า</h2>
            <p className="mt-2">{displayValue(customer?.full_name) || "-"}</p>
            {customerPhone ? <p className="text-sm text-zinc-600">โทร {customerPhone}</p> : null}
            {customerAddress ? <p className="text-sm text-zinc-600">{customerAddress}</p> : null}
          </div>
          {hasVehicleInfo ? (
            <div className="rounded-md border border-zinc-300 p-4">
              <h2 className="font-semibold">ข้อมูลรถ</h2>
              {vehicleIdentity ? <p className="mt-2">{vehicleIdentity}</p> : null}
              {vehicleDetail ? <p className="text-sm text-zinc-600">{vehicleDetail}</p> : null}
              {mileage ? <p className="text-sm text-zinc-600">เลขไมล์ {mileage}</p> : null}
            </div>
          ) : null}
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
        ) : type === "billing-statements" ? (
          <section className="border-b border-zinc-300 py-6">
            <div className="rounded-md border border-zinc-300 p-3">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left">
                  <th className="w-12 py-2 text-center">ลำดับ</th>
                  <th className="py-2">ใบแจ้งหนี้</th>
                  <th className="py-2">วันที่ออก</th>
                  <th className="py-2">ครบกำหนด</th>
                  <th className="py-2 text-right">ยอดรวม</th>
                  <th className="py-2 text-right">ชำระแล้ว</th>
                  <th className="py-2 text-right">ยอดค้าง</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr className="border-b border-zinc-200" key={String(item.id)}>
                    <td className="py-3 text-center">{index + 1}</td>
                    <td className="py-3 font-semibold">{String(item.invoice_no ?? "-")}</td>
                    <td className="py-3">{formatDate(item.issued_at)}</td>
                    <td className="py-3">{formatDate(item.due_at)}</td>
                    <td className="py-3 text-right">{formatCurrency(item.total)}</td>
                    <td className="py-3 text-right">{formatCurrency(item.paid_amount)}</td>
                    <td className="py-3 text-right font-bold">{formatCurrency(item.balance_due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="ml-auto mt-4 w-full max-w-sm rounded-md border border-zinc-300 p-3 text-sm">
              <div className="flex justify-between">
                <span>ยอดรวมใบวางบิล</span>
                <span>{formatCurrency(document.subtotal ?? document.total)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-300 pt-2 text-lg font-bold">
                <span>ยอดสุทธิ</span>
                <span>{formatCurrency(document.total)}</span>
              </div>
            </div>
          </section>
        ) : (
          <section className="border-b border-zinc-300 py-6">
            <div className="rounded-md border border-zinc-300 p-3">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left">
                  <th className="w-12 py-2 text-center">ลำดับ</th>
                  <th className="py-2">รายการ</th>
                  <th className="py-2 text-right">จำนวน</th>
                  <th className="py-2 text-right">หน่วย</th>
                  <th className="py-2 text-right">ราคา</th>
                  <th className="py-2 text-right">ส่วนลด</th>
                  <th className="py-2 text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr className="border-b border-zinc-200" key={String(item.id)}>
                    <td className="py-3 text-center">{index + 1}</td>
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
            </div>
            <div className="ml-auto mt-4 w-full max-w-sm rounded-md border border-zinc-300 p-3 text-sm">
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

        {showPaymentInfo && hasPaymentInfo(company) ? (
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

        {noteText ? (
          <section className="py-6">
            <h2 className="font-semibold">หมายเหตุ</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600">{noteText}</p>
          </section>
        ) : null}

        <footer className="mt-12 grid gap-8" style={{ gridTemplateColumns: `repeat(${signatures.length}, minmax(0, 1fr))` }}>
          {signatures.map((signature) => (
            <div className="text-center text-sm" key={signature.label}>
              <div className="border-t border-zinc-400 pt-3">{signature.label}</div>
              {signature.date ? <div className="mt-4 text-zinc-600">วันที่ ........../........../..........</div> : null}
            </div>
          ))}
        </footer>
      </section>
    </main>
  );
}
