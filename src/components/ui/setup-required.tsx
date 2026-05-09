export function SetupRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="w-full max-w-2xl rounded-lg border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm font-semibold text-primary">ต้องตั้งค่า Supabase ก่อนใช้งาน</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">อู่วาลิดการช่าง</h1>
        <p className="mt-4 text-muted">
          เพิ่มค่า `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` ใน `.env.local`
          แล้วรัน migration/seed จากโฟลเดอร์ `supabase` ระบบจะเชื่อมต่อฐานข้อมูลจริงทันที
        </p>
        <div className="mt-6 rounded-md bg-surface-soft p-4 font-mono text-sm text-foreground">
          cp .env.example .env.local
        </div>
      </section>
    </main>
  );
}
