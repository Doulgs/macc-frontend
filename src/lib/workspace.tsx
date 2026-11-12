"use client";
import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getScoped, type Company, type Session } from "./api";

export type Workspace = {
  session: Session;
  company: Company;
  can: (permission: string) => boolean;
  feature: (feature: string) => boolean;
  selectCompany: (id: string) => Promise<void>;
};
export const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("Selecione uma empresa para continuar.");
  return workspace;
}

export function hasPermission(session: Session, permission: string) {
  return session.permissions.includes(permission) || session.permissions.includes("*");
}

export function useScopedQuery<T>(path: string, params?: object, options: { enabled?: boolean } = {}) {
  const { session, company } = useWorkspace();
  return useQuery({
    queryKey: ["scope", session.account.id, company.id, path, params],
    queryFn: getScoped<T>(path, company.id, params),
    enabled: options.enabled,
  });
}

export function useRefreshWorkspace() {
  const { session, company } = useWorkspace();
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["scope", session.account.id, company.id] }),
      client.invalidateQueries({ queryKey: ["session"] }),
    ]);
  };
}
