"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { ArrowDownLeft, ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp, CircleDollarSign, Wallet, Plus } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/fields";
import { ModernSelect } from "@/components/ui/modern-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { getScoped, normalizePage, type ApiPage, type ApiRow } from "@/lib/api";
import { dateLabel, money } from "@/lib/utils";
import { useScopedQuery, useWorkspace } from "@/lib/workspace";
import { EntityTable } from "@/features/operations/entity-table";
import { resources } from "@/features/operations/definitions";
import type { CashRow } from "./cash-chart";
import { PeriodFilters, resolvePeriod } from "./period-picker";
const OverviewAccountCharts = dynamic(() => import("./overview-charts").then(module => module.OverviewAccountCharts), { ssr: false, loading: () => <LoadingState rows={6} /> });
const OverviewTransactionTypes = dynamic(() => import("./overview-charts").then(module => module.OverviewTransactionTypes), { ssr: false, loading: () => <LoadingState rows={5} /> });
const OverviewUserRadar = dynamic(() => import("./overview-charts").then(module => module.OverviewUserRadar), { ssr: false, loading: () => <LoadingState rows={5} /> });
const OverviewExpensePie = dynamic(() => import("./overview-charts").then(module => module.OverviewExpensePie), { ssr: false, loading: () => <LoadingState rows={6} /> });

const CashChart = dynamic(() => import("./cash-chart"), { ssr: false, loading: () => <LoadingState rows={5} /> });
type Summary = {
  currency: string; currentBalance: string; incomeReceived: string; expensePaid: string; netCashflow: string;
  openReceivables: string; openPayables: string; confirmedSales: string;
  previous?: Partial<Omit<Summary, "previous" | "balances">>;
  balances?: { id: string; name: string; balance: string }[];
};
type Category = { categoryId?: string; name: string; income: string; expense: string };
type Alerts = { overduePayables: number; overdueReceivables: number };
const metrics = [
  { key: "incomeReceived", label: "Receitas recebidas", Icon: ArrowDownLeft, formula: "Entradas liquidadas no período, sem transferências." },
  { key: "expensePaid", label: "Despesas pagas", Icon: ArrowUpRight, formula: "Saídas liquidadas no período, sem transferências." },
] as const;

function delta(current: string, previous?: string) {
  if (previous === undefined) return null;
  try {
    const baseline = new Decimal(previous);
    if (baseline.isZero()) return null;
    return new Decimal(current).minus(baseline).div(baseline.abs()).mul(100).toDecimalPlaces(1).toNumber();
  } catch { return null; }
}

function CashPanel({ params, projected = false, className = "", compact = false }: { params: object; projected?: boolean; className?: string; compact?: boolean }) {
  const { company } = useWorkspace();
  const result = useScopedQuery<CashRow[]>("/dashboard/cashflow", params);
  const hasMovements = result.data?.some(row => [row.income, row.expense, ...(projected ? [row.projectedIncome, row.projectedExpense] : [])].some(value => Number(value) !== 0));
  return <section className={`panel ${className}`}>
    <div className="panel-title cash-panel-heading">
      <div className="cash-panel-heading-row">
        <h2>{projected ? "Realizado e projetado" : "Receitas e despesas"}</h2>

      </div>
      <p>{projected ? "Valores liquidados e obrigações por vencimento" : "Evolução dos valores liquidados no período"}</p>
    </div>
    {result.isPending ? <LoadingState rows={5} /> : result.isError ? <ErrorState error={result.error} retry={() => void result.refetch()} />
      : hasMovements ? <CashChart rows={result.data} currency={company.currency} projected={projected} view="compare" bars={compact} /> : <EmptyState title="Sem movimentações no período" detail="Registre lançamentos ou selecione outras datas." />}
  </section>;
}

function CashAccounts({ chosen, onChange }: { chosen: string; onChange: (value: string) => void }) {
  const { can } = useWorkspace();
  const accounts = useScopedQuery<ApiPage<ApiRow> | ApiRow[]>("/financial-accounts", { page: 0, size: 100 }, { enabled: can("financial.read") });
  if (!can("financial.read")) return null;
  return <Field label="Conta financeira">{props => <ModernSelect {...props} className="input" value={chosen} onValueChange={onChange}><option value="">Todas as contas</option>{(accounts.data ? normalizePage(accounts.data).items : []).map(item =>
    <option value={item.id} key={item.id}>{String(item.name)}</option>,
  )}</ModernSelect>}</Field>;
}

