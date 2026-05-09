import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <section className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-soft text-primary">
          <SearchX className="h-7 w-7" />
        </div>
        <p className="mt-5 text-sm font-semibold text-primary">ไม่พบหน้าหรือข้อมูลที่ต้องการ</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">รายการนี้อาจถูกลบหรือไม่มีสิทธิ์เข้าถึง</h1>
        <p className="mt-2 text-sm text-muted">กลับไปที่ Dashboard แล้วเลือกเมนูที่ต้องการอีกครั้ง</p>
        <ButtonLink className="mt-5" href="/dashboard">
          กลับ Dashboard
        </ButtonLink>
      </div>
    </section>
  );
}
