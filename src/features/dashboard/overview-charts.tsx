"use client";

import { useId, useState, type ReactNode } from "react";
import Decimal from "decimal.js";
import { useQueries } from "@tanstack/react-query";
import {
  Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip,
  Radar, RadarChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Pie, PieChart, Sector, type PieSectorShapeProps,
} from "recharts";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { getScoped } from "@/lib/api";
import { useScopedQuery, useWorkspace } from "@/lib/workspace";
import { dateLabel, money } from "@/lib/utils";
import type { CashRow } from "./cash-chart";

const palette = ["var(--chart-1)", "var(--destructive)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--macc-silver)"];
const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--foreground)", boxShadow: "0 8px 24px #00102618" };
type Account = { id: string; name: string; balance: string };


export function OverviewAccountCharts({ params, accounts, accountsError, children }: {
  params: { startDate: string; endDate: string; accountId?: string };
  accounts?: Account[];
  accountsError?: unknown;
  children: (charts: { area: ReactNode; radar: ReactNode }) => ReactNode;
}) {
  const { company, session } = useWorkspace();
  const gradient = useId().replaceAll(":", "");
  const cash = useScopedQuery<CashRow[]>("/dashboard/cashflow", params);
  const results = useQueries({ queries: (accounts ?? []).map(account => {
    const scopedParams = { ...params, accountId: account.id };
    return { queryKey: ["scope", session.account.id, company.id, "/dashboard/cashflow", scopedParams], queryFn: getScoped<CashRow[]>("/dashboard/cashflow", company.id, scopedParams) };
  }) });
  const rows = (cash.data ?? []).map(row => ({ date: row.date, income: Number(row.income), expense: Number(row.expense) }));
  const hasCash = rows.some(row => row.income !== 0 || row.expense !== 0);
  const radar = (accounts ?? []).map((account, index) => ({
    name: account.name.replace(/^\[DEMO\]\s*/, ""), fullName: account.name,
    income: Number((results[index]?.data ?? []).reduce((sum, row) => sum.plus(row.income), new Decimal(0))),
    expense: Number((results[index]?.data ?? []).reduce((sum, row) => sum.plus(row.expense), new Decimal(0))),
  }));
  const failed = results.find(result => result.isError);
  const hasRadar = radar.some(row => row.income !== 0 || row.expense !== 0);
  const compactMoney = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: company.currency, notation: "compact", maximumFractionDigits: 0 }).format(value);
  const area = <section className="panel overview-area">
      <div className="panel-title"><div><h2>Receitas e despesas</h2><p>Evolução das contas financeiras no período</p></div></div>
      {cash.isPending ? <LoadingState rows={6} /> : cash.isError ? <ErrorState error={cash.error} retry={() => void cash.refetch()} /> : !hasCash ? <EmptyState title="Sem movimentações no período" detail="Selecione outras datas ou registre um lançamento." /> :
        <div className="overview-chart-canvas" role="group" aria-label="Gráfico de área com degradê das receitas e despesas das contas no período">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={rows} accessibilityLayer margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>{[0, 1].map(index => <linearGradient key={index} id={`${gradient}-${index}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={palette[index]} stopOpacity={0.65} /><stop offset="95%" stopColor={palette[index]} stopOpacity={0.04} /></linearGradient>)}</defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={6} minTickGap={30} tickFormatter={value => dateLabel(value).slice(0, 5)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} width={62} tickFormatter={compactMoney} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={value => dateLabel(String(value))} formatter={(value, name) => [money(value, company.currency), name]} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 4" }} />
              <Area dataKey="expense" name="Despesas" type="monotone" stroke={palette[1]} fill={`url(#${gradient}-1)`} strokeWidth={2} isAnimationActive={false} />
              <Area dataKey="income" name="Receitas" type="monotone" stroke={palette[0]} fill={`url(#${gradient}-0)`} strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>}
    </section>;
  const radarCard = <section className="panel overview-radar">
      <div className="panel-title"><div><h2>Movimentação por conta</h2><p>Receitas e despesas distribuídas entre as contas</p></div><span className="overview-account-count">{accounts?.length ?? 0} {accounts?.length === 1 ? "conta" : "contas"}</span></div>
      {accountsError ? <ErrorState error={accountsError} /> : accounts === undefined || results.some(result => result.isPending) ? <LoadingState rows={6} /> : failed ? <ErrorState error={failed.error} retry={() => void failed.refetch()} /> : radar.length < 3 ? <EmptyState title="Contas insuficientes para o radar" detail="Cadastre ao menos três contas ou remova o filtro por conta para comparar neste gráfico." /> : !hasRadar ? <EmptyState title="Sem movimentações no período" /> :
        <div className="overview-chart-canvas" role="group" aria-label="Radar comparando receitas e despesas de cada conta financeira">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <RadarChart data={radar} cy={radar.length === 3 ? "60%" : "50%"} outerRadius="88%" accessibilityLayer margin={{ top: 6, right: 40, bottom: 6, left: 40 }}>
              <PolarGrid stroke="var(--input)" strokeWidth={1.2} />
              <PolarAngleAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={name => String(name).length > 12 ? String(name).slice(0, 11) + "…" : String(name)} />
              <PolarRadiusAxis axisLine={false} tick={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [money(value, company.currency), name]} />
              <Radar dataKey="income" name="Receitas" stroke={palette[0]} fill={palette[0]} fillOpacity={0.45} strokeWidth={3} isAnimationActive={false} />
              <Radar dataKey="expense" name="Despesas" stroke={palette[1]} fill={palette[1]} fillOpacity={0.4} strokeWidth={3} isAnimationActive={false} />
            </RadarChart>
          </ResponsiveContainer>
        </div>}
    </section>;
  return children({ area, radar: radarCard });
}

export function OverviewExpensePie({ categories }: { categories: { categoryId?: string; name: string; expense: string }[] }) {
  const { company } = useWorkspace();
  const [selected, setSelected] = useState<string | null>(null);
  const sorted = categories.filter(item => new Decimal(item.expense).gt(0)).toSorted((a, b) => new Decimal(b.expense).cmp(a.expense));
  const grouped = sorted.length > 6 ? [...sorted.slice(0, 5), { name: "Outras", expense: sorted.slice(5).reduce((sum, item) => sum.plus(item.expense), new Decimal(0)).toString() }] : sorted;
  const data = grouped.map((item, index) => ({ name: item.name, key: item.categoryId ?? item.name, value: Number(item.expense), fill: selected && selected !== (item.categoryId ?? item.name) ? "var(--muted)" : palette[index] }));
  const total = sorted.reduce((sum, item) => sum.plus(item.expense), new Decimal(0));
  const active = data.find(item => item.key === selected);
  return <>
    <div className="overview-pie-canvas" role="group" aria-label={`Pizza de despesas por categoria. Total: ${money(total.toString(), company.currency)}. Clique em uma fatia para destacar.`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <PieChart accessibilityLayer>
          <Tooltip contentStyle={tooltipStyle} formatter={value => money(value, company.currency)} />
          <Pie data={data} dataKey="value" nameKey="name" outerRadius="76%" stroke="var(--card)" strokeWidth={3} isAnimationActive={false}
            label={({ percent }) => `${((percent ?? 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
            onClick={(_, index) => { const key = data[index]?.key; if (key) setSelected(current => current === key ? null : key); }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
    <div className="overview-pie-total" aria-live="polite"><span>{active?.name ?? "Total de despesas"}</span><strong>{money(active?.value ?? total.toString(), company.currency)}</strong></div>

  </>;
}

export function OverviewUserRadar({ params }: { params: { startDate: string; endDate: string; accountId?: string } }) {
  const { company } = useWorkspace();
  const result = useScopedQuery<{ userId: string | null; name: string; income: string; expense: string; count: number }[]>("/dashboard/users", params);
  const rows = (result.data ?? []).map(item => ({
    ...item, fullName: item.name,
    name: item.userId ? item.name.replace(/^\[DEMO\]\s*/, "") : "Sem autoria",
    income: Number(item.income), expense: Number(item.expense),
  }));
  const users = rows.filter(item => item.userId !== null).length;
  const hasMovements = rows.some(item => item.count > 0);
  const unattributed = rows.some(item => item.userId === null && item.count > 0);
  return <section className="panel overview-user-radar">
    <div className="panel-title"><div><h2>Movimentação por usuário</h2><p>Receitas e despesas por responsável</p></div><span className="overview-account-count">{users} {users === 1 ? "usuário" : "usuários"}</span></div>
    {result.isPending ? <LoadingState rows={5} /> : result.isError ? <ErrorState error={result.error} retry={() => void result.refetch()} /> : !hasMovements ? <EmptyState title="Sem movimentações no período" /> : rows.length < 3 ? <EmptyState title="Usuários insuficientes para o radar" detail="A comparação em radar precisa de pelo menos três responsáveis." /> :
      <div className="overview-chart-canvas" role="group" aria-label="Radar com pontos de receitas e despesas por usuário">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <RadarChart data={rows} outerRadius="80%" accessibilityLayer margin={{ top: 12, right: 40, bottom: 12, left: 40 }}>
            <PolarGrid stroke="var(--input)" strokeWidth={1.2} />
            <PolarAngleAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickFormatter={name => String(name).length > 12 ? String(name).slice(0, 11) + "…" : String(name)} />
            <PolarRadiusAxis axisLine={false} tick={false} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={value => rows.find(row => row.name === value)?.fullName ?? String(value)} formatter={(value, name) => [money(value, company.currency), name]} />
            <Radar dataKey="income" name="Receitas" stroke={palette[0]} fill={palette[0]} fillOpacity={0.4} strokeWidth={2.5} dot={{ r: 4, fill: palette[0], fillOpacity: 1 }} isAnimationActive={false} />
            <Radar dataKey="expense" name="Despesas" stroke={palette[1]} fill={palette[1]} fillOpacity={0.35} strokeWidth={2.5} dot={{ r: 4, fill: palette[1], fillOpacity: 1 }} isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
      </div>}
    {unattributed && <p className="overview-chart-note">“Sem autoria” reúne lançamentos sem usuário registrado na auditoria.</p>}
  </section>;
}

const transactionKinds = [
  { type: "INCOME", name: "Receitas", fill: "var(--chart-1)" },
  { type: "EXPENSE", name: "Despesas", fill: "var(--destructive)" },
  { type: "TRANSFER", name: "Transferências", fill: "var(--chart-3)" },
  { type: "ADJUSTMENT", name: "Ajustes", fill: "var(--macc-silver)" },
];

export function OverviewTransactionTypes({ params }: { params: { startDate: string; endDate: string; accountId?: string } }) {
  const result = useScopedQuery<{ type: string; count: number }[]>("/dashboard/transaction-types", params);
  const [selected, setSelected] = useState<string | null>(null);
  const data = transactionKinds.map(kind => ({ ...kind, count: Number(result.data?.find(row => row.type === kind.type)?.count ?? 0) }));
  const sectors = data.filter(row => row.count > 0);
  const total = data.reduce((sum, row) => sum + row.count, 0);
  const focused = selected ?? sectors.toSorted((a, b) => b.count - a.count)[0]?.type;
  function renderSector(props: PieSectorShapeProps) {
    const active = sectors[props.index]?.type === focused;
    return <Sector {...props} outerRadius={props.outerRadius + (active ? 7 : 0)}
      style={{ filter: active ? "drop-shadow(0 6px 5px rgb(0 16 38 / 22%))" : undefined, cursor: "pointer" }} />;
  }
  return <section className="panel overview-transaction-types">
    <div className="panel-title"><div><h2>Tipos de transações</h2><p>Quantidade de lançamentos por tipo no período</p></div></div>
    {result.isPending ? <LoadingState rows={6} /> : result.isError ? <ErrorState error={result.error} retry={() => void result.refetch()} /> : total === 0 ? <EmptyState title="Sem transações no período" /> :
      <div className="transaction-types-layout">
        <div className="transaction-types-chart" role="group" aria-label={`Distribuição por tipo de ${total} transações. Inclui todos os status.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <PieChart accessibilityLayer>
              <Tooltip contentStyle={tooltipStyle} formatter={value => [`${Number(value).toLocaleString("pt-BR")} transações`, "Quantidade"]} />
              <Pie data={sectors} dataKey="count" nameKey="name" innerRadius="56%" outerRadius="85%" startAngle={90} endAngle={-270}
                stroke="var(--card)" strokeWidth={2} isAnimationActive={false} shape={renderSector} labelLine={false}
                onClick={(_, index) => { const type = sectors[index]?.type; if (type) setSelected(current => current === type ? null : type); }}
                label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, payload }) => {
                  if ((percent ?? 0) < 0.05) return null;
                  const radius = (Number(innerRadius) + Number(outerRadius)) / 2;
                  const angle = -(Number(midAngle) * Math.PI / 180);
                  return <text x={Number(cx) + Math.cos(angle) * radius} y={Number(cy) + Math.sin(angle) * radius}
                    dominantBaseline="central" textAnchor="middle" fill={payload.type === "ADJUSTMENT" ? "var(--foreground)" : "#fff"} fontSize={11} fontWeight={650} pointerEvents="none">
                    {((percent ?? 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                  </text>;
                }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="transaction-types-total"><strong>{total.toLocaleString("pt-BR")}</strong><span>transações</span></div>
        </div>
        <ul className="transaction-types-legend">{data.map(item => <li key={item.type} className={focused === item.type ? "is-highlighted" : undefined}>
          <span>{item.name}</span><strong><i style={{ background: item.fill }} aria-hidden="true" />{item.count.toLocaleString("pt-BR")}</strong>
        </li>)}</ul>
      </div>}
  </section>;
}
