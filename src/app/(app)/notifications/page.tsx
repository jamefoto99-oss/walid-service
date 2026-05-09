import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Package,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import {
  markAllNotificationsReadFormAction,
  markNotificationReadFormAction,
  syncNotificationsFormAction,
} from "@/app/actions/notifications";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { SetupRequired } from "@/components/ui/setup-required";
import { requireProfile } from "@/lib/auth";
import {
  getNotificationCategory,
  getNotificationPageData,
  type NotificationCategory,
  type NotificationItem,
  type NotificationSeverity,
} from "@/lib/notifications";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

type NotificationFilter = "all" | "unread" | "critical" | NotificationCategory;
type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const severityStyles: Record<NotificationSeverity, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-red-200 bg-red-50 text-red-700",
};

const severityLabels: Record<NotificationSeverity, string> = {
  info: "ข้อมูล",
  warning: "เตือน",
  critical: "ด่วน",
};

const filterOptions: { key: NotificationFilter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "unread", label: "ยังไม่อ่าน" },
  { key: "critical", label: "ด่วน" },
  { key: "stock", label: "สต๊อก" },
  { key: "billing", label: "เอกสารเงิน" },
  { key: "repair", label: "งานซ่อม" },
];

function severityIcon(severity: NotificationSeverity) {
  if (severity === "critical") return <ShieldAlert className="h-4 w-4" />;
  if (severity === "warning") return <AlertTriangle className="h-4 w-4" />;
  return <Bell className="h-4 w-4" />;
}

