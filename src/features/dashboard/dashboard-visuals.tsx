"use client";

import { useId, useState } from "react";
import Decimal from "decimal.js";
import { arc, pie } from "d3-shape";
import { money } from "@/lib/utils";

const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--macc-silver)"];

export function MetricSparkline({ values }: { values: number[] }) {
  const id = useId().replaceAll(":", "");
  if (values.length < 2 || !values.some(value => value !== 0)) return null;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${index / (values.length - 1) * 100},${36 - value / max * 32}`);
  return <svg className="metric-sparkline" viewBox="0 0 100 40" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor="currentColor" stopOpacity="0.24" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    <path d={`M0,40 L${points.join(" L")} L100,40 Z`} fill={`url(#${id})`} />
    <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
  </svg>;
}

export function CategoryDonut({ categories, currency }: {
  categories: { categoryId?: string; name: string; expense: string }[];
  currency: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const sorted = categories.filter(item => new Decimal(item.expense).gt(0)).toSorted((a, b) => new Decimal(b.expense).cmp(a.expense));
  const total = sorted.reduce((sum, item) => sum.plus(item.expense), new Decimal(0));
  const items = sorted.length > 6 ? [...sorted.slice(0, 5), { name: "Outras", expense: sorted.slice(5).reduce((sum, item) => sum.plus(item.expense), new Decimal(0)).toString() }] : sorted;
  const active = items.find(item => (item.categoryId ?? item.name) === selected);
  const segments = pie<(typeof items)[number]>().sort(null).value(item => Number(item.expense))(items);
  const shape = arc<(typeof segments)[number]>().innerRadius(55).outerRadius(95).cornerRadius(21).padAngle(0.025);
  const labelPosition = arc<(typeof segments)[number]>().innerRadius(75).outerRadius(75);
  function toggle(key: string) { setSelected(current => current === key ? null : key); }
  return <div className="category-donut-layout">
    <div className="category-donut">
      <svg viewBox="0 0 210 210" role="group" aria-label="Despesas por categoria. Clique em um segmento ou use Tab e Enter para destacar. Escape limpa a seleção.">
        {segments.map((segment, index) => {
          const item = segment.data;
          const share = total.isZero() ? 0 : new Decimal(item.expense).div(total).mul(100).toNumber();
          const key = item.categoryId ?? item.name;
          const focused = selected === key;
          const muted = !!active && !focused;
          const [x, y] = labelPosition.centroid(segment);
          const angle = (segment.startAngle + segment.endAngle) / 2;
          const dx = focused ? Math.sin(angle) * 4 : 0;
          const dy = focused ? -Math.cos(angle) * 4 : 0;
          const percent = share.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
          return <g key={key} className="donut-segment" role="button" tabIndex={0} aria-pressed={focused}
            aria-label={`${item.name}: ${money(item.expense, currency)} (${percent})`}
            transform={`translate(${105 + dx} ${105 + dy})`}
            onClick={() => toggle(key)} onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(key); }
              if (event.key === "Escape") { event.preventDefault(); setSelected(null); }
            }}>
            <path d={shape(segment) ?? undefined} fill={muted ? "var(--muted)" : colors[index]} />
            {share >= 5 && <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="donut-segment-label" fill={muted || index === 5 ? "var(--foreground)" : "#fff"}>{percent}</text>}
            <title>{item.name}: {money(item.expense, currency)} ({percent})</title>
          </g>;
        })}
      </svg>
      <div className="donut-center" aria-live="polite"><small>{active ? active.name : "Total de despesas"}</small><strong>{money(active?.expense ?? total.toString(), currency)}</strong></div>
    </div>
    <ul className="donut-legend">{items.map((item, index) => {
      const key = item.categoryId ?? item.name;
      const share = total.isZero() ? 0 : new Decimal(item.expense).div(total).mul(100).toNumber();
      return <li key={key} className={selected === key ? "donut-legend-active" : undefined}>
        <i style={{ background: colors[index] }} aria-hidden="true" />
        <span><span className="donut-category-name">{item.name}</span><small>{money(item.expense, currency)}</small></span>
        <strong>{share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong>
      </li>;
    })}</ul>
  </div>;
}
