"use client";

import { Ban, ShieldAlert } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { voidInvoice, voidPurchase, voidReceipt } from "@/app/actions/void-documents";
import { Button } from "@/components/ui/button";

type VoidDocumentType = "invoice" | "receipt" | "purchase";

const labels: Record<VoidDocumentType, string> = {
  invoice: "ใบแจ้งหนี้",
  receipt: "ใบเสร็จ",
  purchase: "ใบซื้อ",
};

export function VoidDocumentAction({
  documentType,
  documentId,
  documentNo,
  disabled = false,
  disabledReason,
  compact = false,
}: {
  documentType: VoidDocumentType;
  documentId: string;
  documentNo: string;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  async function runVoidAction() {
    const input = { id: documentId, reason };
    if (documentType === "invoice") return voidInvoice(input);
    if (documentType === "receipt") return voidReceipt(input);
    return voidPurchase(input);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 8) {
      toast.error("กรุณาระบุเหตุผลอย่างน้อย 8 ตัวอักษร");
      return;
    }

    startTransition(async () => {
      const result = await runVoidAction();
      if (result.ok) {
        toast.success(result.message ?? "ยกเลิกเอกสารแล้ว");
        setOpen(false);
        setReason("");
      } else {
        toast.error(result.error ?? "ยกเลิกเอกสารไม่สำเร็จ");
      }
      router.refresh();
    });
  }

  return (
    <>
      <Button
        className={compact ? "h-9 px-3" : undefined}
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={disabled ? disabledReason : `ยกเลิก${labels[documentType]}`}
        type="button"
        variant="secondary"
      >
        <Ban className="h-4 w-4" />
        {compact ? "ยกเลิก" : `ยกเลิก${labels[documentType]}`}
      </Button>

      {disabled && disabledReason ? <span className="sr-only">{disabledReason}</span> : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <form
            onSubmit={submit}
            className="mt-12 w-full max-w-xl rounded-lg border border-border bg-surface p-5 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-red-50 text-danger">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">ยกเลิก{labels[documentType]}</h2>
                <p className="mt-1 text-sm text-muted">
                  {documentNo} จะถูกกลับรายการบัญชี/สต๊อกตามประเภทเอกสาร และบันทึก Activity Log
                </p>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold">
                เหตุผลการยกเลิก <span className="text-danger">*</span>
              </span>
              <textarea
                className="mt-1 min-h-28 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                onChange={(event) => setReason(event.target.value)}
                placeholder="เช่น ออกเอกสารผิด ต้องออกใหม่ หรือบันทึกยอดผิด"
                value={reason}
              />
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                ปิด
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
