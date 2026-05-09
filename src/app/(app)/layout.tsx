import type { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { SetupRequired } from "@/components/ui/setup-required";
import { requireProfile } from "@/lib/auth";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) return null;
  return <AppShell profile={session.profile}>{children}</AppShell>;
}
