"use client";
import { useMemo } from "react";
import { defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { scaleOrdinal } from "@tanstack/charts/scales/ordinal";
import { dateLabel, money } from "@/lib/utils";

export type CashRow = { date: string; income: string; expense: string; projectedIncome: string; projectedExpense: string };
const series = [
  { key: "income", label: "Receitas realizadas" }, { key: "expense", label: "Despesas realizadas" },
  { key: "projectedIncome", label: "Receitas previstas" }, { key: "projectedExpense", label: "Despesas previstas" },
] as const;

export default function CashChart({ rows, currency, projected = false }: { rows: CashRow[]; currency: string; projected?: boolean }) {
  const visible = useMemo(() => projected ? series : series.slice(0, 2), [projected]);
  const definition = useMemo(() => {
    const data = rows.flatMap(row => visible.map((item, index) => ({
      id: row.date + "-" + index,
      date: row.date,
      value: Number(row[item.key]),
      series: item.label,
    })));
    return defineChart({
      marks: [lineY(data, { x: "date", y: "value", z: "series" })],
      scales: {
        x: { scale: () => scalePoint<string>().padding(.25), axis: { ticks: { format: (value: string) => dateLabel(value).slice(0, 5) } } },
        y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { format: (value: number) => new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value) } } },
      },
      color: { scale: () => scaleOrdinal<string, string>().range(visible.map((_, index) => "var(--chart-" + (index + 1) + ")")) },
    });
  }, [rows, visible]);
  return <>
    <div className="chart-legend">{visible.map(item => <span key={item.key}><i aria-hidden="true" />{item.label}</span>)}</div>
    <div className="chart-box"><Chart definition={definition} height={280} ariaLabel="Séries de receitas e despesas por dia" /></div>
    <details className="chart-data">
      <summary>Ver dados em tabela</summary>
      <div className="table-overflow"><table className="entity-table"><thead><tr><th scope="col">Data</th>{visible.map(item => <th scope="col" key={item.key}>{item.label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.date}><td>{dateLabel(row.date)}</td>{visible.map(item => <td key={item.key}>{money(row[item.key], currency)}</td>)}</tr>)}</tbody></table></div>
    </details>
  </>;
}
