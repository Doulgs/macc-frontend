"use client";
import { AlertCircle, Inbox, ShieldAlert } from "lucide-react";
import { errorMessage, errorStatus, errorTraceId } from "@/lib/api";
import { Button } from "./button";

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="empty-state"><Inbox size={27} aria-hidden="true" /><strong>{title}</strong>{detail && <p>{detail}</p>}{action}</div>;
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const forbidden = errorStatus(error) === 403;
  const Icon = forbidden ? ShieldAlert : AlertCircle;
  const trace = errorTraceId(error);
  return <div role="alert" className="empty-state"><Icon size={27} aria-hidden="true" /><strong>{forbidden ? "Acesso restrito" : "Não foi possível carregar"}</strong><p>{errorMessage(error)}</p>{trace && <small>Referência: <code>{trace}</code></small>}
    {!forbidden && retry && <Button variant="outline" size="small" onClick={retry}>Tentar novamente</Button>}
  </div>;
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return <div aria-busy="true" aria-label="Carregando" className="skeleton-stack">
    {Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index} />)}
  </div>;
}
