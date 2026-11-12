"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { errorStatus } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: {
    queries: { staleTime: 30_000, retry: (count, error) => count < 1 && (errorStatus(error) ?? 500) >= 500 },
    mutations: { retry: false },
  } }));
  return <QueryClientProvider client={queryClient}>{children}<Toaster position="bottom-right" richColors /></QueryClientProvider>;
}
