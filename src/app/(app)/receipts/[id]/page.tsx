import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Car, FileDown, FileText, ReceiptText, UserRound, Wrench } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { VoidDocumentAction } from "@/components/documents/void-document-action";
import { AuditTrailPanel } from "@/components/records/audit-trail-panel";
import { DetailPanel, DetailTable, InfoGrid, SummaryCard } from "@/components/records/detail-sections";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SetupRequired } from "@/components/ui/setup-required";
import { canRead, canWrite, requireProfile } from "@/lib/auth";
import { getReceiptDetail } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

const paymentMethodLabels: Record<string, string> = {
  cash: "เงินสด",
  transfer: "โอนเงิน",
  qr: "QR Payment",
  other: "อื่น ๆ",
};

const itemTypeLabels: Record<string, string> = {
  labor: "ค่าแรง",
  part: "อะไหล่",
  other: "อื่น ๆ",
};

function text(value: unknown) {
  return String(value ?? "-");
}

function nested(row: Row | null, key: string): Row | null {
  if (!row) return null;
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

function paymentMethod(value: unknown) {
  return paymentMethodLabels[String(value)] ?? text(value);
}

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, "receipts")) redirect("/dashboard");

  const { detail, setupRequired } = await getReceiptDetail(id);
  if (setupRequired) return <SetupRequired />;
  if (!detail) notFound();

  const { receipt, items, payments, incomeRecords, logs } = detail;
  const customer = nested(receipt, "customers");
  const invoice = nested(receipt, "invoices");
  const directVehicle = nested(receipt, "vehicles");
  const directRepairJob = nested(receipt, "repair_jobs");
  const vehicle = nested(invoice, "vehicles") ?? directVehicle;
  const repairJob = nested(invoice, "repair_jobs") ?? directRepairJob;
  const quotation = nested(invoice, "quotations");
  const vehicleId = invoice?.vehicle_id ?? receipt.vehicle_id;
  const repairJobId = invoice?.repair_job_id ?? receipt.repair_job_id;
  const writable = canWrite(session.profile.role, "receipts");
  const isVoided = Boolean(receipt.voided_at);

  return (
    <>
      <PageHeader
        title={`ใบเสร็จรับเงิน ${text(receipt.receipt_no)}`}
        description="รายละเอียดการรับชำระเงิน เอกสารอ้างอิง รายรับอัตโนมัติ และข้อมูลลูกค้า"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/receipts" variant="secondary">
              กลับรายการใบเสร็จ
            </ButtonLink>
            <ButtonLink href={`/print/receipts/${receipt.id}`} target="_blank">
              <FileDown className="h-4 w-4" />
              พิมพ์ใบเสร็จ
            </ButtonLink>
            {writable ? (
              <VoidDocumentAction
                documentType="receipt"
                documentId={String(receipt.id)}
                documentNo={String(receipt.receipt_no)}
                disabled={isVoided}
                disabledReason={isVoided ? "ใบเสร็จนี้ถูกยกเลิกแล้ว" : undefined}
              />
            ) : null}
          </div>
        }
      />

      {isVoided ? (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          ใบเสร็จนี้ถูกยกเลิกแล้วเมื่อ {formatDate(receipt.voided_at)} เหตุผล: {text(receipt.void_reason)}
        </div>
      ) : null}

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="จำนวนเงินที่รับ" value={formatCurrency(receipt.amount)} />
        <SummaryCard label="ช่องทางชำระเงิน" value={paymentMethod(receipt.payment_method)} />
        <SummaryCard label="วันที่รับเงิน" value={formatDate(receipt.received_at)} />
        <SummaryCard
          label="สถานะใบแจ้งหนี้"
          value={invoice ? <Badge value={invoice.payment_status} /> : "ออกตรงจากงานซ่อม"}
          hint={invoice ? `ค้างชำระ ${formatCurrency(invoice.balance_due)}` : "ไม่ผ่านใบแจ้งหนี้"}
        />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <DetailPanel title="ข้อมูลใบเสร็จ">
          <InfoGrid
            rows={[
              { label: "เลขที่ใบเสร็จ", value: text(receipt.receipt_no) },
              { label: "วันที่รับเงิน", value: formatDate(receipt.received_at) },
              { label: "ช่องทางชำระเงิน", value: paymentMethod(receipt.payment_method) },
              { label: "จำนวนเงิน", value: formatCurrency(receipt.amount) },
              { label: "หมายเหตุ", value: <span className="whitespace-pre-wrap">{text(receipt.notes)}</span> },
              { label: "วันที่สร้างเอกสาร", value: formatDate(receipt.created_at) },
            ]}
          />
        </DetailPanel>

        <DetailPanel title="เอกสารอ้างอิง">
          <InfoGrid
            rows={[
              {
                label: "ใบแจ้งหนี้",
                value: invoice ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/invoices/${receipt.invoice_id}`}>
                    <ReceiptText className="mr-1 inline h-4 w-4" />
                    {text(invoice.invoice_no)}
                  </Link>
                ) : (
                  "ไม่ผ่านใบแจ้งหนี้"
                ),
              },
              ...(invoice
                ? [
                    { label: "วันที่ออกใบแจ้งหนี้", value: formatDate(invoice.issued_at) },
                    { label: "วันครบกำหนด", value: formatDate(invoice.due_at) },
                    { label: "ยอดรวมใบแจ้งหนี้", value: formatCurrency(invoice.total) },
                  ]
                : []),
              {
                label: "ใบเสนอราคา",
                value: quotation ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/quotations/${invoice?.quotation_id}`}>
                    <FileText className="mr-1 inline h-4 w-4" />
                    {text(quotation.quotation_no)}
                  </Link>
                ) : (
                  "-"
                ),
              },
              {
                label: "งานซ่อม",
                value: repairJob ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/repair-jobs/${repairJobId}`}>
                    {text(repairJob.job_number)}
                  </Link>
                ) : (
                  "-"
                ),
              },
            ]}
          />
        </DetailPanel>
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <DetailPanel title="ลูกค้า">
          <InfoGrid
            rows={[
              {
                label: "ชื่อลูกค้า",
                value: customer ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/customers/${receipt.customer_id}`}>
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
                  <Link className="font-semibold text-primary hover:underline" href={`/vehicles/${vehicleId}`}>
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
          title={invoice ? "รายการในใบแจ้งหนี้" : "รายการจากงานซ่อม"}
          rows={items}
          empty={invoice ? "ยังไม่มีรายการในใบแจ้งหนี้" : "ยังไม่มีรายการจากงานซ่อม"}
          columns={[
            {
              header: "รายการ",
              cell: (row) => {
                const part = nested(row, "parts");
                return (
                  <div>
                    <p className="font-semibold">{text(row.description)}</p>
                    <p className="text-xs text-muted">
                      {part ? `${text(part.part_code)} ${text(part.name)} ${text(part.unit)}` : itemTypeLabels[String(row.item_type)] ?? text(row.item_type)}
                    </p>
                  </div>
                );
              },
            },
            { header: "ประเภท", cell: (row) => itemTypeLabels[String(row.item_type)] ?? text(row.item_type) },
            { header: "จำนวน", cell: (row) => `${text(row.quantity)} ${text(row.unit ?? nested(row, "parts")?.unit ?? "ชิ้น")}`, className: "px-4 py-3 text-right" },
            { header: "ราคา/หน่วย", cell: (row) => formatCurrency(row.unit_price), className: "px-4 py-3 text-right" },
            { header: "ส่วนลด", cell: (row) => formatCurrency(row.discount), className: "px-4 py-3 text-right" },
            { header: "รวม", cell: (row) => formatCurrency(row.total), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <DetailTable
          title="Payment Record"
          rows={payments}
          empty="ยังไม่มีบันทึกรับชำระ"
          columns={[
            { header: "วันที่รับเงิน", cell: (row) => formatDate(row.paid_at) },
            { header: "ช่องทาง", cell: (row) => paymentMethod(row.payment_method) },
            { header: "หมายเหตุ", cell: (row) => text(row.notes) },
            { header: "จำนวนเงิน", cell: (row) => formatCurrency(row.amount), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />

        <DetailTable
          title="รายรับที่บันทึกอัตโนมัติ"
          rows={incomeRecords}
          empty="ยังไม่มีรายการรายรับที่เชื่อมกับใบเสร็จนี้"
          columns={[
            { header: "วันที่", cell: (row) => formatDate(row.recorded_at) },
            { header: "หมวดหมู่", cell: (row) => text(row.category) },
            { header: "รายละเอียด", cell: (row) => text(row.description) },
            { header: "จำนวนเงิน", cell: (row) => formatCurrency(row.amount), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />

        <AuditTrailPanel logs={logs} empty="ยังไม่มีประวัติของใบเสร็จนี้" />
      </section>
    </>
  );
}
