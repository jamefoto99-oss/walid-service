import { ModulePage } from "@/components/app/module-page";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RepairJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialValues = {
    customer_id: firstParam(params.customer_id),
    vehicle_id: firstParam(params.vehicle_id),
  };

  return (
    <ModulePage
      moduleKey="repair-jobs"
      initialValues={Object.fromEntries(
        Object.entries(initialValues).filter(([, value]) => Boolean(value)),
      ) as Record<string, string>}
    />
  );
}
