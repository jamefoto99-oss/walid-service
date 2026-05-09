import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Car, FileDown, ReceiptText, UserRound, Wrench } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { QuotationActions } from "@/components/quotations/quotation-actions";
import { AuditTrailPanel } from "@/components/records/audit-trail-panel";
import { DetailPanel, DetailTable, InfoGrid, SummaryCard } from "@/components/records/detail-sections";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SetupRequired } from "@/components/ui/setup-required";
import { canRead, canWrite, requireProfile } from "@/lib/auth";
import { getQuotationDetail } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

const itemTypeLabels: Record<string, string> = {
  labor: "ค่าแรง",
  part: "อะไหล่",
  other: "อื่น ๆ",
};

function text(value: unknown) {
  return String(value ?? "-");
}

function nested(row: Row, key: string): Row | null {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, "quotations")) redirect("/dashboard");

  const { detail, setupRequired } = await getQuotationDetail(id);
  if (setupRequired) return <SetupRequired />;
  if (!detail) notFound();

  const { quotation, items, invoices, logs } = detail;
  const customer = nested(quotation, "customers");
  const vehicle = nested(quotation, "vehicles");
  const repairJob = nested(quotation, "repair_jobs");
  const hasInvoice = invoices.length > 0;
  const writable = canWrite(session.profile.role, "quotations");

  return (
    <>
      <PageHeader
        title={`ใบเสนอราคา ${text(quotation.quotation_no)}`}
        description="รายละเอียดใบเสนอราคา รายการซ่อม อะไหล่ สถานะอนุมัติ และเอกสารต่อเนื่อง"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/quotations" variant="secondary">
              กลับรายการใบเสนอราคา
            </ButtonLink>
            <ButtonLink href={`/print/quotations/${quotation.id}`} target="_blank">
              <FileDown className="h-4 w-4" />
              พิมพ์ใบเสนอราคา
            </ButtonLink>
          </div>
        }
      />

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="ยอดก่อนส่วนลด" value={formatCurrency(quotation.subtotal)} />
        <SummaryCard label="ส่วนลด" value={formatCurrency(quotation.discount)} />
        <SummaryCard label="ยอดสุทธิ" value={formatCurrency(quotation.total)} />
        <SummaryCard
          label="สถานะ"
          value={<Badge value={quotation.status} />}
          hint={hasInvoice ? `${invoices.length} ใบแจ้งหนี้` : "ยังไม่แปลงเป็นใบแจ้งหนี้"}
        />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <DetailPanel title="ข้อมูลใบเสนอราคา">
          <InfoGrid
            rows={[
              { label: "เลขที่ใบเสนอราคา", value: text(quotation.quotation_no) },
              { label: "วันที่ออก", value: formatDate(quotation.issued_at) },
              { label: "สถานะ", value: <Badge value={quotation.status} /> },
              {
                label: "งานซ่อม",
                value: repairJob ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/repair-jobs/${quotation.repair_job_id}`}>
                    {text(repairJob.job_number)}
                  </Link>
                ) : (
                  "-"
                ),
              },
              { label: "เงื่อนไข", value: <span className="whitespace-pre-wrap">{text(quotation.terms)}</span> },
              { label: "หมายเหตุ", value: <span className="whitespace-pre-wrap">{text(quotation.notes)}</span> },
            ]}
          />
        </DetailPanel>

        {writable ? (
          <QuotationActions quotationId={String(quotation.id)} status={String(quotation.status)} hasInvoice={hasInvoice} />
        ) : (
          <DetailPanel title="การดำเนินการ">
            <p className="text-sm text-muted">บัญชีนี้มีสิทธิ์ดูข้อมูล แต่ไม่มีสิทธิ์แก้ไขใบเสนอราคา</p>
          </DetailPanel>
        )}
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <DetailPanel title="ลูกค้า">
          <InfoGrid
            rows={[
              {
                label: "ชื่อลูกค้า",
                value: customer ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/customers/${quotation.customer_id}`}>
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
                  <Link className="font-semibold text-primary hover:underline" href={`/vehicles/${quotation.vehicle_id}`}>
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
          title="รายการในใบเสนอราคา"
          rows={items}
          empty="ยังไม่มีรายการในใบเสนอราคา"
          columns={[
            {
              header: "รายการ",
              cell: (row) => {
                const part = nested(row, "parts");
                return (
                  <div>
                    <p className="font-semibold">{text(row.description)}</p>
                    {part ? (
                      <p className="text-xs text-muted">
                        {text(part.part_code)} {text(part.name)} เหลือ {text(part.quantity_on_hand)} {text(part.unit)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted">{itemTypeLabels[String(row.item_type)] ?? text(row.item_type)}</p>
                    )}
                  </div>
                );
              },
            },
            {
              header: "ประเภท",
              cell: (row) => itemTypeLabels[String(row.item_type)] ?? text(row.item_type),
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
          title="ใบแจ้งหนี้ที่สร้างจากใบเสนอราคานี้"
          rows={invoices}
          empty="ยังไม่มีใบแจ้งหนี้จากใบเสนอราคานี้"
          columns={[
            {
              header: "เลขที่",
              cell: (row) => (
                <Link className="font-semibold text-primary hover:underline" href={`/invoices/${row.id}`}>
                  <ReceiptText className="mr-1 inline h-4 w-4" />
                  {text(row.invoice_no)}
                </Link>
              ),
            },
            { header: "วันที่ออก", cell: (row) => formatDate(row.issued_at) },
            { header: "ครบกำหนด", cell: (row) => formatDate(row.due_at) },
            { header: "สถานะ", cell: (row) => <Badge value={row.payment_status} /> },
            { header: "ยอดค้าง", cell: (row) => formatCurrency(row.balance_due), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />

        <AuditTrailPanel logs={logs} empty="ยังไม่มีประวัติการเปลี่ยนแปลงใบเสนอราคานี้" />
      </section>
    </>
  );
}
