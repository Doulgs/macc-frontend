"use client";

import { useMutation } from "@tanstack/react-query";
import { BellRing, Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { api, companyHeaders, errorMessage } from "@/lib/api";
import { useRefreshWorkspace, useScopedQuery, useWorkspace } from "@/lib/workspace";
import styles from "./workflows.module.css";

type Notice = { id: string; type: string; payload: { workflow?: string; trigger?: string }; createdAt: string; readAt?: string | null };
const subjects: Record<string, string> = { BUDGET_SUBMITTED: "Orçamento enviado", EXPENSE_CONFIRMED: "Despesa confirmada", PAYABLE_DUE: "Conta perto do vencimento" };

export function NotificationsScreen() {
  const { company } = useWorkspace();
  const refresh = useRefreshWorkspace();
  const notices = useScopedQuery<Notice[]>("/notifications");
  const read = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`, {}, { headers: companyHeaders(company.id) }),
    onSuccess: refresh,
    onError: error => toast.error(errorMessage(error)),
  });
  return <>
    <PageHeading eyebrow="Workspace" title="Notificações" subtitle="Avisos e solicitações da empresa ativa." />
    {notices.isPending ? <LoadingState /> : notices.isError ? <ErrorState error={notices.error} retry={() => void notices.refetch()} /> :
      !notices.data.length ? <EmptyState title="Nenhuma notificação" detail="Os avisos de automações e pedidos de aprovação aparecem aqui." /> :
      <ul className={styles.notices}>{notices.data.map(notice => <li key={notice.id}>
        <BellRing size={20} aria-hidden />
        <div><strong>{notice.type === "REQUEST_APPROVAL" ? "Solicitação de aprovação" : subjects[notice.payload.trigger ?? ""] ?? "Aviso de automação"}</strong>
          <p>{notice.payload.workflow ?? "Automação"} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: company.timezone }).format(new Date(notice.createdAt))}</p></div>
        {notice.readAt ? <span className={styles.badge}><Check size={14} /> Lida</span> :
          <Button variant="outline" size="small" disabled={read.isPending} onClick={() => read.mutate(notice.id)}>Marcar como lida</Button>}
      </li>)}</ul>}
  </>;
}
