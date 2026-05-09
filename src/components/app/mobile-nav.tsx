"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useState } from "react";
import { menuItems } from "@/lib/constants";
import type { UserRole } from "@/lib/types";
import { Button } from "../ui/button";

export function MobileNav({
  role,
  unreadNotificationCount = 0,
  pendingApprovalCount = 0,
}: {
  role: UserRole;
  unreadNotificationCount?: number;
  pendingApprovalCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const items = menuItems.filter((item) => item.roles.includes(role));

  return (
    <div className="border-b border-border bg-surface p-3 lg:hidden">
      <Button variant="secondary" className="w-full justify-between" onClick={() => setOpen((value) => !value)}>
        เมนูหลัก
        <Menu className="h-4 w-4" />
      </Button>
      {open ? (
        <nav className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-soft px-3 py-3 text-sm font-semibold"
              onClick={() => setOpen(false)}
            >
              <span>{item.label}</span>
              {item.href === "/notifications" && unreadNotificationCount > 0 ? (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                  {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                </span>
              ) : null}
              {item.href === "/approvals" && pendingApprovalCount > 0 ? (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  {pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
