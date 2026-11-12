import { ResourceDetail } from "@/features/operations/resource-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResourceDetail resource="transactions" id={id} key={id} />;
}
