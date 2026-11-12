import axios from "axios";
import type { QueryFunctionContext } from "@tanstack/react-query";
import type { components } from "./api-contract";

export type ApiPage<T> = { items: T[]; page: number; size: number; totalItems: number; totalPages: number };
export type ApiRow = { id: string; [key: string]: unknown };
export type Problem = { traceId?: string; detail?: string; title?: string; code?: string; fieldErrors?: Record<string, string[]> };
export type Company = { id: string; legalName: string; tradeName?: string; currency: string; timezone: string; role?: string; isPrimary?: boolean };
export type Session = {
  user: { id: string; fullName: string; email: string; emailVerifiedAt?: string | null };
  account: { id: string; name: string; slug: string };
  companies: Company[];
  activeCompanyId?: string;
  permissions: string[];
  features: string[];
  membershipRole: string;
};
export type Branding = { name: string; logoUrl?: string; primaryColor?: string; slug?: string };
type BackendSession = components["schemas"]["Session"];
export type Tokens = BackendSession & Required<Pick<BackendSession, "accessToken" | "refreshToken" | "workspaceSlug">>;

export const api = axios.create({ baseURL: "/api/bff", timeout: 20_000, headers: { Accept: "application/json" } });
export const companyHeaders = (companyId?: string) => companyId ? { "X-Company-Id": companyId } : undefined;

export function errorStatus(error: unknown) {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export function errorMessage(error: unknown) {
  if (axios.isAxiosError<Problem>(error)) {
    const response = error.response;
    if (response?.status === 403) return response.data?.detail ?? "Você não tem permissão para esta ação.";
    if (response?.status === 404) return response.data?.detail ?? "Recurso não encontrado.";
    return response?.data?.detail ?? response?.data?.title ?? "Não foi possível acessar o serviço. Tente novamente.";
  }
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export function errorFields(error: unknown) {
  return axios.isAxiosError<Problem>(error) ? error.response?.data?.fieldErrors ?? {} : {};
}

export function errorTraceId(error: unknown) {
  if (!axios.isAxiosError<Problem>(error)) return undefined;
  const trace = error.response?.data?.traceId ?? error.response?.headers?.["x-correlation-id"];
  return typeof trace === "string" && /^[a-z0-9-]{8,64}$/i.test(trace) ? trace : undefined;
}

export function normalizePage<T>(result: ApiPage<T> | T[]): ApiPage<T> {
  return Array.isArray(result) ? { items: result, page: 0, size: result.length, totalItems: result.length, totalPages: result.length ? 1 : 0 } : result;
}

export function getScoped<T>(path: string, companyId?: string, params?: object) {
  return async ({ signal }: Pick<QueryFunctionContext, "signal">) =>
    (await api.get<T>(path, { headers: companyHeaders(companyId), params, signal })).data;
}

api.interceptors.response.use(response => response, (error: unknown) => {
  if (typeof window !== "undefined" && axios.isAxiosError(error) && error.response?.status === 401) {
    const path = error.config?.url ?? "";
    if (!/^\/(?:auth\/(?!me)|invitations\/accept|public\/)/.test(path)) {
      window.dispatchEvent(new Event("macc-session-expired"));
    }
  }
  return Promise.reject(error);
});
