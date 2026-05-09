import Link from "next/link";
import { RegisterForm } from "@/components/forms/register-form";
import { getSessionProfile } from "@/lib/auth";
import { SetupRequired } from "@/components/ui/setup-required";

export default async function RegisterPage() {
  const session = await getSessionProfile();
  if (session.setupRequired) return <SetupRequired />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-primary">สร้างบัญชีผู้ใช้</p>
        <h1 className="mt-2 text-2xl font-semibold">อู่วาลิดการช่าง</h1>
        <RegisterForm />
        <p className="mt-6 text-sm text-muted">
          มีบัญชีอยู่แล้ว?{" "}
          <Link className="font-semibold text-primary" href="/login">
            เข้าสู่ระบบ
          </Link>
        </p>
      </section>
    </main>
  );
}
