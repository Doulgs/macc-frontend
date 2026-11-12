# MACC Gestão

Aplicação Next.js para operar finanças, orçamentos e vendas por empresa. A conta agrupa seus workspaces, enquanto cada empresa mantém equipe, permissões e registros próprios. Os dados vêm da API Spring, inclusive os indicadores do painel.

## Desenvolvimento local

Com o backend executando, use Node.js 22 ou superior e pnpm 10:

```sh
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

Acesse `http://localhost:3000`. Use o mesmo host e porta configurados em `APP_ORIGIN`. Em outra porta, ajuste `APP_ORIGIN` e a origem dos links de e-mail no backend. Para subir a pilha com PostgreSQL, siga o [guia do ambiente local](../macc-backend/docs/ambiente-local.md).

- `APP_ORIGIN`: endereço público canônico deste frontend, usado para verificar a origem de alterações e decidir se o cookie é seguro.
- `APP_ALLOWED_ORIGINS`: origens públicas adicionais separadas por vírgula para servir vários domínios com o mesmo build. Configure os domínios correspondentes no backend e encaminhe o host público pelo proxy.
- `BACKEND_INTERNAL_URL`: URL privada da API com o sufixo `/api/v1`.
- `BACKEND_BFF_SECRET`: segredo compartilhado com a API para o encaminhamento confiável do host. Configure em runtime.

## Operação

1. Cadastre a conta e a primeira empresa. O identificador da conta aparece em **Empresas** e é usado para login.
2. Crie outras empresas em **Configurações → Empresas** ou em **Novo workspace** no seletor lateral.
3. Selecione a empresa e abra **Equipe** para gerar o convite por e-mail e papel. Copie o link se precisar compartilhá-lo manualmente.
4. Aceite pelo link. Quem já participa da conta usa a senha existente. A sessão abre na empresa do convite após conferir o vínculo.

O frontend usa um BFF no mesmo domínio. O navegador recebe cookies HttpOnly, enquanto o BFF usa os tokens para chamar a API. Hospede com HTTPS e mantenha o segredo fora do bundle. A coordenação de refresh usa memória local do processo. Com várias réplicas, mantenha as requisições de uma sessão na mesma instância ou forneça coordenação compartilhada para rotação concorrente.

As imagens de login e os símbolos da MACC foram otimizados para WebP a partir dos arquivos do diretório `assets`. A marca padrão segue a paleta oficial, e o backend resolve marcas alternativas por domínio.

## Verificações

```sh
pnpm lint
pnpm typecheck
pnpm build
```

Quando o contrato da API mudar, atualize a especificação versionada no backend e rode `pnpm generate:api` com os dois projetos em pastas vizinhas.

A imagem de produção usa saída standalone e disponibiliza `/api/health`.
