import { DashboardPage } from "@/features/dashboard/dashboard-page";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DashboardPage query={await searchParams} cashflow />;
}
