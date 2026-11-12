"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { ArrowDownLeft, ArrowDownRight, ArrowUpRight, CircleDollarSign, Landmark, Plus, Target, Wallet } from "lucide-react";
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
  { key: "netCashflow", label: "Resultado de caixa", Icon: CircleDollarSign, formula: "Receitas recebidas menos despesas pagas no período." },
] as const;

function delta(current: string, previous?: string) {
  if (previous === undefined) return null;
  try {
    const baseline = new Decimal(previous);
    if (baseline.isZero()) return null;
    return new Decimal(current).minus(baseline).div(baseline.abs()).mul(100).toDecimalPlaces(1).toNumber();
  } catch { return null; }
}

function CashPanel({ params, projected = false }: { params: object; projected?: boolean }) {
  const { company } = useWorkspace();
  const result = useScopedQuery<CashRow[]>("/dashboard/cashflow", params);
  const hasMovements = result.data?.some(row => [row.income, row.expense, ...(projected ? [row.projectedIncome, row.projectedExpense] : [])].some(value => Number(value) !== 0));
  return <section className="panel">
    <div className="panel-title"><div><h2>{projected ? "Realizado e projetado" : "Receitas e despesas"}</h2><p>{projected ? "Valores liquidados e obrigações por vencimento" : "Movimentações confirmadas no período"}</p></div></div>
    {result.isPending ? <LoadingState rows={5} /> : result.isError ? <ErrorState error={result.error} retry={() => void result.refetch()} />
      : hasMovements ? <CashChart rows={result.data} currency={company.currency} projected={projected} /> : <EmptyState title="Sem movimentações no período" detail="Registre lançamentos ou selecione outras datas." />}
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
  const kpis = [...metrics, commercial
    ? { key: "confirmedSales" as const, label: "Vendas confirmadas", Icon: Target, formula: "Total das vendas confirmadas no período." }
    : { key: "openReceivables" as const, label: "Valores a receber", Icon: Target, formula: "Total das contas a receber em aberto." }];
  const budget = can("budget.read") && feature("BUDGETS");
  const allowed = can("dashboard.read") && (cashflow ? financial : financial || commercial);
  const summary = useScopedQuery<Summary>("/dashboard/summary", params, { enabled: allowed && !cashflow });
  const categories = useScopedQuery<Category[]>("/dashboard/categories", params, { enabled: financial && !cashflow });
  const alerts = useScopedQuery<Alerts>("/dashboard/alerts", params, { enabled: financial && !cashflow });
  const recent = useScopedQuery<ApiPage<ApiRow> | ApiRow[]>("/transactions", { page: 0, size: 5, sort: "effectiveDate,desc", ...period, ...(accountId ? { financialAccountId: accountId } : {}) }, { enabled: financial && !cashflow });
  const recentSales = useScopedQuery<ApiPage<ApiRow> | ApiRow[]>("/sales", { page: 0, size: 5, ...period }, { enabled: commercial && !cashflow });
  const recentBudgets = useScopedQuery<ApiPage<ApiRow> | ApiRow[]>("/budgets", { page: 0, size: 5, status: "ACTIVE" }, { enabled: budget && !cashflow });
  const data = summary.data;
  const list = recent.data ? normalizePage(recent.data).items : [];
  const salesList = recentSales.data ? normalizePage(recentSales.data).items : [];
  const budgetsList = recentBudgets.data ? normalizePage(recentBudgets.data).items : [];
  const expenseCategories = (categories.data ?? []).filter(category => Number(category.expense) > 0).sort((a, b) => Number(b.expense) - Number(a.expense));
  const maxExpense = Number(expenseCategories[0]?.expense ?? 1);
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
      {!cashflow && financial && <div className="dashboard-overview">
        <section className="panel balance-panel">
          <div className="panel-title"><h2>Saldo disponível</h2><Wallet size={20} aria-hidden /></div>
          {summary.isPending ? <LoadingState rows={2} /> : summary.isError ? <ErrorState error={summary.error} /> : <>
            <strong className="balance-value">{money(data?.currentBalance, company.currency)}</strong>
            <div className="balance-actions">
              {can("transfers.create") && <Button asChild><Link href="/financeiro/contas?novo=transfer">Transferir</Link></Button>}
              <Button asChild variant="outline"><Link href="/financeiro/contas">Ver contas</Link></Button>
            </div>
            <div className="balance-accounts">
              <div className="balance-accounts-heading"><strong>Contas financeiras</strong><small>{data?.balances?.length ?? 0} no período</small></div>
              {data?.balances?.length ? <ul>{data.balances.slice(0, 3).map(account => <li key={account.id}><Link href={`/financeiro/contas/${account.id}`}><Landmark size={15} /><span>{account.name}</span><strong>{money(account.balance, company.currency)}</strong></Link></li>)}</ul>
                : <EmptyState title="Nenhuma conta financeira" />}
            </div>
          </>}
        </section>
        {summary.isPending ? <div className="kpi-grid">{kpis.map(item => <div className="panel" key={item.key}><LoadingState rows={2} /></div>)}</div> :
          summary.isError ? <ErrorState error={summary.error} retry={() => void summary.refetch()} /> : <div className="kpi-grid">{kpis.map(({ key, label, Icon, formula }) => {
            const change = delta(summary.data[key], summary.data.previous?.[key]);
            return <article className="panel kpi" key={key}>
              <div className="kpi-top"><span title={formula}>{label}</span><Icon size={19} aria-hidden="true" /></div>
              <strong>{money(summary.data[key], summary.data.currency)}</strong>
              <small>{change === null ? "No período selecionado" : (change > 0 ? "+" : "") + change.toLocaleString("pt-BR") + "% vs. período anterior"}</small>
            </article>;
          })}</div>}
        <CashPanel params={params} />
      </div>}
      {cashflow ? <CashPanel params={params} projected /> : <>
        <div className={financial ? "dashboard-layout" : "list-stack"}>
          <div className="list-stack activity-stack">
            {financial && <section className="panel">
              <div className="panel-title"><h2>Últimos lançamentos</h2><Button asChild size="small" variant="ghost"><Link href="/financeiro/transacoes">Ver transações</Link></Button></div>
              {recent.isPending ? <LoadingState rows={3} /> : recent.isError ? <ErrorState error={recent.error} retry={() => void recent.refetch()} /> :
                list.length ? <EntityTable rows={list} columns={resources.transactions.columns} detailRoute="/financeiro/transacoes" /> : <EmptyState title="Sem lançamentos neste período" />}
            </section>}
            {commercial && <section className="panel">
              <div className="panel-title"><h2>Últimas vendas</h2><Button asChild size="small" variant="ghost"><Link href="/vendas">Ver vendas</Link></Button></div>
              {recentSales.isPending ? <LoadingState rows={3} /> : recentSales.isError ? <ErrorState error={recentSales.error} retry={() => void recentSales.refetch()} /> :
                salesList.length ? <EntityTable rows={salesList} columns={resources.sales.columns} detailRoute="/vendas" /> : <EmptyState title="Sem vendas neste período" />}
            </section>}
          </div>
          {financial && <div className="list-stack insights-stack">
            <section className="panel">
              <div className="panel-title"><div><h2>Despesas por categoria</h2><p>Participação entre os gastos pagos</p></div><Target size={20} aria-hidden="true" /></div>
              {categories.isPending ? <LoadingState rows={3} /> : categories.isError ? <ErrorState error={categories.error} retry={() => void categories.refetch()} /> :
                !expenseCategories.length ? <EmptyState title="Sem despesas classificadas" /> : <ul className="category-bars">{expenseCategories.slice(0, 6).map(category =>
                  <li key={category.categoryId ?? category.name}><div><span>{category.name}</span><strong>{money(category.expense, company.currency)}</strong></div>
                    <div className="progress-track"><span style={{ width: Math.min(100, Number(category.expense) / maxExpense * 100) + "%" }} /></div></li>,
                )}</ul>}
            </section>
            <section className="panel">
              <div className="panel-title"><h2>Vencimentos e vendas</h2></div>
              {summary.isPending || alerts.isPending ? <LoadingState rows={3} /> : <ul className="metric-list">
                <li><div><Link href="/financeiro/a-receber">A receber</Link><small>{alerts.data ? alerts.data.overdueReceivables + (alerts.data.overdueReceivables === 1 ? " vencida" : " vencidas") : ""}</small></div><strong>{money(data?.openReceivables, company.currency)}</strong></li>
                <li><div><Link href="/financeiro/a-pagar">A pagar</Link><small>{alerts.data ? alerts.data.overduePayables + (alerts.data.overduePayables === 1 ? " vencida" : " vencidas") : ""}</small></div><strong>{money(data?.openPayables, company.currency)}</strong></li>
                {commercial && <li><Link href="/vendas">Vendas confirmadas</Link><strong>{money(data?.confirmedSales, company.currency)}</strong></li>}
              </ul>}
            </section>
            {budget && <section className="panel"><div className="panel-title"><h2>Orçamentos ativos</h2><Button asChild variant="ghost" size="small"><Link href="/orcamentos">Ver todos</Link></Button></div>
              {recentBudgets.isPending ? <LoadingState rows={2} /> : recentBudgets.isError ? <ErrorState error={recentBudgets.error} /> :
                budgetsList.length ? <ul className="metric-list">{budgetsList.map(item => <li key={item.id}><Link href={"/orcamentos/" + item.id}>{String(item.name)}</Link><small>{dateLabel(item.periodEnd)}</small></li>)}</ul> :
                  <EmptyState title="Sem orçamentos ativos" />}
            </section>}
          </div>}
        </div>
      </>}
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
