"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Check, Copy, MailPlus, Monitor, Moon, Plus, Sun } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/fields";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/feedback";
import { api, companyHeaders, errorFields, errorMessage, normalizePage, type ApiPage, type ApiRow, type Company } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { useScopedQuery, useWorkspace } from "@/lib/workspace";
import { dateLabel } from "@/lib/utils";
import type { components } from "@/lib/api-contract";

const companySchema = z.object({
  legalName: z.string().trim().min(2, "Informe a razão social.").max(160),
  tradeName: z.string().trim().max(160),
  currency: z.literal("BRL"),
  timezone: z.string().trim().max(64).refine(value => { try { return !!new Intl.DateTimeFormat("pt-BR", { timeZone: value }); } catch { return false; } }, "Informe um fuso IANA válido."),
});

export function CompanyEditor({ company, onClose, onSave }: { company?: Company; onClose: () => void; onSave: (id: string) => Promise<void> }) {
  const { company: active } = useWorkspace();
  const [error, setError] = useState("");
  const form = useForm({
    resolver: zodResolver(companySchema),
    defaultValues: { legalName: company?.legalName ?? "", tradeName: company?.tradeName ?? "", currency: "BRL" as const, timezone: company?.timezone ?? "America/Sao_Paulo" },
  });
  const submit = form.handleSubmit(async values => {
    setError("");
    try {
      const headers = companyHeaders(active.id);
      const payload = { ...values, tradeName: values.tradeName || null };
      const response = company
        ? await api.patch<Company>("/companies/" + company.id, payload, { headers })
        : await api.post<Company>("/companies", payload, { headers });
      toast.success(company ? "Workspace atualizado." : "Workspace criado.");
      await onSave(response.data.id);
    } catch (failure) {
      for (const [field, messages] of Object.entries(errorFields(failure))) {
        if (Object.hasOwn(companySchema.shape, field) && messages[0]) form.setError(field as keyof typeof companySchema.shape, { message: messages[0] });
      }
      setError(errorMessage(failure));
    }
  });
  const fields = { legalName: "Razão social", tradeName: "Nome fantasia (opcional)", currency: "Moeda", timezone: "Fuso horário" } as const;
  return <Dialog open onOpenChange={onClose} busy={form.formState.isSubmitting} title={company ? "Editar workspace" : "Novo workspace"}
    description={company ? "Atualize os dados da empresa selecionada." : "Crie uma empresa separada, com equipe e dados próprios."}>
    <form className="form-stack" onSubmit={submit} noValidate>
      {(Object.keys(fields) as (keyof typeof fields)[]).map(name => <Field key={name} label={fields[name]} error={form.formState.errors[name]?.message}
        hint={name === "timezone" ? "Ex.: America/Sao_Paulo" : undefined}>
        {props => name === "currency"
          ? <select {...props} className="input" {...form.register(name)}><option value="BRL">Real brasileiro (BRL)</option></select>
          : <input {...props} className="input" maxLength={name === "timezone" ? 64 : 160} {...form.register(name)} />}
      </Field>)}
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="dialog-actions"><Button type="button" variant="outline" onClick={onClose} disabled={form.formState.isSubmitting}>Voltar</Button><Button disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Salvando…" : "Salvar workspace"}</Button></div>
    </form>
  </Dialog>;
}

