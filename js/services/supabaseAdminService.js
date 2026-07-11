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

// Se o login do painel ficar um tempo parado, o token de sessão vence e
// qualquer gravação passa a ser barrada pela RLS (mensagem "new row
// violates row-level security policy"), mesmo a pessoa continuando
// logada visualmente. Em vez de obrigar a deslogar/logar de novo toda
// vez que isso acontece, detecta esse erro específico, renova o token
// sozinho e tenta a mesma operação de novo, 1 vez, sem o usuário notar.
async function comRenovacaoDeSessao(fn) {
  try {
    return await fn();
  } catch (e) {
    const pareceExpirado = /row-level security policy/i.test(e.message || '');
    if (!pareceExpirado) throw e;
    const { error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) throw e; // não deu pra renovar — mostra o erro original mesmo
    return await fn(); // tenta de novo, já com sessão renovada
  }
}

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
  const { data: orgs, error } = await supabase.from('organizations').select('org_id, status, trial_expira_em, criado_em, nome_org, nome_fantasia');
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
  // Trial que já passou da data e ninguém ainda tomou nenhuma ação
  // (nem virou "ativo" nem "cancelado") — precisa de contato manual.
  const trialVencido = orgs.filter(o => {
    if (o.status !== 'trial' || !o.trial_expira_em) return false;
    const dias = Math.ceil((new Date(o.trial_expira_em) - hoje) / 86400000);
    return dias < 0;
  });

  return { total, ativas, suspensas, trial, trialExpirando, trialVencido };
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
  return comRenovacaoDeSessao(async () => {
    const { data: org } = await supabase.from('organizations').select('nome_fantasia, nome_org').eq('org_id', org_id).maybeSingle();
    const { error } = await supabase.from('organizations').update({ status }).eq('org_id', org_id);
    if (error) throw new Error(error.message);

    registrarLogAdmin({
      acao: 'editar', entidade: 'organizacao', entidade_id: org_id,
      descricao: `Mudou o status de "${org?.nome_fantasia || org?.nome_org || org_id}" pra "${status}"`,
    });

    return { success: true };
  });
}

// ========== MÓDULOS POR EMPRESA ==========
export async function getModulosDaEmpresa(org_id) {
  const { data, error } = await supabase.from('org_modulos').select('*').eq('org_id', org_id);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function salvarModulosDaEmpresa(org_id, modulosHabilitados) {
  return comRenovacaoDeSessao(async () => {
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
  });
}

// ========== ACESSO DE SUPORTE (conta oculta por empresa) ==========
// Conta de suporte/manutenção dentro da própria empresa (não é login mestre
// — se vazar, só compromete aquela empresa). Login previsível
// (_suporte_<org_id>), mas a segurança real é a senha aleatória, que é
// mostrada 1 única vez na hora de gerar/redefinir e nunca fica salva em
// texto puro em lugar nenhum (nem no log de auditoria).
//
// Cópia manual das flags/módulos do app cliente (mesmo padrão já usado em
// modulosLista.js) — se um módulo ou flag nova for adicionado lá
// (permissionFlags.js / menuModules.js), replicar aqui também, senão a
// conta de suporte nasce sem acesso a essa coisa nova.
const PERMISSAO_FLAGS_KEYS = [
  // agendamento
  'view_dashboard', 'view_appointments', 'add_appointment', 'edit_appointment', 'delete_appointment',
  'view_blocked_dates', 'add_blocked_date', 'edit_blocked_date', 'delete_blocked_date',
  // configuracoes
  'view_usuarios', 'view_hospitais', 'view_medicos', 'view_convenios', 'view_procedimentos',
  'view_status', 'view_motivos', 'view_grupos', 'view_setores', 'view_unidades', 'add_unidade',
  'edit_own_profile', 'view_auditoria', 'view_classificacoes_sprint',
];
const MODULOS_GENERICOS_KEYS = [
  'gestao_estrategica', // já implementado, mas fora de agendamento/configuracoes — usa ação genérica
  'gestao_processos', 'gestao_riscos', 'gestao_ocorrencias', 'gestao_planos_acoes',
  'gestao_indicadores', 'gestao_auditorias', 'gestao_treinamentos', 'gestao_acidentes',
  'recursos_humanos', 'gestao_atendimento_cliente', 'gestao_reunioes', 'gestao_ordem_servico',
  'gestao_patrimonio', 'controle_agua', 'gestao_temp_umidade', 'gestao_fornecedores_produtos',
  'gestao_fornecedores_servicos', 'modelo_canvas', 'cadeia_valor', 'gestao_mudanca_inovacao',
];

function _gerarSenhaAleatoria(tamanho = 14) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const valores = new Uint32Array(tamanho);
  crypto.getRandomValues(valores);
  return Array.from(valores, v => chars[v % chars.length]).join('');
}

