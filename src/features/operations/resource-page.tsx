"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeftRight, Filter, Plus, Search } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { normalizePage, type ApiPage, type ApiRow } from "@/lib/api";
import { useScopedQuery, useWorkspace } from "@/lib/workspace";
import { EntityTable } from "./entity-table";
import { ResourceField, ResourceForm, type ResourceFormProps } from "./resource-form";
import { resources, rowName, transferFields, type ActionSpec, type ResourceSpec } from "./definitions";

type Editor = Omit<ResourceFormProps, "onClose">;
type Filters = { q: string; status: string; startDate: string; endDate: string; type: string; financialAccountId: string; categoryId: string };
const emptyFilters: Filters = { q: "", status: "", startDate: "", endDate: "", type: "", financialAccountId: "", categoryId: "" };

function parseFilters(query: Record<string, unknown> | undefined, spec: ResourceSpec): Filters {
  const value = (key: keyof Filters) => typeof query?.[key] === "string" ? query[key] as string : "";
  const date = (key: "startDate" | "endDate") => spec.dateFilter && /^\d{4}-\d{2}-\d{2}$/.test(value(key)) && !Number.isNaN(Date.parse(value(key))) ? value(key) : "";
  const id = (key: "financialAccountId" | "categoryId") => /^[a-f0-9-]{36}$/i.test(value(key)) ? value(key) : "";
  const startDate = date("startDate");
  const endDate = date("endDate");
  const ordered = !startDate || !endDate || startDate <= endDate;
  return {
    q: value("q").slice(0, 160),
    status: spec.statuses?.some(item => item.value === value("status")) ? value("status") : "",
    type: spec.typeFilter?.some(item => item.value === value("type")) ? value("type") : "",
    startDate: ordered ? startDate : "",
    endDate: ordered ? endDate : "",
    financialAccountId: spec.accountFilter ? id("financialAccountId") : "",
    categoryId: spec.categoryFilter ? id("categoryId") : "",
  };
}
function populated(filters: Filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
}

export function actionEditor(spec: ResourceSpec, row: ApiRow, action: ActionSpec): Editor {
  return {
    path: spec.path + "/" + row.id + "/" + action.command,
    title: action.label, description: action.destructive ? "Confirme a alteração para registrar a operação no histórico." : rowName(row),
    fields: action.fields ?? [], row, submitLabel: action.label, destructive: action.destructive,
    includeVersion: spec.path === "/budgets" || spec.path === "/sales",
    defaults: action.command === "payments" ? { amount: row.outstandingAmount } : undefined,
  };
}

export function RecordActions({ spec, row, open, isDetail = false }: { spec: ResourceSpec; row: ApiRow; open: (editor: Editor) => void; isDetail?: boolean }) {
  const { can } = useWorkspace();
  const advanced = spec.path === "/sales" || spec.path === "/budgets";
  const canEdit = can(spec.write) && (advanced
    ? isDetail && ["DRAFT", "REJECTED"].includes(String(row.status))
    : spec.editFields || (isDetail && (spec.path === "/transactions" && ["DRAFT", "SCHEDULED"].includes(String(row.status)) ||
      ["/payables", "/receivables"].includes(spec.path) && ["OPEN", "OVERDUE", "PENDING"].includes(String(row.status)))));
  const actions = spec.actions?.filter(action => can(action.permission) && (!action.statuses || action.statuses.includes(String(row.status)))) ?? [];
  if (!canEdit && !actions.length && (!spec.detailRoute || isDetail)) return <span className="muted">—</span>;
  const editFields = spec.editFields ?? spec.fields.filter(field =>
    spec.path === "/transactions" ? field.key !== "type" : ["/payables", "/receivables"].includes(spec.path) ? field.key !== "originalAmount" : true,
  );
  return <div className="table-actions">
    {spec.detailRoute && !isDetail && <Button asChild variant="outline" size="small"><Link href={spec.detailRoute + "/" + row.id}>Detalhes</Link></Button>}
    {canEdit && <Button variant="outline" size="small" onClick={() => open({
      title: "Editar registro", path: spec.path + "/" + row.id, fields: editFields, method: "patch", row,
      collection: spec.path === "/sales" ? "items" : spec.path === "/budgets" ? "lines" : undefined,
      includeVersion: advanced,
    })}>Editar</Button>}
    {actions.map(action => <Button key={action.command} size="small" variant={action.destructive ? "danger" : "outline"}
      onClick={() => open(actionEditor(spec, row, action))}>{action.label}</Button>)}
  </div>;
}

