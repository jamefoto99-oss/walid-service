"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteRepairJobItem, updateRepairJobItem } from "@/app/actions/repair-jobs";
import { SearchableSelect } from "@/components/forms/searchable-select";
import { financeRoles, operationRoles } from "@/lib/constants";
import type { FieldOption, UserRole } from "@/lib/types";
import { cn, formatCurrency, toNumber } from "@/lib/utils";
import { Button } from "../ui/button";

type PartRow = {
  id: string;
  part_code: string | null;
  name: string | null;
  sale_price: number | string | null;
  quantity_on_hand: number | string | null;
  unit: string | null;
};

export type RepairJobItemRow = {
  id: string;
  title: string | null;
  description: string | null;
  labor_price: number | string | null;
  quantity: number | string | null;
  discount: number | string | null;
  total: number | string | null;
  part_id?: string | null;
  parts?: PartRow | null;
};

type ItemDraft = {
  title: string;
  description: string;
  labor_price: string;
  quantity: string;
  discount: string;
  part_id: string;
};

function partLabel(part: PartRow) {
  return `${part.part_code ?? "-"} ${part.name ?? ""} | เหลือ ${part.quantity_on_hand ?? 0} ${part.unit ?? ""}`;
}

function draftFromItem(item: RepairJobItemRow): ItemDraft {
  return {
    title: item.title ?? "",
    description: item.description ?? "",
    labor_price: String(item.labor_price ?? 0),
    quantity: String(item.quantity ?? 1),
    discount: String(item.discount ?? 0),
    part_id: item.part_id ?? "",
  };
}

function itemIsPart(item: RepairJobItemRow) {
  return Boolean(item.part_id);
}

