import { cn } from "@/lib/utils";

const statusTone: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unpaid: "bg-amber-50 text-amber-700 border-amber-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  waiting_parts: "bg-orange-50 text-orange-700 border-orange-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-zinc-100 text-zinc-600 border-zinc-200",
  owner: "bg-teal-50 text-teal-700 border-teal-200",
  manager: "bg-sky-50 text-sky-700 border-sky-200",
  accountant: "bg-amber-50 text-amber-700 border-amber-200",
  staff: "bg-zinc-50 text-zinc-700 border-zinc-200",
};

export function Badge({ value }: { value: unknown }) {
  const text = String(value ?? "-");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusTone[text] ?? "border-border bg-surface-soft text-foreground",
      )}
    >
      {text}
    </span>
  );
}
