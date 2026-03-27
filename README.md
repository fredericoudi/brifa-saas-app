# Agência SaaS

Plataforma SaaS web para gestão de pequenas agências de publicidade (2 a 15 pessoas), com arquitetura multi-tenant, autenticação Supabase e frontend em Next.js 14.

## Stack

- Next.js 14 + React + TypeScript
- TailwindCSS
- Supabase (Auth + Postgres + RLS)
- PostgreSQL (via Supabase)
- Deploy recomendado: Vercel

## Funcionalidades implementadas

- Autenticação completa:
  - Cadastro de agência (primeiro usuário vira admin)
  - Login
  - Recuperação/redefinição de senha
  - Logout
- Multi-tenant com isolamento por agência via **RLS**
- Dashboard com métricas:
  - Jobs ativos
  - Jobs atrasados
  - Tarefas em andamento
  - Tarefas atrasadas
  - Carga da equipe
- Clientes: CRUD
- Jobs: CRUD
- Job detalhe (`/jobs/[id]`) com tarefas relacionadas
- Tarefas em Kanban (`A fazer`, `Em andamento`, `Revisão`, `Concluído`) com drag-and-drop persistente
- Produção da equipe (`/workload`) com carga por membro
- Equipe:
  - Convite por e-mail
  - Definição de role
  - Remoção de membros
- Configurações de perfil e agência
- Integração com Google Drive por agência:
  - OAuth 2.0 (conexão única)
  - Configuração de pasta raiz
  - Criação automática de pasta de job + subpastas padrão
  - Link da pasta salvo no job

## Estrutura de rotas

- Públicas: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback`
- Privadas: `/dashboard`, `/jobs`, `/jobs/[id]`, `/tasks`, `/clients`, `/team`, `/workload`, `/settings`
- APIs novas: `/api/jobs`, `/api/integrations/google-drive/connect`, `/api/integrations/google-drive/callback`, `/api/integrations/google-drive/root-folder`

## Banco de dados e RLS

A migration principal está em:

- `supabase/migrations/202603110001_initial_schema.sql`
- `supabase/migrations/202603120001_google_drive_integration.sql`
- `supabase/migrations/202603120002_clients_prefix.sql`

Ela cria:

- Tabelas: `agencies`, `users`, `clients`, `jobs`, `tasks`, `team_invitations`
- Enums de status/roles/prioridade/plano
- Índices para performance
- Trigger de onboarding em `auth.users` para:
  - Criar agência + admin no signup
  - Vincular usuário convidado à agência
- Políticas RLS multi-tenant

## Setup

1. Instale dependências:

```bash
npm install
```

2. Crie um projeto Supabase.

3. Rode a migration SQL:

- Opção A: SQL Editor no dashboard do Supabase (colar o arquivo da migration)
- Opção B: Supabase CLI (se já estiver configurado localmente)

4. Configure variáveis de ambiente:

```bash
cp .env.example .env.local
```

Preencha:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (recomendado na UI atual do Supabase)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (compatibilidade com projetos antigos)
- `SUPABASE_SERVICE_ROLE_KEY` (compatibilidade com projetos antigos)
- `SUPABASE_SECRET_KEY` (chave de servidor na UI atual; necessária para convite por e-mail e criação de pasta no Google Drive)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

5. Configure no Supabase Auth as URLs de redirecionamento para incluir:

- `http://localhost:3000/auth/callback`

6. Configure no Google Cloud Console (OAuth 2.0 Client):

- Authorized redirect URI: `http://localhost:3000/api/integrations/google-drive/callback`

7. Rode localmente:

```bash
npm run dev
```

Acesse `http://localhost:3000`.

## Observações importantes

- O isolamento entre agências é garantido no banco por RLS, não apenas no frontend.
- Para convite por e-mail funcionar, o provider de e-mail do Supabase precisa estar configurado.
- Mobile está com suporte básico; foco principal em desktop e tablet.
