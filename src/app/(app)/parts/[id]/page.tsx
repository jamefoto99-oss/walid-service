import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, FileText, ReceiptText, Wrench } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { AuditTrailPanel } from "@/components/records/audit-trail-panel";
import { DetailPanel, DetailTable, InfoGrid, SummaryCard } from "@/components/records/detail-sections";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SetupRequired } from "@/components/ui/setup-required";
import { canRead, requireProfile } from "@/lib/auth";
import { getPartDetail } from "@/lib/data";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "-");
}

function nested(row: Row | null, key: string): Row | null {
  if (!row) return null;
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

function movementQuantity(row: Row, unit: unknown) {
  const quantity = toNumber(row.quantity);
  const sign = quantity > 0 ? "+" : "";
  return `${sign}${quantity.toLocaleString("th-TH")} ${text(unit)}`;
}

function referenceLink(row: Row) {
  const referenceId = String(row.reference_id ?? "");
  const referenceType = String(row.reference_type ?? "");
  if (!referenceId || referenceId === "-") return "-";

  if (referenceType === "repair_job") {
    return (
      <Link className="font-semibold text-primary hover:underline" href={`/repair-jobs/${referenceId}`}>
        งานซ่อม
      </Link>
    );
  }

  if (referenceType === "invoice" || referenceType === "invoice_void") {
    return (
      <Link className="font-semibold text-primary hover:underline" href={`/invoices/${referenceId}`}>
        ใบแจ้งหนี้
      </Link>
    );
  }

  if (referenceType === "purchase" || referenceType === "purchase_void") {
    return (
      <Link className="font-semibold text-primary hover:underline" href={`/purchases/${referenceId}`}>
        ใบซื้อ
      </Link>
    );
  }

  return text(referenceType);
}

export default async function PartDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, "parts")) redirect("/dashboard");

  const { detail, setupRequired } = await getPartDetail(id);
  if (setupRequired) return <SetupRequired />;
  if (!detail) notFound();

  const { part, stockMovements, purchaseItems, quotationItems, invoiceItems, logs } = detail;
  const category = nested(part, "part_categories");
  const supplier = nested(part, "suppliers");
  const quantityOnHand = toNumber(part.quantity_on_hand);
  const lowStockThreshold = toNumber(part.low_stock_threshold);
  const stockValue = quantityOnHand * toNumber(part.cost_price);
  const grossMargin = toNumber(part.sale_price) - toNumber(part.cost_price);
  const incomingQuantity = stockMovements.filter((row) => toNumber(row.quantity) > 0).reduce((sum, row) => sum + toNumber(row.quantity), 0);
  const outgoingQuantity = Math.abs(
    stockMovements.filter((row) => toNumber(row.quantity) < 0).reduce((sum, row) => sum + toNumber(row.quantity), 0),
  );
  const isLowStock = quantityOnHand <= lowStockThreshold;

  return (
    <>
      <PageHeader
        title={`${text(part.part_code)} ${text(part.name)}`}
        description="รายละเอียดอะไหล่ สถานะคงเหลือ มูลค่าสต๊อก ประวัติรับเข้า-เบิกใช้ และเอกสารที่เกี่ยวข้อง"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/parts" variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              กลับรายการอะไหล่
            </ButtonLink>
            {supplier ? (
              <ButtonLink href={`/suppliers/${part.supplier_id}`} variant="secondary">
                <Building2 className="h-4 w-4" />
                ดู Supplier
              </ButtonLink>
            ) : null}
            <ButtonLink href={`/purchases?supplier_id=${part.supplier_id ?? ""}`}>
              <ReceiptText className="h-4 w-4" />
              ซื้ออะไหล่นี้
            </ButtonLink>
          </div>
        }
      />

      {isLowStock ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          อะไหล่นี้ใกล้หมด: คงเหลือ {text(part.quantity_on_hand)} {text(part.unit)} ต่ำกว่าหรือเท่ากับจุดเตือน {text(part.low_stock_threshold)} {text(part.unit)}
        </div>
      ) : null}

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="คงเหลือ" value={`${quantityOnHand.toLocaleString("th-TH")} ${text(part.unit)}`} hint={isLowStock ? "ใกล้หมด" : "พร้อมใช้งาน"} />
        <SummaryCard label="มูลค่าสต๊อกตามทุน" value={formatCurrency(stockValue)} />
        <SummaryCard label="กำไรต่อหน่วยโดยประมาณ" value={formatCurrency(grossMargin)} hint={`ขาย ${formatCurrency(part.sale_price)} / ทุน ${formatCurrency(part.cost_price)}`} />
        <SummaryCard label="รับเข้า / เบิกใช้" value={`${incomingQuantity.toLocaleString("th-TH")} / ${outgoingQuantity.toLocaleString("th-TH")}`} hint={text(part.unit)} />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <DetailPanel title="ข้อมูลอะไหล่">
          <InfoGrid
            rows={[
              { label: "รหัสอะไหล่", value: text(part.part_code) },
              { label: "ชื่ออะไหล่", value: text(part.name) },
              { label: "หมวดหมู่", value: text(category?.name) },
              { label: "หน่วยนับ", value: text(part.unit) },
              { label: "ราคาทุน", value: formatCurrency(part.cost_price) },
              { label: "ราคาขาย", value: formatCurrency(part.sale_price) },
              { label: "จุดแจ้งเตือน", value: `${text(part.low_stock_threshold)} ${text(part.unit)}` },
              { label: "วันที่สร้าง", value: formatDate(part.created_at) },
              { label: "อัปเดตล่าสุด", value: formatDate(part.updated_at) },
              { label: "หมายเหตุ", value: <span className="whitespace-pre-wrap">{text(part.notes)}</span> },
            ]}
          />
        </DetailPanel>

        <DetailPanel title="Supplier">
          <InfoGrid
            rows={[
              {
                label: "ชื่อร้าน / บริษัท",
                value: supplier ? (
                  <Link className="font-semibold text-primary hover:underline" href={`/suppliers/${part.supplier_id}`}>
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
      </section>

      <section className="mb-5">
        <DetailTable
          title="ประวัติสต๊อก"
          rows={stockMovements}
          empty="ยังไม่มีประวัติรับเข้า/เบิกใช้ของอะไหล่นี้"
          columns={[
            { header: "วันที่", cell: (row) => formatDate(row.created_at) },
            { header: "ประเภท", cell: (row) => <Badge value={row.movement_type} /> },
            { header: "จำนวน", cell: (row) => movementQuantity(row, part.unit), className: "px-4 py-3 text-right font-semibold" },
            { header: "ทุน/หน่วย", cell: (row) => formatCurrency(row.unit_cost), className: "px-4 py-3 text-right" },
            { header: "อ้างอิง", cell: referenceLink },
            { header: "หมายเหตุ", cell: (row) => <span className="whitespace-pre-wrap">{text(row.notes)}</span> },
          ]}
        />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <DetailTable
          title="ประวัติซื้อเข้า"
          rows={purchaseItems}
          empty="ยังไม่มีประวัติซื้ออะไหล่นี้"
          columns={[
            {
              header: "ใบซื้อ",
              cell: (row) => {
                const purchase = nested(row, "purchases");
                const purchaseSupplier = nested(purchase, "suppliers");
                return purchase ? (
                  <div>
                    <Link className="font-semibold text-primary hover:underline" href={`/purchases/${purchase.id}`}>
                      <ReceiptText className="mr-1 inline h-4 w-4" />
                      {text(purchase.purchase_no)}
                    </Link>
                    <p className="text-xs text-muted">{text(purchaseSupplier?.name)}</p>
                  </div>
                ) : (
                  "-"
                );
              },
            },
            { header: "วันที่", cell: (row) => formatDate(nested(row, "purchases")?.purchased_at) },
            { header: "จำนวน", cell: (row) => `${text(row.quantity)} ${text(part.unit)}`, className: "px-4 py-3 text-right" },
            { header: "ทุน", cell: (row) => formatCurrency(row.unit_cost), className: "px-4 py-3 text-right" },
            { header: "รวม", cell: (row) => formatCurrency(row.total), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />

        <DetailTable
          title="ใช้ในใบแจ้งหนี้"
          rows={invoiceItems}
          empty="ยังไม่มีการตัดใช้อะไหล่นี้ผ่านใบแจ้งหนี้"
          columns={[
            {
              header: "ใบแจ้งหนี้",
              cell: (row) => {
                const invoice = nested(row, "invoices");
                const customer = nested(invoice, "customers");
                return invoice ? (
                  <div>
                    <Link className="font-semibold text-primary hover:underline" href={`/invoices/${invoice.id}`}>
                      <FileText className="mr-1 inline h-4 w-4" />
                      {text(invoice.invoice_no)}
                    </Link>
                    <p className="text-xs text-muted">{text(customer?.full_name)}</p>
                  </div>
                ) : (
                  "-"
                );
              },
            },
            { header: "วันที่", cell: (row) => formatDate(nested(row, "invoices")?.issued_at) },
            { header: "สถานะ", cell: (row) => <Badge value={nested(row, "invoices")?.payment_status} /> },
            { header: "จำนวน", cell: (row) => `${text(row.quantity)} ${text(part.unit)}`, className: "px-4 py-3 text-right" },
            { header: "รวม", cell: (row) => formatCurrency(row.total), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />
      </section>

      <section className="mb-5">
        <DetailTable
          title="ใช้ในใบเสนอราคา"
          rows={quotationItems}
          empty="ยังไม่มีการเสนอราคาโดยใช้อะไหล่นี้"
          columns={[
            {
              header: "ใบเสนอราคา",
              cell: (row) => {
                const quotation = nested(row, "quotations");
                const customer = nested(quotation, "customers");
                const repairJob = nested(quotation, "repair_jobs");
                return quotation ? (
                  <div>
                    <Link className="font-semibold text-primary hover:underline" href={`/quotations/${quotation.id}`}>
                      <FileText className="mr-1 inline h-4 w-4" />
                      {text(quotation.quotation_no)}
                    </Link>
                    <p className="text-xs text-muted">{text(customer?.full_name)}</p>
                    {repairJob ? (
                      <Link className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" href={`/repair-jobs/${quotation.repair_job_id}`}>
                        <Wrench className="h-3.5 w-3.5" />
                        {text(repairJob.job_number)}
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  "-"
                );
              },
            },
            { header: "วันที่", cell: (row) => formatDate(nested(row, "quotations")?.issued_at) },
            { header: "สถานะ", cell: (row) => <Badge value={nested(row, "quotations")?.status} /> },
            { header: "จำนวน", cell: (row) => `${text(row.quantity)} ${text(part.unit)}`, className: "px-4 py-3 text-right" },
            { header: "รวม", cell: (row) => formatCurrency(row.total), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />
      </section>

      <AuditTrailPanel logs={logs} empty="ยังไม่มีประวัติการแก้ไขหรือเบิกใช้อะไหล่นี้" />
    </>
  );
}
