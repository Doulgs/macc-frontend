import { ReportsPage } from "@/features/dashboard/reports-page";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <ReportsPage query={query} key={JSON.stringify(query)} />;
}
