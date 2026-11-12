"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import { Download, FileChartColumn } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/fields";
import { ModernSelect } from "@/components/ui/modern-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { api, companyHeaders, errorMessage, type ApiRow } from "@/lib/api";
import { dateLabel, money } from "@/lib/utils";
import { useScopedQuery, useWorkspace } from "@/lib/workspace";
import { EntityTable } from "@/features/operations/entity-table";
import type { ColumnSpec } from "@/features/operations/definitions";
import { PeriodFilters, resolvePeriod } from "./period-picker";

const reportTypes = {
  cashflow: { label: "Fluxo de caixa", columns: [
    { key: "date", label: "Data", type: "date" }, { key: "income", label: "Receitas realizadas", type: "money" },
    { key: "expense", label: "Despesas realizadas", type: "money" }, { key: "projectedIncome", label: "Receitas previstas", type: "money" },
    { key: "projectedExpense", label: "Despesas previstas", type: "money" },
  ] },
  categories: { label: "Receitas e despesas por categoria", columns: [
    { key: "name", label: "Categoria" }, { key: "income", label: "Receitas", type: "money" }, { key: "expense", label: "Despesas", type: "money" },
  ] },
  aging: { label: "Vencimentos por faixa de atraso", columns: [
    { key: "type", label: "Tipo", type: "kind" }, { key: "bucket", label: "Faixa" }, { key: "count", label: "Contas" }, { key: "amount", label: "Em aberto", type: "money" },
  ] },
  sales: { label: "Vendas por data e cliente", columns: [
    { key: "date", label: "Data", type: "date" }, { key: "customer", label: "Cliente" }, { key: "count", label: "Vendas" }, { key: "total", label: "Total", type: "money" },
  ] },
  "sales-items": { label: "Vendas por item", columns: [
    { key: "item", label: "Produto ou serviço" }, { key: "quantity", label: "Quantidade" }, { key: "total", label: "Total", type: "money" },
  ] },
  dre: { label: "DRE gerencial", columns: [
    { key: "name", label: "Categoria" }, { key: "income", label: "Receitas", type: "money" }, { key: "expense", label: "Despesas", type: "money" },
  ] },
} satisfies Record<string, { label: string; columns: ColumnSpec[] }>;
type ReportKey = keyof typeof reportTypes;
const isReport = (value: unknown): value is ReportKey => typeof value === "string" && Object.hasOwn(reportTypes, value);

export function ReportsPage({ query }: { query: Record<string, unknown> }) {
  const { can, company, feature } = useWorkspace();
  const [exporting, setExporting] = useState(false);
  const [pagination, setPagination] = useState({ key: "", page: 0 });
  const financial = can("financial.read") && feature("FINANCIAL_CORE");
  const commercial = can("sales.read") && feature("SALES");
  const available = (Object.keys(reportTypes) as ReportKey[]).filter(key => key.startsWith("sales") ? commercial : financial);
  const report = isReport(query.relatorio) && available.includes(query.relatorio) ? query.relatorio : available[0] ?? "cashflow";
  const period = resolvePeriod(query, company.timezone);
  const paginationKey = [company.id, report, period.startDate, period.endDate].join(":");
  const page = pagination.key === paginationKey ? pagination.page : 0;
  const setPage = (next: number) => setPagination({ key: paginationKey, page: next });
  const allowed = can("reports.read") && feature("ADVANCED_REPORTS") && available.length > 0;
  const result = useScopedQuery<Record<string, unknown>[]>("/reports/" + report, period, { enabled: allowed });
  const config = reportTypes[report];
  const rows: ApiRow[] = (result.data ?? []).map((row, index) => ({ ...row, id: String(index) }));
  const pages = Math.ceil(rows.length / 50);

  async function exportReport() {
    setExporting(true);
    try {
      const response = await api.post<Blob>("/exports", { report, ...period }, {
        responseType: "blob", headers: { ...companyHeaders(company.id), Accept: "text/csv" },
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "macc-" + report + "-" + period.startDate + ".csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("CSV exportado.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally { setExporting(false); }
  }

  const grouped = report === "dre" && rows.every(row => row.categoryId) ? rows : [];
  const sum = (key: "income" | "expense") => grouped.reduce((value, row) => value.plus(String(row[key] ?? "0")), new Decimal(0));
  return <>
    <PageHeading eyebrow="Inteligência" title="Relatórios" subtitle="Consulte dados do workspace e exporte os resultados filtrados."
      actions={allowed && <><PeriodFilters initial={period} timezone={company.timezone} extra={{ name: "relatorio", value: report }}>
        {(value, onChange) => <Field label="Relatório">{props => <ModernSelect {...props} value={value} onValueChange={onChange}>
          {available.map(key => <option value={key} key={key}>{reportTypes[key].label}</option>)}
        </ModernSelect>}</Field>}
      </PeriodFilters>{can("reports.export") && <Button onClick={() => void exportReport()} disabled={exporting}><Download size={17} /> {exporting ? "Exportando…" : "Exportar CSV"}</Button>}</>} />
    {!allowed ? <section className="panel"><EmptyState title="Acesso restrito" detail="Seu workspace não tem acesso aos relatórios." /></section> : <>
      <section className="panel">
        <div className="panel-title"><div><h2>{config.label}</h2><p>{dateLabel(period.startDate)} a {dateLabel(period.endDate)} · {company.currency}
          {result.dataUpdatedAt ? " · Gerado em " + new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: company.timezone }).format(result.dataUpdatedAt) : ""}</p></div><FileChartColumn size={21} aria-hidden="true" /></div>
        {report === "dre" && <p className="report-note muted">Visão gerencial em regime de caixa. O resultado é exibido quando as receitas e despesas do período estão classificadas.</p>}
        {grouped.length > 0 && <dl className="detail-grid">
          <div><dt>Receitas classificadas</dt><dd>{money(sum("income").toFixed(2), company.currency)}</dd></div>
          <div><dt>Despesas classificadas</dt><dd>{money(sum("expense").toFixed(2), company.currency)}</dd></div>
          <div><dt>Resultado gerencial</dt><dd>{money(sum("income").minus(sum("expense")).toFixed(2), company.currency)}</dd></div>
        </dl>}
        {result.isPending ? <LoadingState /> : result.isError ? <ErrorState error={result.error} retry={() => void result.refetch()} /> :
          rows.length ? <EntityTable rows={rows.slice(page * 50, (page + 1) * 50)} columns={config.columns} /> : <EmptyState title="Sem dados no período" detail="Selecione outro intervalo para consultar este relatório." />}
        {pages > 1 && <div className="pagination"><span>Página {page + 1} de {pages}</span>
          <Button size="small" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
          <Button size="small" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>}
      </section>
    </>}
  </>;
}