export function DashboardPage({ query, cashflow = false }: { query: Record<string, unknown>; cashflow?: boolean }) {
  const { company, can, feature, session } = useWorkspace();
  const [comparison, setComparison] = useState(false);
  const period = resolvePeriod(query, company.timezone);
  const accountId = typeof query.accountId === "string" && /^[a-f0-9-]{36}$/i.test(query.accountId) ? query.accountId : undefined;
  const params = { ...period, ...(accountId ? { accountId } : {}) };
  const financial = can("financial.read") && feature("FINANCIAL_CORE");
  const commercial = can("sales.read") && feature("SALES");
  const allowed = can("dashboard.read") && (cashflow ? financial : financial || commercial);
  const summary = useScopedQuery<Summary>("/dashboard/summary", params, { enabled: allowed && !cashflow });
  const categories = useScopedQuery<Category[]>("/dashboard/categories", params, { enabled: financial && !cashflow });
  const alerts = useScopedQuery<Alerts>("/dashboard/alerts", params, { enabled: financial && !cashflow });
  const recentSales = useScopedQuery<ApiPage<ApiRow> | ApiRow[]>("/sales", { page: 0, size: 5, ...period }, { enabled: commercial && !financial && !cashflow });

  const data = summary.data;
  const salesList = recentSales.data ? normalizePage(recentSales.data).items : [];
  const expenseCategories = (categories.data ?? []).filter(category => Number(category.expense) > 0).sort((a, b) => Number(b.expense) - Number(a.expense));
  function renderMetric({ key, label, Icon, formula }: (typeof metrics)[number]) {
    const change = data ? delta(data[key], data.previous?.[key]) : null;
    const TrendIcon = change !== null && change < 0 ? TrendingDown : TrendingUp;
    const favorable = change !== null && (key === "expensePaid" ? change < 0 : change > 0);
    return <article className={`panel kpi dashboard-metric-${key}`} key={key}>
      <div className="kpi-top"><span title={formula}>{label}</span><span className="metric-icon"><Icon size={19} aria-hidden="true" /></span></div>
      {summary.isPending ? <LoadingState rows={2} /> : summary.isError ? <ErrorState error={summary.error} retry={() => void summary.refetch()} /> : <>
        <div className="metric-value-row"><strong>{money(data?.[key], company.currency)}</strong>

        </div>
        <small className={change === null || change === 0 ? "metric-comparison" : `metric-comparison ${favorable ? "metric-favorable" : "metric-unfavorable"}`}>
          {change !== null && change !== 0 && <TrendIcon size={13} aria-hidden="true" />}
          {change === null ? "No período selecionado" : (change > 0 ? "+" : "") + change.toLocaleString("pt-BR") + "% vs. período anterior"}
        </small>
      </>}
    </article>;
  }
  return <>
    <PageHeading eyebrow={cashflow ? "Financeiro" : "Visão geral"} title={cashflow ? "Fluxo de caixa" : `Olá, ${session.user.fullName.trim().split(/\s+/)[0]}`}
      subtitle={cashflow ? "Compare o que já entrou ou saiu com os próximos vencimentos." : (company.tradeName || company.legalName) + " · " + dateLabel(period.startDate) + " a " + dateLabel(period.endDate)}
      actions={<>
        {allowed && <PeriodFilters initial={period} timezone={company.timezone} extra={financial ? { name: "accountId", value: accountId ?? "" } : undefined}>
          {financial ? (value, onChange) => <CashAccounts chosen={value} onChange={onChange} /> : undefined}
        </PeriodFilters>}
        {!cashflow && session.companies.length > 1 && <Button variant="outline" onClick={() => setComparison(!comparison)} aria-expanded={comparison}>Comparar empresas</Button>}
        {!cashflow && financial && can("financial.write") && <Button asChild variant="outline"><Link href="/financeiro/transacoes?novo=EXPENSE"><ArrowDownRight size={17} /> Nova despesa</Link></Button>}
        {!cashflow && commercial && can("sales.write") && <Button asChild><Link href="/vendas?novo=1"><Plus size={17} /> Nova venda</Link></Button>}
      </>} />
    {!allowed ? <section className="panel"><EmptyState title="Acesso restrito" detail="Seu workspace não tem acesso ao painel financeiro." /></section> : <>
      {!cashflow && comparison && <CompanyComparison period={period} />}
      {!cashflow && !financial && <section className="panel commercial-kpi">
        <div className="panel-title"><h2>Vendas confirmadas</h2><CircleDollarSign size={20} aria-hidden="true" /></div>
        {summary.isPending ? <LoadingState rows={2} /> : summary.isError ? <ErrorState error={summary.error} retry={() => void summary.refetch()} /> :
          <p className="commercial-value">{money(summary.data.confirmedSales, company.currency)}</p>}
      </section>}
      <div className="dashboard-container">
        {cashflow ? <CashPanel params={params} projected /> : <div className={financial ? "dashboard-bento" : "list-stack"}>
          {financial && <>
            <div className="overview-kpis">
              <article className="panel kpi overview-balance">
                <div className="kpi-top"><Link href="/financeiro/contas">Saldo disponível</Link><span className="metric-icon"><Wallet size={19} aria-hidden="true" /></span></div>
                {summary.isPending ? <LoadingState rows={2} /> : summary.isError ? <ErrorState error={summary.error} retry={() => void summary.refetch()} /> : <>
                  <strong>{money(data?.currentBalance, company.currency)}</strong>
                  <small>Saldo consolidado · {company.currency}</small>
                </>}
              </article>
              {metrics.map(renderMetric)}
              {([['openReceivables', 'A receber', '/financeiro/a-receber', ArrowDownLeft, alerts.data?.overdueReceivables], ['openPayables', 'A pagar', '/financeiro/a-pagar', ArrowUpRight, alerts.data?.overduePayables]] as const).map(([key, label, href, Icon, overdue]) =>
                <article className="panel kpi" key={key}>
                  <div className="kpi-top"><Link href={href}>{label}</Link><span className="metric-icon"><Icon size={19} aria-hidden="true" /></span></div>
                  {summary.isPending || alerts.isPending ? <LoadingState rows={2} /> : summary.isError || alerts.isError ? <ErrorState error={summary.error ?? alerts.error} /> : <>
                    <strong>{money(data?.[key], company.currency)}</strong>
                    <small>{overdue ? `${overdue} ${overdue === 1 ? "conta vencida" : "contas vencidas"}` : "Nenhuma conta vencida"}</small>
                  </>}
                </article>,
              )}
            </div>
            <OverviewAccountCharts params={params} accounts={data?.balances} accountsError={summary.error}>
              {({ area, radar }) => <>
                <div className="overview-chart-row">
                  {area}
                  <OverviewTransactionTypes params={params} />
                </div>
                <div className="overview-bottom-row">
                  <section className="panel overview-expenses">
                <div className="panel-title"><div><h2>Despesas por categoria</h2><p>Participação no total de despesas liquidadas</p></div></div>
                {categories.isPending ? <LoadingState rows={5} /> : categories.isError ? <ErrorState error={categories.error} retry={() => void categories.refetch()} /> : !expenseCategories.length ? <EmptyState title="Sem despesas classificadas" /> : <OverviewExpensePie categories={expenseCategories} />}
              </section>
                  {radar}
                  <OverviewUserRadar params={params} />
                </div>
              </>}
            </OverviewAccountCharts>

          </>}
          {commercial && !financial && <section className="panel dashboard-sales">
              <div className="panel-title"><h2>Últimas vendas</h2><Button asChild size="small" variant="ghost"><Link href="/vendas">Ver vendas</Link></Button></div>
              {recentSales.isPending ? <LoadingState rows={3} /> : recentSales.isError ? <ErrorState error={recentSales.error} retry={() => void recentSales.refetch()} /> :
                salesList.length ? <EntityTable rows={salesList} columns={resources.sales.columns} detailRoute="/vendas" /> : <EmptyState title="Sem vendas neste período" />}
            </section>}
        </div>}
      </div>
    </>}
  </>;
}

