import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { FileText, Gauge, Plus, ReceiptText, UserRound } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { DetailPanel, DetailTable, InfoGrid, SummaryCard } from "@/components/records/detail-sections";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SetupRequired } from "@/components/ui/setup-required";
import { canRead, requireProfile } from "@/lib/auth";
import { getVehicleDetail } from "@/lib/data";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "-");
}

function nested(row: Row, key: string): Row | null {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, "vehicles")) redirect("/dashboard");

  const { detail, setupRequired } = await getVehicleDetail(id);
  if (setupRequired) return <SetupRequired />;
  if (!detail) notFound();

  const { vehicle, jobs, quotations, invoices, receipts } = detail;
  const customer = nested(vehicle, "customers");
  const outstanding = invoices.reduce((sum, invoice) => sum + toNumber(invoice.balance_due), 0);
  const activeJobs = jobs.filter((job) => !["completed", "delivered", "cancelled"].includes(String(job.status))).length;
  const mileageValues = [vehicle.mileage, ...jobs.map((job) => job.intake_mileage)]
    .map(toNumber)
    .filter((value) => value > 0);
  const latestMileage = mileageValues.length ? Math.max(...mileageValues) : 0;

  return (
    <>
      <PageHeader
        title={`${text(vehicle.license_plate)} ${text(vehicle.province)}`}
        description={`${text(vehicle.brand)} ${text(vehicle.model)} | ประวัติซ่อมและเอกสารของรถคันนี้`}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/vehicles" variant="secondary">
              กลับรายการรถ
            </ButtonLink>
            <ButtonLink href={`/repair-jobs?customer_id=${vehicle.customer_id}&vehicle_id=${vehicle.id}`}>
              <Plus className="h-4 w-4" />
              เปิดงานซ่อม
            </ButtonLink>
          </div>
        }
      />

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="งานซ่อมทั้งหมด" value={`${jobs.length} งาน`} />
        <SummaryCard label="งานที่กำลังดำเนินการ" value={`${activeJobs} งาน`} />
        <SummaryCard label="เลขไมล์ล่าสุด" value={latestMileage ? latestMileage.toLocaleString("th-TH") : "-"} />
        <SummaryCard label="ยอดค้างตามรถ" value={formatCurrency(outstanding)} />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <DetailPanel title="ข้อมูลรถยนต์">
          <InfoGrid
            rows={[
              { label: "ทะเบียนรถ", value: `${text(vehicle.license_plate)} ${text(vehicle.province)}` },
              { label: "ยี่ห้อ / รุ่น", value: `${text(vehicle.brand)} ${text(vehicle.model)}` },
              { label: "ปีรถ", value: text(vehicle.year) },
              { label: "สี", value: text(vehicle.color) },
              { label: "เลขไมล์ในระบบ", value: text(vehicle.mileage) },
              { label: "เลขไมล์ล่าสุดจากงานซ่อม", value: latestMileage ? latestMileage.toLocaleString("th-TH") : "-" },
              { label: "เลขตัวถัง", value: text(vehicle.vin) },
              { label: "เลขเครื่องยนต์", value: text(vehicle.engine_no) },
              { label: "หมายเหตุ", value: <span className="whitespace-pre-wrap">{text(vehicle.notes)}</span> },
            ]}
          />
        </DetailPanel>

        <DetailPanel title="เจ้าของรถ">
          <InfoGrid
            rows={[
              {
                label: "ชื่อลูกค้า",
                value: customer ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/customers/${vehicle.customer_id}`}>
                    {text(customer.full_name)}
                  </Link>
                ) : (
                  "-"
                ),
              },
              { label: "เบอร์โทร", value: text(customer?.phone) },
              { label: "LINE", value: text(customer?.line_id) },
              { label: "ยอดค้างของลูกค้า", value: formatCurrency(customer?.outstanding_balance) },
              { label: "ที่อยู่", value: <span className="whitespace-pre-wrap">{text(customer?.address)}</span> },
            ]}
          />
        </DetailPanel>
      </section>

      <section className="mb-5 grid gap-5">
        <DetailTable
          title="ประวัติซ่อมของรถ"
          rows={jobs}
          empty="ยังไม่มีประวัติงานซ่อมของรถคันนี้"
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
            { header: "สถานะ", cell: (row) => <Badge value={row.status} /> },
            {
              header: "เลขไมล์",
              cell: (row) => (
                <span className="inline-flex items-center gap-1">
                  <Gauge className="h-4 w-4 text-muted" />
                  {text(row.intake_mileage)}
                </span>
              ),
            },
            { header: "อาการเสีย", cell: (row) => text(row.reported_problem) },
            { header: "ยอดประมาณการ", cell: (row) => formatCurrency(row.estimated_total), className: "px-4 py-3 text-right" },
          ]}
        />

        <div className="grid gap-5 xl:grid-cols-2">
          <DetailTable
            title="ใบเสนอราคาของรถ"
            rows={quotations}
            empty="ยังไม่มีใบเสนอราคาของรถคันนี้"
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
              { header: "สถานะ", cell: (row) => <Badge value={row.status} /> },
              { header: "ยอดรวม", cell: (row) => formatCurrency(row.total), className: "px-4 py-3 text-right" },
            ]}
          />

          <DetailTable
            title="ใบแจ้งหนี้ของรถ"
            rows={invoices}
            empty="ยังไม่มีใบแจ้งหนี้ของรถคันนี้"
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
          title="ใบเสร็จรับเงินที่เกี่ยวข้อง"
          rows={receipts}
          empty="ยังไม่มีใบเสร็จรับเงินของรถคันนี้"
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
            {
              header: "ลูกค้า",
              cell: () => (
                <span className="inline-flex items-center gap-1">
                  <UserRound className="h-4 w-4 text-muted" />
                  {text(customer?.full_name)}
                </span>
              ),
            },
            { header: "จำนวนเงิน", cell: (row) => formatCurrency(row.amount), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />
      </section>
    </>
  );
}
