"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Globe2, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, errorMessage, errorStatus, getScoped, type Session } from "@/lib/api";
import { BrandMark, useBranding } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { PageHeading } from "@/components/layout/page-heading";
import styles from "./platform.module.css";

type Brand = { id: string; name: string; slug: string; primaryDomain: string; verifiedDomain: boolean; primaryColor: string; logoUrl?: string };
type Domain = { id: string; hostname: string; verifiedAt?: string; challenge?: string };
type Account = { id: string; name: string; slug: string; brand: string; status: "ACTIVE" | "SUSPENDED" | "CLOSED"; planCode: string };
type Feature = { featureKey: string; enabled: boolean; limits: { maxCompanies?: number; maxSeats?: number } };
const labels: Record<string,string> = {
  ADVANCED_REPORTS: "Relatórios avançados", BUDGETS: "Orçamentos", CUSTOM_BRANDING: "Identidade visual",
  FINANCIAL_CORE: "Financeiro", MULTI_COMPANY: "Múltiplas empresas", SALES: "Vendas", WORKFLOWS: "Automações",
};

function grantConfig(grant: string, signal?: AbortSignal) {
  return { headers: { "X-MACC-Platform-Grant": grant }, signal };
}

function usePlatform<T>(path: string, key: string | undefined, grant: string) {
  return useQuery({
    queryKey: ["platform", path, key],
    queryFn: async ({ signal }) => (await api.get<T>(`/platform/${path}`, grantConfig(grant, signal))).data,
    enabled: !!grant && key !== "",
    staleTime: 15_000,
  });
}

