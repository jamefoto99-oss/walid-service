"use client";

import { Ban, CheckCircle2, FilePlus2, Send, XCircle } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  approveQuotation,
  convertQuotationToInvoice,
  updateQuotationStatus,
} from "@/app/actions/workflows";
import { Button } from "../ui/button";

type QuotationActionsProps = {
  quotationId: string;
  status: string;
  hasInvoice: boolean;
};

export function QuotationActions({ quotationId, status, hasInvoice }: QuotationActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isClosed = ["rejected", "cancelled"].includes(status);
  const canSend = status === "draft";
  const canApprove = !["approved", "rejected", "cancelled"].includes(status);
  const canConvert = status === "approved" && !hasInvoice;

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.error ?? "ทำรายการไม่สำเร็จ");
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="font-semibold">จัดการใบเสนอราคา</h2>
        <p className="mt-1 text-sm text-muted">อนุมัติ เปลี่ยนสถานะ หรือแปลงเป็นใบแจ้งหนี้จากใบเสนอราคานี้</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="secondary"
          disabled={isPending || !canSend}
          onClick={() => run(() => updateQuotationStatus(quotationId, "sent"))}
        >
          <Send className="h-4 w-4" />
          ส่งให้ลูกค้าแล้ว
        </Button>
        <Button
          type="button"
          disabled={isPending || !canApprove}
          onClick={() => run(() => approveQuotation(quotationId))}
        >
          <CheckCircle2 className="h-4 w-4" />
          อนุมัติใบเสนอราคา
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending || isClosed || status === "approved"}
          onClick={() => {
            if (!window.confirm("ยืนยันว่าไม่อนุมัติใบเสนอราคานี้?")) return;
            run(() => updateQuotationStatus(quotationId, "rejected"));
          }}
        >
          <XCircle className="h-4 w-4" />
          ไม่อนุมัติ
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending || isClosed || hasInvoice}
          onClick={() => {
            if (!window.confirm("ยืนยันยกเลิกใบเสนอราคานี้?")) return;
            run(() => updateQuotationStatus(quotationId, "cancelled"));
          }}
        >
          <Ban className="h-4 w-4" />
          ยกเลิก
        </Button>
      </div>

      <Button
        type="button"
        className="mt-3 w-full"
        disabled={isPending || !canConvert}
        onClick={() => run(() => convertQuotationToInvoice(quotationId))}
      >
        <FilePlus2 className="h-4 w-4" />
        แปลงเป็นใบแจ้งหนี้
      </Button>

      {hasInvoice ? (
        <p className="mt-3 rounded-md bg-surface-soft p-3 text-sm text-muted">ใบเสนอราคานี้ถูกแปลงเป็นใบแจ้งหนี้แล้ว</p>
      ) : null}
    </section>
  );
}
