import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Clock3, ClipboardCheck, FileSearch, XCircle } from "lucide-react";
import {
  approveApprovalRequestFormAction,
  rejectApprovalRequestFormAction,
} from "@/app/actions/approvals";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { SetupRequired } from "@/components/ui/setup-required";
import { requireProfile } from "@/lib/auth";
import {
  approvalTargetTitle,
  getApprovalPageData,
  getApprovalTargetPath,
  type ApprovalRequestItem,
  type ApprovalStatus,
} from "@/lib/approvals";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, formatCurrency } from "@/lib/utils";

const statusLabels: Record<ApprovalStatus, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธแล้ว",
};

const statusStyles: Record<ApprovalStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
};

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function displayProfile(profile: ApprovalRequestItem["requester"]) {
  if (!profile) return "-";
  return profile.full_name || profile.email || profile.id;
}

function metadataText(item: ApprovalRequestItem) {
  const amount = item.metadata.amount;
  const status = item.metadata.current_status;
  const parts = [];
  if (amount !== undefined && amount !== null) parts.push(`ยอด ${formatCurrency(amount)}`);
  if (status) parts.push(`สถานะ ${String(status)}`);
  return parts.join(" / ");
}

export default async function ApprovalsPage() {
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) return null;

  const canUsePage = ["owner", "manager"].includes(session.profile.role);
  if (!canUsePage) {
    return (
      <>
        <PageHeader
          title="อนุมัติ"
          description="ตรวจสอบคำขอที่เกี่ยวกับเอกสารสำคัญและบันทึก audit trail"
        />
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
          บัญชีนี้ไม่มีสิทธิ์เข้าหน้าคำขออนุมัติ
        </div>
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const data = await getApprovalPageData(supabase, session.profile);
  if (data.setupRequired) return <SetupRequired />;

  const isOwner = session.profile.role === "owner";

  return (
    <>
      <PageHeader
        title="อนุมัติ"
        description="ควบคุมการลบเอกสารบัญชีสำคัญด้วยเหตุผล ผู้ขออนุมัติ ผู้ตรวจ และ Activity Log"
      />

      <div className="space-y-5">
        {data.unavailable ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            ยังไม่พบตารางคำขออนุมัติในฐานข้อมูล ให้รัน migration ล่าสุดในโฟลเดอร์ `supabase/migrations`
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard icon={<Clock3 className="h-4 w-4" />} label="รออนุมัติ" value={data.summary.pending} />
          <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="อนุมัติแล้ว" value={data.summary.approved} />
          <SummaryCard icon={<XCircle className="h-4 w-4" />} label="ปฏิเสธแล้ว" value={data.summary.rejected} />
        </section>

        <section className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold">คำขออนุมัติการลบเอกสาร</h2>
            <p className="text-sm text-muted">
              {isOwner ? "Owner เห็นทุกคำขอและเป็นผู้ตัดสินใจขั้นสุดท้าย" : "Manager เห็นคำขอที่ตัวเองส่งและติดตามผลได้"}
            </p>
          </div>

          {data.approvals.length ? (
            <div className="divide-y divide-border">
              {data.approvals.map((approval) => (
                <ApprovalCard approval={approval} isOwner={isOwner} key={approval.id} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center p-6 text-center">
              <ClipboardCheck className="h-10 w-10 text-emerald-600" />
              <p className="mt-3 font-semibold">ยังไม่มีคำขอค้างอยู่</p>
              <p className="mt-1 max-w-md text-sm text-muted">
                เมื่อมีการกดลบใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ หรือเอกสารซื้ออะไหล่ ระบบจะสร้างคำขอไว้ที่นี่
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ApprovalCard({ approval, isOwner }: { approval: ApprovalRequestItem; isOwner: boolean }) {
  const targetPath = getApprovalTargetPath(approval);
  const meta = metadataText(approval);

  return (
    <article className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold",
              statusStyles[approval.status],
            )}
          >
            {approval.status === "pending" ? <Clock3 className="h-3.5 w-3.5" /> : null}
            {approval.status === "approved" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
            {approval.status === "rejected" ? <XCircle className="h-3.5 w-3.5" /> : null}
            {statusLabels[approval.status]}
          </span>
          <span className="rounded-full bg-surface-soft px-2 py-1 text-xs font-semibold text-muted">
            {approvalTargetTitle(approval.target_table)}
          </span>
          {meta ? <span className="rounded-full bg-surface-soft px-2 py-1 text-xs font-semibold text-muted">{meta}</span> : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{approval.target_label}</h3>
          <Link
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-semibold transition hover:bg-surface-soft"
            href={targetPath}
          >
            <FileSearch className="h-3.5 w-3.5" />
            เปิดเอกสาร
          </Link>
        </div>

        <p className="mt-2 text-sm text-muted">เหตุผล: {approval.reason}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Info label="ผู้ขอ" value={displayProfile(approval.requester)} />
          <Info label="วันที่ขอ" value={formatDateTime(approval.created_at)} />
          <Info label="ผู้ตรวจ" value={displayProfile(approval.reviewer)} />
          <Info label="วันที่ตรวจ" value={formatDateTime(approval.reviewed_at)} />
        </dl>
        {approval.review_note ? <p className="mt-3 text-sm text-muted">หมายเหตุผู้ตรวจ: {approval.review_note}</p> : null}
      </div>

      {isOwner && approval.status === "pending" ? (
        <div className="rounded-lg border border-border bg-surface-soft p-3">
          <p className="text-sm font-semibold">ตัดสินใจคำขอ</p>
          <div className="mt-3 grid gap-3">
            <form action={approveApprovalRequestFormAction} className="grid gap-2">
              <input name="approval_id" type="hidden" value={approval.id} />
              <input
                className="h-10 rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
                name="review_note"
                placeholder="หมายเหตุ (ถ้ามี)"
              />
              <Button>
                <CheckCircle2 className="h-4 w-4" />
                อนุมัติและลบเอกสาร
              </Button>
            </form>
            <form action={rejectApprovalRequestFormAction} className="grid gap-2">
              <input name="approval_id" type="hidden" value={approval.id} />
              <input
                className="h-10 rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
                name="review_note"
                placeholder="เหตุผลที่ปฏิเสธ"
              />
              <Button variant="secondary">
                <XCircle className="h-4 w-4" />
                ปฏิเสธ
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-foreground">{value}</dd>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold">{value.toLocaleString("th-TH")}</p>
    </div>
  );
}
