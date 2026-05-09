import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="w-full max-w-xl rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-soft text-primary">
          <SearchX className="h-7 w-7" />
        </div>
        <p className="mt-5 text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">ไม่พบหน้าที่ต้องการ</h1>
        <p className="mt-2 text-sm text-muted">ตรวจ URL อีกครั้ง หรือกลับไปหน้า Login เพื่อเข้าใช้งานระบบ</p>
        <ButtonLink className="mt-5" href="/login">
          ไปหน้า Login
        </ButtonLink>
      </section>
    </main>
  );
}
