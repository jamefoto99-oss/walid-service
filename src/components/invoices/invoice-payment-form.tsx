"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CreditCard, ReceiptText } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { receiveInvoicePayment } from "@/app/actions/invoices";
import { paymentMethods } from "@/lib/constants";
import { formatCurrency, toNumber } from "@/lib/utils";
import { Button } from "../ui/button";

const paymentFormSchema = z.object({
  received_at: z.string().min(1, "กรุณาระบุวันที่รับเงิน"),
  amount: z.coerce.number().min(0.01, "ยอดรับชำระต้องมากกว่า 0"),
  payment_method: z.enum(["cash", "transfer", "qr", "other"]).default("transfer"),
  notes: z.string().optional(),
});

type PaymentFormInput = z.input<typeof paymentFormSchema>;
type PaymentFormValues = z.output<typeof paymentFormSchema>;

export function InvoicePaymentForm({
  invoiceId,
  invoiceNo,
  balanceDue,
  disabled,
}: {
  invoiceId: string;
  invoiceNo: string;
  balanceDue: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<PaymentFormInput, unknown, PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      received_at: new Date().toISOString().slice(0, 10),
      amount: balanceDue,
      payment_method: "transfer",
      notes: "",
    },
  });

  function submit(values: PaymentFormValues) {
    const amount = toNumber(values.amount);
    if (amount > balanceDue) {
      toast.error("ยอดรับชำระมากกว่ายอดค้าง");
      return;
    }

    startTransition(async () => {
      const result = await receiveInvoicePayment({
        ...values,
        invoice_id: invoiceId,
      });

      if (result.ok) {
        toast.success(result.message);
        form.reset({
          received_at: new Date().toISOString().slice(0, 10),
          amount: Math.max(balanceDue - amount, 0),
          payment_method: "transfer",
          notes: "",
        });
        router.refresh();
      } else {
        toast.error(result.error ?? "รับชำระไม่สำเร็จ");
      }
    });
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">รับชำระเงิน</h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            {invoiceNo} ค้างชำระ {formatCurrency(balanceDue)}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-9"
          disabled={disabled}
          onClick={() => form.setValue("amount", balanceDue, { shouldValidate: true })}
        >
          เต็มจำนวน
        </Button>
      </div>

      {disabled ? (
        <div className="rounded-md bg-surface-soft p-4 text-sm text-muted">ใบแจ้งหนี้นี้ไม่มียอดค้างให้รับชำระ</div>
      ) : (
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-sm font-semibold">วันที่รับเงิน *</span>
              <input className={inputClass()} type="date" {...form.register("received_at")} />
              <FieldError message={form.formState.errors.received_at?.message} />
            </label>
            <label>
              <span className="text-sm font-semibold">จำนวนเงิน *</span>
              <input className={inputClass()} min="0.01" max={balanceDue} step="0.01" type="number" {...form.register("amount")} />
              <FieldError message={form.formState.errors.amount?.message} />
            </label>
            <label>
              <span className="text-sm font-semibold">ช่องทางรับเงิน</span>
              <select className={inputClass()} {...form.register("payment_method")}>
                {paymentMethods.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold">หมายเหตุ</span>
              <input className={inputClass()} placeholder="เช่น รับโอนรอบที่ 1" {...form.register("notes")} />
            </label>
          </div>

          <Button disabled={isPending} type="submit" className="w-full">
            <CreditCard className="h-4 w-4" />
            {isPending ? "กำลังรับชำระ..." : "รับชำระและออกใบเสร็จ"}
          </Button>
        </form>
      )}
    </section>
  );
}

function inputClass() {
  return "mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary";
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-sm text-danger">{message}</p> : null;
}
