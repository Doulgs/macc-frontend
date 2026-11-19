import {
  LayoutDashboard, Landmark, ArrowLeftRight, ArrowUpRight, ArrowDownLeft, ChartNoAxesCombined,
  Target, ShoppingBag, ContactRound, Package, FileChartColumn, Workflow, Building2, UsersRound,
  Tags, Palette, ShieldCheck, Wallet, SlidersHorizontal,
} from "lucide-react";

export const navigation = [
  { label: "Visão geral", icon: LayoutDashboard, standalone: true, links: [
    { label: "Visão geral", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.read" },
  ] },
  { label: "Financeiro", icon: Wallet, standalone: false, links: [
    { label: "Contas financeiras", href: "/financeiro/contas", icon: Landmark, permission: "financial.read", feature: "FINANCIAL_CORE" },
    { label: "Transações", href: "/financeiro/transacoes", icon: ArrowLeftRight, permission: "financial.read", feature: "FINANCIAL_CORE" },
    { label: "Contas a pagar", href: "/financeiro/a-pagar", icon: ArrowUpRight, permission: "financial.read", feature: "FINANCIAL_CORE" },
    { label: "Contas a receber", href: "/financeiro/a-receber", icon: ArrowDownLeft, permission: "financial.read", feature: "FINANCIAL_CORE" },
    { label: "Fluxo de caixa", href: "/financeiro/fluxo-de-caixa", icon: ChartNoAxesCombined, permission: "dashboard.read", feature: "FINANCIAL_CORE" },
    { label: "Orçamentos", href: "/orcamentos", icon: Target, permission: "budget.read", feature: "BUDGETS" },
  ] },
  { label: "Comercial", icon: ShoppingBag, standalone: false, links: [
    { label: "Vendas", href: "/vendas", icon: ShoppingBag, permission: "sales.read", feature: "SALES" },
    { label: "Clientes", href: "/clientes", icon: ContactRound, permission: "customer.read", feature: "SALES" },
    { label: "Catálogo", href: "/catalogo", icon: Package, permission: "catalog.read", feature: "SALES" },
  ] },
  { label: "Inteligência", icon: ChartNoAxesCombined, standalone: false, links: [
    { label: "Relatórios", href: "/relatorios", icon: FileChartColumn, permission: "reports.read", feature: "ADVANCED_REPORTS" },
  ] },
  { label: "Automações", icon: Workflow, standalone: false, links: [
    { label: "Gerenciar automações", href: "/automacoes", icon: Workflow, permission: "workflows.read", feature: "workflows" },
  ] },
  { label: "Administração", icon: SlidersHorizontal, standalone: false, links: [
    { label: "Empresas", href: "/configuracoes/empresa", icon: Building2, permission: "companies.read" },
    { label: "Equipe", href: "/configuracoes/equipe", icon: UsersRound, permission: "users.read" },
    { label: "Categorias", href: "/configuracoes/categorias", icon: Tags, permission: "financial.read", feature: "FINANCIAL_CORE" },
    { label: "Aparência", href: "/configuracoes/aparencia", icon: Palette },
    { label: "Plataforma", href: "/plataforma", icon: ShieldCheck, permission: "platform.read", feature: "platform" },
  ] },
] as const;