export function ResourcePage({ resource, initialCreate, queryFilters }: { resource: string; initialCreate?: string; queryFilters?: Record<string, unknown> }) {
  const spec = resources[resource];
  const { company, can, feature } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(() => parseFilters(queryFilters, spec));
  const [draft, setDraft] = useState(filters);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterError, setFilterError] = useState("");
  const requiredFeature = spec.group === "Comercial" ? "SALES" : resource === "budgets" ? "BUDGETS" : "FINANCIAL_CORE";
  const permitted = can(spec.read) && feature(requiredFeature);
  const allowCreate = permitted && can(spec.write);
  const createEditor = (type?: string): Editor => ({
    title: type === "EXPENSE" ? "Nova despesa" : type === "INCOME" ? "Nova receita" : spec.createLabel,
    path: spec.path, fields: spec.fields,
    collection: resource === "sales" ? "items" : resource === "budgets" ? "lines" : undefined,
    defaults: type ? { type } : undefined,
    onSave: row => { if (row?.id && spec.detailRoute && (resource === "budgets" || resource === "sales")) router.push(spec.detailRoute + "/" + row.id); },
  });
  const [editor, setEditor] = useState<Editor | undefined>(() => allowCreate && initialCreate ? createEditor(initialCreate) : undefined);
  const params = {
    page, size: 25, ...populated(filters),
    ...(sort ? { sort } : {}),
  };
  const query = useScopedQuery<ApiPage<ApiRow> | ApiRow[]>(spec.path, params, { enabled: permitted });
  const result = query.data ? normalizePage(query.data) : undefined;
  const hasFilters = Object.values(filters).some(Boolean);

  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.startDate && draft.endDate && draft.startDate > draft.endDate) {
      setFilterError("A data final deve vir após a inicial.");
      return;
    }
    selectFilters(draft);
  }

  function selectFilters(next: Filters) {
    setDraft(next);
    setFilters(next);
    setPage(0);
    setFilterError("");
    setFilterOpen(false);
    const params = new URLSearchParams(populated(next)).toString();
    router.replace(pathname + (params ? "?" + params : ""), { scroll: false });
  }

  function reset() {
    selectFilters(emptyFilters);
  }

  const filterForm = <form className="filter-bar" onSubmit={apply}>
    <Field label="Buscar">{props => <input {...props} className="input" type="search" maxLength={160} placeholder="Nome ou descrição" value={draft.q} onChange={e => setDraft({ ...draft, q: e.target.value })} />}</Field>
    {spec.statuses && <Field label="Situação">{props => <select {...props} className="input" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="">Todas</option>{spec.statuses?.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>}</Field>}
    {spec.typeFilter && <Field label="Tipo">{props => <select {...props} className="input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}><option value="">Todos</option>{spec.typeFilter?.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>}</Field>}
    {spec.dateFilter && (["startDate", "endDate"] as const).map((key, index) => <Field key={key} label={index ? "Até" : "De"}>{props => <input {...props} type="date" className="input" value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />}</Field>)}
    {spec.accountFilter && <ResourceField spec={{ key: "financialAccountId", label: "Conta", type: "select", resource: "/financial-accounts" }} value={draft.financialAccountId} onChange={value => setDraft({ ...draft, financialAccountId: value })} />}
    {spec.categoryFilter && <ResourceField spec={{ key: "categoryId", label: "Categoria", type: "select", resource: "/financial-categories" }} value={draft.categoryId} onChange={value => setDraft({ ...draft, categoryId: value })} />}
    <Button variant="outline" size="small"><Search size={15} /> Aplicar</Button>
    {hasFilters && <Button type="button" variant="ghost" size="small" onClick={reset}>Limpar</Button>}
    {filterError && <p className="field-error" role="alert">{filterError}</p>}
  </form>;
  return <>
    <PageHeading eyebrow={spec.group} title={spec.title} subtitle={spec.subtitle} actions={<>
      {permitted && <Button variant="outline" className="mobile-only" onClick={() => setFilterOpen(true)}><Filter size={16} /> Filtros</Button>}
      {resource === "accounts" && can("transfers.create") && <Button variant="outline" onClick={() => setEditor({ title: "Nova transferência", path: "/transfers", fields: transferFields, submitLabel: "Transferir" })}><ArrowLeftRight size={17} /> Transferir</Button>}
      {allowCreate && <Button onClick={() => setEditor(createEditor())}><Plus size={18} /> {spec.createLabel}</Button>}
    </>} />
    {permitted && ["payables", "receivables"].includes(resource) && <div className="obligation-tabs" aria-label="Situação da conta">
      {[{ value: "", label: "Todas" }, ...(spec.statuses ?? [])].map(item => <Button key={item.value} size="small" variant={filters.status === item.value ? "primary" : "outline"}
        aria-pressed={filters.status === item.value} onClick={() => selectFilters({ ...filters, status: item.value })}>{item.label}</Button>)}
    </div>}
    <section className="panel">
      {permitted && <div className="desktop-filter">{filterForm}</div>}
      {!permitted ? <EmptyState title="Acesso restrito" detail="Seu papel neste workspace não permite consultar estes dados." /> :
        query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={() => void query.refetch()} /> :
          !result?.items.length ? <EmptyState title={hasFilters ? "Nenhum resultado para estes filtros" : "Nenhum registro neste workspace"}
            detail={hasFilters ? "Altere os filtros para ampliar a busca." : "Os registros desta empresa aparecerão aqui."}
            action={hasFilters ? <Button size="small" variant="outline" onClick={reset}>Limpar filtros</Button> : allowCreate ? <Button size="small" variant="outline" onClick={() => setEditor(createEditor())}>{spec.createLabel}</Button> : undefined} /> :
            <EntityTable rows={result.items} columns={spec.columns} detailRoute={spec.detailRoute} actions={row => <RecordActions spec={spec} row={row} open={setEditor} />}
              sort={sort} sortBy={key => { setSort(key + (sort === key + ",asc" ? ",desc" : ",asc")); setPage(0); }} />}
      {result && (page > 0 || result.totalPages > 1) && <div className="pagination">
        <span>{result.totalItems} registros · Página {page + 1} de {Math.max(1, result.totalPages)}</span>
        <Button variant="outline" size="small" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
        <Button variant="outline" size="small" disabled={page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
      </div>}
    </section>
    {filterOpen && <Dialog open onOpenChange={() => setFilterOpen(false)} title="Filtrar registros">{filterForm}</Dialog>}
    {editor && <ResourceForm key={company.id + editor.path + editor.title} {...editor} onClose={() => setEditor(undefined)} />}
  </>;
}
