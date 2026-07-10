# Delfos Admin

Painel de Super Admin da plataforma Delfos Quality — **projeto separado**
do app cliente. Mesmo Supabase (mesma URL/anon key), mas bundle, deploy
e login completamente independentes. Ninguém que usa o app cliente
consegue chegar nesse código nem nessa tela.

## Estrutura

```
delfos-admin/
  index.html
  css/admin.css
  js/main.js                          — bootstrap (login ou shell)
  js/services/supabaseAdminService.js — toda a comunicação com o Supabase
  js/ui/login.js                      — tela de login
  js/ui/shell.js                      — sidebar + roteamento
  js/ui/dashboard.js                  — painel inicial (stats + atividade recente)
  js/ui/empresas.js                   — lista/busca/ativa-desativa/módulos
  js/ui/auditoria.js                  — log de auditoria com filtros e restaurar
  js/utils/toast.js
  js/utils/escapeHTML.js
  sql/001_setup_platform_admin.sql    — schema novo necessário no banco
```

## Passo a passo pra colocar no ar

### 1. Rodar o SQL
Abra o SQL Editor do seu projeto Supabase (o mesmo do app cliente) e rode
o arquivo `sql/001_setup_platform_admin.sql` inteiro, de cima a baixo.

Isso cria:
- `platform_admins` — quem pode entrar no painel admin
- `organizations.status` (+ `trial_expira_em`, `plano`) — novas colunas na tabela que já existe
- `org_modulos` — quais módulos cada empresa vê
- `audit_logs` — o log de auditoria
- as policies de RLS necessárias

### 2. Criar seu próprio login de admin
No painel do Supabase → **Authentication → Users → Add user**, crie um
usuário com seu email/senha (separado do seu usuário do app cliente, se
quiser, ou pode reaproveitar o mesmo email).

Copie o **UID** desse usuário (aparece na lista).

Volte no SQL Editor e rode (troque os valores):
```sql
insert into platform_admins (admin_id, auth_id, nome, email)
values ('PADM1', 'COLE-O-UID-AQUI', 'José Carlos', 'seu@email.com');
```

### 3. Deploy (GitHub Pages, mesmo esquema do app cliente)
1. Crie um **repositório novo** no GitHub (ex: `delfos-admin`) — separado
   do repositório do app cliente.
2. Suba essa pasta inteira (`delfos-admin/`) pra raiz desse repositório novo.
3. Settings → Pages → Deploy from branch → `main` → `/ (root)`.
4. Pronto: fica em `https://SEU-USUARIO.github.io/delfos-admin/`.

**Por que repositório separado, e não só uma pasta `/admin` dentro do
repo do app cliente:** GitHub Pages serve tudo que está no repositório —
mesmo uma pasta "escondida" fica acessível por URL direta pra qualquer
um que souber (ou adivinhar) o caminho. Repositório separado garante
que o código do admin nunca é publicado no mesmo lugar que o app cliente.

### 4. Cadastrar módulos das empresas existentes
Como a tabela `org_modulos` é nova, as empresas que já existem não têm
nada nela ainda — o que, na lógica de `getModulosDaEmpresa`, hoje
significa "nenhum módulo habilitado". Pra empresas antigas que devem
manter acesso a tudo, entre no painel → Empresas → Módulos → marque tudo
e salve (ou rode um INSERT em lote no SQL Editor pra cada org_id com
todos os module_key).

## Pendências / próximos passos (não incluídos ainda)

- **Gravação automática do log de auditoria**: as tabelas e a tela de
  consulta já existem, mas o app cliente (`supabaseService.js`) ainda
  não chama `registrarLog()` em nenhuma das ~30 funções de save/delete.
  Isso precisa ser adicionado lá — ver `audit_logs_funcao_central.js`
  (arquivo enviado antes) pro esboço de como centralizar isso.
- **Filtro de módulos no menu do app cliente**: hoje o `menuModules.js`
  do app cliente mostra os módulos fixos pra todo mundo. Falta o app
  cliente consultar `org_modulos` no login e filtrar o menu por isso.
- **`restaurarExclusao`**: só sabe restaurar 4 entidades por enquanto
  (`agendamento`, `sprint_execucao`, `acao_estrategica`, `usuario`) — e
  só funciona pra tabelas que usam soft-delete (`ativo`). Sprints e
  assinaturas de ata, por exemplo, hoje são excluídas de vez no
  `supabaseService.js` (`delete()` puro) — pra restaurar essas também,
  primeiro precisa trocar esse `delete()` por soft-delete lá.
- **Cadastro de nova empresa pelo botão "+ Nova empresa"**: o botão está
  no mockup mas a função ainda não foi implementada aqui (a rota de
  signup que já existe no app cliente cria org + usuário admin junto —
  dá pra reaproveisar a mesma lógica de `signup()` do `supabaseService.js`,
  chamada a partir daqui).