function notificationIcon(type: NotificationItem["type"]) {
  if (type === "part_low_stock" || type === "part_out_of_stock") return <Package className="h-5 w-5" />;
  if (type === "invoice_due_soon" || type === "invoice_overdue") return <ReceiptText className="h-5 w-5" />;
  if (type === "job_waiting_parts" || type === "job_waiting_payment") return <Wrench className="h-5 w-5" />;
  return <Bell className="h-5 w-5" />;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeFilter(value: string | string[] | undefined): NotificationFilter {
  const raw = firstParam(value);
  return filterOptions.some((option) => option.key === raw) ? (raw as NotificationFilter) : "all";
}

function filterNotifications(notifications: NotificationItem[], filter: NotificationFilter) {
  if (filter === "all") return notifications;
  if (filter === "unread") return notifications.filter((notification) => !notification.read_at);
  if (filter === "critical") return notifications.filter((notification) => notification.severity === "critical");
  return notifications.filter((notification) => getNotificationCategory(notification.type) === filter);
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeFilter = normalizeFilter(params.filter);
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) return null;

  const supabase = await createSupabaseServerClient();
  const data = await getNotificationPageData(supabase, session.profile);
  if (data.setupRequired) return <SetupRequired />;

  const readCount = data.notifications.length - data.unreadCount;
  const filteredNotifications = filterNotifications(data.notifications, activeFilter);
  const filterCounts: Record<NotificationFilter, number> = {
    all: data.notifications.length,
    unread: data.unreadCount,
    critical: data.severityCounts.critical,
    stock: data.categoryCounts.stock,
    billing: data.categoryCounts.billing,
    repair: data.categoryCounts.repair,
  };

  return (
    <>
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <form action={syncNotificationsFormAction}>
              <Button variant="secondary">
                <RefreshCw className="h-4 w-4" />
                อัปเดต
              </Button>
            </form>
            <form action={markAllNotificationsReadFormAction}>
              <Button disabled={data.unreadCount === 0}>
                <CheckCircle2 className="h-4 w-4" />
                อ่านทั้งหมด
              </Button>
            </form>
          </div>
        }
        title="แจ้งเตือน"
        description="ติดตามอะไหล่ใกล้หมด ใบแจ้งหนี้ใกล้ครบกำหนด/เกินกำหนด และงานซ่อมที่ต้องเร่งติดตาม"
      />

      <div className="space-y-5">
        {data.unavailable ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            ยังไม่พบตารางแจ้งเตือนในฐานข้อมูล ให้รัน migration ล่าสุดในโฟลเดอร์ `supabase/migrations`
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard icon={<Bell className="h-4 w-4" />} label="ยังไม่ได้อ่าน" value={data.unreadCount.toLocaleString("th-TH")} />
          <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="อ่านแล้ว" value={readCount.toLocaleString("th-TH")} />
          <SummaryCard icon={<ShieldAlert className="h-4 w-4" />} label="ด่วน" value={data.severityCounts.critical.toLocaleString("th-TH")} />
          <SummaryCard icon={<AlertTriangle className="h-4 w-4" />} label="เตือน" value={data.severityCounts.warning.toLocaleString("th-TH")} />
          <SummaryCard icon={<Package className="h-4 w-4" />} label="สต๊อก" value={data.categoryCounts.stock.toLocaleString("th-TH")} />
          <SummaryCard icon={<Wrench className="h-4 w-4" />} label="งานซ่อม" value={data.categoryCounts.repair.toLocaleString("th-TH")} />
        </section>

        <section className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="border-b border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">รายการแจ้งเตือนที่ต้องติดตาม</h2>
                <p className="text-sm text-muted">
                  รายการถูกสร้างจากข้อมูลจริงในระบบและจะหายไปเมื่อเงื่อนไขถูกแก้ไขแล้ว | อัปเดตล่าสุด {formatDateTime(data.generatedAt)}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-soft px-3 py-2 text-sm text-muted">
                <Clock3 className="h-4 w-4" />
                แสดง {filteredNotifications.length.toLocaleString("th-TH")} รายการ
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-border p-4">
            {filterOptions.map((option) => (
              <Link
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                  activeFilter === option.key
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-surface text-foreground hover:bg-surface-soft",
                )}
                href={option.key === "all" ? "/notifications" : `/notifications?filter=${option.key}`}
                key={option.key}
              >
                {option.label}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    activeFilter === option.key ? "bg-white/20 text-white" : "bg-surface-soft text-muted",
                  )}
                >
                  {filterCounts[option.key].toLocaleString("th-TH")}
                </span>
              </Link>
            ))}
          </div>

          {filteredNotifications.length ? (
            <div className="divide-y divide-border">
              {filteredNotifications.map((notification) => (
                <article
                  className={cn(
                    "grid gap-4 p-4 lg:grid-cols-[auto_minmax(0,1fr)_auto]",
                    notification.read_at ? "bg-surface text-muted" : "bg-white",
                  )}
                  key={notification.id}
                >
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-md border",
                      severityStyles[notification.severity],
                    )}
                  >
                    {notificationIcon(notification.type)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold",
                          severityStyles[notification.severity],
                        )}
                      >
                        {severityIcon(notification.severity)}
                        {severityLabels[notification.severity]}
                      </span>
                      {notification.read_at ? (
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                          อ่านแล้ว
                        </span>
                      ) : (
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                          ใหม่
                        </span>
                      )}
                      {notification.due_at ? (
                        <span className="rounded-full bg-surface-soft px-2 py-1 text-xs font-semibold text-muted">
                          ครบกำหนด {formatDate(notification.due_at)}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-2 font-semibold text-foreground">{notification.title}</h3>
                    <p className="mt-1 text-sm text-muted">{notification.message}</p>
                    <p className="mt-2 font-mono text-xs text-muted">
                      {notification.source_table} / {notification.source_key} / อัปเดต {formatDateTime(notification.updated_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                    <Link
                      className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-semibold transition hover:bg-surface-soft"
                      href={notification.target_href}
                    >
                      เปิดรายการ
                    </Link>
                    {!notification.read_at ? (
                      <form action={markNotificationReadFormAction}>
                        <input name="notification_id" type="hidden" value={notification.id} />
                        <Button variant="secondary">
                          <CheckCircle2 className="h-4 w-4" />
                          อ่านแล้ว
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : data.notifications.length ? (
            <div className="flex min-h-72 flex-col items-center justify-center p-6 text-center">
              <Bell className="h-10 w-10 text-muted" />
              <p className="mt-3 font-semibold">ไม่มีรายการตามตัวกรองนี้</p>
              <p className="mt-1 max-w-md text-sm text-muted">ลองเปลี่ยนตัวกรองเพื่อดูแจ้งเตือนหมวดอื่นที่ยังค้างอยู่</p>
              <Link
                className="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-semibold transition hover:bg-surface-soft"
                href="/notifications"
              >
                ดูทั้งหมด
              </Link>
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center p-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="mt-3 font-semibold">ไม่มีแจ้งเตือนค้างอยู่</p>
              <p className="mt-1 max-w-md text-sm text-muted">
                ตอนนี้ยังไม่พบอะไหล่ใกล้หมด ใบแจ้งหนี้เร่งด่วน หรืองานซ่อมที่ต้องติดตามเป็นพิเศษ
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
