"use client";
import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterPopover } from "@/components/ui/filter-popover";
import { Field } from "@/components/ui/fields";
import { ModernSelect } from "@/components/ui/modern-select";
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

export function PeriodFilters({ initial, timezone, extra, children }: {
  initial: Period; timezone: string; extra?: { name: string; value: string };
  children?: (value: string, onChange: (value: string) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <FilterPopover open={open} onOpenChange={setOpen}>
    {open && <PeriodForm initial={initial} timezone={timezone} extra={extra} onApply={() => setOpen(false)}>{children}</PeriodForm>}
  </FilterPopover>;
}

function PeriodForm({ initial, timezone, extra, children, onApply }: {
  initial: Period; timezone: string; extra?: { name: string; value: string }; onApply: () => void;
  children?: (value: string, onChange: (value: string) => void) => ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState(initial);
  const [selection, setSelection] = useState(extra?.value ?? "");
  const [preset, setPreset] = useState("");
  const [error, setError] = useState("");
  function apply(period: Period) {
    const { startDate, endDate } = period;
    if (!dateIsValid(startDate) || !dateIsValid(endDate) || !periodIsValid(startDate, endDate)) {
      setError("Escolha datas válidas, em ordem, dentro de um intervalo de até um ano.");
      return;
    }
    setDraft(period);
    setError("");
    router.replace(pathname + "?" + new URLSearchParams({ ...period, ...(extra && selection ? { [extra.name]: selection } : {}) }).toString(), { scroll: false });
    onApply();
  }
  return <form className="period-picker" onSubmit={event => { event.preventDefault(); apply(draft); }}>
    <Field label="Período rápido">{props => <ModernSelect {...props} className="input" aria-label="Período rápido" value={preset} onValueChange={event => {
      setPreset(event);
      if (event === "month") setDraft(currentMonth(timezone));
      if (event === "year") {
        const year = civilDate(new Date(), timezone).slice(0, 4);
        setDraft({ startDate: year + "-01-01", endDate: year + "-12-31" });
      }
    }}><option value="">Personalizado</option><option value="month">Mês atual</option><option value="year">Ano atual</option></ModernSelect>}</Field>
    <Field label="Início">{props => <input {...props} className="input" type="date" required value={draft.startDate} onChange={event => { setPreset(""); setDraft({ ...draft, startDate: event.target.value }); }} />}</Field>
    <Field label="Fim">{props => <input {...props} className="input" type="date" required value={draft.endDate} onChange={event => { setPreset(""); setDraft({ ...draft, endDate: event.target.value }); }} />}</Field>
    {children && <div className="period-extra">{children(selection, setSelection)}</div>}
    <Button variant="outline" size="small"><CalendarDays size={15} /> Aplicar</Button>
    {error && <small className="field-error" role="alert">{error}</small>}
  </form>;
}