export function PlatformScreen() {
  const branding = useBranding();
  const cache = useQueryClient();
  const router = useRouter();
  const session = useQuery({ queryKey: ["session", "platform"], queryFn: getScoped<Session>("/auth/me"), retry: false });
  const [grant, setGrant] = useState("");
  const [expires, setExpires] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState<"brands" | "accounts">("brands");

  useEffect(() => {
    if (!expires) return;
    const timer = window.setTimeout(() => {
      setGrant("");
      cache.removeQueries({ queryKey: ["platform"] });
    }, Math.max(0, expires - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expires, cache]);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ grant: string; expiresIn: number }>("/platform/unlock", { code });
      setGrant(data.grant);
      setExpires(Date.now() + data.expiresIn * 1000);
      setCode("");
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  async function logout() {
    try { await api.post("/auth/logout"); }
    catch (err) { toast.error(errorMessage(err)); return; }
    await cache.cancelQueries();
    cache.clear();
    setGrant("");
    router.replace("/login");
  }

  return <div className={`product ${styles.root}`} data-theme="dark">
    <header className={styles.header}><BrandMark branding={branding} />
      {session.data && <Button variant="ghost" onClick={() => void logout()}><LogOut size={17} /> Sair</Button>}
    </header>
    <main className={styles.main}>
      <PageHeading eyebrow="Operação MACC" title="Console da plataforma" subtitle="Gerencie marcas, domínios e recursos das contas." />
      {session.isPending ? <LoadingState rows={3} /> : session.isError && errorStatus(session.error) !== 401 ?
        <ErrorState error={session.error} retry={() => void session.refetch()} /> :
        session.data?.account.slug !== "macc-platform" ?
          <EmptyState title="Acesso da plataforma" detail="Entre com a conta técnica para continuar."
            action={<Button asChild><Link href="/login">Ir para login</Link></Button>} /> :
        !grant ? <form className={styles.unlock} onSubmit={unlock}>
          <LockKeyhole size={23} aria-hidden /><h2>Confirme sua identidade</h2>
          <p>Digite o código de seis dígitos do seu aplicativo autenticador.</p>
          <label>Código de verificação<input className="input" name="mfa-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, ""))} /></label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <Button type="submit" disabled={code.length !== 6 || busy}><ShieldCheck size={16} /> Desbloquear console</Button>
        </form> : <>
          <nav className={styles.tabs} aria-label="Seções da plataforma">
            <Button variant={section === "brands" ? "primary" : "outline"} aria-pressed={section === "brands"}
              onClick={() => setSection("brands")}><Globe2 size={16} /> Marcas e domínios</Button>
            <Button variant={section === "accounts" ? "primary" : "outline"} aria-pressed={section === "accounts"}
              onClick={() => setSection("accounts")}><Building2 size={16} /> Contas e recursos</Button>
          </nav>
          {section === "brands" ? <Brands grant={grant} /> : <Accounts grant={grant} />}
        </>}
    </main>
  </div>;
}

function Brands({ grant }: { grant: string }) {
  const cache = useQueryClient();
  const brands = usePlatform<Brand[]>("whitelabels", undefined, grant);
  const [selection, setSelection] = useState<string>();
  const selected = selection === "new" ? undefined : brands.data?.find(brand => brand.id === selection) ?? brands.data?.[0];
  return <div className={styles.split}>
    <aside className={styles.panel}>
      <h2>Marcas</h2>
      <Button variant="outline" onClick={() => setSelection("new")}>Nova marca</Button>
      {brands.isPending ? <LoadingState rows={2} /> : brands.isError ? <ErrorState error={brands.error} retry={() => void brands.refetch()} /> :
        <ul className={styles.list}>{brands.data.map(brand => <li key={brand.id}><button type="button" aria-pressed={selected?.id === brand.id}
          onClick={() => setSelection(brand.id)}><span>{brand.name}</span><small>{brand.primaryDomain}</small></button></li>)}</ul>}
    </aside>
    <div className={styles.column}>
      {(selected || selection === "new") && <BrandForm key={"brand:" + (selected?.id ?? "new")} brand={selected} grant={grant} onSaved={async id => {
        await cache.invalidateQueries({ queryKey: ["platform"] });
        setSelection(id);
      }} />}
      {selected && <Domains key={"domains:" + selected.id} brand={selected} grant={grant} />}
    </div>
  </div>;
}

function BrandForm({ brand, grant, onSaved }: { brand?: Brand; grant: string; onSaved: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    try {
      const result = brand ? await api.patch<Brand>(`/platform/whitelabels/${brand.id}`, data, grantConfig(grant)) :
        await api.post<Brand>("/platform/whitelabels", data, grantConfig(grant));
      await onSaved(result.data.id);
      toast.success("Marca salva.");
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <form className={styles.panel} onSubmit={submit}>
    <h2>{brand ? "Identidade da marca" : "Nova marca"}</h2>
    <label>Nome<input className="input" name="name" maxLength={160} required defaultValue={brand?.name} /></label>
    {!brand && <>
      <label>Identificador<input className="input" name="slug" maxLength={96} required pattern={"[a-z][a-z0-9\\-]{1,94}[a-z0-9]"} placeholder="minha-marca" /></label>
      <label>Domínio principal<input className="input" name="domain" autoComplete="off" maxLength={247} required placeholder="gestao.exemplo.com.br" /></label>
    </>}
    <label>URL do logo<input className="input" name="logoUrl" maxLength={800} defaultValue={brand?.logoUrl} placeholder="https://…" /></label>
    <label>Cor principal<input className={styles.color} name="primaryColor" type="color" defaultValue={brand?.primaryColor ?? "#1283E2"} /></label>
    <Button type="submit" disabled={busy}>Salvar marca</Button>
  </form>;
}

function Domains({ brand, grant }: { brand: Brand; grant: string }) {
  const path = `whitelabels/${brand.id}/domains`;
  const domains = usePlatform<Domain[]>(path, brand.id, grant);
  const [busy, setBusy] = useState(false);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const hostname = new FormData(form).get("hostname");
    setBusy(true);
    try { await api.post(`/platform/${path}`, { hostname }, grantConfig(grant)); form.reset(); await domains.refetch(); }
    catch (err) { toast.error(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function verify(id: string) {
    setBusy(true);
    try { await api.post(`/platform/${path}/${id}/verify`, {}, grantConfig(grant)); await domains.refetch(); toast.success("Domínio verificado."); }
    catch (err) { toast.error(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel}>
    <h2>Domínios</h2>
    <form className={styles.row} onSubmit={add}>
      <label>Novo domínio<input className="input" name="hostname" autoComplete="off" required maxLength={247} placeholder="app.exemplo.com.br" /></label>
      <Button variant="outline" type="submit" disabled={busy}>Adicionar</Button>
    </form>
    {domains.isPending ? <LoadingState rows={2} /> : domains.isError ? <ErrorState error={domains.error} retry={() => void domains.refetch()} /> :
      <ul className={styles.domains}>{domains.data.map(domain => <li key={domain.id}>
        <strong>{domain.hostname}</strong><span>{domain.verifiedAt ? "Verificado" : "Aguardando DNS"}</span>
        {!domain.verifiedAt && <><p>Crie o registro TXT <code>_macc.{domain.hostname}</code> com o valor abaixo.</p>
          <code>{domain.challenge}</code>
          <Button variant="outline" size="small" disabled={busy} onClick={() => void verify(domain.id)}>Verificar DNS</Button></>}
      </li>)}</ul>}
  </section>;
}

function Accounts({ grant }: { grant: string }) {
  const accounts = usePlatform<Account[]>("accounts", undefined, grant);
  const [selection, setSelection] = useState("");
  const selected = accounts.data?.find(account => account.id === selection) ?? accounts.data?.[0];
  const [search, setSearch] = useState("");
  return <div className={styles.split}>
    <aside className={styles.panel}><h2>Contas</h2>
      <label>Buscar<input className="input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou identificador" /></label>
      {accounts.isPending ? <LoadingState rows={2} /> : accounts.isError ? <ErrorState error={accounts.error} retry={() => void accounts.refetch()} /> :
        <ul className={styles.list}>{accounts.data.filter(account => `${account.name} ${account.slug}`.toLowerCase().includes(search.toLowerCase())).map(account =>
          <li key={account.id}><button type="button" aria-pressed={selected?.id === account.id} onClick={() => setSelection(account.id)}>
            <span>{account.name}</span><small>{account.slug}</small></button></li>)}</ul>}
    </aside>
    {selected ? <AccountFeatures key={selected.id} account={selected} grant={grant} refresh={accounts.refetch} /> :
      !accounts.isPending && !accounts.isError && <EmptyState title="Nenhuma conta cadastrada" />}
  </div>;
}

function AccountFeatures({ account, grant, refresh }: { account: Account; grant: string; refresh: () => Promise<unknown> }) {
  const path = `accounts/${account.id}/features`;
  const features = usePlatform<Feature[]>(path, account.id, grant);
  const [busy, setBusy] = useState(false);
  async function updateAccount() {
    const status = account.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (status === "SUSPENDED" && !window.confirm(`Suspender a conta ${account.name} e encerrar as sessões ativas?`)) return;
    setBusy(true);
    try { await api.patch(`/platform/accounts/${account.id}`, { status }, grantConfig(grant)); await refresh(); toast.success("Conta atualizada."); }
    catch (err) { toast.error(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function updateFeature(feature: Feature, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const companyLimit = data.get("companyLimit");
    const seatLimit = data.get("seatLimit");
    setBusy(true);
    try {
      await api.put(`/platform/${path}/${feature.featureKey}`, {
        enabled: data.get("enabled") === "on",
        companyLimit: companyLimit ? Number(companyLimit) : null,
        seatLimit: seatLimit ? Number(seatLimit) : null,
      }, grantConfig(grant));
      await features.refetch();
      toast.success("Recurso atualizado.");
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel}>
    <h2>{account.name}</h2>
    <p>{account.brand} · {account.planCode} · {account.status === "ACTIVE" ? "Ativa" : account.status === "CLOSED" ? "Encerrada" : "Suspensa"}</p>
    {account.status !== "CLOSED" && <Button variant={account.status === "ACTIVE" ? "danger" : "outline"} disabled={busy}
      onClick={() => void updateAccount()}>{account.status === "ACTIVE" ? "Suspender conta" : "Reativar conta"}</Button>}
    <h2>Recursos da conta</h2>
    {features.isPending ? <LoadingState rows={3} /> : features.isError ? <ErrorState error={features.error} retry={() => void features.refetch()} /> :
      <ul className={styles.features}>{features.data.map(feature => <li key={feature.featureKey}>
        <form className={styles.feature} onSubmit={event => void updateFeature(feature, event)}>
          <label><input type="checkbox" name="enabled" defaultChecked={feature.enabled} /> {labels[feature.featureKey] ?? feature.featureKey}</label>
          {feature.featureKey === "MULTI_COMPANY" && <div className={styles.row}>
            <label>Máximo de empresas<input className="input" type="number" name="companyLimit" min={1} max={10000} defaultValue={feature.limits.maxCompanies} placeholder="Sem limite" /></label>
            <label>Máximo de usuários<input className="input" type="number" name="seatLimit" min={1} max={100000} defaultValue={feature.limits.maxSeats} placeholder="Sem limite" /></label>
          </div>}
          <Button variant="outline" size="small" type="submit" disabled={busy || account.status === "CLOSED"}>Salvar recurso</Button>
        </form>
      </li>)}</ul>}
  </section>;
}
