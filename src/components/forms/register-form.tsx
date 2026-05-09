"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/actions/auth";
import { Button } from "../ui/button";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, null);

  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-semibold">ชื่อผู้ใช้</span>
        <input
          name="full_name"
          required
          className="mt-1 h-11 w-full rounded-md border border-border px-3 outline-none focus:border-primary"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">อีเมล</span>
        <input
          name="email"
          type="email"
          required
          className="mt-1 h-11 w-full rounded-md border border-border px-3 outline-none focus:border-primary"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">รหัสผ่าน</span>
        <input
          name="password"
          type="password"
          minLength={6}
          required
          className="mt-1 h-11 w-full rounded-md border border-border px-3 outline-none focus:border-primary"
        />
      </label>
      {state?.error ? <p className="rounded-md bg-red-50 p-3 text-sm text-danger">{state.error}</p> : null}
      <Button className="w-full" disabled={pending}>
        {pending ? "กำลังลงทะเบียน..." : "สร้างบัญชี"}
      </Button>
    </form>
  );
}
