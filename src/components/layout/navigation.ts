import {
  LayoutDashboard, Landmark, ArrowLeftRight, ArrowUpRight, ArrowDownLeft, ChartNoAxesCombined,
  Target, ShoppingBag, ContactRound, Package, FileChartColumn, Workflow, Building2, UsersRound,
  Tags, Palette, ShieldCheck,
} from "lucide-react";

export const navigation = [
  { label: "Visão geral", links: [
    { label: "Painel", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.read" },
  ] },
  { label: "Financeiro", links: [
    { label: "Contas financeiras", href: "/financeiro/contas", icon: Landmark, permission: "financial.read", feature: "FINANCIAL_CORE" },
    { label: "Transações", href: "/financeiro/transacoes", icon: ArrowLeftRight, permission: "financial.read", feature: "FINANCIAL_CORE" },
    { label: "Contas a pagar", href: "/financeiro/a-pagar", icon: ArrowUpRight, permission: "financial.read", feature: "FINANCIAL_CORE" },
    { label: "Contas a receber", href: "/financeiro/a-receber", icon: ArrowDownLeft, permission: "financial.read", feature: "FINANCIAL_CORE" },
    { label: "Fluxo de caixa", href: "/financeiro/fluxo-de-caixa", icon: ChartNoAxesCombined, permission: "dashboard.read", feature: "FINANCIAL_CORE" },
    { label: "Orçamentos", href: "/orcamentos", icon: Target, permission: "budget.read", feature: "BUDGETS" },
  ] },
  { label: "Comercial", links: [
    { label: "Vendas", href: "/vendas", icon: ShoppingBag, permission: "sales.read", feature: "SALES" },
    { label: "Clientes", href: "/clientes", icon: ContactRound, permission: "customer.read", feature: "SALES" },
    { label: "Catálogo", href: "/catalogo", icon: Package, permission: "catalog.read", feature: "SALES" },
  ] },
  { label: "Inteligência", links: [
    { label: "Relatórios", href: "/relatorios", icon: FileChartColumn, permission: "reports.read", feature: "ADVANCED_REPORTS" },
    { label: "Automações", href: "/automacoes", icon: Workflow, permission: "workflows.read", feature: "workflows" },
  ] },
  { label: "Configurações", links: [
    { label: "Empresas", href: "/configuracoes/empresa", icon: Building2, permission: "companies.read" },
    { label: "Equipe", href: "/configuracoes/equipe", icon: UsersRound, permission: "users.read" },
    { label: "Categorias", href: "/configuracoes/categorias", icon: Tags, permission: "financial.read", feature: "FINANCIAL_CORE" },
    { label: "Aparência", href: "/configuracoes/aparencia", icon: Palette },
    { label: "Plataforma", href: "/plataforma", icon: ShieldCheck, permission: "platform.read", feature: "platform" },
  ] },
] as const;
