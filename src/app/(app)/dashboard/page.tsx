import { BadgeDollarSign, CarFront, CircleDollarSign, FileWarning, PackageCheck, TrendingDown, TrendingUp, Wrench } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { DashboardChart } from "@/components/dashboard/dashboard-chart";
import { SetupRequired } from "@/components/ui/setup-required";
import { getDashboardData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof TrendingUp;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
        <div className={`rounded-md p-2 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  if (data.setupRequired) return <SetupRequired />;

  const metrics = data.metrics;

  return (
    <>
      <PageHeader title="Dashboard" description="ภาพรวมรายได้ งานซ่อม สต๊อก และเอกสารที่ต้องติดตาม" />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="รายได้วันนี้" value={formatCurrency(metrics.todayIncome)} icon={BadgeDollarSign} tone="bg-teal-50 text-teal-700" />
        <MetricCard label="รายได้เดือนนี้" value={formatCurrency(metrics.monthIncome)} icon={TrendingUp} tone="bg-emerald-50 text-emerald-700" />
        <MetricCard label="รายจ่ายเดือนนี้" value={formatCurrency(metrics.monthExpense)} icon={TrendingDown} tone="bg-amber-50 text-amber-700" />
        <MetricCard label="กำไรโดยประมาณ" value={formatCurrency(metrics.profit)} icon={CircleDollarSign} tone="bg-sky-50 text-sky-700" />
        <MetricCard label="รถที่กำลังซ่อม" value={metrics.activeJobs} icon={CarFront} tone="bg-stone-100 text-stone-700" />
        <MetricCard label="งานรออะไหล่" value={metrics.waitingParts} icon={Wrench} tone="bg-orange-50 text-orange-700" />
        <MetricCard label="งานซ่อมเสร็จ" value={metrics.completedJobs} icon={PackageCheck} tone="bg-emerald-50 text-emerald-700" />
        <MetricCard label="ใบแจ้งหนี้ยังไม่ชำระ" value={metrics.unpaidInvoices} icon={FileWarning} tone="bg-red-50 text-red-700" />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">กราฟรายรับรายจ่ายรายเดือน</h2>
            <span className="text-sm font-semibold text-primary">ลูกหนี้คงค้าง {formatCurrency(metrics.receivables)}</span>
          </div>
          <DashboardChart data={data.monthly} />
        </div>

        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">งานซ่อมล่าสุด</h2>
              <Link href="/repair-jobs" className="text-sm font-semibold text-primary">
                ดูทั้งหมด
              </Link>
            </div>
            <div className="divide-y divide-border">
              {data.recentJobs.length ? (
                data.recentJobs.map((job) => (
                  <div key={String(job.id)} className="py-3">
                    <Link href={`/repair-jobs/${job.id}`} className="font-semibold hover:text-primary">
                      {String(job.job_number ?? "-")}
                    </Link>
                    <p className="line-clamp-1 text-sm text-muted">{String(job.reported_problem ?? "-")}</p>
                    <p className="mt-1 text-xs text-muted">{formatDate(job.created_at)}</p>
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-sm text-muted">ยังไม่มีงานซ่อม</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">ใบแจ้งหนี้ค้างชำระ</h2>
            <div className="divide-y divide-border">
              {data.unpaid.slice(0, 5).map((invoice) => (
                <div key={String(invoice.id)} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{String(invoice.invoice_no ?? "-")}</p>
                    <p className="text-xs text-muted">ครบกำหนด {formatDate(invoice.due_at)}</p>
                  </div>
                  <p className="font-semibold text-danger">{formatCurrency(invoice.balance_due)}</p>
                </div>
              ))}
              {!data.unpaid.length ? <p className="py-6 text-center text-sm text-muted">ไม่มีใบแจ้งหนี้ค้างชำระ</p> : null}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
