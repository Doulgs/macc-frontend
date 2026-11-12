import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Tokens } from "@/lib/api";

export const dynamic = "force-dynamic";
const accessCookie = "macc_access";
const refreshCookie = "macc_refresh";
const workspaceCookie = "macc_workspace";
const publicPosts = new Set([
  "auth/login", "auth/register", "auth/forgot-password", "auth/reset-password",
  "auth/verify-email", "auth/resend-verification", "invitations/accept",
]);
const establishesSession = new Set(["auth/login", "auth/register", "invitations/accept"]);
const protectedResources = new Set([
  "companies", "memberships", "users", "invitations", "financial-accounts",
  "transactions", "transfers", "payables", "receivables", "payments", "financial-categories", "budgets",
  "sales", "customers", "catalog-items", "dashboard", "reports", "exports",
  "workflows", "platform", "notifications", "audit-logs",
]);
const refreshes = new Map<string, Promise<Tokens | null>>();

function problem(status: number, detail: string, traceId: string) {
  return NextResponse.json({ status, detail, traceId }, { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

function tokenCookies(response: NextResponse, tokens: Tokens, secure: boolean) {
  const options = { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
  const sessionAge = 30 * 24 * 60 * 60;
  response.cookies.set(accessCookie, tokens.accessToken, { ...options, maxAge: tokens.expiresIn ?? 900 });
  response.cookies.set(refreshCookie, tokens.refreshToken, { ...options, maxAge: sessionAge });
  response.cookies.set(workspaceCookie, tokens.workspaceSlug, { ...options, maxAge: sessionAge });
}

function clearCookies(response: NextResponse, secure: boolean) {
  for (const name of [accessCookie, refreshCookie, workspaceCookie]) {
    response.cookies.set(name, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  }
}

function readTokens(value: unknown): Tokens | null {
  if (value === null || typeof value !== "object") return null;
  const token = value as Partial<Tokens>;
  return typeof token.accessToken === "string" && typeof token.refreshToken === "string" && typeof token.workspaceSlug === "string"
    ? token as Tokens : null;
}

function renew(base: string, headers: Headers, refreshToken: string, workspaceSlug: string) {
  const key = createHash("sha256").update(refreshToken).digest("hex");
  const existing = refreshes.get(key);
  if (existing) return existing;

  const rotation = fetch(base + "/auth/refresh", {
    method: "POST",
    headers: new Headers([...headers, ["Content-Type", "application/json"]]),
    body: JSON.stringify({ refreshToken, workspaceSlug }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    redirect: "error",
  }).then(async response => {
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error("Renovação indisponível");
    const tokens = readTokens(await response.json());
    if (!tokens) throw new Error("Resposta de sessão inválida");
    return tokens;
  }).finally(() => {
    // Concurrent BFF requests can all carry the previous refresh cookie.
    setTimeout(() => refreshes.delete(key), 5_000).unref();
  });
  refreshes.set(key, rotation);
  return rotation;
}

type RouteContext = { params: Promise<{ path: string[] }> };
async function proxy(request: NextRequest, { params }: RouteContext) {
  const correlationId = randomUUID();
  const { path } = await params;
  if (!path.every(segment => /^[a-zA-Z0-9_-]+$/.test(segment))) {
    return problem(404, "Recurso não encontrado.", correlationId);
  }

  const endpoint = path.join("/");
  const method = request.method;
  const mutable = method !== "GET" && method !== "HEAD";
  const isPublic = (method === "GET" && endpoint === "public/branding") || (method === "POST" && publicPosts.has(endpoint));
  const isLogout = method === "POST" && endpoint === "auth/logout";
  if (!isPublic && !isLogout && endpoint !== "auth/me" && !protectedResources.has(path[0])) {
    return problem(404, "Recurso não encontrado.", correlationId);
  }

  const allowedOrigins = [process.env.APP_ORIGIN, ...(process.env.APP_ALLOWED_ORIGINS?.split(",") ?? [])]
    .flatMap(value => {
      try {
        const url = new URL(value?.trim() ?? "");
        return ["http:", "https:"].includes(url.protocol) ? [url] : [];
      } catch { return []; }
    });
  const requestHost = request.headers.get("host") ?? request.nextUrl.host;
  const publicUrl = allowedOrigins.find(url => url.host === requestHost)
    ?? (allowedOrigins.length === 0 ? new URL(request.nextUrl.origin) : undefined);
  if (!publicUrl) return problem(403, "Domínio não autorizado.", correlationId);
  const secure = publicUrl.protocol === "https:";
  if (mutable && (request.headers.get("origin") !== publicUrl.origin || request.headers.get("sec-fetch-site") === "cross-site")) {
    return problem(403, "Origem da requisição não autorizada.", correlationId);
  }

  const defaultBackendPort = process.env.NODE_ENV === "development" ? 18090 : 8080;
  const base = (process.env.BACKEND_INTERNAL_URL ?? `http://127.0.0.1:${defaultBackendPort}/api/v1`).replace(/\/+$/, "");
  const refresh = request.cookies.get(refreshCookie)?.value;
  const workspace = request.cookies.get(workspaceCookie)?.value;
  const access = request.cookies.get(accessCookie)?.value;
  if (!isPublic && !isLogout && !access && !(refresh && workspace)) {
    return problem(401, "Entre para acessar sua conta.", correlationId);
  }

  const headers = new Headers({ Accept: request.headers.get("accept") ?? "application/json", "X-Correlation-Id": correlationId });
  headers.set("X-Forwarded-Host", publicUrl.host);
  if (process.env.BACKEND_BFF_SECRET) headers.set("X-MACC-BFF-Secret", process.env.BACKEND_BFF_SECRET);
  const scopedHeaders = new Headers(headers);
  const platformGrant = request.headers.get("x-macc-platform-grant");
  if (path[0] === "platform" && platformGrant && /^[A-Za-z0-9_-]{43}$/.test(platformGrant)) scopedHeaders.set("X-MACC-Platform-Grant", platformGrant);
  const companyId = request.headers.get("x-company-id");
  const idempotency = request.headers.get("idempotency-key");
  if (companyId && /^[0-9a-f-]{36}$/i.test(companyId)) scopedHeaders.set("X-Company-Id", companyId);
  if (idempotency && /^[0-9a-z_-]{1,128}$/i.test(idempotency)) scopedHeaders.set("Idempotency-Key", idempotency);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1024 * 1024) return problem(413, "Requisição grande demais.", correlationId);
  const body = isLogout ? JSON.stringify({ refreshToken: refresh ?? "" }) : mutable ? await request.text() : undefined;
  if (body && Buffer.byteLength(body) > 1024 * 1024) return problem(413, "Requisição grande demais.", correlationId);
  if (body) {
    if (!isLogout && !request.headers.get("content-type")?.startsWith("application/json")) {
      return problem(415, "Envie os dados no formato JSON.", correlationId);
    }
    scopedHeaders.set("Content-Type", "application/json");
  }

  function forward(bearer?: string) {
    const outbound = new Headers(scopedHeaders);
    if (!isPublic && bearer) outbound.set("Authorization", "Bearer " + bearer);
    return fetch(base + "/" + endpoint + request.nextUrl.search, {
      method, headers: outbound, body: body || undefined, cache: "no-store", signal: AbortSignal.timeout(15_000), redirect: "error",
    });
  }

  try {
    if (isLogout) {
      if (refresh && workspace) {
        const session = access ? await forward(access) : undefined;
        if (!session || session.status === 401) {
          const renewed = await renew(base, headers, refresh, workspace);
          if (renewed) {
            const result = await forward(renewed.accessToken);
            if (!result.ok) throw new Error("Revogação indisponível");
          }
        } else if (!session.ok) {
          throw new Error("Revogação indisponível");
        }
      }
      const response = new NextResponse(null, { status: 204 });
      clearCookies(response, secure);
      return response;
    }

    let tokens: Tokens | null = null;
    let upstream: Response | undefined;
    if (isPublic || access) upstream = await forward(access);
    if (!isPublic && (!upstream || upstream.status === 401) && refresh && workspace) {
      if (upstream) await upstream.body?.cancel();
      tokens = await renew(base, headers, refresh, workspace);
      upstream = tokens ? await forward(tokens.accessToken) : undefined;
    }
    if (!upstream || (!isPublic && upstream.status === 401)) {
      const response = problem(401, "Sua sessão expirou. Entre novamente.", correlationId);
      clearCookies(response, secure);
      return response;
    }

    if (upstream.ok && establishesSession.has(endpoint)) {
      const data = await upstream.json();
      tokens = readTokens(data);
      if (!tokens && endpoint !== "auth/register") return problem(502, "Resposta de sessão inválida.", correlationId);
      const response = NextResponse.json(tokens
        ? { authenticated: true, workspaceSlug: tokens.workspaceSlug, activeCompanyId: typeof tokens.activeCompanyId === "string" ? tokens.activeCompanyId : undefined }
        : { authenticated: false, workspaceSlug: typeof data?.workspaceSlug === "string" ? data.workspaceSlug : undefined },
      { status: upstream.status, headers: { "Cache-Control": "no-store" } });
      if (tokens) tokenCookies(response, tokens, secure);
      return response;
    }

    const responseHeaders = new Headers({ "Cache-Control": "no-store", "X-Correlation-Id": correlationId });
    for (const key of ["content-type", "content-disposition", "retry-after"]) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    const response = new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
    if (tokens) tokenCookies(response, tokens, secure);
    return response;
  } catch {
    const response = problem(502, "Serviço indisponível. Tente novamente em instantes.", correlationId);
    if (isLogout) clearCookies(response, secure);
    return response;
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
