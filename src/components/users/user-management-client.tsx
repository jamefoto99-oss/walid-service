"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailPlus, Save, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { inviteUser, updateUserProfile } from "@/app/actions/users";
import { allRoles, modules, roleLabels } from "@/lib/constants";
import type { UserRole } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

type Row = Record<string, unknown>;

type UserManagementClientProps = {
  profiles: Row[];
  logs: Row[];
  currentUserId: string;
  serviceRoleConfigured: boolean;
};

type DraftUser = {
  full_name: string;
  role: UserRole;
  is_active: boolean;
};

const inviteFormSchema = z.object({
  email: z.string().trim().email("อีเมลไม่ถูกต้อง"),
  full_name: z.string().trim().min(2, "กรุณากรอกชื่อผู้ใช้"),
  role: z.enum(["owner", "manager", "staff", "accountant"]).default("staff"),
});

type InviteFormInput = z.input<typeof inviteFormSchema>;
type InviteFormValues = z.output<typeof inviteFormSchema>;

const roleDescriptions: Record<UserRole, string> = {
  owner: "ควบคุมระบบทั้งหมด ตั้งค่า และจัดการผู้ใช้",
  manager: "จัดการงานซ่อม เอกสาร และดูรายงานหลัก",
  staff: "เพิ่มลูกค้า รถ เปิดงานซ่อม และอัปเดตสถานะ",
  accountant: "จัดการบัญชี เอกสาร รายรับรายจ่าย และรายงาน",
};

function text(value: unknown) {
  return String(value ?? "-");
}

function logActor(row: Row) {
  const profile = row.profiles;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return text(row.actor_id);
  const profileRow = profile as Row;
  return text(profileRow.full_name ?? profileRow.email);
}

function createDraft(row: Row): DraftUser {
  return {
    full_name: text(row.full_name),
    role: text(row.role) as UserRole,
    is_active: Boolean(row.is_active),
  };
}

