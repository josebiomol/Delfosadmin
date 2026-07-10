-- ============================================================
-- Delfos Admin — setup completo do banco (rodar uma vez no SQL
-- Editor do Supabase, no MESMO projeto que o app cliente usa).
-- ============================================================

-- 1) QUEM PODE ACESSAR O PAINEL ADMIN
-- Tabela separada da tabela `users` do app cliente — de propósito.
-- Um platform_admin NÃO pertence a nenhuma organization.
create table if not exists platform_admins (
  admin_id    text primary key,          -- 'PADM' || extract(epoch from now())
  auth_id     uuid not null unique,       -- referência ao auth.users do Supabase
  nome        text not null,
  email       text not null unique,
  ativo       text not null default 'SIM',
  criado_em   timestamptz not null default now()
);

-- Função helper: true se o usuário logado agora é um platform_admin ativo.
-- security definer pra poder ler platform_admins mesmo com RLS ligado nela.
create or replace function is_platform_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from platform_admins
    where auth_id = auth.uid() and ativo = 'SIM'
  );
$$;

alter table platform_admins enable row level security;
create policy "so platform_admin ve platform_admins"
  on platform_admins for select
  using (is_platform_admin());


-- 2) STATUS DA EMPRESA (ativo / suspenso / trial)
-- A tabela organizations já existe (usada pelo app cliente) — só
-- adiciona as colunas novas, sem quebrar nada que já existe.
alter table organizations add column if not exists status text not null default 'ativo';
  -- valores esperados: 'ativo' | 'suspenso' | 'trial' | 'cancelado'
alter table organizations add column if not exists trial_expira_em date;
alter table organizations add column if not exists plano text default 'completo';

-- Permite que o Super Admin veja/edite TODAS as organizations,
-- além da policy que já deve existir restringindo o cliente à própria.
create policy "platform_admin ve todas organizations"
  on organizations for select
  using (is_platform_admin());
create policy "platform_admin edita todas organizations"
  on organizations for update
  using (is_platform_admin());


-- 3) MÓDULOS HABILITADOS POR EMPRESA
create table if not exists org_modulos (
  id          text primary key,          -- 'ORGMOD' || extract(epoch from now())
  org_id      text not null,
  modulo_key  text not null,             -- bate com a `key` do menuModules.js
  habilitado  text not null default 'SIM',
  atualizado_em timestamptz not null default now(),
  unique (org_id, modulo_key)
);

alter table org_modulos enable row level security;
-- cliente só lê os próprios módulos (pra montar o menu dele)
create policy "empresa ve os proprios modulos"
  on org_modulos for select
  using (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id'));
-- só o super admin escreve
create policy "platform_admin gerencia modulos"
  on org_modulos for all
  using (is_platform_admin());


-- 4) LOG DE AUDITORIA (mesma estrutura já combinada antes)
create table if not exists audit_logs (
  log_id        text primary key,
  org_id        text not null,
  unidade_id    text,
  user_id       text not null,
  modulo        text not null,
  acao          text not null,           -- 'criar' | 'editar' | 'excluir' | 'reativar'
  entidade      text not null,           -- 'sprint_execucao' | 'agendamento' | ...
  entidade_id   text,
  descricao     text not null,
  dados_antes   jsonb,
  dados_depois  jsonb,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_audit_logs_org      on audit_logs (org_id, criado_em desc);
create index if not exists idx_audit_logs_user     on audit_logs (user_id);
create index if not exists idx_audit_logs_entidade on audit_logs (entidade, entidade_id);

alter table audit_logs enable row level security;
create policy "empresa ve o proprio log"
  on audit_logs for select
  using (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id'));
create policy "platform_admin ve todo log"
  on audit_logs for select
  using (is_platform_admin());
-- inserir log: qualquer usuário autenticado pode inserir logs da própria org
-- (a validação de que org_id bate com o token fica a cargo do backend/serviço)
create policy "usuarios autenticados inserem log"
  on audit_logs for insert
  with check (auth.role() = 'authenticated');


-- 5) DEPOIS DE RODAR TUDO ISSO, CADASTRE VOCÊ MESMO COMO PLATFORM ADMIN:
-- (troque o auth_id pelo seu próprio — pegue em Authentication > Users no
-- painel do Supabase, é o "UID" do seu usuário)
--
-- insert into platform_admins (admin_id, auth_id, nome, email)
-- values ('PADM' || extract(epoch from now())::text, 'SEU-AUTH-UID-AQUI', 'José Carlos', 'seu@email.com');
