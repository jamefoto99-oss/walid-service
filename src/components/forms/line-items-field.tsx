"use client";

import { Plus, Trash2 } from "lucide-react";
import { unitOptions } from "@/lib/constants";
import type { FieldOption, LineItemInput } from "@/lib/types";
import { formatCurrency, toNumber } from "@/lib/utils";
import { SearchableSelect } from "./searchable-select";
import { Button } from "../ui/button";

const blankItem: LineItemInput = {
  item_type: "labor",
  description: "",
  quantity: 1,
  unit: "ชิ้น",
  unit_price: 0,
  discount: 0,
};

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
      unit: String(partId ? part?.meta?.unit ?? currentItem.unit ?? "ชิ้น" : currentItem.unit ?? "ชิ้น"),
    });
  }

  function remove(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  const subtotal = items.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unit_price) - toNumber(item.discount), 0);

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-soft p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">รายการค่าแรง / อะไหล่</p>
        <Button
          type="button"
          variant="secondary"
          className="h-9"
          onClick={() => onChange([...items, { ...blankItem }])}
        >
          <Plus className="h-4 w-4" />
          เพิ่มรายการ
        </Button>
      </div>

      <div className="space-y-3">
        <datalist id={unitListId}>
          {unitOptions.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </datalist>
        {items.map((item, index) => (
          <div key={index} className="grid gap-2 rounded-md border border-border bg-surface p-3 md:grid-cols-12">
            <select
              className="h-10 rounded-md border border-border bg-white px-3 text-sm md:col-span-2"
              value={item.item_type}
              onChange={(event) => update(index, { item_type: event.target.value as LineItemInput["item_type"] })}
            >
              <option value="labor">ค่าแรง</option>
              <option value="part">อะไหล่</option>
              <option value="other">อื่น ๆ</option>
            </select>
            <input
              className="h-10 rounded-md border border-border bg-white px-3 text-sm md:col-span-3"
              placeholder="รายละเอียด"
              value={item.description}
              onChange={(event) => update(index, { description: event.target.value })}
            />
            {item.item_type === "part" ? (
              <div className="md:col-span-2">
                <SearchableSelect
                  className="h-10 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                  emptyText="ไม่พบอะไหล่"
                  onValueChange={(partId, option) => selectPart(index, partId, option?.label)}
                  options={partOptions}
                  placeholder="ค้นหาอะไหล่"
                  value={item.part_id ?? ""}
                />
              </div>
            ) : (
              <div className="hidden md:col-span-2 md:block" />
            )}
            <input
              className="h-10 rounded-md border border-border bg-white px-3 text-sm md:col-span-1"
              type="number"
              min="0"
              step="0.01"
              value={item.quantity}
              onChange={(event) => update(index, { quantity: toNumber(event.target.value) })}
            />
            <input
              className="h-10 rounded-md border border-border bg-white px-3 text-sm md:col-span-1"
              list={unitListId}
              placeholder="หน่วย"
              value={item.unit ?? "ชิ้น"}
              onChange={(event) => update(index, { unit: event.target.value })}
            />
            <input
              className="h-10 rounded-md border border-border bg-white px-3 text-sm md:col-span-1"
              type="number"
              min="0"
              step="0.01"
              value={item.unit_price}
              onChange={(event) => update(index, { unit_price: toNumber(event.target.value) })}
            />
            <input
              className="h-10 rounded-md border border-border bg-white px-3 text-sm md:col-span-1"
              type="number"
              min="0"
              step="0.01"
              value={item.discount}
              onChange={(event) => update(index, { discount: toNumber(event.target.value) })}
            />
            <Button type="button" variant="ghost" className="h-10 px-0 md:col-span-1" onClick={() => remove(index)}>
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex justify-end text-sm font-semibold">
        รวมก่อนส่วนลดเอกสาร: {formatCurrency(subtotal)}
      </div>
    </div>
  );
}
