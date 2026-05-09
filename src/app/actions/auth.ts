"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(6, "รหัสผ่านอย่างน้อย 6 ตัวอักษร"),
});

const registerSchema = loginSchema.extend({
  full_name: z.string().min(2, "กรุณากรอกชื่อ"),
});

export async function loginAction(_: unknown, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "ยังไม่ได้ตั้งค่า Supabase" };

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function registerAction(_: unknown, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "ยังไม่ได้ตั้งค่า Supabase" };

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const { email, password, full_name } = parsed.data;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name } },
  });

  if (error) return { error: error.message };

  redirect("/login?registered=1");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/login");
}
