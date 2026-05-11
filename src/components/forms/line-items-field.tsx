"use client";

import { Plus, Trash2 } from "lucide-react";
import { unitOptions } from "@/lib/constants";
import type { FieldOption, LineItemInput } from "@/lib/types";
import { cn, formatCurrency, toNumber } from "@/lib/utils";
import { SearchableSelect } from "./searchable-select";
import { Button } from "../ui/button";

const defaultUnit = "ชิ้น";

const blankItem: LineItemInput = {
  item_type: "labor",
  description: "",
  quantity: 1,
  unit: defaultUnit,
  unit_price: 0,
  discount: 0,
};

const inputClass =
  "mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary";

function itemTotal(item: LineItemInput) {
  return Math.max(toNumber(item.quantity) * toNumber(item.unit_price) - toNumber(item.discount), 0);
}

export function LineItemsField({
  items,
  onChange,
  partOptions,
}: {
  items: LineItemInput[];
  onChange: (items: LineItemInput[]) => void;
  partOptions: FieldOption[];
}) {
  const unitListId = "line-item-unit-options";

  function update(index: number, patch: Partial<LineItemInput>) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function selectPart(index: number, partId: string, label?: string) {
    const part = partOptions.find((option) => option.value === partId);
    const currentItem = items[index];
    update(index, {
      part_id: partId || null,
      description: currentItem.description || (partId ? label || part?.label || "" : ""),
      unit: String(partId ? part?.meta?.unit ?? currentItem.unit ?? defaultUnit : currentItem.unit ?? defaultUnit),
    });
  }

  function remove(index: number) {
    onChange(items.length <= 1 ? [{ ...blankItem }] : items.filter((_, itemIndex) => itemIndex !== index));
  }

  const subtotal = items.reduce((sum, item) => sum + itemTotal(item), 0);

  return (
    <section className="space-y-4 rounded-md border border-border bg-surface-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">รายการค่าแรง / อะไหล่</p>
          <p className="text-xs text-muted">พิมพ์รายละเอียดเองได้ หรือค้นหาอะไหล่จากสต๊อกเพื่อดึงหน่วยนับมาเติมอัตโนมัติ</p>
        </div>
        <Button type="button" variant="secondary" className="h-10" onClick={() => onChange([...items, { ...blankItem }])}>
          <Plus className="h-4 w-4" />
          เพิ่มรายการ
        </Button>
      </div>

      <datalist id={unitListId}>
        {unitOptions.map((option) => (
          <option key={option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </datalist>

      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={index} className="space-y-3 rounded-md border border-border bg-surface p-4">
            <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
              <label>
                <span className="text-xs font-semibold text-muted">ประเภทรายการ</span>
                <select
                  className={inputClass}
                  value={item.item_type}
                  onChange={(event) => update(index, { item_type: event.target.value as LineItemInput["item_type"] })}
                >
                  <option value="labor">ค่าแรง</option>
                  <option value="part">อะไหล่</option>
                  <option value="other">อื่น ๆ</option>
                </select>
              </label>

              <label>
                <span className="text-xs font-semibold text-muted">รายละเอียดรายการที่จะแสดงในเอกสาร</span>
                <input
                  className={inputClass}
                  placeholder="เช่น เปลี่ยนคลัทช์, น้ำมันเครื่อง, ตรวจเช็กระบบเบรก"
                  value={item.description}
                  onChange={(event) => update(index, { description: event.target.value })}
                />
              </label>
            </div>

            {item.item_type === "part" ? (
              <label className="block">
                <span className="text-xs font-semibold text-muted">ค้นหาอะไหล่ในสต๊อก</span>
                <SearchableSelect
                  className="h-11 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                  containerClassName="mt-1"
                  emptyText="ไม่พบอะไหล่"
                  onValueChange={(partId, option) => selectPart(index, partId, option?.label)}
                  options={partOptions}
                  placeholder="พิมพ์รหัสอะไหล่หรือชื่ออะไหล่"
                  value={item.part_id ?? ""}
                />
              </label>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[120px_140px_160px_160px_1fr_44px]">
              <label>
                <span className="text-xs font-semibold text-muted">จำนวน</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.quantity}
                  onChange={(event) => update(index, { quantity: toNumber(event.target.value) })}
                />
              </label>

              <label>
                <span className="text-xs font-semibold text-muted">หน่วยนับ</span>
                <input
                  className={inputClass}
                  list={unitListId}
                  placeholder="ชิ้น, ชุด, คู่ หรือพิมพ์เอง"
                  value={item.unit ?? defaultUnit}
                  onChange={(event) => update(index, { unit: event.target.value })}
                />
              </label>

              <label>
                <span className="text-xs font-semibold text-muted">ราคาต่อหน่วย</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unit_price}
                  onChange={(event) => update(index, { unit_price: toNumber(event.target.value) })}
                />
              </label>

              <label>
                <span className="text-xs font-semibold text-muted">ส่วนลดรายการ</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.discount}
                  onChange={(event) => update(index, { discount: toNumber(event.target.value) })}
                />
              </label>

              <div>
                <span className="text-xs font-semibold text-muted">รวมรายการ</span>
                <div className="mt-1 flex h-11 items-center rounded-md border border-border bg-surface-soft px-3 text-sm font-semibold">
                  {formatCurrency(itemTotal(item))}
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                className={cn("mt-5 h-11 px-0", items.length <= 1 && "opacity-70")}
                onClick={() => remove(index)}
                title="ลบรายการ"
              >
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end text-sm font-semibold">
        รวมก่อนส่วนลดเอกสาร: {formatCurrency(subtotal)}
      </div>
    </section>
  );
}
