"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/fields";
import { api, errorFields, errorMessage } from "@/lib/api";
import { BrandMark, brandStyle, useBranding } from "@/lib/branding";

type Mode = "login" | "register" | "forgot" | "reset" | "invite" | "verify";
type FieldName = "workspaceSlug" | "fullName" | "companyName" | "email" | "password" | "confirmation";
const modes: Record<Mode, { title: string; subtitle: string; action: string; fields: FieldName[] }> = {
  login: { title: "Entrar na sua conta", subtitle: "Acesse finanças, orçamentos e vendas.", action: "Entrar", fields: ["workspaceSlug", "email", "password"] },
  register: { title: "Crie sua conta", subtitle: "Comece com uma empresa. Adicione outros workspaces depois.", action: "Criar conta", fields: ["fullName", "companyName", "email", "password"] },
  forgot: { title: "Recuperar senha", subtitle: "Informe a conta e o e-mail usados no cadastro.", action: "Enviar link", fields: ["workspaceSlug", "email"] },
  reset: { title: "Redefinir senha", subtitle: "Escolha uma senha nova para sua conta.", action: "Salvar senha", fields: ["workspaceSlug", "password", "confirmation"] },
  invite: { title: "Aceitar convite", subtitle: "Use a senha da sua conta. Se for novo por aqui, informe seu nome e crie uma senha.", action: "Aceitar e entrar", fields: ["workspaceSlug", "fullName", "password"] },
  verify: { title: "Confirme seu e-mail", subtitle: "Use o link enviado para confirmar o endereço ou solicite outro.", action: "Confirmar e-mail", fields: ["workspaceSlug"] },
};

function schema(mode: Mode, resend: boolean) {
  return z.object({
    workspaceSlug: z.string().trim(),
    fullName: z.string().trim(),
    companyName: z.string().trim(),
    email: z.string().trim(),
    password: z.string().max(72, "Use no máximo 72 caracteres."),
    confirmation: z.string(),
    terms: z.boolean(),
  }).superRefine((value, ctx) => {
    const fields = resend ? ["workspaceSlug", "email"] : modes[mode].fields;
    const issue = (key: keyof typeof value, message: string) => ctx.addIssue({ code: "custom", path: [key], message });
    if (fields.includes("workspaceSlug") && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.workspaceSlug)) issue("workspaceSlug", "Informe o identificador da conta.");
    if (fields.includes("email") && !z.email().safeParse(value.email).success) issue("email", "Informe um e-mail válido.");
    if (fields.includes("password") && value.password.length < (mode === "login" ? 1 : 10)) issue("password", mode === "login" ? "Informe sua senha." : "Use pelo menos 10 caracteres.");
    if (mode === "reset" && value.password !== value.confirmation) issue("confirmation", "As senhas precisam ser iguais.");
    if (mode === "register") {
      if (value.fullName.length < 2) issue("fullName", "Informe seu nome.");
      if (value.companyName.length < 2) issue("companyName", "Informe o nome da empresa.");
      if (!value.terms) issue("terms", "Confirme o aceite para continuar.");
    }
  });
}

const labels: Record<FieldName, string> = {
  workspaceSlug: "Identificador da conta", fullName: "Nome completo", companyName: "Nome da empresa",
  email: "E-mail", password: "Senha", confirmation: "Confirme a senha",
};
const endpoints: Record<Mode, string> = {
  login: "/auth/login", register: "/auth/register", forgot: "/auth/forgot-password", reset: "/auth/reset-password",
  invite: "/invitations/accept", verify: "/auth/verify-email",
};

