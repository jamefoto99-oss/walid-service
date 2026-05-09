import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { FileText, Plus, ReceiptText, Wrench } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { DetailPanel, DetailTable, InfoGrid, SummaryCard } from "@/components/records/detail-sections";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SetupRequired } from "@/components/ui/setup-required";
import { canRead, requireProfile } from "@/lib/auth";
import { getCustomerDetail } from "@/lib/data";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "-");
}

function nested(row: Row, key: string): Row | null {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

function vehicleLabel(row: Row) {
  const vehicle = nested(row, "vehicles");
  if (!vehicle) return "-";
  return `${text(vehicle.license_plate)} ${text(vehicle.brand)} ${text(vehicle.model)}`;
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, "customers")) redirect("/dashboard");

  const { detail, setupRequired } = await getCustomerDetail(id);
  if (setupRequired) return <SetupRequired />;
  if (!detail) notFound();

  const { customer, vehicles, jobs, quotations, invoices, receipts } = detail;
  const outstanding = invoices.reduce((sum, invoice) => sum + toNumber(invoice.balance_due), 0);
  const totalSales = invoices.reduce((sum, invoice) => sum + toNumber(invoice.total), 0);
  const activeJobs = jobs.filter((job) => !["completed", "delivered", "cancelled"].includes(String(job.status))).length;

  return (
    <>
      <PageHeader
        title={text(customer.full_name)}
        description="ข้อมูลลูกค้า รถยนต์ ประวัติซ่อม เอกสาร และยอดค้างชำระรวมในที่เดียว"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/customers" variant="secondary">
              กลับรายชื่อลูกค้า
            </ButtonLink>
            <ButtonLink href={`/repair-jobs?customer_id=${customer.id}`}>
              <Plus className="h-4 w-4" />
              เปิดงานซ่อม
            </ButtonLink>
          </div>
        }
      />

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="รถของลูกค้า" value={`${vehicles.length} คัน`} />
        <SummaryCard label="งานซ่อมทั้งหมด" value={`${jobs.length} งาน`} />
        <SummaryCard label="งานที่กำลังดำเนินการ" value={`${activeJobs} งาน`} />
        <SummaryCard label="ยอดค้างชำระ" value={formatCurrency(outstanding)} hint={`ยอดขายสะสม ${formatCurrency(totalSales)}`} />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <DetailPanel title="ข้อมูลติดต่อ">
          <InfoGrid
            rows={[
              { label: "ชื่อลูกค้า", value: text(customer.full_name) },
              { label: "เบอร์โทร", value: text(customer.phone) },
              { label: "LINE / ช่องทางติดต่อ", value: text(customer.line_id) },
              { label: "วันที่สร้างข้อมูล", value: formatDate(customer.created_at) },
              { label: "ที่อยู่", value: <span className="whitespace-pre-wrap">{text(customer.address)}</span> },
              { label: "หมายเหตุ", value: <span className="whitespace-pre-wrap">{text(customer.notes)}</span> },
            ]}
          />
        </DetailPanel>

        <DetailTable
          title="รถทั้งหมดของลูกค้า"
          rows={vehicles}
          empty="ยังไม่มีรถในประวัติลูกค้าคนนี้"
          columns={[
            {
              header: "ทะเบียน",
              cell: (row) => (
                <Link className="font-semibold text-primary hover:underline" href={`/vehicles/${row.id}`}>
                  {text(row.license_plate)} {text(row.province)}
                </Link>
              ),
            },
            { header: "รถ", cell: (row) => `${text(row.brand)} ${text(row.model)} ปี ${text(row.year)}` },
            { header: "สี", cell: (row) => text(row.color) },
            { header: "เลขไมล์", cell: (row) => text(row.mileage) },
            {
              header: "",
              className: "px-4 py-3 text-right",
              cell: (row) => (
                <ButtonLink href={`/repair-jobs?customer_id=${customer.id}&vehicle_id=${row.id}`} variant="secondary" className="h-9">
                  <Wrench className="h-4 w-4" />
                  เปิดงาน
                </ButtonLink>
              ),
            },
          ]}
        />
      </section>

      <section className="mb-5 grid gap-5">
        <DetailTable
          title="ประวัติงานซ่อมของลูกค้า"
          rows={jobs}
          empty="ยังไม่มีประวัติงานซ่อม"
          columns={[
            {
              header: "เลขงาน",
              cell: (row) => (
                <Link className="font-semibold text-primary hover:underline" href={`/repair-jobs/${row.id}`}>
                  {text(row.job_number)}
                </Link>
              ),
            },
            { header: "วันที่รับรถ", cell: (row) => formatDate(row.received_at) },
            { header: "รถ", cell: vehicleLabel },
            { header: "สถานะ", cell: (row) => <Badge value={row.status} /> },
            { header: "อาการเสีย", cell: (row) => text(row.reported_problem) },
            { header: "ยอดประมาณการ", cell: (row) => formatCurrency(row.estimated_total), className: "px-4 py-3 text-right" },
          ]}
        />

        <div className="grid gap-5 xl:grid-cols-2">
          <DetailTable
            title="ใบเสนอราคา"
            rows={quotations}
            empty="ยังไม่มีใบเสนอราคา"
            columns={[
              {
                header: "เลขที่",
                cell: (row) => (
                  <Link className="font-semibold text-primary hover:underline" href={`/quotations/${row.id}`}>
                    <FileText className="mr-1 inline h-4 w-4" />
                    {text(row.quotation_no)}
                  </Link>
                ),
              },
              { header: "วันที่", cell: (row) => formatDate(row.issued_at) },
              { header: "รถ", cell: vehicleLabel },
              { header: "สถานะ", cell: (row) => <Badge value={row.status} /> },
              { header: "ยอดรวม", cell: (row) => formatCurrency(row.total), className: "px-4 py-3 text-right" },
            ]}
          />

          <DetailTable
            title="ใบแจ้งหนี้ / ลูกหนี้"
            rows={invoices}
            empty="ยังไม่มีใบแจ้งหนี้"
            columns={[
              {
                header: "เลขที่",
                cell: (row) => (
                  <Link className="font-semibold text-primary hover:underline" href={`/print/invoices/${row.id}`}>
                    <ReceiptText className="mr-1 inline h-4 w-4" />
                    {text(row.invoice_no)}
                  </Link>
                ),
              },
              { header: "ครบกำหนด", cell: (row) => formatDate(row.due_at) },
              { header: "สถานะ", cell: (row) => <Badge value={row.payment_status} /> },
              { header: "ยอดรวม", cell: (row) => formatCurrency(row.total), className: "px-4 py-3 text-right" },
              { header: "ค้าง", cell: (row) => formatCurrency(row.balance_due), className: "px-4 py-3 text-right font-semibold text-danger" },
            ]}
          />
        </div>

        <DetailTable
          title="ใบเสร็จรับเงิน"
          rows={receipts}
          empty="ยังไม่มีใบเสร็จรับเงิน"
          columns={[
            {
              header: "เลขที่",
              cell: (row) => (
                <Link className="font-semibold text-primary hover:underline" href={`/receipts/${row.id}`}>
                  {text(row.receipt_no)}
                </Link>
              ),
            },
            { header: "วันที่รับเงิน", cell: (row) => formatDate(row.received_at) },
            { header: "ช่องทาง", cell: (row) => text(row.payment_method) },
            { header: "หมายเหตุ", cell: (row) => text(row.notes) },
            { header: "จำนวนเงิน", cell: (row) => formatCurrency(row.amount), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />
      </section>
    </>
  );
}
