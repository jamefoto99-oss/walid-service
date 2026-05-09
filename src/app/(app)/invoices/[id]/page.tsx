import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Car, FileDown, ReceiptText, UserRound, Wrench } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { VoidDocumentAction } from "@/components/documents/void-document-action";
import { InvoicePaymentForm } from "@/components/invoices/invoice-payment-form";
import { AuditTrailPanel } from "@/components/records/audit-trail-panel";
import { DetailPanel, DetailTable, InfoGrid, SummaryCard } from "@/components/records/detail-sections";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SetupRequired } from "@/components/ui/setup-required";
import { canRead, canWrite, requireProfile } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/data";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "-");
}

function nested(row: Row, key: string): Row | null {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, "invoices")) redirect("/dashboard");

  const { detail, setupRequired } = await getInvoiceDetail(id);
  if (setupRequired) return <SetupRequired />;
  if (!detail) notFound();

  const { invoice, items, payments, receipts, logs } = detail;
  const customer = nested(invoice, "customers");
  const vehicle = nested(invoice, "vehicles");
  const repairJob = nested(invoice, "repair_jobs");
  const quotation = nested(invoice, "quotations");
  const balanceDue = toNumber(invoice.balance_due);
  const paidAmount = toNumber(invoice.paid_amount);
  const total = toNumber(invoice.total);
  const isClosed = balanceDue <= 0 || ["paid", "cancelled"].includes(String(invoice.payment_status));
  const writable = canWrite(session.profile.role, "invoices");
  const canVoidInvoice =
    writable &&
    !invoice.voided_at &&
    String(invoice.payment_status) !== "cancelled" &&
    receipts.length === 0;
  const voidDisabledReason = receipts.length
    ? "ใบแจ้งหนี้นี้มีใบเสร็จอยู่ ต้องยกเลิกใบเสร็จก่อน"
    : invoice.voided_at || String(invoice.payment_status) === "cancelled"
      ? "ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว"
      : undefined;

  return (
    <>
      <PageHeader
        title={`ใบแจ้งหนี้ ${text(invoice.invoice_no)}`}
        description="รายละเอียดใบแจ้งหนี้ รับชำระเงิน ออกใบเสร็จ และดูประวัติการรับเงิน"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/invoices" variant="secondary">
              กลับรายการใบแจ้งหนี้
            </ButtonLink>
            <ButtonLink href={`/print/invoices/${invoice.id}`} target="_blank">
              <FileDown className="h-4 w-4" />
              พิมพ์ใบแจ้งหนี้
            </ButtonLink>
            {writable ? (
              <VoidDocumentAction
                documentType="invoice"
                documentId={String(invoice.id)}
                documentNo={String(invoice.invoice_no)}
                disabled={!canVoidInvoice}
                disabledReason={voidDisabledReason}
              />
            ) : null}
          </div>
        }
      />

      {invoice.voided_at ? (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          ใบแจ้งหนี้นี้ถูกยกเลิกแล้วเมื่อ {formatDate(invoice.voided_at)} เหตุผล: {text(invoice.void_reason)}
        </div>
      ) : null}

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="ยอดรวมสุทธิ" value={formatCurrency(total)} />
        <SummaryCard label="รับชำระแล้ว" value={formatCurrency(paidAmount)} />
        <SummaryCard label="ยอดค้างชำระ" value={formatCurrency(balanceDue)} />
        <SummaryCard label="สถานะ" value={<Badge value={invoice.payment_status} />} hint={`ครบกำหนด ${formatDate(invoice.due_at)}`} />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <DetailPanel title="ข้อมูลใบแจ้งหนี้">
          <InfoGrid
            rows={[
              { label: "เลขที่ใบแจ้งหนี้", value: text(invoice.invoice_no) },
              { label: "วันที่ออก", value: formatDate(invoice.issued_at) },
              { label: "วันครบกำหนด", value: formatDate(invoice.due_at) },
              { label: "สถานะ", value: <Badge value={invoice.payment_status} /> },
              {
                label: "ใบเสนอราคา",
                value: quotation ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/quotations/${invoice.quotation_id}`}>
                    {text(quotation.quotation_no)}
                  </Link>
                ) : (
                  "-"
                ),
              },
              {
                label: "งานซ่อม",
                value: repairJob ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/repair-jobs/${invoice.repair_job_id}`}>
                    {text(repairJob.job_number)}
                  </Link>
                ) : (
                  "-"
                ),
              },
              { label: "หมายเหตุ", value: <span className="whitespace-pre-wrap">{text(invoice.notes)}</span> },
            ]}
          />
        </DetailPanel>

        <InvoicePaymentForm
          invoiceId={String(invoice.id)}
          invoiceNo={String(invoice.invoice_no)}
          balanceDue={balanceDue}
          disabled={isClosed}
        />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <DetailPanel title="ลูกค้า">
          <InfoGrid
            rows={[
              {
                label: "ชื่อลูกค้า",
                value: customer ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/customers/${invoice.customer_id}`}>
                    <UserRound className="mr-1 inline h-4 w-4" />
                    {text(customer.full_name)}
                  </Link>
                ) : (
                  "-"
                ),
              },
              { label: "เบอร์โทร", value: text(customer?.phone) },
              { label: "LINE", value: text(customer?.line_id) },
              { label: "ที่อยู่", value: <span className="whitespace-pre-wrap">{text(customer?.address)}</span> },
            ]}
          />
        </DetailPanel>

        <DetailPanel title="รถ / งานซ่อม">
          <InfoGrid
            rows={[
              {
                label: "รถยนต์",
                value: vehicle ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/vehicles/${invoice.vehicle_id}`}>
                    <Car className="mr-1 inline h-4 w-4" />
                    {text(vehicle.license_plate)} {text(vehicle.brand)} {text(vehicle.model)}
                  </Link>
                ) : (
                  "-"
                ),
              },
              { label: "จังหวัด", value: text(vehicle?.province) },
              { label: "ปี / สี", value: `${text(vehicle?.year)} / ${text(vehicle?.color)}` },
              { label: "เลขไมล์", value: text(vehicle?.mileage) },
              {
                label: "สถานะงานซ่อม",
                value: repairJob ? (
                  <span className="inline-flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-muted" />
                    <Badge value={repairJob.status} />
                  </span>
                ) : (
                  "-"
                ),
              },
              { label: "อาการเสีย", value: <span className="whitespace-pre-wrap">{text(repairJob?.reported_problem)}</span> },
            ]}
          />
        </DetailPanel>
      </section>

      <section className="mb-5">
        <DetailTable
          title="รายการในใบแจ้งหนี้"
          rows={items}
          empty="ยังไม่มีรายการในใบแจ้งหนี้"
          columns={[
            {
              header: "รายการ",
              cell: (row) => (
                <div>
                  <p className="font-semibold">{text(row.description)}</p>
                  <p className="text-xs text-muted">{text(row.item_type)}</p>
                </div>
              ),
            },
            { header: "จำนวน", cell: (row) => text(row.quantity), className: "px-4 py-3 text-right" },
            { header: "ราคา/หน่วย", cell: (row) => formatCurrency(row.unit_price), className: "px-4 py-3 text-right" },
            { header: "ส่วนลด", cell: (row) => formatCurrency(row.discount), className: "px-4 py-3 text-right" },
            { header: "รวม", cell: (row) => formatCurrency(row.total), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DetailTable
          title="ประวัติรับชำระ"
          rows={payments}
          empty="ยังไม่มีประวัติรับชำระ"
          columns={[
            { header: "วันที่รับเงิน", cell: (row) => formatDate(row.paid_at) },
            {
              header: "ใบเสร็จ",
              cell: (row) => {
                const receipt = nested(row, "receipts");
                return receipt ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/receipts/${row.receipt_id}`}>
                    {text(receipt.receipt_no)}
                  </Link>
                ) : (
                  "-"
                );
              },
            },
            { header: "ช่องทาง", cell: (row) => text(row.payment_method) },
            { header: "หมายเหตุ", cell: (row) => text(row.notes) },
            { header: "จำนวนเงิน", cell: (row) => formatCurrency(row.amount), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />

        <DetailTable
          title="ใบเสร็จรับเงิน"
          rows={receipts}
          empty="ยังไม่มีใบเสร็จ"
          columns={[
            {
              header: "เลขที่",
              cell: (row) => (
                <Link className="font-semibold text-primary hover:underline" href={`/receipts/${row.id}`}>
                  <ReceiptText className="mr-1 inline h-4 w-4" />
                  {text(row.receipt_no)}
                </Link>
              ),
            },
            { header: "วันที่", cell: (row) => formatDate(row.received_at) },
            { header: "ช่องทาง", cell: (row) => text(row.payment_method) },
            { header: "จำนวนเงิน", cell: (row) => formatCurrency(row.amount), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />
      </section>

      <div className="mt-5">
        <AuditTrailPanel logs={logs} />
      </div>
    </>
  );
}
