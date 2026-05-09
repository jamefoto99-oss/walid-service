import { redirect } from "next/navigation";
import { ActivityLogsClient } from "@/components/activity-logs/activity-logs-client";
import { PageHeader } from "@/components/app/page-header";
import { SetupRequired } from "@/components/ui/setup-required";
import { financeRoles } from "@/lib/constants";
import { requireProfile } from "@/lib/auth";
import { getActivityLogPageData } from "@/lib/data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function ActivityLogsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!financeRoles.includes(session.profile.role)) redirect("/dashboard");

  const params = await searchParams;
  const filters = {
    from: param(params, "from"),
    to: param(params, "to"),
    table: param(params, "table"),
    actor: param(params, "actor"),
    action: param(params, "action"),
  };

  const data = await getActivityLogPageData(filters);
  if (data.setupRequired) return <SetupRequired />;

  return (
    <>
      <PageHeader
        title="Activity Log"
        description="ตรวจย้อนหลังการสร้าง แก้ไข ลบ อัปเดตสถานะ เอกสาร การรับชำระเงิน และการตั้งค่าระบบ"
      />
      <ActivityLogsClient
        actions={data.actions}
        actors={data.actors}
        filters={filters}
        logs={data.logs}
        tableNames={data.tableNames}
      />
    </>
  );
}
