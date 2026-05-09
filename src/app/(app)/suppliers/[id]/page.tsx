import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Clock, Package, Plus, ReceiptText, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { DetailPanel, DetailTable, InfoGrid, SummaryCard } from "@/components/records/detail-sections";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SetupRequired } from "@/components/ui/setup-required";
import { canRead, requireProfile } from "@/lib/auth";
import { getSupplierDetail } from "@/lib/data";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "-");
}

function nested(row: Row, key: string): Row | null {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

function purchaseItemSummary(row: Row) {
  const items = Array.isArray(row.purchase_items) ? (row.purchase_items as Row[]) : [];
  if (!items.length) return "-";
  return items
    .slice(0, 3)
    .map((item) => {
      const part = nested(item, "parts");
      return `${text(part?.part_code)} ${text(part?.name)} x ${text(item.quantity)} ${text(part?.unit)}`;
    })
    .join(", ");
}

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, "suppliers")) redirect("/dashboard");

  const { detail, setupRequired } = await getSupplierDetail(id);
  if (setupRequired) return <SetupRequired />;
  if (!detail) notFound();

  const { supplier, purchases, parts, expenses, stockMovements, logs } = detail;
  const purchaseTotal = purchases.reduce((sum, row) => sum + toNumber(row.total), 0);
  const paidTotal = purchases.reduce((sum, row) => sum + toNumber(row.paid_amount), 0);
  const payableTotal = purchases.reduce((sum, row) => sum + toNumber(row.balance_due), 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const openPurchases = purchases.filter((row) => toNumber(row.balance_due) > 0).length;

  return (
    <>
      <PageHeader
        title={text(supplier.name)}
        description="ภาพรวม Supplier ประวัติซื้ออะไหล่ เครดิตคงค้าง รายจ่าย และสินค้าในสต๊อก"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/suppliers" variant="secondary">
              กลับรายการ Supplier
            </ButtonLink>
            <ButtonLink href={`/purchases?supplier_id=${supplier.id}`}>
              <Plus className="h-4 w-4" />
              ซื้ออะไหล่จากร้านนี้
            </ButtonLink>
          </div>
        }
      />

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="เครดิตคงค้าง" value={formatCurrency(supplier.credit_balance)} />
        <SummaryCard label="ค้างจากใบซื้อ" value={formatCurrency(payableTotal)} hint={`${openPurchases} ใบที่ยังไม่ปิด`} />
        <SummaryCard label="ยอดซื้อสะสม" value={formatCurrency(purchaseTotal)} hint={`จ่ายแล้ว ${formatCurrency(paidTotal)}`} />
        <SummaryCard label="รายจ่ายที่บันทึก" value={formatCurrency(expenseTotal)} />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <DetailPanel title="ข้อมูล Supplier">
          <InfoGrid
            rows={[
              { label: "ชื่อร้าน / บริษัท", value: text(supplier.name) },
              { label: "เบอร์โทร", value: text(supplier.phone) },
              { label: "เครดิตคงค้าง", value: formatCurrency(supplier.credit_balance) },
              { label: "วันที่สร้างข้อมูล", value: formatDate(supplier.created_at) },
              { label: "ที่อยู่", value: <span className="whitespace-pre-wrap">{text(supplier.address)}</span> },
              { label: "รายการอะไหล่ที่ซื้อประจำ", value: <span className="whitespace-pre-wrap">{text(supplier.regular_items)}</span> },
              { label: "หมายเหตุ", value: <span className="whitespace-pre-wrap">{text(supplier.notes)}</span> },
            ]}
          />
        </DetailPanel>

        <DetailTable
          title="อะไหล่ที่ผูกกับ Supplier นี้"
          rows={parts}
          empty="ยังไม่มีอะไหล่ที่ผูกกับ Supplier นี้"
          columns={[
            {
              header: "อะไหล่",
              cell: (row) => (
                <div>
                  <p className="font-semibold">
                    <Package className="mr-1 inline h-4 w-4 text-muted" />
                    {text(row.part_code)} {text(row.name)}
                  </p>
                  <p className="text-xs text-muted">{text(row.notes)}</p>
                </div>
              ),
            },
            { header: "ทุน", cell: (row) => formatCurrency(row.cost_price), className: "px-4 py-3 text-right" },
            { header: "ขาย", cell: (row) => formatCurrency(row.sale_price), className: "px-4 py-3 text-right" },
            { header: "คงเหลือ", cell: (row) => `${text(row.quantity_on_hand)} ${text(row.unit)}` },
            { header: "จุดเตือน", cell: (row) => text(row.low_stock_threshold) },
          ]}
        />
      </section>

      <section className="mb-5">
        <DetailTable
          title="ประวัติใบซื้อ"
          rows={purchases}
          empty="ยังไม่มีประวัติซื้อจาก Supplier นี้"
          columns={[
            {
              header: "เลขที่",
              cell: (row) => (
                <Link className="font-semibold text-primary hover:underline" href={`/purchases/${row.id}`}>
                  <ShoppingCart className="mr-1 inline h-4 w-4 text-muted" />
                  {text(row.purchase_no)}
                </Link>
              ),
            },
            { header: "วันที่ซื้อ", cell: (row) => formatDate(row.purchased_at) },
            { header: "รายการ", cell: purchaseItemSummary },
            { header: "สถานะ", cell: (row) => <Badge value={row.payment_status} /> },
            { header: "ยอดรวม", cell: (row) => formatCurrency(row.total), className: "px-4 py-3 text-right" },
            { header: "จ่ายแล้ว", cell: (row) => formatCurrency(row.paid_amount), className: "px-4 py-3 text-right" },
            { header: "ค้าง", cell: (row) => formatCurrency(row.balance_due), className: "px-4 py-3 text-right font-semibold text-danger" },
          ]}
        />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <DetailTable
          title="รายจ่ายที่เกี่ยวข้อง"
          rows={expenses}
          empty="ยังไม่มีรายจ่ายที่ผูกกับ Supplier นี้"
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
            { header: "ช่องทาง", cell: (row) => text(row.payment_method) },
            { header: "จำนวนเงิน", cell: (row) => formatCurrency(row.amount), className: "px-4 py-3 text-right font-semibold" },
          ]}
        />

        <DetailTable
          title="Stock Movement ล่าสุด"
          rows={stockMovements}
          empty="ยังไม่มีประวัติการรับเข้า/เบิกใช้อะไหล่ของ Supplier นี้"
          columns={[
            { header: "วันที่", cell: (row) => formatDate(row.created_at) },
            {
              header: "อะไหล่",
              cell: (row) => {
                const part = nested(row, "parts");
                return `${text(part?.part_code)} ${text(part?.name)}`;
              },
            },
            { header: "ประเภท", cell: (row) => <Badge value={row.movement_type} /> },
            { header: "จำนวน", cell: (row) => text(row.quantity), className: "px-4 py-3 text-right" },
            { header: "ทุน/หน่วย", cell: (row) => formatCurrency(row.unit_cost), className: "px-4 py-3 text-right" },
          ]}
        />
      </section>

      <DetailPanel title="Activity Log">
        <div className="space-y-3">
          {logs.map((log) => (
            <div className="rounded-md border border-border p-3" key={text(log.id)}>
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <p className="font-semibold">
                  <Clock className="mr-1 inline h-4 w-4 text-muted" />
                  {text(log.action)}
                </p>
                <p className="text-xs text-muted">{formatDate(log.created_at)}</p>
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-soft p-3 text-xs text-muted">
                {JSON.stringify(log.metadata ?? {}, null, 2)}
              </pre>
            </div>
          ))}
          {!logs.length ? <p className="rounded-md bg-surface-soft p-4 text-sm text-muted">ยังไม่มี activity log ของ Supplier นี้</p> : null}
        </div>
      </DetailPanel>
    </>
  );
}