export function UserManagementClient({
  profiles,
  logs,
  currentUserId,
  serviceRoleConfigured,
}: UserManagementClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftUser>>(() =>
    Object.fromEntries(profiles.map((profile) => [String(profile.id), createDraft(profile)])),
  );

  const inviteForm = useForm<InviteFormInput, unknown, InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      full_name: "",
      role: "staff",
    },
  });

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => JSON.stringify(profile).toLowerCase().includes(query.trim().toLowerCase()));
  }, [profiles, query]);

  const totals = {
    all: profiles.length,
    active: profiles.filter((profile) => profile.is_active).length,
    inactive: profiles.filter((profile) => !profile.is_active).length,
    owners: profiles.filter((profile) => profile.role === "owner" && profile.is_active).length,
  };

  function updateDraft(id: string, patch: Partial<DraftUser>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? { full_name: "", role: "staff", is_active: true }),
        ...patch,
      },
    }));
  }

  function saveUser(profile: Row) {
    const id = String(profile.id);
    const draft = drafts[id] ?? createDraft(profile);
    startTransition(async () => {
      const result = await updateUserProfile({ id, ...draft });
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error ?? "อัปเดตผู้ใช้ไม่สำเร็จ");
      }
    });
  }

  function submitInvite(values: InviteFormValues) {
    startTransition(async () => {
      const result = await inviteUser(values);
      if (result.ok) {
        toast.success(result.message);
        inviteForm.reset({ email: "", full_name: "", role: "staff" });
        router.refresh();
      } else {
        toast.error(result.error ?? "เชิญผู้ใช้ไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="ผู้ใช้ทั้งหมด" value={`${totals.all} คน`} />
        <SummaryCard label="ใช้งานอยู่" value={`${totals.active} คน`} icon="active" />
        <SummaryCard label="ปิดใช้งาน" value={`${totals.inactive} คน`} icon="inactive" />
        <SummaryCard label="Owner ที่ใช้งานอยู่" value={`${totals.owners} คน`} icon="owner" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <form
          className="rounded-lg border border-border bg-surface p-4 shadow-sm"
          onSubmit={inviteForm.handleSubmit(submitInvite)}
        >
          <div className="mb-4 flex items-center gap-2">
            <MailPlus className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">เชิญผู้ใช้ใหม่</h2>
          </div>
          {!serviceRoleConfigured ? (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              ต้องตั้งค่า `SUPABASE_SERVICE_ROLE_KEY` ใน Environment Variables ก่อนจึงจะส่งคำเชิญผ่าน Supabase Auth ได้
            </div>
          ) : null}

          <div className="space-y-4">
            <label>
              <span className="text-sm font-semibold">ชื่อผู้ใช้ *</span>
              <input className={inputClass()} {...inviteForm.register("full_name")} />
              <FieldError message={inviteForm.formState.errors.full_name?.message} />
            </label>
            <label>
              <span className="text-sm font-semibold">อีเมล *</span>
              <input className={inputClass()} type="email" {...inviteForm.register("email")} />
              <FieldError message={inviteForm.formState.errors.email?.message} />
            </label>
            <label>
              <span className="text-sm font-semibold">Role *</span>
              <select className={inputClass()} {...inviteForm.register("role")}>
                {allRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Button className="mt-5 w-full" disabled={isPending || !serviceRoleConfigured} type="submit">
            <MailPlus className="h-4 w-4" />
            {isPending ? "กำลังส่งคำเชิญ..." : "ส่งคำเชิญ"}
          </Button>
        </form>

        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Permission Matrix</h2>
              <p className="text-sm text-muted">อ่าน / เขียน / ลบ แยกตาม role และ module</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-surface-soft text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3 font-semibold">Module</th>
                  {allRoles.map((role) => (
                    <th className="px-3 py-3 font-semibold" key={role}>
                      {roleLabels[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.values(modules).map((module) => (
                  <tr className="border-t border-border" key={module.key}>
                    <td className="px-3 py-3 font-semibold">{module.title}</td>
                    {allRoles.map((role) => (
                      <td className="px-3 py-3" key={`${module.key}-${role}`}>
                        <PermissionBadges
                          read={module.policy.read.includes(role)}
                          write={module.policy.write.includes(role)}
                          remove={module.policy.delete.includes(role)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold">ผู้ใช้ในระบบ</h2>
            <p className="text-sm text-muted">แก้ชื่อ Role และสถานะใช้งานของผู้ใช้</p>
          </div>
          <label className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
            <input
              className="h-11 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-primary"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาชื่อ อีเมล หรือ role"
              value={query}
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-surface-soft text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">ผู้ใช้</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">สถานะ</th>
                <th className="px-4 py-3 font-semibold">อัปเดตล่าสุด</th>
                <th className="px-4 py-3 text-right font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((profile) => {
                const id = String(profile.id);
                const draft = drafts[id] ?? createDraft(profile);
                const isSelf = id === currentUserId;
                const changed =
                  draft.full_name !== text(profile.full_name) ||
                  draft.role !== profile.role ||
                  draft.is_active !== Boolean(profile.is_active);

                return (
                  <tr className="border-t border-border" key={id}>
                    <td className="px-4 py-3 align-top">
                      <input
                        className={inputClass("font-semibold")}
                        onChange={(event) => updateDraft(id, { full_name: event.target.value })}
                        value={draft.full_name}
                      />
                      <p className="mt-1 text-xs text-muted">{text(profile.email)}</p>
                      {isSelf ? <p className="mt-1 text-xs font-semibold text-primary">บัญชีของคุณ</p> : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <select
                        className={inputClass()}
                        onChange={(event) => updateDraft(id, { role: event.target.value as UserRole })}
                        value={draft.role}
                      >
                        {allRoles.map((role) => (
                          <option key={role} value={role}>
                            {roleLabels[role]}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-muted">{roleDescriptions[draft.role]}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <label className="flex items-center gap-2">
                        <input
                          checked={draft.is_active}
                          className="h-4 w-4 accent-primary"
                          disabled={isSelf && draft.is_active}
                          onChange={(event) => updateDraft(id, { is_active: event.target.checked })}
                          type="checkbox"
                        />
                        <Badge value={draft.is_active ? "active" : "inactive"} />
                      </label>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p>{formatDate(profile.updated_at)}</p>
                      <p className="text-xs text-muted">สร้าง {formatDate(profile.created_at)}</p>
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <Button className="h-9" disabled={isPending || !changed} onClick={() => saveUser(profile)} type="button">
                        <Save className="h-4 w-4" />
                        บันทึก
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!filteredProfiles.length ? (
                <tr>
                  <td className="px-4 py-12 text-center text-muted" colSpan={5}>
                    ไม่พบผู้ใช้ที่ค้นหา
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-4 font-semibold">Activity Log ผู้ใช้</h2>
        <div className="grid gap-3 xl:grid-cols-2">
          {logs.map((log) => (
            <div className="rounded-md border border-border p-3" key={text(log.id)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{text(log.action)}</p>
                  <p className="text-sm text-muted">{logActor(log)}</p>
                </div>
                <p className="text-xs text-muted">{formatDate(log.created_at)}</p>
              </div>
              <p className="mt-2 break-all rounded-md bg-surface-soft p-2 text-xs text-muted">
                {JSON.stringify(log.metadata ?? {})}
              </p>
            </div>
          ))}
          {!logs.length ? <p className="rounded-md bg-surface-soft p-4 text-sm text-muted">ยังไม่มี Activity Log ผู้ใช้</p> : null}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon?: "active" | "inactive" | "owner" }) {
  const Icon = icon === "inactive" ? UserX : icon === "active" || icon === "owner" ? UserCheck : ShieldCheck;
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function PermissionBadges({ read, write, remove }: { read: boolean; write: boolean; remove: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {read ? <MiniBadge label="อ่าน" tone="read" /> : null}
      {write ? <MiniBadge label="เขียน" tone="write" /> : null}
      {remove ? <MiniBadge label="ลบ" tone="delete" /> : null}
      {!read && !write && !remove ? <span className="text-xs text-muted">-</span> : null}
    </div>
  );
}

function MiniBadge({ label, tone }: { label: string; tone: "read" | "write" | "delete" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
        tone === "read" && "border-sky-200 bg-sky-50 text-sky-700",
        tone === "write" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "delete" && "border-red-200 bg-red-50 text-red-700",
      )}
    >
      {label}
    </span>
  );
}

function inputClass(extra?: string) {
  return cn("h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary", extra);
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-sm text-danger">{message}</p> : null;
}
