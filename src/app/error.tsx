"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="w-full max-w-xl rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-red-50 p-3 text-danger">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-danger">ระบบพบข้อผิดพลาด</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">เปิดหน้านี้ไม่สำเร็จ</h1>
            <p className="mt-2 text-sm text-muted">ลองโหลดใหม่ หรือกลับไปที่หน้าเข้าสู่ระบบเพื่อเริ่ม session อีกครั้ง</p>
            {error.digest ? <p className="mt-3 font-mono text-xs text-muted">Digest: {error.digest}</p> : null}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => unstable_retry()} type="button">
                <RotateCcw className="h-4 w-4" />
                ลองใหม่
              </Button>
              <ButtonLink href="/login" variant="secondary">
                ไปหน้า Login
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
