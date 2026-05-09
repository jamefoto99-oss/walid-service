"use client";

import { FileText, MessageSquarePlus, PackageMinus, Plus, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addRepairJobLaborItem,
  addRepairJobNote,
  consumeRepairJobPart,
  createQuotationFromRepairJob,
  updateRepairJobStatus,
} from "@/app/actions/repair-jobs";
import { financeRoles, repairStatuses } from "@/lib/constants";
import type { UserRole } from "@/lib/types";
import { Button } from "../ui/button";

type PartRow = {
  id: string;
  part_code: string | null;
  name: string | null;
  sale_price: number | string | null;
  quantity_on_hand: number | string | null;
  unit: string | null;
};

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
  const canUseStock = financeRoles.includes(role);

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message ?? "บันทึกสำเร็จ");
        onSuccess?.();
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
                <select
                  className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
                  value={partUsage.part_id}
                  onChange={(event) => setPartUsage((value) => ({ ...value, part_id: event.target.value }))}
                >
                  <option value="">เลือกอะไหล่</option>
                  {parts.map((part) => (
                    <option key={part.id} value={part.id}>
                      {part.part_code} {part.name} - เหลือ {part.quantity_on_hand} {part.unit}
                    </option>
                  ))}
                </select>
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
