"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeDollarSign,
  BarChart3,
  Bell,
  Car,
  ClipboardCheck,
  ClipboardList,
  DatabaseBackup,
  FileText,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import { menuItems } from "@/lib/constants";
import type { UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const icons = {
  LayoutDashboard,
  Bell,
  ClipboardCheck,
  Users,
  Car,
  Wrench,
  Package,
  Truck,
  FileText,
  ReceiptText,
  BadgeDollarSign,
  WalletCards,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ClipboardList,
  DatabaseBackup,
  Settings,
  ShieldCheck,
};

export function Sidebar({
  role,
  unreadNotificationCount = 0,
  pendingApprovalCount = 0,
}: {
  role: UserRole;
  unreadNotificationCount?: number;
  pendingApprovalCount?: number;
}) {
  const pathname = usePathname();
  const allowedItems = menuItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="hidden w-72 shrink-0 border-r border-border bg-[#242820] text-white lg:block">
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <div>
          <p className="text-lg font-bold">อู่วาลิดการช่าง</p>
          <p className="text-xs text-white/60">Garage ERP</p>
        </div>
      </div>
      <nav className="space-y-1 p-3">
        {allowedItems.map((item) => {
          const Icon = icons[item.icon as keyof typeof icons];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white",
                active && "bg-white text-[#242820] hover:bg-white hover:text-[#242820]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{item.label}</span>
              {item.href === "/notifications" && unreadNotificationCount > 0 ? (
                <span
                  className={cn(
                    "inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold",
                    active ? "bg-danger text-white" : "bg-red-500 text-white",
                  )}
                >
                  {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                </span>
              ) : null}
              {item.href === "/approvals" && pendingApprovalCount > 0 ? (
                <span
                  className={cn(
                    "inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold",
                    active ? "bg-amber-600 text-white" : "bg-amber-500 text-white",
                  )}
                >
                  {pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
