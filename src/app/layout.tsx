import type { Metadata } from "next";
import "@fontsource-variable/geist";
import "./globals.css";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = {
  title: { default: "MACC Gestão", template: "%s | MACC Gestão" },
  description: "Finanças, orçamentos e vendas no mesmo workspace.",
  icons: { icon: "/brand/icon.webp" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><Providers>{children}</Providers></body></html>;
}
