"use client";

import { Plus, Trash2 } from "lucide-react";
import { unitOptions } from "@/lib/constants";
import type { FieldOption, LineItemInput } from "@/lib/types";
import { cn, formatCurrency, toNumber } from "@/lib/utils";
import { SearchableSelect } from "./searchable-select";
import { Button } from "../ui/button";

const defaultUnit = "ชิ้น";

function blankItem(itemType: LineItemInput["item_type"] = "labor"): LineItemInput {
  return {
    item_type: itemType,
    description: "",
    quantity: 1,
    unit: defaultUnit,
    unit_price: 0,
    discount: 0,
  };
}

const inputClass =
  "mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary";

const itemTypeOptions: Array<{ label: string; value: LineItemInput["item_type"] }> = [
  { label: "ค่าแรง", value: "labor" },
  { label: "อะไหล่", value: "part" },
  { label: "อื่น ๆ", value: "other" },
];

function itemTotal(item: LineItemInput) {
  return Math.max(toNumber(item.quantity) * toNumber(item.unit_price) - toNumber(item.discount), 0);
}

export function LineItemsField({
  items,
  onChange,
  partOptions,
  defaultItemType = "labor",
  allowedItemTypes,
}: {
  items: LineItemInput[];
  onChange: (items: LineItemInput[]) => void;
  partOptions: FieldOption[];
  defaultItemType?: LineItemInput["item_type"];
  allowedItemTypes?: LineItemInput["item_type"][];
}) {
  const unitListId = "line-item-unit-options";
  const visibleItemTypes = itemTypeOptions.filter((option) => !allowedItemTypes || allowedItemTypes.includes(option.value));
  const effectiveDefaultItemType = visibleItemTypes.some((option) => option.value === defaultItemType)
    ? defaultItemType
    : visibleItemTypes[0]?.value ?? defaultItemType;

  function update(index: number, patch: Partial<LineItemInput>) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function selectPart(index: number, partId: string, label?: string) {
    const part = partOptions.find((option) => option.value === partId);
    update(index, {
      item_type: "part",
      part_id: partId || null,
      description: partId ? String(part?.meta?.name ?? label ?? part?.label ?? "") : items[index]?.description ?? "",
      unit: String(partId ? part?.meta?.unit ?? defaultUnit : items[index]?.unit ?? defaultUnit),
      unit_price: partId ? toNumber(part?.meta?.sale_price) : items[index]?.unit_price ?? 0,
    });
  }

  function remove(index: number) {
    onChange(items.length <= 1 ? [blankItem(effectiveDefaultItemType)] : items.filter((_, itemIndex) => itemIndex !== index));
  }

  function addItem() {
    onChange([...items, blankItem(effectiveDefaultItemType)]);
  }

  const subtotal = items.reduce((sum, item) => sum + itemTotal(item), 0);

  return (
    <section className="space-y-4 rounded-md border border-border bg-surface-soft p-4">
      <div>
        <div>
          <p className="text-sm font-semibold">รายการค่าแรง / อะไหล่</p>
          <p className="text-xs text-muted">พิมพ์รายละเอียดเองได้ หรือค้นหาอะไหล่จากสต๊อกเพื่อดึงหน่วยนับมาเติมอัตโนมัติ</p>
        </div>
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
                  value={visibleItemTypes.some((option) => option.value === item.item_type) ? item.item_type : effectiveDefaultItemType}
                  onChange={(event) => update(index, { item_type: event.target.value as LineItemInput["item_type"] })}
                >
                  {visibleItemTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
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

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="secondary" className="h-11 sm:w-auto" onClick={addItem}>
          <Plus className="h-4 w-4" />
          เพิ่มรายการ
        </Button>
        <div className="text-right text-sm font-semibold">
          รวมก่อนส่วนลดเอกสาร: {formatCurrency(subtotal)}
        </div>
      </div>
    </section>
  );
}
