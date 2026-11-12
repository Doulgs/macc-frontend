import type { ApiRow } from "@/lib/api";

export type Option = { value: string; label: string };
export type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "date" | "amount" | "number" | "email" | "select" | "textarea";
  required?: boolean;
  default?: string | number;
  options?: Option[];
  resource?: string;
  params?: object;
  full?: boolean;
  min?: number;
  max?: number;
  zero?: boolean;
};
export type ColumnSpec = { key: string; label: string; type?: "money" | "date" | "status" | "link" | "kind" | "number"; aliases?: string[] };
export type ActionSpec = { command: string; label: string; permission: string; statuses?: string[]; fields?: FieldSpec[]; destructive?: boolean };
export type ResourceSpec = {
  path: string; group: string; title: string; subtitle: string; createLabel: string;
  read: string; write: string; fields: FieldSpec[]; editFields?: FieldSpec[]; columns: ColumnSpec[];
  detailRoute?: string; actions?: ActionSpec[]; statuses?: Option[]; dateFilter?: boolean;
  typeFilter?: Option[]; accountFilter?: boolean; categoryFilter?: boolean;
};

export const options = (values: Record<string, string>) => Object.entries(values).map(([value, label]) => ({ value, label }));
const activeStatuses = options({ ACTIVE: "Ativo", ARCHIVED: "Arquivado" });
const paymentStatuses = options({ OPEN: "Em aberto", OVERDUE: "Vencido", PARTIAL: "Parcial", PAID: "Liquidado", CANCELED: "Cancelado" });
const transactionStatuses = options({ SCHEDULED: "Agendado", CONFIRMED: "Confirmado", REVERSED: "Estornado", CANCELED: "Cancelado" });
const transactionTypes = options({ INCOME: "Receita", EXPENSE: "Despesa" });
const accountTypes = options({ BANK: "Conta bancária", CHECKING: "Conta corrente", CASH: "Caixa", WALLET: "Carteira", SAVINGS: "Poupança", CREDIT_CARD: "Cartão de crédito", INVESTMENT: "Investimento", OTHER: "Outra" });
const catalogTypes = options({ PRODUCT: "Produto", SERVICE: "Serviço" });

const status: ColumnSpec = { key: "status", label: "Situação", type: "status" };
const activeStatus: FieldSpec = { key: "status", label: "Situação", type: "select", options: activeStatuses, default: "ACTIVE" };
const name: FieldSpec = { key: "name", label: "Nome", required: true };
const description: FieldSpec = { key: "description", label: "Descrição", required: true };
const account: FieldSpec = { key: "financialAccountId", label: "Conta financeira", type: "select", resource: "/financial-accounts", required: true };
const category: FieldSpec = { key: "categoryId", label: "Categoria", type: "select", resource: "/financial-categories" };
const customer: FieldSpec = { key: "customerId", label: "Cliente", type: "select", resource: "/customers" };
const amount: FieldSpec = { key: "amount", label: "Valor", type: "amount", required: true };
const date: FieldSpec = { key: "effectiveDate", label: "Data efetiva", type: "date", default: "today", required: true };

const accountFields: FieldSpec[] = [name, { key: "type", label: "Tipo", type: "select", options: accountTypes, required: true },
  { key: "institution", label: "Banco ou instituição" }, { key: "openingDate", label: "Data de abertura", type: "date", default: "today" },
  { key: "initialBalance", label: "Saldo inicial", type: "amount", default: "0", zero: true }];
const categoryFields: FieldSpec[] = [name, { key: "kind", label: "Tipo", type: "select", options: transactionTypes, required: true }];
const customerFields: FieldSpec[] = [name, { key: "email", label: "E-mail", type: "email" }, { key: "phone", label: "Telefone" },
  { key: "documentType", label: "Tipo de documento", type: "select", options: options({ CPF: "CPF", CNPJ: "CNPJ" }) }, { key: "documentNumber", label: "CPF/CNPJ" }, { key: "address", label: "Endereço", type: "textarea", full: true }];
const catalogFields: FieldSpec[] = [name, { key: "kind", label: "Tipo", type: "select", options: catalogTypes, required: true },
  { key: "sku", label: "SKU" }, { key: "unit", label: "Unidade" }, { key: "basePrice", label: "Preço base", type: "amount", required: true, zero: true }];

