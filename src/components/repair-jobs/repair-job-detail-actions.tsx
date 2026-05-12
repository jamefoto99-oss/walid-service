"use client";

import { BadgeDollarSign, FileText, MessageSquarePlus, PackageMinus, Plus, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addRepairJobLaborItem,
  addRepairJobNote,
  createInstantRepairJobBill,
  consumeRepairJobPart,
  createQuotationFromRepairJob,
  updateRepairJobStatus,
} from "@/app/actions/repair-jobs";
import { financeRoles, repairStatuses } from "@/lib/constants";
import type { FieldOption, UserRole } from "@/lib/types";
import { SearchableSelect } from "../forms/searchable-select";
import { Button } from "../ui/button";

type PartRow = {
  id: string;
  part_code: string | null;
  name: string | null;
  sale_price: number | string | null;
  quantity_on_hand: number | string | null;
  unit: string | null;
};

function partSearchLabel(part: PartRow) {
  return `${part.part_code ?? "-"} ${part.name ?? ""} | เหลือ ${part.quantity_on_hand ?? 0} ${part.unit ?? ""}`;
}

export function RepairJobDetailActions({
  jobId,
  currentStatus,
  internalNotes,
  parts,
  role,
}: {
  jobId: string;
  currentStatus: string;
  internalNotes?: string | null;
  parts: PartRow[];
  role: UserRole;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(currentStatus);
  const [notes, setNotes] = useState(internalNotes ?? "");
  const [labor, setLabor] = useState({
    title: "",
    description: "",
    labor_price: "0",
    quantity: "1",
    discount: "0",
  });
  const [partUsage, setPartUsage] = useState({ part_id: "", quantity: "1", discount: "0" });
  const [timelineNote, setTimelineNote] = useState("");
  const [instantBill, setInstantBill] = useState({
    payment_method: "cash",
    discount: "0",
    notes: "",
    show_payment_info: false,
    show_paid_stamp: true,
  });
  const canUseStock = financeRoles.includes(role);
  const partOptions = useMemo<FieldOption[]>(
    () =>
      parts.map((part) => ({
        label: partSearchLabel(part),
        value: part.id,
        meta: {
          quantity_on_hand: part.quantity_on_hand ?? 0,
          sale_price: part.sale_price ?? 0,
          unit: part.unit ?? "",
        },
      })),
    [parts],
  );

  function run(
    action: () => Promise<{ ok: boolean; message?: string; error?: string; href?: string }>,
    onSuccess?: (result: { href?: string }) => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message ?? "บันทึกสำเร็จ");
        onSuccess?.(result);
        router.refresh();
      } else {
        toast.error(result.error ?? "ทำรายการไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <RefreshCcw className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">สถานะงานซ่อม</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <label>
            <span className="text-sm font-semibold">สถานะ</span>
            <select
              className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {repairStatuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-semibold">หมายเหตุภายในล่าสุด</span>
            <input
              className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="เช่น รออะไหล่จาก supplier"
            />
          </label>
        </div>
        <Button
          className="mt-4"
          disabled={isPending}
          onClick={() => run(() => updateRepairJobStatus(jobId, { status, internal_notes: notes }))}
        >
          อัปเดตสถานะ
        </Button>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquarePlus className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">เพิ่ม Timeline Note</h2>
        </div>
        <textarea
          className="min-h-24 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          value={timelineNote}
          onChange={(event) => setTimelineNote(event.target.value)}
          placeholder="บันทึกความคืบหน้า เช่น โทรแจ้งลูกค้าแล้ว ลูกค้าขอดูราคาก่อน"
        />
        <Button
          className="mt-3"
          variant="secondary"
          disabled={isPending}
          onClick={() => run(() => addRepairJobNote(jobId, timelineNote), () => setTimelineNote(""))}
        >
          เพิ่มหมายเหตุ
        </Button>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">เพิ่มรายการซ่อม / ค่าแรง</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="text-sm font-semibold">ชื่องานซ่อม</span>
            <input
              className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
              value={labor.title}
              onChange={(event) => setLabor((value) => ({ ...value, title: event.target.value }))}
              placeholder="เช่น ยกเกียร์ เปลี่ยนคลัทช์"
            />
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-semibold">รายละเอียด</span>
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              value={labor.description}
              onChange={(event) => setLabor((value) => ({ ...value, description: event.target.value }))}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">ค่าแรง / ราคาต่อหน่วย</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
              value={labor.labor_price}
              onChange={(event) => setLabor((value) => ({ ...value, labor_price: event.target.value }))}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">จำนวน</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
              value={labor.quantity}
              onChange={(event) => setLabor((value) => ({ ...value, quantity: event.target.value }))}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">ส่วนลด</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
              value={labor.discount}
              onChange={(event) => setLabor((value) => ({ ...value, discount: event.target.value }))}
            />
          </label>
        </div>
        <Button
          className="mt-4"
          disabled={isPending}
          onClick={() =>
            run(() => addRepairJobLaborItem(jobId, labor), () =>
              setLabor({ title: "", description: "", labor_price: "0", quantity: "1", discount: "0" }),
            )
          }
        >
          เพิ่มรายการซ่อม
        </Button>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <PackageMinus className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">เบิกอะไหล่และตัดสต๊อก</h2>
        </div>
        {canUseStock ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="text-sm font-semibold">อะไหล่</span>
                <SearchableSelect
                  className="h-11 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                  containerClassName="mt-1"
                  emptyText="ไม่พบอะไหล่"
                  onValueChange={(partId) => setPartUsage((value) => ({ ...value, part_id: partId }))}
                  options={partOptions}
                  placeholder="พิมพ์รหัสอะไหล่หรือชื่ออะไหล่"
                  value={partUsage.part_id}
                />
              </label>
              <label>
                <span className="text-sm font-semibold">จำนวน</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
                  value={partUsage.quantity}
                  onChange={(event) => setPartUsage((value) => ({ ...value, quantity: event.target.value }))}
                />
              </label>
              <label>
                <span className="text-sm font-semibold">ส่วนลด</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
                  value={partUsage.discount}
                  onChange={(event) => setPartUsage((value) => ({ ...value, discount: event.target.value }))}
                />
              </label>
            </div>
            <Button
              className="mt-4"
              disabled={isPending}
              onClick={() =>
                run(() => consumeRepairJobPart(jobId, partUsage), () =>
                  setPartUsage({ part_id: "", quantity: "1", discount: "0" }),
                )
              }
            >
              เบิกอะไหล่
            </Button>
          </>
        ) : (
          <p className="rounded-md bg-surface-soft p-4 text-sm text-muted">
            Role นี้อัปเดตงานซ่อมได้ แต่การตัดสต๊อกอะไหล่ต้องใช้สิทธิ์ Owner, Manager หรือ Accountant
          </p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm xl:col-span-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <BadgeDollarSign className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">เปิดบิลทันที</h2>
            </div>
            <p className="text-sm text-muted">
              ใช้กรณีลูกค้าชำระเงินเลย ไม่ต้องสร้างใบเสนอราคาและไม่ต้องออกใบแจ้งหนี้ ระบบจะดึงรายการซ่อมในงานนี้ไปออกเอกสารให้ทันที
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isPending || !financeRoles.includes(role)}
              onClick={() =>
                run(
                  () =>
                    createInstantRepairJobBill(jobId, {
                      ...instantBill,
                      document_type: "receipt",
                      discount: instantBill.discount,
                    }),
                  (result) => {
                    if (result.href) router.push(result.href);
                  },
                )
              }
            >
              เปิดใบเสร็จรับเงิน
            </Button>
            <Button
              variant="secondary"
              disabled={isPending || !financeRoles.includes(role)}
              onClick={() =>
                run(
                  () =>
                    createInstantRepairJobBill(jobId, {
                      ...instantBill,
                      document_type: "cash_bill",
                      discount: instantBill.discount,
                    }),
                  (result) => {
                    if (result.href) router.push(result.href);
                  },
                )
              }
            >
              เปิดบิลเงินสด
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[180px_160px_1fr]">
          <label>
            <span className="text-sm font-semibold">ช่องทางชำระเงิน</span>
            <select
              className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
              value={instantBill.payment_method}
              onChange={(event) => setInstantBill((value) => ({ ...value, payment_method: event.target.value }))}
            >
              <option value="cash">เงินสด</option>
              <option value="transfer">โอนเงิน</option>
              <option value="qr">QR Payment</option>
              <option value="other">อื่น ๆ</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-semibold">ส่วนลดรวม</span>
            <input
              className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
              min="0"
              step="0.01"
              type="number"
              value={instantBill.discount}
              onChange={(event) => setInstantBill((value) => ({ ...value, discount: event.target.value }))}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">หมายเหตุบนเอกสาร</span>
            <input
              className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
              value={instantBill.notes}
              onChange={(event) => setInstantBill((value) => ({ ...value, notes: event.target.value }))}
              placeholder="เช่น รับชำระงานซ่อมด่วน"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              className="h-4 w-4 rounded border-border"
              checked={instantBill.show_payment_info}
              onChange={(event) => setInstantBill((value) => ({ ...value, show_payment_info: event.target.checked }))}
              type="checkbox"
            />
            แสดงข้อมูลบัญชีธนาคาร
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              className="h-4 w-4 rounded border-border"
              checked={instantBill.show_paid_stamp}
              onChange={(event) => setInstantBill((value) => ({ ...value, show_paid_stamp: event.target.checked }))}
              type="checkbox"
            />
            Stamp จ่ายแล้ว
          </label>
        </div>
        {!financeRoles.includes(role) ? (
          <p className="mt-3 rounded-md bg-surface-soft p-3 text-sm text-muted">
            การเปิดบิลทันทีต้องใช้สิทธิ์ Owner, Manager หรือ Accountant
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm xl:col-span-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">ต่อเอกสารจากงานซ่อม</h2>
            </div>
            <p className="text-sm text-muted">สร้างใบเสนอราคาจากรายการซ่อมและอะไหล่ที่อยู่ในงานนี้</p>
          </div>
          <Button
            disabled={isPending || !financeRoles.includes(role)}
            onClick={() => run(() => createQuotationFromRepairJob(jobId))}
          >
            สร้างใบเสนอราคา
          </Button>
        </div>
      </section>
    </div>
  );
}
