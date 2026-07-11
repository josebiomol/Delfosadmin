/**
 * services/supabaseAdminService.js
 *
 * Fala com o MESMO projeto Supabase do Delfos Quality (mesma URL, mesma
 * anon key) — mas com login e permissões completamente à parte:
 * só entra quem estiver na tabela `platform_admins` (ver sql/001_setup_platform_admin.sql).
 *
 * IMPORTANTE: mesmo sendo o mesmo Supabase, este é um projeto/deploy
 * separado do app cliente — bundle JS diferente, domínio/pasta diferente.
 * Ninguém que acessa o app cliente consegue chegar nesse código.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

// Mesmas credenciais do app cliente — são públicas por natureza (anon key),
// a segurança real é a RLS + a tabela platform_admins no banco.
const SUPABASE_URL = 'https://taavmpmdiddulkiewflh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fhwicMVcRAqFJWhjW8wYcQ_4ctFrBtS';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== SESSÃO (própria, não mexe no localStorage do app cliente) ==========
const SESSION_KEY = 'delfos_admin_session';

export function saveAdminSession(admin) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(admin));
}
export function getAdminSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}
export function clearAdminSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ========== LOGIN ==========
export async function loginAdmin(email, password) {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) return { success: false, error: 'Email ou senha inválidos.' };

  // confirma que esse login É um platform_admin ativo — se não for,
  // desloga na hora (mesmo que a senha esteja certa, não é admin daqui).
  const { data: admin, error: findErr } = await supabase
    .from('platform_admins')
    .select('*')
    .eq('auth_id', authData.user.id)
    .eq('ativo', 'SIM')
    .maybeSingle();

  if (findErr || !admin) {
    await supabase.auth.signOut();
    return { success: false, error: 'Este login não tem acesso ao painel administrativo.' };
  }

  saveAdminSession(admin);
  return { success: true, admin };
}

export async function logoutAdmin() {
  await supabase.auth.signOut();
  clearAdminSession();
}

// ========== DASHBOARD ==========
export async function getDashboardStats() {
  const { data: orgs, error } = await supabase.from('organizations').select('org_id, status, trial_expira_em, criado_em');
  if (error) throw new Error(error.message);

  const total = orgs.length;
  const ativas = orgs.filter(o => o.status === 'ativo').length;
  const suspensas = orgs.filter(o => o.status === 'suspenso').length;
  const trial = orgs.filter(o => o.status === 'trial').length;

  const hoje = new Date();
  const trialExpirando = orgs.filter(o => {
    if (o.status !== 'trial' || !o.trial_expira_em) return false;
    const dias = Math.ceil((new Date(o.trial_expira_em) - hoje) / 86400000);
    return dias <= 10 && dias >= 0;
  });

  return { total, ativas, suspensas, trial, trialExpirando };
}

export async function getAtividadeRecente(limite = 8) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return data || [];
}

// ========== EMPRESAS ==========
export async function getOrganizacoes({ busca, status } = {}) {
  let q = supabase.from('organizations').select('*').order('criado_em', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let lista = data || [];
  if (busca) {
    const termo = busca.toLowerCase();
    lista = lista.filter(o =>
      (o.nome_org || '').toLowerCase().includes(termo) ||
      (o.nome_fantasia || '').toLowerCase().includes(termo) ||
      (o.cnpj || '').includes(termo)
    );
  }
  // conta usuários de cada org (uma query por org é aceitável no volume
  // esperado; se crescer muito, trocar por uma view/RPC agregada)
  const comContagem = await Promise.all(lista.map(async (org) => {
    const { count } = await supabase.from('users').select('user_id', { count: 'exact', head: true }).eq('org_id', org.org_id);
    return { ...org, total_usuarios: count || 0 };
  }));
  return comContagem;
}

// ========== LOG DAS AÇÕES DO PRÓPRIO PAINEL ADMIN ==========
// Registra em audit_logs com org_id = 'PLATAFORMA' (não pertence a
// nenhuma empresa) — assim dá pra distinguir na tela de Auditoria entre
// "ação de usuário de empresa" e "ação do dono da plataforma".
async function registrarLogAdmin({ acao, entidade, entidade_id, descricao }) {
  const admin = getAdminSession();
  try {
    const { error } = await supabase.from('audit_logs').insert({
      log_id: `LOG${Date.now()}`,
      org_id: 'PLATAFORMA', unidade_id: null, user_id: admin?.admin_id || 'desconhecido',
      modulo: 'delfos_admin', acao, entidade, entidade_id: entidade_id || null,
      descricao: `[${admin?.nome || 'admin'}] ${descricao}`,
    });
    if (error) console.error('⚠️ Falha ao gravar log do admin:', error.message);
  } catch (e) {
    console.error('⚠️ Exceção ao gravar log do admin:', e.message);
  }
}

export async function atualizarStatusOrganizacao(org_id, status) {
  const { data: org } = await supabase.from('organizations').select('nome_fantasia, nome_org').eq('org_id', org_id).maybeSingle();
  const { error } = await supabase.from('organizations').update({ status }).eq('org_id', org_id);
  if (error) throw new Error(error.message);

  registrarLogAdmin({
    acao: 'editar', entidade: 'organizacao', entidade_id: org_id,
    descricao: `Mudou o status de "${org?.nome_fantasia || org?.nome_org || org_id}" pra "${status}"`,
  });

  return { success: true };
}

// ========== MÓDULOS POR EMPRESA ==========
export async function getModulosDaEmpresa(org_id) {
  const { data, error } = await supabase.from('org_modulos').select('*').eq('org_id', org_id);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function salvarModulosDaEmpresa(org_id, modulosHabilitados) {
  // modulosHabilitados: array de module_key habilitados (os que não vierem, ficam desabilitados)
  const { data: org } = await supabase.from('organizations').select('nome_fantasia, nome_org').eq('org_id', org_id).maybeSingle();
  await supabase.from('org_modulos').delete().eq('org_id', org_id);
  if (modulosHabilitados.length) {
    const rows = modulosHabilitados.map(key => ({
      id: `ORGMOD${Date.now()}${key}`,
      org_id, modulo_key: key, habilitado: 'SIM',
    }));
    const { error } = await supabase.from('org_modulos').insert(rows);
    if (error) throw new Error(error.message);
  }

  registrarLogAdmin({
    acao: 'editar', entidade: 'org_modulos', entidade_id: org_id,
    descricao: `Ajustou os módulos habilitados de "${org?.nome_fantasia || org?.nome_org || org_id}" (${modulosHabilitados.length} módulo(s) habilitado(s))`,
  });

  return { success: true };
}

// ========== AUDITORIA ==========
export async function getAuditLogs({ org_id, user_ids, modulo, texto, data_inicio, data_fim, hora_inicio, hora_fim, limite = 100 } = {}) {
  let q = supabase.from('audit_logs').select('*').order('criado_em', { ascending: false }).limit(limite);
  if (org_id) q = q.eq('org_id', org_id);
  if (Array.isArray(user_ids) && user_ids.length) q = q.in('user_id', user_ids);
  if (modulo) q = q.eq('modulo', modulo);
  if (data_inicio) {
    const dtIni = new Date(`${data_inicio}T${hora_inicio || '00:00'}:00`);
    q = q.gte('criado_em', dtIni.toISOString());
  }
  if (data_fim) {
    const dtFim = new Date(`${data_fim}T${hora_fim || '23:59'}:59`);
    q = q.lte('criado_em', dtFim.toISOString());
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let lista = data || [];
  if (texto) {
    const termo = texto.toLowerCase();
    lista = lista.filter(l => (l.descricao || '').toLowerCase().includes(termo));
  }
  return lista;
}

// Busca usuários do app cliente por nome ou login — usado pelo filtro de
// Auditoria (o admin digita um nome, a gente resolve pra user_id(s) antes
// de consultar audit_logs). Coluna real no banco é "Login" (L maiúsculo).
export async function buscarUsuariosPorTermo(termo) {
  if (!termo || !termo.trim()) return [];
  const t = termo.trim();
  const { data, error } = await supabase
    .from('users')
    .select('user_id, nome, Login')
    .or(`nome.ilike.%${t}%,Login.ilike.%${t}%`)
    .limit(20);
  if (error) throw new Error(error.message);
  return data || [];
}

// Resolve user_id -> {nome, login} pra exibir na tabela de auditoria em
// vez do ID cru. Só busca os IDs que realmente aparecem nos logs carregados.
export async function resolverUsuarios(userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await supabase.from('users').select('user_id, nome, Login').in('user_id', ids);
  if (error) { console.error('⚠️ Falha ao resolver usuários:', error.message); return {}; }
  const mapa = {};
  (data || []).forEach(u => { mapa[u.user_id] = { nome: u.nome, login: u.Login }; });
  return mapa;
}

// Restaura uma exclusão logada — só funciona pra ações do tipo 'excluir'
// em entidades que usam soft-delete (campo 'ativo'). Ver ressalva no
// README: nem toda exclusão no sistema hoje é soft-delete.
export async function restaurarExclusao(log) {
  if (log.acao !== 'excluir') throw new Error('Só é possível restaurar ações de exclusão.');
  if (!log.dados_antes) throw new Error('Sem snapshot salvo — não é possível restaurar.');

  const TABELA_POR_ENTIDADE = {
    agendamento: { table: 'agendamentos', pk: 'agendamento_id', schema: null },
    sprint_execucao: { table: 'sprint_execucoes', pk: 'execucao_id', schema: 'gestao_estrategica' },
    acao_estrategica: { table: 'acoes_estrategicas', pk: 'acao_id', schema: 'gestao_estrategica' },
    usuario: { table: 'users', pk: 'user_id', schema: null },
  };
  const config = TABELA_POR_ENTIDADE[log.entidade];
  if (!config) throw new Error(`Não sei restaurar a entidade "${log.entidade}" ainda — adicione o mapeamento em TABELA_POR_ENTIDADE.`);

  const client = config.schema ? supabase.schema(config.schema) : supabase;
  const { error } = await client.from(config.table).update({ ativo: 'SIM' }).eq(config.pk, log.entidade_id);
  if (error) throw new Error(error.message);
  return { success: true };
}