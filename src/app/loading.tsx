export default function RootLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="h-6 w-44 animate-pulse rounded bg-surface-soft" />
        <div className="mt-4 space-y-3">
          <div className="h-11 animate-pulse rounded-md bg-surface-soft" />
          <div className="h-11 animate-pulse rounded-md bg-surface-soft" />
          <div className="h-11 w-36 animate-pulse rounded-md bg-surface-soft" />
        </div>
      </section>
    </main>
  );
}
