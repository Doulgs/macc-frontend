import { ResourcePage } from "@/features/operations/resource-page";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const { novo } = query;
  return <ResourcePage resource="budgets" initialCreate={typeof novo === "string" ? novo : undefined} queryFilters={query} key={JSON.stringify(query)} />;
}
