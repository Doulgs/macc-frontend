"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, Mail } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { CompanyEditor } from "@/features/companies/company-pages";
import { api, errorMessage, normalizePage, type ApiPage, type ApiRow } from "@/lib/api";
import { useRefreshWorkspace, useScopedQuery, useWorkspace } from "@/lib/workspace";

function Ready() {
  return <span className="badge badge-good"><Check size={14} aria-hidden /> Concluído</span>;
}

export function OnboardingScreen() {
  const { company, session, can, feature } = useWorkspace();
  const refresh = useRefreshWorkspace();
  const [editing, setEditing] = useState(false);
  const financialEnabled = feature("FINANCIAL_CORE") && can("financial.read");
  const accounts = useScopedQuery<ApiPage<ApiRow> | ApiRow[]>("/financial-accounts", { size: 1 }, { enabled: financialEnabled });
  const categories = useScopedQuery<ApiPage<ApiRow> | ApiRow[]>("/categories", { size: 1 }, { enabled: financialEnabled });
  const emailVerified = !!session.user.emailVerifiedAt;
  const resend = useMutation({
    mutationFn: () => api.post("/auth/resend-verification", { workspaceSlug: session.account.slug, email: session.user.email }),
    onSuccess: () => toast.success("Se a verificação ainda estiver pendente, você receberá um novo e-mail."),
    onError: error => toast.error(errorMessage(error)),
  });
  const count = (data: ApiPage<ApiRow> | ApiRow[] | undefined) => data ? normalizePage(data).totalItems : 0;

  return <>
    <PageHeading eyebrow="Primeiro acesso" title="Prepare seu workspace"
      subtitle="Confira os dados da empresa e deixe o financeiro pronto para receber seus primeiros lançamentos."
      actions={<Button asChild><Link href="/dashboard">Ir ao painel <ArrowRight size={16} aria-hidden /></Link></Button>} />
    <section className="panel" aria-label="Etapas da configuração inicial">
      <ol className="onboarding-steps">
        <li>
          <div><strong>1. Confirme seu e-mail</strong><small>{session.user.email}</small></div>
          {emailVerified ? <Ready /> : <div className="page-actions">
            <Button size="small" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate()}><Mail size={15} aria-hidden /> Reenviar link</Button>
            <Button size="small" variant="ghost" onClick={() => void refresh()}>Já confirmei</Button>
          </div>}
        </li>
        <li>
          <div><strong>2. Revise a empresa</strong>
            <small>{company.tradeName || company.legalName} · {company.currency} · {company.timezone}</small></div>
          {can("companies.manage") ? <Button size="small" variant="outline" onClick={() => setEditing(true)}>Editar workspace</Button> : <Ready />}
        </li>
        {financialEnabled && <>
          <li>
            <div><strong>3. Adicione uma conta financeira</strong><small>Use uma conta bancária ou uma carteira para registrar o saldo de abertura.</small></div>
            {count(accounts.data) > 0 ? <Ready /> : can("financial.write") ?
              <Button asChild variant="outline" size="small"><Link href="/financeiro/contas?novo=1">Criar conta financeira</Link></Button> :
              <Button asChild variant="outline" size="small"><Link href="/financeiro/contas">Consultar contas</Link></Button>}
          </li>
          <li>
            <div><strong>4. Revise suas categorias</strong><small>Separe receitas e despesas para acompanhar os relatórios.</small></div>
            <div className="page-actions">{count(categories.data) > 0 && <Ready />}
              <Button asChild variant="outline" size="small"><Link href="/configuracoes/categorias">Ver categorias</Link></Button></div>
          </li>
        </>}
      </ol>
    </section>
    {editing && <CompanyEditor company={company} onClose={() => setEditing(false)} onSave={async () => {
      await refresh();
      setEditing(false);
    }} />}
  </>;
}