export function CompaniesPage({ startCreating = false }: { startCreating?: boolean }) {
  const { company, session, selectCompany, can } = useWorkspace();
  const cache = useQueryClient();
  const router = useRouter();
  const [editing, setEditing] = useState<Company | null | undefined>(startCreating ? null : undefined);
  const manage = can("companies.manage") || session.membershipRole === "OWNER";
  async function saved(id: string) {
    setEditing(undefined);
    await cache.invalidateQueries({ queryKey: ["session"] });
    if (id) await selectCompany(id);
    if (startCreating) router.replace("/configuracoes/empresa");
  }
  function close() {
    setEditing(undefined);
    if (startCreating) router.replace("/configuracoes/empresa");
  }
  return <>
    <PageHeading eyebrow="Configurações" title="Empresas" subtitle="Gerencie os workspaces associados à sua conta."
      actions={manage && <Button onClick={() => setEditing(null)}><Plus size={18} /> Novo workspace</Button>} />
    <div className="workspace-caption"><span>Identificador da conta</span><code>{session.account.slug}</code></div>
    <div className="card-grid">
      {session.companies.map(item => <article className="panel company-card" key={item.id}>
        <span className="company-icon"><Building2 size={20} /></span>
        <h2>{item.tradeName || item.legalName}</h2>
        <p className="muted">{item.tradeName ? item.legalName : item.currency + " · " + item.timezone}</p>
        {item.tradeName && <small className="muted">{item.currency} · {item.timezone}</small>}
        <div className="card-actions">
          {item.id === company.id ? <span className="badge badge-good"><Check size={14} /> Ativo</span> :
            <Button variant="outline" size="small" onClick={() => void selectCompany(item.id)}>Abrir workspace</Button>}
          {manage && <Button size="small" variant="ghost" onClick={() => setEditing(item)}>Editar</Button>}
        </div>
      </article>)}
    </div>
    {manage && editing !== undefined && <CompanyEditor company={editing ?? undefined} onClose={close} onSave={saved} />}
  </>;
}

const roles = [
  { value: "ADMIN", label: "Administrador" }, { value: "FINANCE", label: "Financeiro" },
  { value: "SALES", label: "Comercial" }, { value: "VIEWER", label: "Leitor" },
] as const;
const invitationSchema = z.object({ email: z.email("Informe um e-mail válido."), role: z.enum(["ADMIN", "FINANCE", "SALES", "VIEWER"]) });
type Invitation = { id: string; inviteUrl: string; expiresAt: string };
type Member = ApiRow & { fullName?: string; email?: string; name?: string; role?: string; companyRole?: string; status?: string; user?: { fullName?: string; email?: string } };
function readableRole(value: unknown) {
  if (value === "OWNER") return "Proprietário";
  return roles.find(role => role.value === value)?.label ?? String(value ?? "—");
}