export function RepairJobItemsManager({
  jobId,
  items,
  parts,
  role,
  totalItems,
}: {
  jobId: string;
  items: RepairJobItemRow[];
  parts: PartRow[];
  role: UserRole;
  totalItems: number;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [isPending, startTransition] = useTransition();
  const canEditLabor = operationRoles.includes(role);
  const canEditParts = financeRoles.includes(role);

  const partOptions = useMemo<FieldOption[]>(
    () =>
      parts.map((part) => ({
        label: partLabel(part),
        value: part.id,
        meta: {
          sale_price: toNumber(part.sale_price),
          unit: part.unit ?? "",
          quantity_on_hand: toNumber(part.quantity_on_hand),
        },
      })),
    [parts],
  );

  function beginEdit(item: RepairJobItemRow) {
    setEditingId(item.id);
    setDraft(draftFromItem(item));
  }

  function updateDraft(patch: Partial<ItemDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveItem(item: RepairJobItemRow) {
    if (!draft) return;
    const isPart = itemIsPart(item);
    if (isPart && !draft.part_id) {
      toast.error("กรุณาเลือกอะไหล่");
      return;
    }
    if (!isPart && !draft.title.trim()) {
      toast.error("กรุณาระบุชื่อรายการซ่อม");
      return;
    }

    startTransition(async () => {
      const result = await updateRepairJobItem(jobId, {
        item_id: item.id,
        title: isPart ? null : draft.title,
        description: draft.description,
        labor_price: toNumber(draft.labor_price),
        quantity: toNumber(draft.quantity),
        discount: toNumber(draft.discount),
        part_id: isPart ? draft.part_id : null,
      });

      if (result.ok) {
        toast.success(result.message);
        cancelEdit();
      } else {
        toast.error(result.error ?? "แก้ไขรายการไม่สำเร็จ");
      }
    });
  }

  function removeItem(item: RepairJobItemRow) {
    const isPart = itemIsPart(item);
    const allowed = isPart ? canEditParts : canEditLabor;
    if (!allowed) return;
    const confirmed = window.confirm(
      isPart
        ? "ยืนยันลบรายการอะไหล่นี้? ระบบจะคืนสต๊อกให้อัตโนมัติ"
        : "ยืนยันลบรายการซ่อมนี้?",
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteRepairJobItem(jobId, item.id);
      if (result.ok) {
        toast.success(result.message);
        if (editingId === item.id) cancelEdit();
      } else {
        toast.error(result.error ?? "ลบรายการไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h2 className="font-semibold">รายการซ่อมในงาน</h2>
          <p className="text-xs text-muted">แก้ไขรายการหรือคืนสต๊อกอะไหล่ได้จากตารางนี้</p>
        </div>
        <p className="text-sm font-semibold text-primary">{formatCurrency(totalItems)}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-surface-soft text-left text-muted">
            <tr>
              <th className="px-4 py-3">รายการ</th>
              <th className="px-4 py-3 text-right">ราคา/หน่วย</th>
              <th className="px-4 py-3 text-right">จำนวน</th>
              <th className="px-4 py-3 text-right">ส่วนลด</th>
              <th className="px-4 py-3 text-right">รวม</th>
              <th className="px-4 py-3 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isEditing = editingId === item.id && draft;
              const isPart = itemIsPart(item);
              const canEdit = isPart ? canEditParts : canEditLabor;

              return (
                <tr className="border-t border-border align-top" key={item.id}>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="space-y-2">
                        {isPart ? (
                          <SearchableSelect
                            className="h-11 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                            emptyText="ไม่พบอะไหล่"
                            onValueChange={(partId, option) => {
                              updateDraft({
                                part_id: partId,
                                labor_price: option?.meta?.sale_price ? String(option.meta.sale_price) : draft.labor_price,
                              });
                            }}
                            options={partOptions}
                            placeholder="พิมพ์รหัสอะไหล่หรือชื่ออะไหล่"
                            value={draft.part_id}
                          />
                        ) : (
                          <input
                            className={inputClass()}
                            value={draft.title}
                            onChange={(event) => updateDraft({ title: event.target.value })}
                            placeholder="ชื่อรายการซ่อม"
                          />
                        )}
                        <input
                          className={inputClass()}
                          value={draft.description}
                          onChange={(event) => updateDraft({ description: event.target.value })}
                          placeholder="รายละเอียดเพิ่มเติม"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="font-semibold">{item.title ?? "-"}</p>
                        <p className="text-xs text-muted">{item.description ?? "-"}</p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input
                        className={cn(inputClass(), "text-right")}
                        min="0"
                        step="0.01"
                        type="number"
                        value={draft.labor_price}
                        onChange={(event) => updateDraft({ labor_price: event.target.value })}
                      />
                    ) : (
                      formatCurrency(item.labor_price)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input
                        className={cn(inputClass(), "text-right")}
                        min="0.01"
                        step="0.01"
                        type="number"
                        value={draft.quantity}
                        onChange={(event) => updateDraft({ quantity: event.target.value })}
                      />
                    ) : (
                      item.quantity ?? "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input
                        className={cn(inputClass(), "text-right")}
                        min="0"
                        step="0.01"
                        type="number"
                        value={draft.discount}
                        onChange={(event) => updateDraft({ discount: event.target.value })}
                      />
                    ) : (
                      formatCurrency(item.discount)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.total)}</td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <div className="flex justify-end gap-1">
                        {isEditing ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-9 w-9 px-0"
                              disabled={isPending}
                              onClick={() => saveItem(item)}
                              title="บันทึก"
                            >
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-9 w-9 px-0"
                              disabled={isPending}
                              onClick={cancelEdit}
                              title="ยกเลิก"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-9 w-9 px-0"
                            disabled={isPending}
                            onClick={() => beginEdit(item)}
                            title="แก้ไข"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 w-9 px-0"
                          disabled={isPending}
                          onClick={() => removeItem(item)}
                          title="ลบ"
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    ) : (
                      <span className="block text-right text-xs text-muted">ไม่มีสิทธิ์</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!items.length ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted" colSpan={6}>
                  ยังไม่มีรายการซ่อมในงานนี้
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function inputClass() {
  return "h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary";
}
