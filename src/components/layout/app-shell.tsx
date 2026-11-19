"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog as Sheet, DropdownMenu } from "radix-ui";
import {
  Bell, Building2, Check, ChevronDown, ChevronsUpDown, ChevronsLeft, ChevronsRight,
  LogOut, Menu, Plus, Search, X,
} from "lucide-react";
import { toast } from "sonner";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { api, errorStatus, getScoped, type Company, type Session } from "@/lib/api";
import { BrandMark, brandStyle, useBranding } from "@/lib/branding";
import { usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { WorkspaceContext, hasPermission, useWorkspace } from "@/lib/workspace";
import { navigation } from "./navigation";

type NavItem = { label: string; href: string; icon: React.ElementType; permission?: string; feature?: string };

function visibleNavigation(can: (permission: string) => boolean, feature: (feature: string) => boolean) {
  return navigation.map(group => ({
    label: group.label,
    icon: group.icon,
    standalone: group.standalone,
    links: (group.links as readonly NavItem[]).filter(link => (!link.permission || can(link.permission)) && (!link.feature || feature(link.feature))),
  })).filter(group => group.links.length);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const branding = useBranding();
  const [hydrated, setHydrated] = useState<{ inviteCompany?: string } | null>(null);
  const ready = hydrated !== null;
  const [requested, setRequested] = useState<{ account: string; id: string }>();
  const saved = usePreferences(state => state.companies);
  const choose = usePreferences(state => state.chooseCompany);
  const theme = usePreferences(state => state.theme);
  const bootstrap = useQuery({ queryKey: ["session", "current"], queryFn: getScoped<Session>("/auth/me"), enabled: ready });
  const account = bootstrap.data?.account.id;
  const companies = bootstrap.data?.companies ?? [];
  const selected = account && requested?.account === account ? requested.id : hydrated?.inviteCompany ?? (account && saved[account]);
  const company = companies.find(item => item.id === selected)
    ?? companies.find(item => item.id === bootstrap.data?.activeCompanyId)
    ?? companies[0];
  const scoped = useQuery({
    queryKey: ["session", account, company?.id],
    queryFn: getScoped<Session>("/auth/me", company?.id),
    enabled: !!account && !!company,
  });

  useEffect(() => {
    void Promise.resolve(usePreferences.persist.rehydrate()).finally(() => {
      const invitation = new URLSearchParams(window.location.search).get("empresa");
      setHydrated({ inviteCompany: invitation && /^[0-9a-f-]{36}$/i.test(invitation) ? invitation : undefined });
    });
  }, []);

  useEffect(() => {
    if (account && company?.id === hydrated?.inviteCompany && company?.id) choose(account, company.id);
  }, [account, company?.id, hydrated?.inviteCompany, choose]);

  useEffect(() => {
    const expired = errorStatus(bootstrap.error) === 401 || errorStatus(scoped.error) === 401;
    function onExpired() {
      void queryClient.cancelQueries();
      queryClient.clear();
      router.replace("/login");
    }
    if (expired) onExpired();
    window.addEventListener("macc-session-expired", onExpired);
    return () => window.removeEventListener("macc-session-expired", onExpired);
  }, [bootstrap.error, scoped.error, queryClient, router]);

  async function selectCompany(id: string) {
    if (!account || id === company?.id) return;
    await queryClient.cancelQueries({ queryKey: ["scope", account] });
    queryClient.removeQueries({ queryKey: ["scope", account] });
    queryClient.removeQueries({ queryKey: ["session", account] });
    choose(account, id);
    setRequested({ account, id });
    const { pathname, search } = window.location;
    const detail = /\/[0-9a-f-]{36}$/i;
    if (search || detail.test(pathname)) router.replace(pathname.replace(detail, ""), { scroll: false });
  }

  async function signOut() {
    try { await api.post("/auth/logout"); }
    catch { toast.error("A API não confirmou a revogação da sessão."); }
    finally {
      await queryClient.cancelQueries();
      queryClient.clear();
      router.replace("/login");
    }
  }

  if (!ready || bootstrap.isPending || (company && scoped.isPending)) {
    return <main className="center-screen"><BrandMark branding={branding} /><LoadingState rows={3} /></main>;
  }
  if (bootstrap.isError) return <main className="center-screen"><ErrorState error={bootstrap.error} retry={() => void bootstrap.refetch()} /></main>;
  if (scoped.isError) return <main className="center-screen"><ErrorState error={scoped.error} retry={() => void scoped.refetch()} />
    {companies.filter(item => item.id !== company?.id).map(item => <Button key={item.id} variant="outline" onClick={() => void selectCompany(item.id)}>{item.tradeName || item.legalName}</Button>)}
    <Button variant="ghost" onClick={() => void signOut()}>Sair</Button>
  </main>;

  const session = scoped.data ?? bootstrap.data;
  const can = (permission: string) => hasPermission(session, permission);
  const feature = (name: string) => session.features.includes(name) || session.features.includes(name.toUpperCase()) || session.features.includes("*");
  if (!company) return <main className="center-screen"><EmptyState title="Nenhum workspace disponível" detail="Peça a um administrador para liberar seu acesso." action={<Button variant="outline" onClick={() => void signOut()}>Sair</Button>} /></main>;
  return <WorkspaceContext.Provider value={{ session: { ...session, companies }, company, can, feature, selectCompany }}>
    <div className="product" data-theme={theme} style={brandStyle(branding)}>
      <Frame company={company} logout={signOut} key={company.id}>{children}</Frame>
    </div>
  </WorkspaceContext.Provider>;
}

function CompanySwitcher({ company, compact }: { company: Company; compact?: boolean }) {
  const { session, can, selectCompany } = useWorkspace();
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button type="button" className="company-trigger" aria-label="Trocar workspace">
        <span className="company-icon"><Building2 size={18} /></span>
        {!compact && <><span className="company-name"><strong>{company.tradeName || company.legalName}</strong><small>Workspace ativo</small></span><ChevronsUpDown size={15} /></>}
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="start" sideOffset={8}>
      <DropdownMenu.Label className="dropdown-label">Workspaces</DropdownMenu.Label>
      <DropdownMenu.RadioGroup value={company.id} onValueChange={id => void selectCompany(id)}>
        {session.companies.map(item => <DropdownMenu.RadioItem className="dropdown-item" value={item.id} key={item.id}>
          <Building2 size={15} />{item.tradeName || item.legalName}<DropdownMenu.ItemIndicator className="dropdown-check"><Check size={15} /></DropdownMenu.ItemIndicator>
        </DropdownMenu.RadioItem>)}
      </DropdownMenu.RadioGroup>
      {can("companies.manage") && <DropdownMenu.Item asChild className="dropdown-item"><Link href="/configuracoes/empresa?novo=1"><Plus size={16} /> Novo workspace</Link></DropdownMenu.Item>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

function Frame({ children, company, logout }: { children: React.ReactNode; company: Company; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const branding = useBranding();
  const { session, can, feature } = useWorkspace();
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const surface = useRef<HTMLElement>(null);

  useEffect(() => {
    surface.current?.scrollTo({ top: 0 });
  }, [pathname]);

  const collapsed = usePreferences(state => state.collapsed);
  const toggleCollapsed = usePreferences(state => state.toggleCollapsed);
  const groups = visibleNavigation(can, feature);
  const links = groups.flatMap(group => group.links);
  const page = links.find(item => pathname === item.href || pathname.startsWith(item.href + "/"))?.label
    ?? (pathname === "/notificacoes" ? "Notificações" : "Workspace");
  const initials = session.user.fullName.trim().split(/\s+/).slice(0, 2).map(name => name[0]).join("").toUpperCase();
  function sidebarContent(compact: boolean, isMobile: boolean) {
    return <>
      <div className="sidebar-brand"><Link href="/dashboard" onClick={() => setMobile(false)}><BrandMark branding={branding} compact={compact} /></Link>
        {isMobile && <Sheet.Close asChild><Button variant="ghost" size="icon" aria-label="Fechar menu"><X size={20} /></Button></Sheet.Close>}
      </div>
      <CompanySwitcher company={company} compact={compact} />
      <nav className="navigation" aria-label="Navegação principal">
        {groups.map(group => <NavigationModule key={group.label} group={group} pathname={pathname} compact={compact} onNavigate={() => setMobile(false)} />)}
      </nav>
      <div className="sidebar-footer">
        <span className="avatar">{initials}</span><span className="sidebar-person"><strong>{session.user.fullName}</strong><small>{session.user.email}</small></span>
        <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => void logout()}><LogOut size={17} /></Button>
      </div>
    </>;
  }
  return <div className={cn("app-frame", collapsed && "is-collapsed")}>
    <a href="#main-content" className="skip-link">Ir para conteúdo</a>
    <aside id="desktop-sidebar" className="sidebar desktop-sidebar">{sidebarContent(collapsed, false)}</aside>
    <Sheet.Root open={mobile} onOpenChange={setMobile}>
      <Sheet.Portal>
        <Sheet.Overlay className="mobile-overlay" />
        <Sheet.Content id="app-navigation" className="sidebar sidebar-open mobile-sheet" aria-describedby={undefined}>
          <Sheet.Title className="sr-only">Menu do workspace</Sheet.Title>
          {sidebarContent(false, true)}
        </Sheet.Content>
      </Sheet.Portal>
      <div className="app-main">
        <header className="app-header">
          <div className="header-left">
            <Sheet.Trigger asChild><Button variant="ghost" size="icon" className="mobile-only" aria-label="Abrir menu"><Menu size={20} /></Button></Sheet.Trigger>
            <Button variant="ghost" size="icon" className="desktop-only" aria-label={collapsed ? "Expandir menu" : "Recolher menu"} aria-expanded={!collapsed} aria-controls="desktop-sidebar" onClick={toggleCollapsed}>{collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}</Button>
            <Button variant="outline" className="search-trigger" aria-label="Buscar páginas" onClick={() => setSearch("")}><Search size={17} /><span>Buscar página</span></Button>
            <span className="header-page">{page}</span>
          </div>
          <div className="header-right">
            <Button asChild variant="ghost" size="icon"><Link href="/notificacoes" aria-label="Notificações"><Bell size={19} /></Link></Button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="header-profile" aria-label="Menu da conta"><span className="avatar">{initials}</span><span>{session.user.fullName}</span><ChevronDown size={14} /></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="end" sideOffset={8}>
                <DropdownMenu.Label className="dropdown-label">{session.user.fullName}</DropdownMenu.Label>
                <DropdownMenu.Item asChild className="dropdown-item"><Link href="/configuracoes/aparencia">Preferências</Link></DropdownMenu.Item>
                <DropdownMenu.Item className="dropdown-item" onSelect={() => void logout()}><LogOut size={16} /> Sair</DropdownMenu.Item>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>
        <main id="main-content" ref={surface} className="app-surface" tabIndex={-1}>
          <div className="app-content">{children}</div>
        </main>
      </div>
    </Sheet.Root>
    <Dialog open={search !== null} title="Buscar página" onOpenChange={open => { if (!open) setSearch(null); }}>
      <SearchInput aria-label="Nome da página" placeholder="Ex.: contas a pagar" value={search ?? ""} onChange={event => setSearch(event.target.value)} />
      <div className="search-results">{links.filter(item => item.label.toLowerCase().includes(search?.trim().toLowerCase() ?? "")).map(item =>
        <Link href={item.href} key={item.href} onClick={() => setSearch(null)}>{item.label}</Link>,
      )}</div>
    </Dialog>
  </div>;
}

function NavigationModule({ group, pathname, compact, onNavigate }: {
  group: ReturnType<typeof visibleNavigation>[number];
  pathname: string;
  compact: boolean;
  onNavigate: () => void;
}) {
  const moduleId = useId();
  const activeLink = group.links.find(link => pathname === link.href || pathname.startsWith(link.href + "/"));
  const [disclosure, setDisclosure] = useState<{ pathname: string; open: boolean }>();
  const open = disclosure?.pathname === pathname ? disclosure.open : !!activeLink;
  const Icon = group.icon;

  function renderLink({ label, href, icon: LinkIcon }: NavItem) {
    const active = activeLink?.href === href;
    return <Link className={cn("nav-link", active && "nav-active")} title={label} key={href} href={href} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      <LinkIcon size={18} aria-hidden="true" /><span>{label}</span>
      {active && <Check size={15} className="nav-check" aria-hidden="true" />}
    </Link>;
  }

  if (group.standalone) return <div className="nav-direct">{group.links.map(renderLink)}</div>;

  if (compact) return <DropdownMenu.Root>
    <DropdownMenu.Trigger className={cn("nav-module-trigger nav-module-compact", activeLink && "nav-module-current")} aria-label={group.label} title={group.label}>
      <Icon size={20} aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" side="right" align="start" sideOffset={12}>
      <DropdownMenu.Label className="dropdown-label">{group.label}</DropdownMenu.Label>
      {group.links.map(({ href, label, icon: ItemIcon }) => <DropdownMenu.Item asChild className="dropdown-item" key={href}>
        <Link href={href} aria-current={activeLink?.href === href ? "page" : undefined} onClick={onNavigate}><ItemIcon size={16} aria-hidden="true" />{label}{activeLink?.href === href && <Check size={14} aria-hidden="true" />}</Link>
      </DropdownMenu.Item>)}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;

  return <div className={cn("nav-module", open && "nav-module-open", activeLink && "nav-module-current")}>
    <button type="button" className="nav-module-trigger" aria-expanded={open} aria-controls={moduleId} onClick={() => setDisclosure({ pathname, open: !open })}>
      <Icon size={20} aria-hidden="true" /><span>{group.label}</span><ChevronDown size={16} className="nav-module-chevron" aria-hidden="true" />
    </button>
    <div id={moduleId} className="nav-module-links" hidden={!open}>{group.links.map(renderLink)}</div>
  </div>;
}