function InviteMember({ onClose }: { onClose: () => void }) {
  const { company } = useWorkspace();
  const cache = useQueryClient();
  const [result, setResult] = useState<Invitation>();
  const [error, setError] = useState("");
  const form = useForm<z.infer<typeof invitationSchema>>({ resolver: zodResolver(invitationSchema), defaultValues: { email: "", role: "VIEWER" } });
  const submit = form.handleSubmit(async values => {
    setError("");
    try {
      const payload: components["schemas"]["Invite"] = { ...values, companyId: company.id };
      const response = await api.post<Invitation>("/invitations", payload, { headers: companyHeaders(company.id) });
      setResult(response.data);
      toast.success("Convite criado.");
      await cache.invalidateQueries({ queryKey: ["scope"] });
    } catch (failure) { setError(errorMessage(failure)); }
  });
  async function copy() {
    try { await navigator.clipboard.writeText(result!.inviteUrl); toast.success("Link copiado."); }
    catch { toast.error("Selecione e copie o link no campo."); }
  }
  return <Dialog open onOpenChange={onClose} busy={form.formState.isSubmitting} title="Convidar pessoa"
    description={"O convite dá acesso ao workspace " + (company.tradeName || company.legalName) + "."}>
    {result ? <div className="form-stack">
      <Field label="Link de convite" hint={"Válido até " + dateLabel(result.expiresAt, company.timezone)}>{props => <input {...props} className="input" readOnly value={result.inviteUrl} onFocus={event => event.target.select()} />}</Field>
      <Button onClick={() => void copy()}><Copy size={17} /> Copiar link</Button>
    </div> : <form className="form-stack" onSubmit={submit} noValidate>
      <Field label="E-mail" error={form.formState.errors.email?.message}>{props => <input {...props} type="email" className="input" {...form.register("email")} />}</Field>
      <Field label="Papel no workspace" error={form.formState.errors.role?.message}>{props => <select {...props} className="input" {...form.register("role")}>{roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select>}</Field>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <Button disabled={form.formState.isSubmitting}><MailPlus size={17} /> {form.formState.isSubmitting ? "Criando…" : "Criar convite"}</Button>
    </form>}
  </Dialog>;
}

export function TeamPage() {
  const { session, company, can } = useWorkspace();
  const [invite, setInvite] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Member>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const members = useScopedQuery<ApiPage<Member> | Member[]>("/memberships", { page, size: 25 });
  async function change(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const status = form.get("status");
    const payload = status === "REVOKED" ? { status } : { role: form.get("role"), status };
    try {
      await api.patch("/memberships/" + editing.id, payload, { headers: companyHeaders(company.id) });
      setEditing(undefined);
      await members.refetch();
      toast.success("Acesso atualizado.");
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  const result = members.data ? normalizePage(members.data) : undefined;
  return <>
    <PageHeading eyebrow="Configurações" title="Equipe" subtitle={"Pessoas e permissões de " + (company.tradeName || company.legalName) + "."}
      actions={can("users.invite") && <Button onClick={() => setInvite(true)}><MailPlus size={18} /> Convidar pessoa</Button>} />
    <section className="panel">
      {members.isPending ? <LoadingState /> : members.isError ? <ErrorState error={members.error} retry={() => void members.refetch()} /> : !result?.items.length
        ? <EmptyState title="Nenhum membro encontrado" /> :
        <div className="table-overflow"><table className="entity-table"><thead><tr><th scope="col">Pessoa</th><th scope="col">Papel</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead>
          <tbody>{result.items.map(member => <tr key={member.id}><td><strong>{member.fullName ?? member.user?.fullName ?? member.name ?? "Membro"}</strong><small className="muted">{member.email ?? member.user?.email}</small></td>
            <td>{readableRole(member.companyRole ?? member.role)}</td><td>{member.status === "REVOKED" ? "Revogado" : member.status === "INVITED" ? "Convidado" : "Ativo"}</td>
            <td>{(can("users.manage") || can("users.invite")) && member.role !== "OWNER" && member.user?.email !== session.user.email && member.email !== session.user.email && <Button variant="outline" size="small" onClick={() => { setError(""); setEditing(member); }}>Editar acesso</Button>}</td></tr>)}</tbody>
        </table></div>}
      {result && result.totalPages > 1 && <div className="pagination"><Button variant="outline" size="small" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button><span>Página {page + 1} de {result.totalPages}</span><Button variant="outline" size="small" disabled={page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}>Próxima</Button></div>}
    </section>
    {invite && <InviteMember onClose={() => setInvite(false)} />}
    {editing && <Dialog open onOpenChange={() => setEditing(undefined)} title="Editar acesso" description="Altere o papel ou revogue o acesso a este workspace." busy={busy}>
      <form className="form-stack" onSubmit={change}>
        <Field label="Papel">{props => <select {...props} className="input" name="role" defaultValue={editing.companyRole ?? editing.role}>{roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select>}</Field>
        <Field label="Acesso">{props => <select {...props} className="input" name="status" defaultValue={editing.status ?? "ACTIVE"}><option value="ACTIVE">Ativo</option><option value="REVOKED">Revogado</option></select>}</Field>
        {error && <p className="inline-error" role="alert">{error}</p>}<Button disabled={busy}>Salvar acesso</Button>
      </form>
    </Dialog>}
  </>;
}

export function AppearancePage() {
  const theme = usePreferences(state => state.theme);
  const setTheme = usePreferences(state => state.setTheme);
  return <>
    <PageHeading eyebrow="Configurações" title="Aparência" subtitle="Escolha o tema que prefere usar neste navegador." />
    <div className="card-grid theme-grid">
      <button className="panel theme-option" onClick={() => setTheme("light")} aria-pressed={theme === "light"}><Sun size={23} /><span><strong>Tema claro</strong><small>Superfícies claras com identidade MACC.</small></span>{theme === "light" && <Check size={18} />}</button>
      <button className="panel theme-option" onClick={() => setTheme("dark")} aria-pressed={theme === "dark"}><Moon size={23} /><span><strong>Tema escuro</strong><small>Superfícies em azul noturno.</small></span>{theme === "dark" && <Check size={18} />}</button>
    </div>
    <p className="muted appearance-note"><Monitor size={16} /> Preferência salva neste dispositivo.</p>
  </>;
}
