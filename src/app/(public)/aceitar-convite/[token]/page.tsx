import { AuthForm } from "@/features/auth/auth-form";

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ workspace?: string }> }) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  return <AuthForm mode="invite" workspace={typeof query.workspace === "string" ? query.workspace : undefined} token={token} />;
}
