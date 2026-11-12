"use client";
import Link from "next/link";
import { useState } from "react";
import Decimal from "decimal.js";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { type ApiRow } from "@/lib/api";
import { dateLabel, money } from "@/lib/utils";
import { useScopedQuery, useWorkspace } from "@/lib/workspace";
import { EntityTable, StatusBadge } from "./entity-table";
import { ResourceForm, type ResourceFormProps } from "./resource-form";
import { RecordActions } from "./resource-page";
import { labels, resources, rowName, rowValue, type ColumnSpec } from "./definitions";

type Editor = Omit<ResourceFormProps, "onClose">;

function rows(value: unknown): ApiRow[] {
  return Array.isArray(value) ? value.filter((row): row is ApiRow => typeof row?.id === "string") : [];
}
function valueObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}
const movementColumns: ColumnSpec[] = [
  { key: "effectiveDate", label: "Data", type: "date", aliases: ["postingDate", "createdAt"] },
  { key: "accountName", label: "Conta" }, { key: "kind", label: "Tipo", type: "kind" }, { key: "amountSigned", label: "Valor", type: "money", aliases: ["amount"] },
];
const paymentColumns: ColumnSpec[] = [
  { key: "paidAt", label: "Data", type: "date", aliases: ["createdAt"] }, { key: "amount", label: "Valor", type: "money" }, { key: "status", label: "Situação", type: "status" },
];
const installmentColumns: ColumnSpec[] = [
  { key: "installmentNumber", label: "Parcela", aliases: ["sequence", "number"] }, { key: "dueDate", label: "Vencimento", type: "date" },
  { key: "originalAmount", label: "Valor", type: "money", aliases: ["amount"] },
  { key: "outstandingAmount", label: "Em aberto", type: "money" }, { key: "status", label: "Situação", type: "status" },
];
const saleItemColumns: ColumnSpec[] = [
  { key: "descriptionSnapshot", label: "Item", aliases: ["description"] }, { key: "quantity", label: "Quantidade" },
  { key: "unitPrice", label: "Preço", type: "money" }, { key: "discountAmount", label: "Desconto", type: "money" },
  { key: "lineTotal", label: "Total", type: "money", aliases: ["total"] },
];

function DetailTable({ title, data, columns, actions }: { title: string; data: unknown; columns: ColumnSpec[]; actions?: (row: ApiRow) => React.ReactNode }) {
  const entries = rows(data);
  return <section className="panel"><div className="panel-title"><h2>{title}</h2></div>
    {entries.length ? <EntityTable rows={entries} columns={columns} actions={actions} /> : <EmptyState title="Sem registros" />}
  </section>;
}

function BudgetBreakdown({ row }: { row: ApiRow }) {
  const { company } = useWorkspace();
  const totals = valueObject(row.totals);
  return <section className="panel list-stack"><h2>Execução por categoria</h2>
    <dl className="detail-grid">
      {[["Planejado", totals.planned ?? totals.limitAmount ?? row.totalLimit], ["Realizado", totals.actual ?? totals.actualAmount ?? row.totalRealized], ["Disponível", totals.available ?? totals.availableAmount ?? row.totalRemaining]].map(([label, amount]) =>
        <div key={String(label)}><dt>{String(label)}</dt><dd>{money(amount, company.currency)}</dd></div>,
      )}
    </dl>
    {rows(row.lines).length ? <div className="list-stack">{rows(row.lines).map(line => {
      const limit = line.limitAmount ?? line.planned;
      const actual = line.actualAmount ?? line.actual ?? line.realizedAmount;
      const percent = decimalRatio(actual, limit);
      const alert = Number(line.alertPercentage ?? 80);
      const state = percent > 100 ? "danger" : percent >= alert ? "warning" : "normal";
      const params = new URLSearchParams({ categoryId: String(line.categoryId ?? ""), startDate: String(row.periodStart ?? ""), endDate: String(row.periodEnd ?? ""), status: "CONFIRMED" });
      return <article key={line.id} className="budget-line">
        <div className="panel-title"><div><h3>{String(line.categoryName ?? line.name ?? "Categoria")}</h3><p>{money(actual, company.currency)} de {money(limit, company.currency)}</p></div>
          <span className={"badge " + (state === "danger" ? "badge-danger" : state === "warning" ? "badge-warning" : "badge-good")}>{state === "danger" ? "Acima do limite" : state === "warning" ? "Em alerta" : "Dentro do limite"}</span></div>
        <div className="progress-track" data-state={state} role="progressbar" aria-label="Percentual realizado" aria-valuenow={Math.min(100, percent)} aria-valuetext={percent.toFixed(1) + "%"}><span style={{ width: Math.min(100, percent) + "%" }} /></div>
        <Button asChild variant="ghost" size="small"><Link href={"/financeiro/transacoes?" + params.toString()}>Ver lançamentos <ArrowUpRight size={14} /></Link></Button>
      </article>;
    })}</div> : <EmptyState title="Nenhuma categoria neste orçamento" />}
  </section>;
}

function decimalRatio(actual: unknown, limit: unknown) {
  try {
    const denominator = new Decimal(String(limit));
    return denominator.isPositive() ? Math.max(0, new Decimal(String(actual)).div(denominator).mul(100).toNumber()) : 0;
  } catch { return 0; }
}

