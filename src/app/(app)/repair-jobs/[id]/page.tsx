import { notFound, redirect } from "next/navigation";
import { Car, FileDown, FileText, History, PackageMinus, Phone, ReceiptText, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { RepairJobDetailActions } from "@/components/repair-jobs/repair-job-detail-actions";
import { RepairJobImageUploader } from "@/components/repair-jobs/repair-job-image-uploader";
import { RepairJobItemsManager, type RepairJobItemRow } from "@/components/repair-jobs/repair-job-items-manager";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SetupRequired } from "@/components/ui/setup-required";
import { canRead, requireProfile } from "@/lib/auth";
import { operationRoles } from "@/lib/constants";
import { getRepairJobDetail } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type UnknownRow = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "-");
}

function nested(row: UnknownRow, key: string): UnknownRow | null {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRow) : null;
}

function InfoCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof UserRound;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default async function RepairJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, "repair-jobs")) redirect("/dashboard");

  const { detail, setupRequired } = await getRepairJobDetail(id);
  if (setupRequired) return <SetupRequired />;
  if (!detail) notFound();

  const { job, customer, vehicle, items, movements, logs, quotations, invoices, receipts, cashBills, parts, imageUrls } = detail;
  const totalItems = items.reduce((sum, item) => sum + Number(item.total ?? 0), 0);

  return (
    <>
      <PageHeader
        title={`งานซ่อม ${text(job.job_number)}`}
        description="ศูนย์รวมสถานะ รายการซ่อม อะไหล่ Timeline และเอกสารที่เกี่ยวข้อง"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/repair-jobs" variant="secondary">
              กลับรายการ
            </ButtonLink>
            <ButtonLink href={`/print/repair-job/${job.id}`} target="_blank">
              <FileDown className="h-4 w-4" />
              พิมพ์ใบรับรถ
            </ButtonLink>
          </div>
        }
      />

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm text-muted">สถานะ</p>
          <div className="mt-2">
            <Badge value={job.status} />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm text-muted">วันที่รับรถ</p>
          <p className="mt-2 text-xl font-semibold">{formatDate(job.received_at)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm text-muted">ยอดรายการในงาน</p>
          <p className="mt-2 text-xl font-semibold">{formatCurrency(totalItems || job.estimated_total)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm text-muted">เลขไมล์รับรถ</p>
          <p className="mt-2 text-xl font-semibold">{text(job.intake_mileage)}</p>
        </div>
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-3">
        <InfoCard title="ข้อมูลลูกค้า" icon={UserRound}>
          <p className="text-lg font-semibold">{text(customer?.full_name)}</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <Phone className="h-4 w-4" />
            {text(customer?.phone)}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{text(customer?.address)}</p>
          <p className="mt-2 text-sm text-muted">LINE: {text(customer?.line_id)}</p>
        </InfoCard>

        <InfoCard title="ข้อมูลรถ" icon={Car}>
          <p className="text-lg font-semibold">
            {text(vehicle?.license_plate)} {text(vehicle?.province)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {text(vehicle?.brand)} {text(vehicle?.model)} ปี {text(vehicle?.year)}
          </p>
          <p className="mt-2 text-sm text-muted">สี {text(vehicle?.color)} เลขไมล์ล่าสุด {text(vehicle?.mileage)}</p>
          <p className="mt-1 text-sm text-muted">เลขตัวถัง {text(vehicle?.vin)}</p>
        </InfoCard>

        <InfoCard title="อาการและการตรวจเช็ก" icon={Wrench}>
          <p className="text-sm font-semibold">อาการเสียที่แจ้ง</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{text(job.reported_problem)}</p>
          <p className="mt-3 text-sm font-semibold">ตรวจเช็กเบื้องต้น</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{text(job.preliminary_check)}</p>
          <p className="mt-3 text-sm font-semibold">ของมีค่าในรถ</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{text(job.valuables)}</p>
        </InfoCard>
      </section>

      <section className="mb-5">
        <RepairJobImageUploader
          jobId={String(job.id)}
          images={imageUrls}
          canManage={operationRoles.includes(session.profile.role)}
        />
      </section>

      <section className="mb-5">
        <RepairJobDetailActions
          jobId={String(job.id)}
          currentStatus={String(job.status)}
          internalNotes={String(job.internal_notes ?? "")}
          parts={parts as never}
          role={session.profile.role}
        />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <RepairJobItemsManager
          jobId={String(job.id)}
          items={items as RepairJobItemRow[]}
          parts={parts as never}
          role={session.profile.role}
          totalItems={totalItems}
        />

        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <PackageMinus className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">ประวัติเบิกอะไหล่</h2>
          </div>
          <div className="space-y-3">
            {movements.map((movement) => {
              const part = nested(movement, "parts");
              return (
                <div className="rounded-md border border-border p-3" key={text(movement.id)}>
                  <p className="font-semibold">{text(part?.name ?? movement.notes)}</p>
                  <p className="text-sm text-muted">
                    {text(part?.part_code)} จำนวน {text(movement.quantity)} {text(part?.unit)}
                  </p>
                  <p className="mt-1 text-xs text-muted">{formatDate(movement.created_at)}</p>
                </div>
              );
            })}
            {!movements.length ? <p className="rounded-md bg-surface-soft p-4 text-sm text-muted">ยังไม่มีการเบิกอะไหล่จากงานนี้</p> : null}
          </div>
        </div>
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-4">
        <DocumentPanel title="ใบเสนอราคา" icon={FileText} rows={quotations} numberKey="quotation_no" amountKey="total" hrefPrefix="/quotations" />
        <DocumentPanel title="ใบแจ้งหนี้" icon={ReceiptText} rows={invoices} numberKey="invoice_no" amountKey="balance_due" hrefPrefix="/invoices" />
        <DocumentPanel title="ใบเสร็จรับเงิน" icon={ReceiptText} rows={receipts} numberKey="receipt_no" amountKey="amount" hrefPrefix="/receipts" />
        <DocumentPanel title="บิลเงินสด" icon={ReceiptText} rows={cashBills} numberKey="cash_bill_no" amountKey="total" hrefPrefix="/print/cash-bills" />
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Timeline การทำงาน</h2>
        </div>
        <div className="space-y-3">
          {logs.map((log) => (
            <div className="rounded-md border border-border p-3" key={text(log.id)}>
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <p className="font-semibold">{text(log.action)}</p>
                <p className="text-xs text-muted">{formatDate(log.created_at)}</p>
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-soft p-3 text-xs text-muted">
                {JSON.stringify(log.metadata ?? {}, null, 2)}
              </pre>
            </div>
          ))}
          {!logs.length ? <p className="rounded-md bg-surface-soft p-4 text-sm text-muted">ยังไม่มี timeline</p> : null}
        </div>
      </section>
    </>
  );
}

function DocumentPanel({
  title,
  icon: Icon,
  rows,
  numberKey,
  amountKey,
  hrefPrefix,
}: {
  title: string;
  icon: typeof FileText;
  rows: UnknownRow[];
  numberKey: string;
  amountKey: string;
  hrefPrefix: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <Link className="block rounded-md border border-border p-3 hover:bg-surface-soft" href={`${hrefPrefix}/${row.id}`} key={text(row.id)}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{text(row[numberKey])}</p>
              <Badge value={row.status ?? row.payment_status ?? row.payment_method} />
            </div>
            <p className="mt-1 text-sm text-muted">{formatDate(row.issued_at ?? row.received_at ?? row.created_at)}</p>
            <p className="mt-2 font-semibold">{formatCurrency(row[amountKey])}</p>
          </Link>
        ))}
        {!rows.length ? <p className="rounded-md bg-surface-soft p-4 text-sm text-muted">ยังไม่มีเอกสาร</p> : null}
      </div>
    </section>
  );
}