// Retorna a conta de suporte da empresa, se existir (nunca inclui senha —
// senha não fica salva em lugar nenhum além do hash no Supabase Auth).
export async function getAcessoSuporte(org_id) {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, "Login", criado_em')
    .eq('org_id', org_id)
    .eq('oculto', 'SIM')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

// Cria (1ª vez) ou redefine a senha (se já existir) da conta de suporte
// dessa empresa. Retorna { login, senha } — a chamada em empresas.js é
// responsável por mostrar isso só 1x e nunca guardar em lugar nenhum.
export async function gerarOuRedefinirAcessoSuporte(org_id) {
  return comRenovacaoDeSessao(async () => {
    const { data: org } = await supabase.from('organizations').select('nome_fantasia, nome_org').eq('org_id', org_id).maybeSingle();
    const existente = await getAcessoSuporte(org_id);
    const senha = _gerarSenhaAleatoria();
    const login = existente?.Login || `suporte_${org_id}`;
    const userIdFinal = existente?.user_id || `USR${Date.now()}`;
    const email = `${login}@delfosquality.internal`;

    const row = {
      user_id: userIdFinal, org_id, nome: 'Suporte Delfos',
      email, Login: login, role: 'admin', ativo: 'SIM', oculto: 'SIM',
    };
    const { data, error } = await supabase.from('users').upsert(row, { onConflict: 'user_id' }).select().single();
    if (error) throw new Error(error.message);

    // Confere e completa o que faltar (idempotente) — cobre tanto a 1ª
    // criação quanto contas antigas que porventura já existiam sem
    // unidade/permissão vinculada (não duplica o que já está lá).
    const { data: unidadesOrg, error: undErr } = await supabase
      .from('unidades').select('unidade_id').eq('org_id', org_id).eq('ativo', 'SIM');
    if (undErr) throw new Error('Usuário salvo, mas falhou ao buscar unidades: ' + undErr.message);

    const { data: jaVinculadas } = await supabase
      .from('usuarios_unidades').select('unidade_id').eq('user_id', userIdFinal).eq('ativo', 'SIM');
    const idsJaVinculados = new Set((jaVinculadas || []).map(v => v.unidade_id));
    const faltantes = (unidadesOrg || []).filter(u => !idsJaVinculados.has(u.unidade_id));
    if (faltantes.length) {
      const rowsUnidades = faltantes.map(u => ({
        id: `UU${Date.now()}${u.unidade_id}`, user_id: userIdFinal, org_id, unidade_id: u.unidade_id, ativo: 'SIM',
      }));
      const { error: uuErr } = await supabase.from('usuarios_unidades').insert(rowsUnidades);
      if (uuErr) throw new Error('Usuário salvo, mas falhou ao vincular unidades: ' + uuErr.message);
    }

    const { data: permExistente } = await supabase
      .from('permissoes_usuarios').select('permissao_id').eq('user_id', userIdFinal).eq('ativo', 'SIM').maybeSingle();
    if (!permExistente) {
      const flatPerms = {};
      PERMISSAO_FLAGS_KEYS.forEach(k => { flatPerms[k] = true; });
      const modulosPerms = {};
      MODULOS_GENERICOS_KEYS.forEach(k => { modulosPerms[k] = { acessar: true, cadastrar: true, editar: true, excluir: true }; });
      const { error: permErr } = await supabase.from('permissoes_usuarios').insert({
        permissao_id: `PERM${Date.now()}`, user_id: userIdFinal, org_id, unidade_id: null,
        permissoes_json: JSON.stringify({ ...flatPerms, modulos: modulosPerms }), ativo: 'SIM',
      });
      if (permErr) throw new Error('Usuário salvo, mas falhou ao gravar permissões: ' + permErr.message);
    }

    // Mesma Edge Function que o app cliente usa pra criar/atualizar o
    // login no Supabase Auth (service_role no servidor).
    const { data: authResult, error: authFnErr } = await supabase.functions.invoke('auth-user-create', {
      body: { email, password: senha, user_id: userIdFinal, org_id, auth_id: data.auth_id || null }
    });
    if (authFnErr || !authResult?.success) {
      throw new Error('Usuário criado, mas o login no Auth falhou: ' + (authFnErr?.message || authResult?.error || 'erro desconhecido'));
    }
    if (authResult.auth_id) {
      await supabase.from('users').update({ auth_id: authResult.auth_id }).eq('user_id', userIdFinal);
    }

    // Log NÃO inclui a senha — só o fato de que foi gerada/redefinida.
    registrarLogAdmin({
      acao: existente ? 'editar' : 'criar', entidade: 'acesso_suporte', entidade_id: org_id,
      descricao: `${existente ? 'Redefiniu a senha do' : 'Gerou'} acesso de suporte pra "${org?.nome_fantasia || org?.nome_org || org_id}"`,
    });

    return { success: true, login, senha, criadoAgora: !existente };
  });
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

// ========== PLANOS ==========
export async function getPlanos() {
  const { data, error } = await supabase.from('planos').select('*').order('criado_em');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function salvarPlano(payload) {
  return comRenovacaoDeSessao(async () => {
    const { plano_key, ...formData } = payload;
    const row = { ...formData };
    row.plano_key = plano_key || `PLANO${Date.now()}`;
    const { error } = await supabase.from('planos').upsert(row, { onConflict: 'plano_key' });
    if (error) throw new Error(error.message);
    return { success: true };
  });
}

export async function excluirPlano(plano_key) {
  const { error } = await supabase.from('planos').update({ ativo: 'NAO' }).eq('plano_key', plano_key);
  if (error) throw new Error(error.message);
  return { success: true };
}

// Aplica o plano numa empresa: seta organizations.plano E já espelha os
// módulos do plano em org_modulos — preservando as sub-telas de
// Configurações que vieram do Segmento (são fatias independentes, uma
// não apaga a outra).
export async function aplicarPlanoNaEmpresa(org_id, plano_key) {
  return comRenovacaoDeSessao(async () => {
    const { data: plano, error: planoErr } = await supabase.from('planos').select('*').eq('plano_key', plano_key).maybeSingle();
    if (planoErr) throw new Error(planoErr.message);
    if (!plano) throw new Error('Plano não encontrado.');

    const { error: orgErr } = await supabase.from('organizations').update({ plano: plano_key }).eq('org_id', org_id);
    if (orgErr) throw new Error(orgErr.message);

    const todasSubtelas = (await getSubtelas()).map(s => s.subtela_key);
    const { data: atuais } = await supabase.from('org_modulos').select('modulo_key').eq('org_id', org_id);
    const subtelasAtuais = (atuais || []).map(m => m.modulo_key).filter(k => todasSubtelas.includes(k));

    await salvarModulosDaEmpresa(org_id, [...(plano.modulos_json || []), ...subtelasAtuais]);
    return { success: true, plano };
  });
}

// ========== SUB-TELAS DE CONFIGURAÇÃO (registro dinâmico) ==========
export async function getSubtelas() {
  const { data, error } = await supabase.from('subtelas_configuracao').select('*').eq('ativo', 'SIM').order('criado_em');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function salvarSubtela({ subtela_key, label }) {
  return comRenovacaoDeSessao(async () => {
    const key = subtela_key || `subtela_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const { error } = await supabase.from('subtelas_configuracao').upsert({ subtela_key: key, label }, { onConflict: 'subtela_key' });
    if (error) throw new Error(error.message);
    return { success: true };
  });
}

export async function excluirSubtela(subtela_key) {
  const { error } = await supabase.from('subtelas_configuracao').update({ ativo: 'NAO' }).eq('subtela_key', subtela_key);
  if (error) throw new Error(error.message);
  return { success: true };
}

// ========== SEGMENTOS DE NEGÓCIO ==========
export async function getSegmentos() {
  const { data, error } = await supabase.from('segmentos').select('*').eq('ativo', 'SIM').order('criado_em');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function salvarSegmento(payload) {
  return comRenovacaoDeSessao(async () => {
    const { segmento_key, ...formData } = payload;
    const row = { ...formData };
    row.segmento_key = segmento_key || `SEG${Date.now()}`;
    const { error } = await supabase.from('segmentos').upsert(row, { onConflict: 'segmento_key' });
    if (error) throw new Error(error.message);
    return { success: true };
  });
}

export async function excluirSegmento(segmento_key) {
  const { error } = await supabase.from('segmentos').update({ ativo: 'NAO' }).eq('segmento_key', segmento_key);
  if (error) throw new Error(error.message);
  return { success: true };
}

// Aplica o segmento numa empresa: seta organizations.segmento E espelha
// as sub-telas dele em org_modulos — preservando os módulos principais
// que vieram do Plano.
export async function aplicarSegmentoNaEmpresa(org_id, segmento_key) {
  return comRenovacaoDeSessao(async () => {
    const { data: segmento, error: segErr } = await supabase.from('segmentos').select('*').eq('segmento_key', segmento_key).maybeSingle();
    if (segErr) throw new Error(segErr.message);
    if (!segmento) throw new Error('Segmento não encontrado.');

    const { error: orgErr } = await supabase.from('organizations').update({ segmento: segmento_key }).eq('org_id', org_id);
    if (orgErr) throw new Error(orgErr.message);

    const todasSubtelas = (await getSubtelas()).map(s => s.subtela_key);
    const { data: atuais } = await supabase.from('org_modulos').select('modulo_key').eq('org_id', org_id);
    const modulosPrincipaisAtuais = (atuais || []).map(m => m.modulo_key).filter(k => !todasSubtelas.includes(k));

    await salvarModulosDaEmpresa(org_id, [...modulosPrincipaisAtuais, ...(segmento.subtelas_json || [])]);
    return { success: true, segmento };
  });
}