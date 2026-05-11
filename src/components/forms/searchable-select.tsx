"use client";

import { Search, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { FieldOption } from "@/lib/types";
import { cn } from "@/lib/utils";

type SearchableSelectProps = {
  options: FieldOption[];
  value?: string | null;
  onValueChange: (value: string, option?: FieldOption) => void;
  onBlur?: () => void;
  placeholder?: string;
  containerClassName?: string;
  className?: string;
  emptyText?: string;
};

function optionMatches(option: FieldOption, query: string) {
  const search = query.trim().toLowerCase();
  if (!search) return true;
  return `${option.label} ${option.value}`.toLowerCase().includes(search);
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  onBlur,
  placeholder = "ค้นหาและเลือกข้อมูล",
  containerClassName,
  className,
  emptyText = "ไม่พบข้อมูล",
}: SearchableSelectProps) {
  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);
  const [query, setQuery] = useState(selectedOption?.label ?? "");
  const [open, setOpen] = useState(false);
  const listId = useId();

  const filteredOptions = useMemo(() => options.filter((option) => optionMatches(option, query)).slice(0, 30), [options, query]);

  function selectOption(option?: FieldOption) {
    onValueChange(option?.value ?? "", option);
    setQuery(option?.label ?? "");
    setOpen(false);
    onBlur?.();
  }

  return (
    <div className={cn("relative", containerClassName)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        className={cn(className, "w-full pl-9 pr-9")}
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
            onBlur?.();
          }, 100);
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setOpen(true);
          if (!nextQuery.trim()) onValueChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            selectOption(filteredOptions[0]);
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {value ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-soft hover:text-foreground"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectOption(undefined)}
          title="ล้างค่า"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
      {open ? (
        <div
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-white p-1 text-sm shadow-lg"
          id={listId}
          role="listbox"
        >
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                type="button"
                className={cn(
                  "block w-full rounded px-3 py-2 text-left hover:bg-surface-soft",
                  option.value === value && "bg-primary/10 font-semibold text-primary",
                )}
                key={option.value || option.label}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                {option.label}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-muted">{emptyText}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
