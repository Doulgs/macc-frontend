"use client";
import { useId, useMemo } from "react";
import Decimal from "decimal.js";
import { areaY, barY, defineChart, stack, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { d3Curve } from "@tanstack/charts/d3/shape";
import { curveMonotoneX } from "d3-shape";
import { crosshair } from "@tanstack/charts/crosshair";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scalePoint } from "@tanstack/charts/scales/point";
import { dateLabel, money } from "@/lib/utils";

export type CashRow = { date: string; income: string; expense: string; projectedIncome: string; projectedExpense: string };
const series = [
  { key: "income", label: "Receitas realizadas", color: "var(--chart-1)" },
  { key: "expense", label: "Despesas realizadas", color: "var(--chart-2)" },
  { key: "projectedIncome", label: "Receitas previstas", color: "var(--chart-3)" },
  { key: "projectedExpense", label: "Despesas previstas", color: "var(--chart-4)" },
] as const;
const curve = d3Curve(curveMonotoneX);

export type CashChartView = "income" | "expense" | "compare";

export default function CashChart({ rows, currency, projected = false, view, bars = false }: { rows: CashRow[]; currency: string; projected?: boolean; view: CashChartView; bars?: boolean }) {
  const patternId = "income-stripes-" + useId().replaceAll(":", "");
  const visible = useMemo(() => projected ? series : view === "compare" ? series.slice(0, 2) : series.filter(item => item.key === view), [view, projected]);
  const totals = visible.map(item => ({ ...item, total: rows.reduce((sum, row) => sum.plus(row[item.key] ?? 0), new Decimal(0)).toString() }));
  const bucketSize = Math.max(1, Math.ceil(rows.length / 8));
  const chartRows = bars ? rows.filter((_, index) => index % bucketSize === 0).map((row, index) => {
    const bucket = rows.slice(index * bucketSize, (index + 1) * bucketSize);
    return { ...row, date: row.date + "/" + bucket[bucket.length - 1].date,
      ...Object.fromEntries(series.map(item => [item.key, bucket.reduce((sum, entry) => sum.plus(entry[item.key] ?? 0), new Decimal(0)).toString()])) };
  }) : rows;
  const definition = defineChart({
    marks: bars ? [barY(chartRows.flatMap(row => visible.toReversed().map(item => ({ date: row.date, value: Number(row[item.key]), series: item.label, color: item.key === "income" ? `url(#${patternId})` : "var(--macc-steel)" }))), {
      x: "date", y: "value", z: "series", fill: datum => datum.color, layout: stack(), maxThickness: 30, radius: 6, stroke: "var(--muted)", strokeWidth: 3,
    }), crosshair({ x: true, y: false })] : [
      ...visible.flatMap(item => {
        const data = rows.map(row => ({ date: row.date, value: Number(row[item.key]), series: item.label }));
        const line = lineY(data, { x: "date", y: "value", stroke: item.color, strokeWidth: 2.5, curve, strokeDasharray: item.key.startsWith("projected") ? "5 5" : undefined });
        return !projected && visible.length === 1
          ? [areaY(data, { x: "date", y: "value", fill: "url(#cash-area)", fillOpacity: 1, curve }), line]
          : [line];
      }),
      crosshair({ x: true, y: false }),
    ],
    gradients: [{ id: "cash-area", y1: 0, y2: 1, stops: [{ offset: 0, color: visible[0].color, opacity: 0.25 }, { offset: 1, color: visible[0].color, opacity: 0.01 }] }],
    scales: {
      x: { scale: bars ? () => scaleBand<string>().padding(0.25) : () => scalePoint<string>().padding(0.15), axis: { ticks: { values: bars ? chartRows.map(row => row.date) : rows.filter((_, index) => index % Math.max(1, Math.ceil((rows.length - 1) / 5)) === 0 || index === rows.length - 1).map(row => row.date), line: false, format: (value: string) => dateLabel(value.split("/")[0]).slice(0, 5) } } },
      y: { scale: scaleLinear, includeZero: true, nice: true, grid: { stroke: "var(--border)", strokeOpacity: 0.7, strokeDasharray: "3 4" }, axis: { line: false, ticks: { count: 5, line: false, format: (value: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency, maximumFractionDigits: 0 }).format(value) } } },
    },
    focus: "group-x",
    tooltip: { use: tooltip, formatGroup: points => [String(points[0]?.xValue ?? "").split("/").map(date => dateLabel(date)).join(" a "), ...points.filter((point, index, all) => all.findIndex(other => other.datum.series === point.datum.series) === index).map(point => `${point.datum.series}: ${money(point.datum.value, currency)}`)].join("\n") },
  });
  return <>
    {bars && <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false"><defs>
      <pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <rect width="5" height="5" fill="var(--chart-1)" /><line x1="0" y1="0" x2="0" y2="5" stroke="var(--macc-deep-blue)" strokeWidth="2" />
      </pattern>
    </defs></svg>}
    <div className="cash-chart-totals">{totals.map(item => <div key={item.key}><span><i style={{ background: bars ? item.key === "income" ? "var(--chart-1)" : "var(--macc-steel)" : item.color }} aria-hidden="true" />{item.label}</span><strong>{money(item.total, currency)}</strong></div>)}</div>
    <div className="chart-box cash-area-chart"><Chart definition={definition} height={bars ? 160 : 260} ariaLabel={bars ? "Receitas e despesas em barras empilhadas por intervalo de datas" : projected ? "Receitas e despesas realizadas e previstas por dia" : "Evolução diária de " + visible.map(item => item.label.toLowerCase()).join(" e ")} ariaDescription="Use as setas do teclado ou posicione o cursor sobre o gráfico para consultar os valores por data." /></div>

  </>;
}