export function ResourceDetail({ resource, id }: { resource: string; id: string }) {
  const spec = resources[resource];
  const { can, company, feature } = useWorkspace();
  const [editor, setEditor] = useState<Editor>();
  const valid = /^[0-9a-f-]{36}$/i.test(id);
  const requiredFeature = spec.group === "Comercial" ? "SALES" : resource === "budgets" ? "BUDGETS" : "FINANCIAL_CORE";
  const permitted = can(spec.read) && feature(requiredFeature);
  const query = useScopedQuery<ApiRow>(spec.path + "/" + id, undefined, { enabled: valid && permitted });
  if (!valid || !permitted) return <EmptyState title={valid ? "Acesso restrito" : "Registro não encontrado"} />;
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const row = query.data;
  const detailFields = spec.columns.filter(column => column.type !== "status");
  const saleTotals = [
    { key: "subtotal", label: "Subtotal", type: "money" },
    { key: "discountTotal", label: "Descontos", type: "money" },
    { key: "taxTotal", label: "Impostos informativos", type: "money" },
    { key: "received", label: "Recebido", type: "money", aliases: ["receivedAmount", "paidAmount"] },
    { key: "outstanding", label: "Em aberto", type: "money", aliases: ["outstandingAmount", "openAmount"] },
  ] satisfies ColumnSpec[];
  const customerFields = [
    { key: "documentNumber", label: "CPF/CNPJ" }, { key: "address", label: "Endereço" },
  ] satisfies ColumnSpec[];
  const accountFields = [
    { key: "institution", label: "Instituição" }, { key: "openingDate", label: "Abertura", type: "date" },
  ] satisfies ColumnSpec[];
  const recordFields: ColumnSpec[] = resource === "sales" ? [...detailFields, ...saleTotals]
    : resource === "customers" ? [...detailFields, ...customerFields]
    : resource === "accounts" ? [...detailFields, ...accountFields] : detailFields;
  return <>
    <Button variant="ghost" size="small" asChild><Link href={spec.detailRoute ?? "/dashboard"}><ArrowLeft size={16} /> {spec.title}</Link></Button>
    <PageHeading eyebrow={spec.group} title={rowName(row)} subtitle={row.status ? labels[String(row.status)] ?? String(row.status) : undefined}
      actions={<RecordActions spec={spec} row={row} open={setEditor} isDetail />} />
    <div className="list-stack">
      <section className="panel"><div className="panel-title"><h2>Resumo</h2>{row.status !== undefined && <StatusBadge value={row.status} />}</div>
        <dl className="detail-grid">{recordFields.map(field => {
          const value = rowValue(row, field.key, field.aliases);
          return <div key={field.key}><dt>{field.label}</dt><dd>{field.type === "money" ? money(value, company.currency)
            : field.type === "date" ? dateLabel(value, company.timezone) : String(labels[String(value)] ?? value ?? "—")}</dd></div>;
        })}</dl>
      </section>
      {resource === "sales" && <>
        <DetailTable title="Itens da venda" data={row.items} columns={saleItemColumns} />
        <DetailTable title="Parcelas e recebíveis" data={row.installments ?? row.receivables} columns={installmentColumns}
          actions={item => <Button asChild variant="outline" size="small"><Link href={"/financeiro/a-receber/" + String(item.receivableId ?? item.id)}>Abrir recebível</Link></Button>} />
      </>}
      {resource === "budgets" && <>
        <BudgetBreakdown row={row} />
        {Array.isArray(row.approvals) && <DetailTable title="Histórico de aprovação" data={row.approvals} columns={[
          { key: "decidedAt", label: "Data", type: "date" }, { key: "actorName", label: "Responsável" }, { key: "decision", label: "Decisão", type: "status", aliases: ["action"] }, { key: "comment", label: "Comentário" },
        ]} />}
      </>}
      {["transactions", "accounts"].includes(resource) && <DetailTable title="Movimentos financeiros" data={row.movements} columns={movementColumns} />}
      {["payables", "receivables"].includes(resource) && <DetailTable title="Histórico de baixas" data={row.payments} columns={paymentColumns}
        actions={can("transactions.reverse") ? payment => payment.reversedAt || payment.status === "REVERSED" ? null : <Button variant="danger" size="small"
          onClick={() => setEditor({ path: "/payments/" + payment.id + "/reverse", fields: [{ key: "reason", label: "Motivo", type: "textarea" }],
            title: "Estornar baixa", description: "O valor voltará a ficar em aberto e a movimentação será registrada no histórico.", destructive: true, submitLabel: "Estornar baixa" })}>Estornar</Button> : undefined} />}
      {resource === "customers" && <>
        <DetailTable title="Histórico de vendas" data={row.sales} columns={resources.sales.columns.filter(column => column.type !== "link")} actions={sale => <Button asChild variant="outline" size="small"><Link href={"/vendas/" + sale.id}>Ver venda</Link></Button>} />
        <DetailTable title="Recebíveis" data={row.receivables} columns={installmentColumns} />
      </>}
      {Array.isArray(row.audit) && <DetailTable title="Histórico de alterações" data={row.audit} columns={[{ key: "createdAt", label: "Data", type: "date" }, { key: "action", label: "Ação" }]} />}
    </div>
    {editor && <ResourceForm {...editor} key={editor.path} onClose={() => setEditor(undefined)} />}
  </>;
}
