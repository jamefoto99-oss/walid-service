import { PageHeader } from "@/components/app/page-header";
import { ReportsClient } from "@/components/dashboard/reports-client";
import { SetupRequired } from "@/components/ui/setup-required";
import { requireProfile } from "@/lib/auth";
import { getReportsData } from "@/lib/data";

export default async function ReportsPage() {
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) return null;

  const data = await getReportsData();
  if (data.setupRequired) return <SetupRequired />;

  return (
    <>
      <PageHeader
        title="รายงานบัญชี"
        description="รายรับ รายจ่าย กำไรขาดทุน ลูกหนี้ เจ้าหนี้ สต๊อก และสถานะงานซ่อม"
      />
      <ReportsClient data={data} />
    </>
  );
}
