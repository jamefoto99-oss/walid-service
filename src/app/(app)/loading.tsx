export default function AppLoading() {
  return (
    <div className="space-y-5">
      <div className="h-8 w-64 animate-pulse rounded-md bg-surface-soft" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm" key={index}>
            <div className="h-4 w-24 animate-pulse rounded bg-surface-soft" />
            <div className="mt-4 h-8 w-32 animate-pulse rounded bg-surface-soft" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="h-5 w-48 animate-pulse rounded bg-surface-soft" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="h-11 animate-pulse rounded-md bg-surface-soft" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
