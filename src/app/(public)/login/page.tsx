import { AuthForm } from "@/features/auth/auth-form";

export default async function Page({ searchParams }: { searchParams: Promise<{ workspace?: string; token?: string }> }) {
  const query = await searchParams;
  return <AuthForm mode="login" workspace={typeof query.workspace === "string" ? query.workspace : undefined} token={typeof query.token === "string" ? query.token : undefined} />;
}
