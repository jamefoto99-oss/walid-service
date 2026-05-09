import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { PurchaseManager } from "@/components/purchases/purchase-manager";
import { SetupRequired } from "@/components/ui/setup-required";
import { canRead, requireProfile } from "@/lib/auth";
import { getPurchasePageData } from "@/lib/data";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PurchasesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, "purchases")) redirect("/dashboard");

  const data = await getPurchasePageData();
  if (data.setupRequired) return <SetupRequired />;

  return (
    <>
      <PageHeader
        title="ซื้ออะไหล่ / เจ้าหนี้"
        description="บันทึกซื้ออะไหล่ รับสินค้าเข้าสต๊อก ติดตามเจ้าหนี้ Supplier และบันทึกจ่ายชำระ"
      />
      <PurchaseManager data={data} role={session.profile.role} initialSupplierId={firstParam(params.supplier_id)} />
    </>
  );
}
