import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { UserManagementClient } from "@/components/users/user-management-client";
import { SetupRequired } from "@/components/ui/setup-required";
import { canWrite, requireProfile } from "@/lib/auth";
import { getUsersPageData } from "@/lib/data";

export default async function UsersPage() {
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canWrite(session.profile.role, "users")) redirect("/dashboard");

  const data = await getUsersPageData();
  if (data.setupRequired) return <SetupRequired />;

  return (
    <>
      <PageHeader
        title="จัดการผู้ใช้"
        description="กำหนดสิทธิ์ผู้ใช้ เชิญทีมงานใหม่ ตรวจ Permission Matrix และติดตาม Activity Log"
      />
      <UserManagementClient
        currentUserId={session.profile.id}
        logs={data.logs}
        profiles={data.profiles}
        serviceRoleConfigured={data.serviceRoleConfigured}
      />
    </>
  );
}