function obligation(receive: boolean): ResourceSpec {
  return {
    path: receive ? "/receivables" : "/payables", title: receive ? "Contas a receber" : "Contas a pagar", group: "Financeiro",
    subtitle: receive ? "Acompanhe vencimentos, recebimentos e saldos em aberto." : "Organize vencimentos, pagamentos e saldos em aberto.",
    createLabel: receive ? "Novo recebível" : "Nova conta a pagar", detailRoute: receive ? "/financeiro/a-receber" : "/financeiro/a-pagar", read: "financial.read", write: "financial.write",
    fields: [description, receive ? customer : { key: "supplierName", label: "Fornecedor" },
      { key: "originalAmount", label: "Valor original", type: "amount", required: true },
      { key: "dueDate", label: "Vencimento", type: "date", default: "today", required: true },
      { ...category, params: { kind: receive ? "INCOME" : "EXPENSE" } }],
    statuses: paymentStatuses, dateFilter: true,
    columns: [{ key: "description", label: "Descrição", type: "link" }, { key: "dueDate", label: "Vencimento", type: "date" },
      { key: "originalAmount", label: "Total", type: "money" }, { key: "outstandingAmount", label: "Em aberto", type: "money" }, status],
    actions: [
      { command: "payments", label: receive ? "Receber" : "Pagar", permission: "financial.write", statuses: ["OPEN", "OVERDUE", "PARTIAL", "PENDING"],
        fields: [account, amount, { key: "paidAt", label: receive ? "Data do recebimento" : "Data do pagamento", type: "date", default: "today", required: true }] },
      { command: "cancel", label: "Cancelar", permission: "financial.write", statuses: ["OPEN", "PENDING", "OVERDUE"], destructive: true },
    ],
  };
}

export const resources: Record<string, ResourceSpec> = {
  accounts: {
    path: "/financial-accounts", group: "Financeiro", title: "Contas financeiras", subtitle: "Cadastre contas, acompanhe saldos e transfira valores.",
    createLabel: "Nova conta", detailRoute: "/financeiro/contas", read: "financial.read", write: "financial.write", fields: accountFields,
    editFields: [name, { key: "type", label: "Tipo", type: "select", options: accountTypes }, { key: "institution", label: "Banco ou instituição" }, activeStatus],
    statuses: activeStatuses, columns: [{ key: "name", label: "Conta", type: "link" }, { key: "type", label: "Tipo", type: "kind" },
      { key: "balance", label: "Saldo", type: "money", aliases: ["currentBalance", "availableBalance"] }, status],
  },
  transactions: {
    path: "/transactions", group: "Financeiro", title: "Transações", subtitle: "Registre receitas e despesas e acompanhe as movimentações confirmadas.",
    createLabel: "Novo lançamento", detailRoute: "/financeiro/transacoes", read: "financial.read", write: "financial.write", statuses: transactionStatuses,
    dateFilter: true, typeFilter: transactionTypes, accountFilter: true, categoryFilter: true,
    fields: [{ key: "type", label: "Tipo", type: "select", options: transactionTypes, default: "EXPENSE", required: true }, date, description, account, { ...category, required: true }, amount],
    columns: [{ key: "effectiveDate", label: "Data", type: "date" }, { key: "description", label: "Descrição", type: "link" },
      { key: "type", label: "Tipo", type: "kind" }, { key: "financialAccountName", label: "Conta" }, { key: "categoryName", label: "Categoria" }, { key: "amount", label: "Valor", type: "money" }, status],
    actions: [
      { command: "confirm", label: "Confirmar", permission: "transactions.confirm", statuses: ["SCHEDULED", "DRAFT"] },
      { command: "cancel", label: "Cancelar", permission: "financial.write", statuses: ["SCHEDULED", "DRAFT"], destructive: true },
      { command: "reverse", label: "Estornar", permission: "transactions.reverse", statuses: ["CONFIRMED"], destructive: true,
        fields: [{ key: "reason", label: "Motivo", type: "textarea" }] },
    ],
  },
  payables: obligation(false), receivables: obligation(true),
  categories: {
    path: "/financial-categories", group: "Configurações", title: "Categorias", subtitle: "Classifique lançamentos para acompanhar gastos e receitas.",
    createLabel: "Nova categoria", read: "financial.read", write: "financial.write",
    fields: [...categoryFields, { ...category, key: "parentId", label: "Categoria pai" }],
    editFields: [...categoryFields, { ...category, key: "parentId", label: "Categoria pai" }, activeStatus], statuses: activeStatuses,
    columns: [{ key: "name", label: "Categoria" }, { key: "kind", label: "Tipo", type: "kind" }, status],
  },
  customers: {
    path: "/customers", group: "Comercial", title: "Clientes", subtitle: "Centralize os dados de contato e consulte o histórico comercial.",
    createLabel: "Novo cliente", detailRoute: "/clientes", read: "customer.read", write: "customer.write", fields: customerFields,
    editFields: [...customerFields, activeStatus], statuses: activeStatuses,
    columns: [{ key: "name", label: "Cliente", type: "link" }, { key: "email", label: "E-mail" }, { key: "phone", label: "Telefone" }, status],
  },
  catalog: {
    path: "/catalog-items", group: "Comercial", title: "Catálogo", subtitle: "Cadastre produtos e serviços usados nas vendas.",
    createLabel: "Novo item", read: "catalog.read", write: "catalog.write", fields: catalogFields,
    editFields: [...catalogFields, activeStatus], statuses: activeStatuses,
    columns: [{ key: "name", label: "Item" }, { key: "kind", label: "Tipo", type: "kind" }, { key: "sku", label: "SKU" }, { key: "basePrice", label: "Preço base", type: "money" }, status],
  },
  budgets: {
    path: "/budgets", group: "Planejamento", title: "Orçamentos", subtitle: "Defina limites por categoria e acompanhe o valor realizado.",
    createLabel: "Novo orçamento", read: "budget.read", write: "budget.write", detailRoute: "/orcamentos",
    statuses: options({ DRAFT: "Rascunho", SUBMITTED: "Em aprovação", APPROVED: "Aprovado", REJECTED: "Rejeitado", ACTIVE: "Ativo", CLOSED: "Encerrado", ARCHIVED: "Arquivado" }),
    fields: [name, { key: "periodStart", label: "Início", type: "date", required: true }, { key: "periodEnd", label: "Fim", type: "date", required: true }],
    columns: [{ key: "name", label: "Orçamento", type: "link" }, { key: "periodStart", label: "Início", type: "date" }, { key: "periodEnd", label: "Fim", type: "date" }, status],
    actions: [
      { command: "submit", label: "Enviar para aprovação", permission: "budget.submit", statuses: ["DRAFT", "REJECTED"] },
      { command: "approve", label: "Aprovar", permission: "budget.approve", statuses: ["SUBMITTED"], fields: [{ key: "comment", label: "Comentário", type: "textarea" }] },
      { command: "reject", label: "Rejeitar", permission: "budget.approve", statuses: ["SUBMITTED"], destructive: true, fields: [{ key: "comment", label: "Justificativa", type: "textarea", required: true }] },
      { command: "activate", label: "Ativar", permission: "budget.approve", statuses: ["APPROVED"] },
      { command: "close", label: "Encerrar", permission: "budget.approve", statuses: ["ACTIVE"] },
      { command: "archive", label: "Arquivar", permission: "budget.approve", statuses: ["CLOSED", "REJECTED"] },
    ],
  },
  sales: {
    path: "/sales", group: "Comercial", title: "Vendas", subtitle: "Monte pedidos, confirme vendas e acompanhe as parcelas geradas.",
    createLabel: "Nova venda", read: "sales.read", write: "sales.write", detailRoute: "/vendas", dateFilter: true,
    statuses: options({ DRAFT: "Rascunho", CONFIRMED: "Confirmado", CANCELED: "Cancelado" }),
    fields: [{ ...customer, required: true }, { key: "installmentCount", label: "Número de parcelas", type: "number", default: 1, min: 1, max: 36, required: true },
      { key: "firstDueDate", label: "Primeiro vencimento", type: "date", default: "today", required: true },
      { key: "intervalDays", label: "Intervalo entre parcelas (dias)", type: "number", default: 30, min: 1, max: 365 },
      { key: "taxTotal", label: "Impostos informativos", type: "amount", default: 0, zero: true }],
    columns: [{ key: "saleNumber", label: "Venda", type: "link", aliases: ["code", "number", "name"] },
      { key: "customerName", label: "Cliente" }, { key: "total", label: "Total", type: "money" }, status],
    actions: [
      { command: "confirm", label: "Confirmar venda", permission: "sales.confirm", statuses: ["DRAFT"] },
      { command: "cancel", label: "Cancelar venda", permission: "sales.cancel", statuses: ["DRAFT", "CONFIRMED"], destructive: true },
    ],
  },
};