function CompanyComparison({ period }: { period: { startDate: string; endDate: string } }) {
  const { session } = useWorkspace();
  const results = useQueries({ queries: session.companies.map(company => ({
    queryKey: ["scope", session.account.id, company.id, "/dashboard/summary", period],
    queryFn: getScoped<Summary>("/dashboard/summary", company.id, period),
  })) });
  return <section className="panel company-comparison">
    <div className="panel-title"><div><h2>Visão por empresa</h2><p>Indicadores por workspace e moeda no período selecionado</p></div></div>
    <div className="table-overflow"><table className="entity-table responsive">
      <thead><tr>{["Empresa", "Saldo", "Receitas", "Despesas", "Resultado", "Vendas confirmadas"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{results.map((result, index) => {
        const company = session.companies[index];
        const entry = result.data;
        const amounts = [
          ["Saldo", entry?.currentBalance], ["Receitas", entry?.incomeReceived], ["Despesas", entry?.expensePaid],
          ["Resultado", entry?.netCashflow], ["Vendas confirmadas", entry?.confirmedSales],
        ];
        return <tr key={company.id}><td data-label="Empresa">{company.tradeName || company.legalName}<small>{company.currency}</small></td>
          {result.isPending || result.isError ? <td colSpan={5} data-label="Situação">{result.isPending ? "Carregando…" : "Indicadores indisponíveis"}</td> :
            amounts.map(([label, amount]) => <td key={label} data-label={label}>{money(amount, company.currency)}</td>)}
        </tr>;
      })}</tbody>
    </table></div>
  </section>;
}
