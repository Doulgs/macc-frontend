import { CompaniesPage } from "@/features/companies/company-pages";

export default async function Page({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const query = await searchParams;
  return <CompaniesPage startCreating={query.novo === "1"} key={query.novo} />;
}
