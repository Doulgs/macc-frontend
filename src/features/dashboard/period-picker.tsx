"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/fields";
import { civilDate, currentMonth } from "@/lib/utils";

export type Period = { startDate: string; endDate: string };

function dateIsValid(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return value >= "1900-01-01" && value <= "2200-12-31" && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function periodIsValid(start: string, end: string) {
  const interval = Date.parse(end) - Date.parse(start);
  return interval >= 0 && interval <= 365 * 86_400_000;
}
export function resolvePeriod(query: Record<string, unknown>, timezone: string): Period {
  const { startDate, endDate } = query;
  return dateIsValid(startDate) && dateIsValid(endDate) && periodIsValid(startDate, endDate)
    ? { startDate, endDate } : currentMonth(timezone);
}

export function PeriodPicker({ initial, timezone, extra }: { initial: Period; timezone: string; extra?: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  function apply(period: Period) {
    const { startDate, endDate } = period;
    if (!dateIsValid(startDate) || !dateIsValid(endDate) || !periodIsValid(startDate, endDate)) {
      setError("Escolha datas válidas, em ordem, dentro de um intervalo de até um ano.");
      return;
    }
    setDraft(period);
    setError("");
    router.replace(pathname + "?" + new URLSearchParams({ ...extra, ...period }).toString(), { scroll: false });
  }
  return <form className="period-picker" onSubmit={event => { event.preventDefault(); apply(draft); }}>
    <Field label="Período rápido">{props => <select {...props} className="input" aria-label="Período rápido" value="" onChange={event => {
      if (event.target.value === "month") apply(currentMonth(timezone));
      if (event.target.value === "year") {
        const year = civilDate(new Date(), timezone).slice(0, 4);
        apply({ startDate: year + "-01-01", endDate: year + "-12-31" });
      }
    }}><option value="">Personalizado</option><option value="month">Mês atual</option><option value="year">Ano atual</option></select>}</Field>
    <Field label="Início">{props => <input {...props} className="input" type="date" required value={draft.startDate} onChange={event => setDraft({ ...draft, startDate: event.target.value })} />}</Field>
    <Field label="Fim">{props => <input {...props} className="input" type="date" required value={draft.endDate} onChange={event => setDraft({ ...draft, endDate: event.target.value })} />}</Field>
    <Button variant="outline" size="small"><CalendarDays size={15} /> Aplicar</Button>
    {error && <small className="field-error" role="alert">{error}</small>}
  </form>;
}