export const transferFields: FieldSpec[] = [
  { ...account, key: "sourceAccountId", label: "Conta de origem" },
  { ...account, key: "destinationAccountId", label: "Conta de destino" }, amount, date,
  { ...description, required: false },
];
export const budgetLineFields: FieldSpec[] = [
  { ...category, params: { kind: "EXPENSE" }, required: true },
  { key: "limitAmount", label: "Limite", type: "amount", required: true },
  { key: "alertPercentage", label: "Alerta (%)", type: "amount", default: "80", zero: true, max: 100 },
  { key: "notes", label: "Observações", type: "textarea", full: true },
];
export const saleItemFields: FieldSpec[] = [
  { key: "catalogItemId", label: "Item do catálogo", type: "select", resource: "/catalog-items" },
  { ...description, required: false }, { key: "quantity", label: "Quantidade", type: "amount", default: "1", required: true },
  { key: "unitPrice", label: "Preço unitário", type: "amount", zero: true }, { key: "discountAmount", label: "Desconto", type: "amount", zero: true },
];

export const labels: Record<string, string> = Object.fromEntries([
  ...activeStatuses, ...paymentStatuses, ...transactionStatuses, ...transactionTypes, ...accountTypes, ...catalogTypes,
  ...resources.budgets.statuses!, { value: "TRANSFER", label: "Transferência" }, { value: "ADJUSTMENT", label: "Ajuste" }, { value: "PENDING", label: "Em aberto" }, { value: "PAYABLE", label: "A pagar" }, { value: "RECEIVABLE", label: "A receber" },
].map(option => [option.value, option.label]));

export function rowValue(row: ApiRow, key: string, aliases: string[] = []): unknown {
  return [key, ...aliases].map(field => row[field]).find(value => value !== undefined && value !== null && value !== "");
}

export function rowName(row: ApiRow) {
  return String(rowValue(row, "name", ["description", "customerName", "code", "saleNumber"]) ?? row.id.slice(0, 8));
}
