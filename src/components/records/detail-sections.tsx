import type { ReactNode } from "react";

export function SummaryCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function DetailPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <div className="border-b border-border p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function InfoGrid({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div className="rounded-md bg-surface-soft p-3" key={row.label}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{row.label}</dt>
          <dd className="mt-1 text-sm font-medium">{row.value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailTable({
  title,
  rows,
  columns,
  empty,
}: {
  title: string;
  rows: Record<string, unknown>[];
  columns: { header: string; cell: (row: Record<string, unknown>) => ReactNode; className?: string }[];
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="border-b border-border p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-soft text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              {columns.map((column) => (
                <th className={column.className ?? "px-4 py-3 font-semibold"} key={column.header}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr className="border-t border-border" key={String(row.id)}>
                  {columns.map((column) => (
                    <td className={column.className ?? "px-4 py-3 align-top"} key={column.header}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-10 text-center text-muted" colSpan={columns.length}>
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
