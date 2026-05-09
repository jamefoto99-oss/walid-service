import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { CompanySettingsForm } from "@/components/settings/company-settings-form";
import { SetupRequired } from "@/components/ui/setup-required";
import { canWrite, requireProfile } from "@/lib/auth";
import { getSettingsPageData } from "@/lib/data";

export default async function SettingsPage() {
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canWrite(session.profile.role, "settings")) redirect("/dashboard");

  const { settings, counters, logs, setupRequired } = await getSettingsPageData();
  if (setupRequired) return <SetupRequired />;

  return (
    <>
      <PageHeader
        title="ตั้งค่ากิจการ"
        description="ข้อมูลอู่ โลโก้ ข้อความท้ายเอกสาร Prefix และ Running Number"
      />
      <CompanySettingsForm settings={settings} counters={counters} logs={logs} />
    </>
  );
}
