import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { BillingStatementManager } from "@/components/billing-statements/billing-statement-manager";
import { SetupRequired } from "@/components/ui/setup-required";
import { canRead, requireProfile } from "@/lib/auth";
import { getBillingStatementsPageData } from "@/lib/data";

export default async function BillingStatementsPage() {
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, "billing-statements")) redirect("/dashboard");

  const data = await getBillingStatementsPageData();
  if (data.setupRequired) return <SetupRequired />;

  return (
    <>
      <PageHeader
        title="ใบวางบิล"
        description="รวมใบแจ้งหนี้หลายรายการของลูกค้าคนเดียวกันเพื่อส่งวางบิลและติดตามยอดค้าง"
      />
      <BillingStatementManager invoices={data.invoices} statements={data.statements} />
    </>
  );
}