export function AuthForm({ mode, workspace = "", token = "" }: { mode: Mode; workspace?: string; token?: string }) {
  const brand = useBranding();
  const router = useRouter();
  const cache = useQueryClient();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [idempotency, setIdempotency] = useState<{ key: string; fingerprint: string }>();
  const configuration = modes[mode];
  const resend = mode === "verify" && !token;
  const fields = resend ? (["workspaceSlug", "email"] as const) : configuration.fields;
  const form = useForm({
    resolver: zodResolver(schema(mode, resend)),
    defaultValues: { workspaceSlug: workspace, fullName: "", companyName: "", email: "", password: "", confirmation: "", terms: false },
  });
  const submit = form.handleSubmit(async values => {
    setError("");
    const { workspaceSlug, email, password, fullName, companyName } = values;
    if ((mode === "invite" || mode === "reset") && !token) {
      setError("Abra o link recebido para continuar.");
      return;
    }
    const payloads = {
      login: { workspaceSlug, email, password },
      register: { fullName, email, password, company: { legalName: companyName, currency: "BRL", timezone: "America/Sao_Paulo" } },
      forgot: { workspaceSlug, email },
      reset: { workspaceSlug, token, password },
      invite: { workspaceSlug, token, password, ...(fullName ? { fullName } : {}) },
      verify: resend ? { workspaceSlug, email } : { workspaceSlug, token },
    };
    try {
      const fingerprint = JSON.stringify(payloads[mode]);
      const key = idempotency?.fingerprint === fingerprint ? idempotency.key : crypto.randomUUID();
      setIdempotency({ key, fingerprint });
      const { data } = await api.post<{ authenticated?: boolean; workspaceSlug?: string; activeCompanyId?: string }>(
        resend ? "/auth/resend-verification" : endpoints[mode], payloads[mode], { headers: { "Idempotency-Key": key } },
      );
      if (data?.authenticated) {
        await cache.cancelQueries();
        cache.clear();
        const target = data.workspaceSlug === "macc-platform" ? "/plataforma" : mode === "register" ? "/configuracao-inicial" : "/dashboard";
        const company = data.activeCompanyId && /^[0-9a-f-]{36}$/i.test(data.activeCompanyId) ? "?empresa=" + data.activeCompanyId : "";
        router.replace(target + company);
        return;
      }
      const messages = {
        register: "Conta criada. Confira seu e-mail para verificar o endereço." + (data?.workspaceSlug ? " Identificador da conta: " + data.workspaceSlug : ""),
        forgot: "Se os dados estiverem corretos, você receberá um link para redefinir sua senha.",
        verify: resend ? "Se houver uma conta pendente, você receberá outro link." : "E-mail confirmado. Você já pode entrar na sua conta.",
        reset: "Senha atualizada. Entre novamente para continuar.",
        login: "Sessão iniciada.",
        invite: "Convite aceito.",
      };
      form.reset();
      setResult(messages[mode]);
    } catch (failure) {
      for (const [field, messages] of Object.entries(errorFields(failure))) {
        const name = field === "company.legalName" ? "companyName" : field;
        if (fields.some(key => key === name) && messages[0]) form.setError(name as FieldName, { message: messages[0] });
      }
      setError(errorMessage(failure));
    }
  });

  return <main className="auth-layout" style={brandStyle(brand)}>
    <section className="auth-side">
      <Link href="/login" className="auth-logo" aria-label={brand.name}>
        {brand.logoUrl ? <BrandMark branding={brand} /> : <Image src="/brand/logo.webp" alt={brand.name} width={116} height={58} priority />}
      </Link>
      <div className="auth-form">
        <span className="auth-icon"><LayoutGrid size={24} /></span>
        <h1>{configuration.title}</h1>
        <p className="muted">{configuration.subtitle}</p>
        {result ? <div className="auth-result" role="status"><CheckCircle2 size={22} /><p>{result}</p><Button asChild><Link href="/login">Ir para o login</Link></Button></div> :
          <form className="form-stack" onSubmit={submit} noValidate>
            {fields.map(name => <Field key={name} label={name === "fullName" && mode === "invite" ? "Nome completo (se for novo)" : labels[name]} error={form.formState.errors[name]?.message}>
              {props => <div className={name === "password" ? "password-wrap" : undefined}>
                <input {...props} {...form.register(name)} type={name === "email" ? "email" : name === "password" || name === "confirmation" ? (passwordVisible ? "text" : "password") : "text"}
                  className="input" autoComplete={name === "email" ? "email" : name === "fullName" ? "name" : name === "password" || name === "confirmation" ? (mode === "login" ? "current-password" : "new-password") : "off"}
                  placeholder={name === "workspaceSlug" ? "minha-empresa" : name === "email" ? "voce@empresa.com.br" : undefined}
                  maxLength={name === "password" || name === "confirmation" ? 72 : name === "email" ? 254 : 160} />
                {name === "password" && <Button type="button" variant="ghost" size="icon" onClick={() => setPasswordVisible(!passwordVisible)}
                  aria-label={passwordVisible ? "Ocultar senha" : "Mostrar senha"}>{passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</Button>}
              </div>}
            </Field>)}
            {mode === "register" && <><label className="checkbox"><input type="checkbox" {...form.register("terms")} aria-invalid={!!form.formState.errors.terms} aria-describedby={form.formState.errors.terms ? "terms-error" : undefined} /> Aceito o uso da plataforma para administrar minha conta e os dados da empresa.</label>
              {form.formState.errors.terms && <small id="terms-error" className="field-error">{form.formState.errors.terms.message}</small>}</>}
            {mode === "login" && <Link className="auth-recover" href="/recuperar-senha">Esqueceu sua senha?</Link>}
            {error && <p className="inline-error" role="alert">{error}</p>}
            <Button disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Aguarde…" : resend ? "Reenviar confirmação" : configuration.action}<ArrowRight size={17} /></Button>
          </form>}
        <p className="auth-links">{mode === "login" ? <>Primeira vez aqui? <Link href="/cadastro">Crie sua conta</Link> <Link href="/confirmar-email">Confirme seu e-mail</Link></> : <Link href="/login">Voltar para o login</Link>}</p>
      </div>
      <footer>MACC Gestão</footer>
    </section>
    <aside className="auth-art">
      <span className="auth-art-image"><Image src="/brand/login.webp" alt="" fill sizes="(min-width: 900px) 50vw, 1px" priority /></span>
      <div className="auth-art-copy"><span>MACC / GESTÃO</span><p>Controle financeiro.<br />Clareza para decidir.</p><small>Todos os seus workspaces em um só lugar.</small></div>
    </aside>
  </main>;
}
