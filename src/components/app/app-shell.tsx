import type { ReactNode } from "react";
import { getPendingApprovalCount } from "@/lib/approvals";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { Toaster } from "../ui/toaster";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export async function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const [unreadNotificationCount, pendingApprovalCount] = supabase
    ? await Promise.all([getUnreadNotificationCount(supabase, profile), getPendingApprovalCount(supabase, profile)])
    : [0, 0];

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        role={profile.role}
        unreadNotificationCount={unreadNotificationCount}
        pendingApprovalCount={pendingApprovalCount}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          profile={profile}
          unreadNotificationCount={unreadNotificationCount}
          pendingApprovalCount={pendingApprovalCount}
        />
        <MobileNav
          role={profile.role}
          unreadNotificationCount={unreadNotificationCount}
          pendingApprovalCount={pendingApprovalCount}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
