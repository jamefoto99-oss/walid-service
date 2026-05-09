import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/forms/login-form";
import { getSessionProfile } from "@/lib/auth";
import { SetupRequired } from "@/components/ui/setup-required";

export default async function LoginPage() {
  const session = await getSessionProfile();
  if (session.setupRequired) return <SetupRequired />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-surface shadow-sm lg:grid-cols-[1fr_420px]">
        <div className="hidden bg-[#242820] p-10 text-white lg:block">
          <p className="text-sm font-semibold text-white/65">Garage ERP</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">อู่วาลิดการช่าง</h1>
          <p className="mt-4 max-w-md text-white/70">
            ระบบเดียวสำหรับรับรถ เปิดงานซ่อม เสนอราคา วางบิล รับชำระ และดูรายงานกำไรขาดทุน
          </p>
          <div className="mt-10 grid gap-3 text-sm text-white/80">
            <span>• Supabase Auth + Row Level Security</span>
            <span>• เอกสาร PDF ภาษาไทย</span>
            <span>• รายรับ รายจ่าย ลูกหนี้ เจ้าหนี้ และสต๊อก</span>
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <p className="text-sm font-semibold text-primary">เข้าสู่ระบบ</p>
          <h2 className="mt-2 text-2xl font-semibold">ยินดีต้อนรับกลับ</h2>
          <Suspense>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-sm text-muted">
            ยังไม่มีบัญชี?{" "}
            <Link className="font-semibold text-primary" href="/register">
              ลงทะเบียน
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
