import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import Decimal from "decimal.js";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(amount: unknown, currency = "BRL") {
  if (typeof amount !== "string" && typeof amount !== "number") return "—";
  if (!/^-?\d+(?:\.\d+)?$/.test(String(amount))) return "—";
  try {
    const formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    const [integer, fraction] = new Decimal(String(amount)).toFixed(fractionDigits).split(".");
    const value = BigInt(integer);
    const parts = formatter.formatToParts(value === 0n && integer.startsWith("-") ? -0 : value);
    return parts.map(part => part.type === "fraction" ? fraction : part.value).join("");
  } catch {
    return "—";
  }
}

export function dateLabel(value: unknown, timezone = "America/Sao_Paulo") {
  if (typeof value !== "string") return "—";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T12:00:00Z" : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: value.length === 10 ? "UTC" : timezone, dateStyle: "short" }).format(date);
}

export function civilDate(date = new Date(), timezone = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function currentMonth(timezone?: string) {
  const [year, month] = civilDate(new Date(), timezone).split("-").map(Number);
  const prefix = year + "-" + String(month).padStart(2, "0");
  return { startDate: prefix + "-01", endDate: prefix + "-" + new Date(Date.UTC(year, month, 0)).getUTCDate() };
}

export function decimalInput(raw: string) {
  const value = raw.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return value;
  if (/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(value)) return value.replaceAll(".", "").replace(",", ".");
  return null;
}
