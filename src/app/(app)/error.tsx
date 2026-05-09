"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function AppError({
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
    <section className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-red-50 p-3 text-danger">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-danger">เกิดข้อผิดพลาดในหน้านี้</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">โหลดข้อมูลไม่สำเร็จ</h1>
            <p className="mt-2 text-sm text-muted">
              ระบบยังทำงานอยู่ ลองโหลดข้อมูลใหม่อีกครั้ง ถ้ายังเกิดซ้ำให้ตรวจการเชื่อมต่อ Supabase และสิทธิ์ของผู้ใช้
            </p>
            {error.digest ? <p className="mt-3 font-mono text-xs text-muted">Digest: {error.digest}</p> : null}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => unstable_retry()} type="button">
                <RotateCcw className="h-4 w-4" />
                ลองใหม่
              </Button>
              <ButtonLink href="/dashboard" variant="secondary">
                กลับ Dashboard
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
