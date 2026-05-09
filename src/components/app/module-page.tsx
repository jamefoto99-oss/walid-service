import { notFound, redirect } from "next/navigation";
import { requireProfile, canRead } from "@/lib/auth";
import { modules } from "@/lib/constants";
import { getModuleRows, getReferenceData } from "@/lib/data";
import type { ModuleKey } from "@/lib/types";
import { SetupRequired } from "../ui/setup-required";
import { PageHeader } from "./page-header";
import { EntityManager } from "../tables/entity-manager";

export async function ModulePage({
  moduleKey,
  initialValues,
}: {
  moduleKey: ModuleKey;
  initialValues?: Record<string, string>;
}) {
  const config = modules[moduleKey];
  if (!config) notFound();

  const session = await requireProfile();
  if (session.setupRequired) return <SetupRequired />;
  if (!session.profile) redirect("/login");
  if (!canRead(session.profile.role, moduleKey)) redirect("/dashboard");

  const [{ rows }, references] = await Promise.all([getModuleRows(config), getReferenceData()]);

  return (
    <>
      <PageHeader title={config.title} description={config.description} />
      <EntityManager
        config={config}
        rows={rows}
        references={references}
        role={session.profile.role}
        initialValues={initialValues}
      />
    </>
  );
}
