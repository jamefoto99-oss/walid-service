import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { SetupRequired } from "@/components/ui/setup-required";

export default async function Home() {
  const session = await getSessionProfile();
  if (session.setupRequired) return <SetupRequired />;
  redirect(session.profile ? "/dashboard" : "/login");
}
