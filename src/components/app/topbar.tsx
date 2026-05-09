import Link from "next/link";
import { Bell, ClipboardCheck, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { roleLabels } from "@/lib/constants";
import type { Profile } from "@/lib/types";
import { initials } from "@/lib/utils";
import { Button } from "../ui/button";

export function Topbar({
  profile,
  unreadNotificationCount = 0,
  pendingApprovalCount = 0,
}: {
  profile: Profile;
  unreadNotificationCount?: number;
  pendingApprovalCount?: number;
}) {
  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur md:px-6">
      <div>
        <p className="text-sm font-semibold text-muted">อู่วาลิดการช่าง</p>
        <p className="text-xs text-muted">ระบบบริหารงานซ่อมและเอกสารบัญชี</p>
      </div>
      <div className="flex items-center gap-3">
        {["owner", "manager"].includes(profile.role) ? (
          <Link
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-foreground transition hover:bg-surface-soft"
            href="/approvals"
            title="Approvals"
          >
            <ClipboardCheck className="h-4 w-4" />
            {pendingApprovalCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                {pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}
              </span>
            ) : null}
          </Link>
        ) : null}
        <Link
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-foreground transition hover:bg-surface-soft"
          href="/notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadNotificationCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
              {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
            </span>
          ) : null}
        </Link>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold">{profile.full_name ?? profile.email}</p>
          <p className="text-xs text-muted">{roleLabels[profile.role]}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-sm font-bold text-white">
          {initials(profile.full_name ?? profile.email)}
        </div>
        <form action={logoutAction}>
          <Button variant="ghost" className="h-10 w-10 px-0" title="Logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
