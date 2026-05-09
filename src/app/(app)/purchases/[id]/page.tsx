import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Package, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { VoidDocumentAction } from "@/components/documents/void-document-action";
import { PurchasePaymentForm } from "@/components/purchases/purchase-payment-form";
import { AuditTrailPanel } from "@/components/records/audit-trail-panel";
import { DetailPanel, DetailTable, InfoGrid, SummaryCard } from "@/components/records/detail-sections";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SetupRequired } from "@/components/ui/setup-required";
import { canRead, canWrite, requireProfile } from "@/lib/auth";
import { paymentMethods } from "@/lib/constants";
import { getPurchaseDetail } from "@/lib/data";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

type Row = Record<string, unknown>;

const paymentMethodLabels = Object.fromEntries(paymentMethods.map((method) => [method.value, method.label]));

function text(value: unknown) {
  return String(value ?? "-");
}

function nested(row: Row | null, key: string): Row | null {
  if (!row) return null;
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

function paymentLabel(value: unknown) {
  return paymentMethodLabels[String(value)] ?? text(value);
}

function expenseStatus(row: Row) {
  if (row.voided_at || row.deleted_at) return <Badge value="cancelled" />;
  return <Badge value="active" />;
}

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, "purchases")) redirect("/dashboard");

  const { detail, setupRequired } = await getPurchaseDetail(id);
  if (setupRequired) return <SetupRequired />;
  if (!detail) notFound();

  const { purchase, items, expenses, stockMovements, logs } = detail;
  const supplier = nested(purchase, "suppliers");
  const total = toNumber(purchase.total);
  const paidAmount = toNumber(purchase.paid_amount);
  const balanceDue = toNumber(purchase.balance_due);
  const isVoided = Boolean(purchase.voided_at) || String(purchase.payment_status) === "cancelled";
  const isClosed = balanceDue <= 0 || isVoided;
  const writable = canWrite(session.profile.role, "purchases");
  const expenseTotal = expenses
    .filter((row) => !row.voided_at && !row.deleted_at)
    .reduce((sum, row) => sum + toNumber(row.amount), 0);

  return (
    <>
      <PageHeader
        title={`ใบซื้อ ${text(purchase.purchase_no)}`}
        description="รายละเอียดใบซื้ออะไหล่ รายการรับสต๊อก เจ้าหนี้ Supplier รายจ่าย และประวัติการทำรายการ"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/purchases" variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              กลับรายการใบซื้อ
            </ButtonLink>
            {supplier ? (
              <ButtonLink href={`/suppliers/${purchase.supplier_id}`} variant="secondary">
                <Building2 className="h-4 w-4" />
                ดู Supplier
              </ButtonLink>
            ) : null}
            {writable ? (
              <VoidDocumentAction
                documentType="purchase"
                documentId={String(purchase.id)}
                documentNo={String(purchase.purchase_no)}
                disabled={isVoided}
                disabledReason={isVoided ? "ใบซื้อนี้ถูกยกเลิกแล้ว" : undefined}
              />
            ) : null}
          </div>
        }
      />

      {isVoided ? (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          ใบซื้อนี้ถูกยกเลิกแล้วเมื่อ {formatDate(purchase.voided_at)} เหตุผล: {text(purchase.void_reason)}
        </div>
      ) : null}

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="ยอดรวมสุทธิ" value={formatCurrency(total)} />
        <SummaryCard label="จ่ายแล้ว" value={formatCurrency(paidAmount)} hint={`รายจ่ายที่ผูกไว้ ${formatCurrency(expenseTotal)}`} />
        <SummaryCard label="ยอดค้างชำระ" value={formatCurrency(balanceDue)} />
        <SummaryCard label="สถานะ" value={<Badge value={purchase.payment_status} />} hint={`วันที่ซื้อ ${formatDate(purchase.purchased_at)}`} />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <DetailPanel title="ข้อมูลใบซื้อ">
          <InfoGrid
            rows={[
              { label: "เลขที่ใบซื้อ", value: text(purchase.purchase_no) },
              { label: "วันที่ซื้อ", value: formatDate(purchase.purchased_at) },
              { label: "สถานะ", value: <Badge value={purchase.payment_status} /> },
              { label: "ส่วนลด", value: formatCurrency(purchase.discount) },
              { label: "วันที่สร้าง", value: formatDate(purchase.created_at) },
              { label: "วันที่แก้ไขล่าสุด", value: formatDate(purchase.updated_at) },
              { label: "หมายเหตุ", value: <span className="whitespace-pre-wrap">{text(purchase.notes)}</span> },
            ]}
          />
        </DetailPanel>

        {writable ? (
          <PurchasePaymentForm
            purchaseId={String(purchase.id)}
            purchaseNo={String(purchase.purchase_no)}
            balanceDue={balanceDue}
            disabled={isClosed}
          />
        ) : (
          <DetailPanel title="การชำระเงิน">
            <p className="text-sm text-muted">บัญชีนี้มีสิทธิ์ดูข้อมูล แต่ไม่มีสิทธิ์บันทึกชำระใบซื้อ</p>
          </DetailPanel>
        )}
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <DetailPanel title="Supplier / เจ้าหนี้">
          <InfoGrid
            rows={[
              {
                label: "ชื่อร้าน / บริษัท",
                value: supplier ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/suppliers/${purchase.supplier_id}`}>
                    <Building2 className="mr-1 inline h-4 w-4" />
                    {text(supplier.name)}
                  </Link>
                ) : (
                  "-"
                ),
              },
              { label: "เบอร์โทร", value: text(supplier?.phone) },
              { label: "เครดิตคงค้าง", value: formatCurrency(supplier?.credit_balance) },
              { label: "ที่อยู่", value: <span className="whitespace-pre-wrap">{text(supplier?.address)}</span> },
              { label: "รายการที่ซื้อประจำ", value: <span className="whitespace-pre-wrap">{text(supplier?.regular_items)}</span> },
              { label: "หมายเหตุ Supplier", value: <span className="whitespace-pre-wrap">{text(supplier?.notes)}</span> },
            ]}
          />
        </DetailPanel>

        <DetailTable
          title="รายจ่ายที่ผูกกับใบซื้อ"
          rows={expenses}
          empty="ยังไม่มีรายจ่ายที่ผูกกับใบซื้อนี้"
          columns={[
            { header: "วันที่", cell: (row) => formatDate(row.recorded_at) },
            {
              header: "รายละเอียด",
              cell: (row) => (
                <div>
                  <p className="font-semibold">
                    <ReceiptText className="mr-1 inline h-4 w-4 text-muted" />
                    {text(row.description)}
                  </p>
                  <p className="text-xs text-muted">{text(row.category)}</p>
                </div>
              ),
            },
            { header: "ช่องทาง", cell: (row) => paymentLabel(row.payment_method) },
            { header: "สถานะ", cell: expenseStatus },
            { header: "จำนวนเงิน", cell: (row) => formatCurrency(row.amount), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />
      </section>

      <section className="mb-5">
        <DetailTable
          title="รายการอะไหล่ในใบซื้อ"
          rows={items}
          empty="ยังไม่มีรายการอะไหล่ในใบซื้อนี้"
          columns={[
            {
              header: "อะไหล่",
              cell: (row) => {
                const part = nested(row, "parts");
                return (
                  <div>
                    <p className="font-semibold">
                      <Package className="mr-1 inline h-4 w-4 text-muted" />
                      {text(part?.part_code)} {text(part?.name)}
                    </p>
                    <p className="text-xs text-muted">
                      คงเหลือปัจจุบัน {text(part?.quantity_on_hand)} {text(part?.unit)} | จุดเตือน {text(part?.low_stock_threshold)}
                    </p>
                  </div>
                );
              },
            },
            { header: "จำนวน", cell: (row) => `${text(row.quantity)} ${text(nested(row, "parts")?.unit)}`, className: "px-4 py-3 text-right" },
            { header: "ทุน/หน่วย", cell: (row) => formatCurrency(row.unit_cost), className: "px-4 py-3 text-right" },
            { header: "รวม", cell: (row) => formatCurrency(row.total), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />
      </section>

      <section className="mb-5">
        <DetailTable
          title="ประวัติสต๊อกจากใบซื้อนี้"
          rows={stockMovements}
          empty="ยังไม่มีประวัติสต๊อกของใบซื้อนี้"
          columns={[
            { header: "เวลา", cell: (row) => formatDate(row.created_at) },
            {
              header: "อะไหล่",
              cell: (row) => {
                const part = nested(row, "parts");
                return `${text(part?.part_code)} ${text(part?.name)}`;
              },
            },
            { header: "ประเภท", cell: (row) => <Badge value={row.movement_type} /> },
            { header: "อ้างอิง", cell: (row) => text(row.reference_type) },
            { header: "จำนวน", cell: (row) => `${text(row.quantity)} ${text(nested(row, "parts")?.unit)}`, className: "px-4 py-3 text-right" },
            { header: "ทุน/หน่วย", cell: (row) => formatCurrency(row.unit_cost), className: "px-4 py-3 text-right" },
            { header: "หมายเหตุ", cell: (row) => <span className="whitespace-pre-wrap">{text(row.notes)}</span> },
          ]}
        />
      </section>

      <AuditTrailPanel logs={logs} empty="ยังไม่มีประวัติของใบซื้อนี้" />
    </>
  );
}
