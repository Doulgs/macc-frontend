"use client";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { getScoped, type Branding } from "./api";

const defaultBrand: Branding = { name: "MACC Gestão", primaryColor: "#1283e2" };

export function useBranding() {
  const query = useQuery({ queryKey: ["branding"], queryFn: getScoped<Branding>("/public/branding"), staleTime: 300_000 });
  return query.data ?? defaultBrand;
}

function safeLogo(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    if (/^\/brand\/[a-z0-9._-]+$/i.test(value)) return value;
  }
  return undefined;
}

export function brandStyle(branding: Branding): React.CSSProperties {
  const color = branding.primaryColor;
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return {};
  const rgb = [1, 3, 5].map(i => Number.parseInt(color.slice(i, i + 2), 16) / 255);
  const luminance = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index], 0);
  const foreground = color.toLowerCase() === "#1283e2" ? "#000611" : (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.05) ? "#fff" : "#000";
  return { "--primary": color, "--primary-foreground": foreground, "--chart-1": color } as React.CSSProperties;
}

export function BrandMark({ branding, compact = false }: { branding: Branding; compact?: boolean }) {
  const url = safeLogo(branding.logoUrl);
  return <div className="brand-lockup">
    <span className="brand-mark"><Image src={url ?? "/brand/icon.webp"} alt="" unoptimized width={40} height={40} /></span>
    {!compact && <span><strong>{branding.name}</strong><small>Workspace financeiro</small></span>}
  </div>;
}
