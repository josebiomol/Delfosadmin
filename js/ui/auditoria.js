import { getAuditLogs, restaurarExclusao, getOrganizacoes, buscarUsuariosPorTermo, resolverUsuarios } from '../services/supabaseAdminService.js';
import { escapeHTML } from '../utils/escapeHTML.js';
import { toast } from '../utils/toast.js';

const LABEL_ACAO = { criar: { label: 'Criou', cls: 'b-green' }, editar: { label: 'Editou', cls: 'b-blue' }, excluir: { label: 'Excluiu', cls: 'b-red' }, reativar: { label: 'Reativou', cls: 'b-yellow' } };

function formatarData(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export const AuditoriaUI = {
  _logs: [],
  _empresas: [],
  _usuariosResolvidos: {}, // user_id -> {nome, login}
  _filtro: { org_id: '', modulo: '', texto: '', data_inicio: '', data_fim: '', hora_inicio: '', hora_fim: '', usuarioTexto: '' },
  _buscou: false, // só true depois que o admin clicou em "Buscar" pelo menos 1x

  // Carrega só o essencial pra montar os filtros (lista de empresas) —
  // NUNCA busca os logs em si aqui. Isso só acontece quando o admin
  // clica em "Buscar", de propósito: audit_logs pode crescer muito rápido
  // e consultar sem filtro nenhum toda vez que a tela abre pesa à toa.
  async carregar(filtroInicial) {
    if (filtroInicial) { this._filtro = { ...this._filtro, ...filtroInicial }; this._buscou = false; this._logs = []; }
    if (!this._empresas.length) this._empresas = await getOrganizacoes();
  },

  render() {
    return `
      <h2>Auditoria</h2>
      <p class="sub">Pesquise ações feitas por qualquer usuário, em qualquer empresa. Ajuste os filtros e clique em Buscar.</p>

      <div class="toolbar">
        <input id="fAudInicio" class="select" type="date" style="max-width:150px" value="${this._filtro.data_inicio}">
        <input id="fAudHoraInicio" class="select" type="time" style="max-width:110px" value="${this._filtro.hora_inicio}">
        <span style="color:var(--muted);font-size:12px">até</span>
        <input id="fAudFim" class="select" type="date" style="max-width:150px" value="${this._filtro.data_fim}">
        <input id="fAudHoraFim" class="select" type="time" style="max-width:110px" value="${this._filtro.hora_fim}">
        <select id="fAudEmpresa" class="select">
          <option value="">Empresa: Todas</option>
          <option value="PLATAFORMA" ${this._filtro.org_id === 'PLATAFORMA' ? 'selected' : ''}>⚙️ Ações do painel admin</option>
          ${this._empresas.map(o => `<option value="${o.org_id}" ${o.org_id === this._filtro.org_id ? 'selected' : ''}>${escapeHTML(o.nome_fantasia || o.nome_org)}</option>`).join('')}
        </select>
        <input id="fAudUsuario" class="input" placeholder="Usuário (nome ou login)..." value="${escapeHTML(this._filtro.usuarioTexto)}" style="max-width:200px">
        <input id="fAudTexto" class="input" placeholder="Buscar na descrição da ação..." value="${escapeHTML(this._filtro.texto)}">
        <button id="btnBuscarAud" class="btn btn-primary"><i class="fa-solid fa-magnifying-glass"></i> Buscar</button>
        <button id="btnLimparAud" class="btn"><i class="fa-solid fa-filter-circle-xmark"></i> Limpar</button>
      </div>

      <div id="auditoriaTableBox">${this._renderTabela()}</div>
    `;
  },

  _renderTabela() {
    if (!this._buscou) {
      return `<div class="empty"><i class="fa-solid fa-magnifying-glass" style="margin-right:6px"></i>Ajuste os filtros acima e clique em "Buscar" pra ver as ações.</div>`;
    }
    if (!this._logs.length) return `<div class="empty">Nenhuma ação encontrada com esse filtro.</div>`;
    return `
      <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:120px">Data/hora</th>
            <th>Empresa</th>
            <th>Usuário</th>
            <th style="width:80px">Ação</th>
            <th style="width:130px">Módulo</th>
            <th>Descrição</th>
            <th style="width:90px"></th>
          </tr>
        </thead>
        <tbody>
          ${this._logs.map(l => {
            const org = this._empresas.find(o => o.org_id === l.org_id);
            const acaoInfo = LABEL_ACAO[l.acao] || { label: l.acao, cls: 'b-blue' };
            const usuario = this._usuariosResolvidos[l.user_id];
            const usuarioLabel = usuario ? (usuario.login || usuario.nome) : l.user_id;
            return `
            <tr>
              <td>${formatarData(l.criado_em)}</td>
              <td style="color:var(--muted)">${escapeHTML(org?.nome_fantasia || org?.nome_org || l.org_id)}</td>
              <td title="${escapeHTML(usuario?.nome || '')}">${escapeHTML(usuarioLabel)}</td>
              <td><span class="badge ${acaoInfo.cls}">${acaoInfo.label}</span></td>
              <td><span class="code">${escapeHTML(l.modulo)}</span></td>
              <td style="color:var(--muted)">${escapeHTML(l.descricao)}</td>
              <td>${l.acao === 'excluir' ? `<button class="restore-link btn-restaurar" data-log="${l.log_id}"><i class="fa-solid fa-clock-rotate-left"></i> Restaurar</button>` : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>`;
  },

  bind(onIrPara) {
    // Só lê os campos aqui dentro — nenhum listener de filtro dispara
    // busca sozinho. A busca só roda quando "Buscar" é clicado.
    const lerFiltrosDaTela = () => {
      this._filtro.data_inicio = document.getElementById('fAudInicio').value;
      this._filtro.hora_inicio = document.getElementById('fAudHoraInicio').value;
      this._filtro.data_fim = document.getElementById('fAudFim').value;
      this._filtro.hora_fim = document.getElementById('fAudHoraFim').value;
      this._filtro.org_id = document.getElementById('fAudEmpresa').value;
      this._filtro.usuarioTexto = document.getElementById('fAudUsuario').value;
      this._filtro.texto = document.getElementById('fAudTexto').value;
    };

    const buscar = async () => {
      lerFiltrosDaTela();
      const btn = document.getElementById('btnBuscarAud');
      const textoOriginal = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Buscando...';
      try {
        let user_ids;
        if (this._filtro.usuarioTexto.trim()) {
          const usuarios = await buscarUsuariosPorTermo(this._filtro.usuarioTexto);
          if (!usuarios.length) {
            this._logs = [];
            this._buscou = true;
            toast.show('Nenhum usuário encontrado com esse nome/login.', 'error');
            this._rerenderTabela();
            return;
          }
          user_ids = usuarios.map(u => u.user_id);
        }

        this._logs = await getAuditLogs({ ...this._filtro, user_ids });
        this._usuariosResolvidos = await resolverUsuarios(this._logs.map(l => l.user_id));
        this._buscou = true;
        this._rerenderTabela();
      } catch (e) {
        toast.show('Erro ao buscar auditoria: ' + e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
      }
    };

    document.getElementById('btnBuscarAud').addEventListener('click', buscar);

    // Enter em qualquer campo de texto também dispara a busca (mas só
    // quando o usuário aperta Enter — não a cada tecla digitada).
    ['fAudUsuario', 'fAudTexto'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });
    });

    document.getElementById('btnLimparAud').addEventListener('click', () => {
      this._filtro = { org_id: '', modulo: '', texto: '', data_inicio: '', data_fim: '', hora_inicio: '', hora_fim: '', usuarioTexto: '' };
      this._logs = [];
      this._buscou = false;
      document.getElementById('fAudInicio').value = '';
      document.getElementById('fAudHoraInicio').value = '';
      document.getElementById('fAudFim').value = '';
      document.getElementById('fAudHoraFim').value = '';
      document.getElementById('fAudEmpresa').value = '';
      document.getElementById('fAudUsuario').value = '';
      document.getElementById('fAudTexto').value = '';
      this._rerenderTabela();
    });

    this._bindTabela();
  },

  _rerenderTabela() {
    const box = document.getElementById('auditoriaTableBox');
    if (box) box.innerHTML = this._renderTabela();
    this._bindTabela();
  },

  _bindTabela() {
    document.querySelectorAll('.btn-restaurar').forEach(btn => {
      btn.onclick = async () => {
        const log = this._logs.find(l => l.log_id === btn.dataset.log);
        if (!confirm(`Restaurar "${log.descricao}"?`)) return;
        try {
          await restaurarExclusao(log);
          toast.show('Restaurado com sucesso.', 'success');
        } catch (e) {
          toast.show('Erro ao restaurar: ' + e.message, 'error');
        }
      };
    });
  },
};