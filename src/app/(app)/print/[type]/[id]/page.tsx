import { notFound } from "next/navigation";
import { DocumentPrint } from "@/components/documents/document-print";
import { getDocumentForPrint } from "@/lib/data";

export default async function PrintPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  const data = await getDocumentForPrint(type, id);
  if (!data) notFound();
  return <DocumentPrint data={data} />;
}
