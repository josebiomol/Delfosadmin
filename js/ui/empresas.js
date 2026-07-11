import {
  getOrganizacoes, atualizarStatusOrganizacao,
  getModulosDaEmpresa, salvarModulosDaEmpresa,
} from '../services/supabaseAdminService.js';
import { escapeHTML } from '../utils/escapeHTML.js';
import { toast } from '../utils/toast.js';

// Cópia da lista de módulos do app cliente (menuModules.js). Se adicionar
// um módulo novo lá, replique aqui também — são dois projetos separados.
const MODULOS = [
  { grupo: 'Gestão Estratégica', itens: [
    { key: 'gestao_estrategica', label: 'Gestão Estratégica (BSC/Backlog/Sprints)' },
  ] },
  { grupo: 'Qualidade', itens: [
    { key: 'gestao_documentos', label: 'Gestão de documentos' },
    { key: 'gestao_processos', label: 'Gestão de processos' },
    { key: 'gestao_riscos', label: 'Gestão de riscos' },
    { key: 'gestao_ocorrencias', label: 'Gestão de ocorrências' },
    { key: 'gestao_planos_acoes', label: 'Gestão de planos de ações' },
    { key: 'gestao_indicadores', label: 'Gestão de indicadores' },
    { key: 'gestao_auditorias', label: 'Gestão de auditorias' },
  ] },
  { grupo: 'Pessoas', itens: [
    { key: 'gestao_treinamentos', label: 'Gestão de treinamentos' },
    { key: 'gestao_acidentes', label: 'Gestão de acidentes' },
    { key: 'recursos_humanos', label: 'Recursos humanos' },
  ] },
  { grupo: 'Operação', itens: [
    { key: 'agendamento', label: 'Agendamento' },
    { key: 'gestao_atendimento_cliente', label: 'Gestão de atendimento ao cliente' },
    { key: 'gestao_reunioes', label: 'Gestão de reuniões' },
    { key: 'gestao_ordem_servico', label: 'Gestão de ordem de serviço' },
    { key: 'gestao_patrimonio', label: 'Gestão do patrimônio' },
    { key: 'controle_agua', label: 'Controle de qualidade da água' },
    { key: 'gestao_temp_umidade', label: 'Controle de temperatura e umidade' },
  ] },
  { grupo: 'Fornecedores e estratégia', itens: [
    { key: 'gestao_fornecedores_produtos', label: 'Gestão de fornecedores de produtos' },
    { key: 'gestao_fornecedores_servicos', label: 'Gestão de fornecedores de serviços' },
    { key: 'modelo_canvas', label: 'Modelo de negócio canvas' },
    { key: 'cadeia_valor', label: 'Cadeia de valor' },
    { key: 'gestao_mudanca_inovacao', label: 'Gestão de mudança e inovação' },
  ] },
];

export const EmpresasUI = {
  _lista: [],
  _filtroBusca: '',
  _filtroStatus: '',

  async carregar() {
    this._lista = await getOrganizacoes({ busca: this._filtroBusca, status: this._filtroStatus });
  },

  render() {
    return `
      <h2>Empresas</h2>
      <p class="sub">Busque, ative/desative acesso e controle os módulos liberados por empresa.</p>

      <div class="toolbar">
        <input id="fBuscaEmpresa" class="input" placeholder="Buscar empresa por nome ou CNPJ..." value="${escapeHTML(this._filtroBusca)}">
        <select id="fStatusEmpresa" class="select">
          <option value="">Status: Todos</option>
          <option value="ativo" ${this._filtroStatus === 'ativo' ? 'selected' : ''}>Ativo</option>
          <option value="suspenso" ${this._filtroStatus === 'suspenso' ? 'selected' : ''}>Suspenso</option>
          <option value="trial" ${this._filtroStatus === 'trial' ? 'selected' : ''}>Trial</option>
        </select>
      </div>

      <div id="empresasTableBox">${this._renderTabela()}</div>
    `;
  },

  _renderTabela() {
    if (!this._lista.length) return `<div class="empty">Nenhuma empresa encontrada.</div>`;
    return `
      <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Plano</th>
            <th>Usuários</th>
            <th>Status</th>
            <th style="width:110px">Ativo</th>
            <th style="width:150px">Módulos</th>
            <th style="width:90px">Auditoria</th>
          </tr>
        </thead>
        <tbody>
          ${this._lista.map(o => `
            <tr>
              <td><div class="org-name">${escapeHTML(o.nome_fantasia || o.nome_org)}</div><div class="org-sub">CNPJ ${escapeHTML(o.cnpj || '—')}</div></td>
              <td>${escapeHTML(o.plano || 'completo')}</td>
              <td>${o.total_usuarios}</td>
              <td>${this._badgeStatus(o)}</td>
              <td><label class="switch"><input type="checkbox" class="chk-status" data-org="${o.org_id}" ${o.status !== 'suspenso' ? 'checked' : ''}><span class="slider"></span></label></td>
              <td><button class="link-btn btn-modulos" data-org="${o.org_id}" data-nome="${escapeHTML(o.nome_fantasia || o.nome_org)}"><i class="fa-solid fa-list-check"></i> Ver módulos</button></td>
              <td><button class="link-btn btn-ver-auditoria" data-org="${o.org_id}">Ver logs</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>`;
  },

  _badgeStatus(o) {
    if (o.status === 'suspenso') return `<span class="badge b-red">Suspenso</span>`;
    if (o.status === 'trial') {
      const dias = o.trial_expira_em ? Math.max(0, Math.ceil((new Date(o.trial_expira_em) - Date.now()) / 86400000)) : null;
      return `<span class="badge b-yellow">Trial${dias !== null ? ` (${dias}d)` : ''}</span>`;
    }
    return `<span class="badge b-green">Ativo</span>`;
  },

  bind(onIrPara) {
    const buscarComEnterOuBlur = () => {
      const el = document.getElementById('fBuscaEmpresa');
      const disparar = async () => { this._filtroBusca = el.value; await this.carregar(); this._atualizarTabela(onIrPara); };
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') disparar(); });
      el.addEventListener('blur', disparar);
    };
    buscarComEnterOuBlur();
    document.getElementById('fStatusEmpresa').addEventListener('change', async (e) => {
      this._filtroStatus = e.target.value;
      await this.carregar();
      this._atualizarTabela(onIrPara);
    });
    this._bindTabela(onIrPara);
  },

  async _atualizarTabela(onIrPara) {
    const box = document.getElementById('empresasTableBox');
    if (box) box.innerHTML = this._renderTabela();
    this._bindTabela(onIrPara);
  },

  _bindTabela(onIrPara) {
    document.querySelectorAll('.chk-status').forEach(chk => {
      chk.onchange = async () => {
        const org_id = chk.dataset.org;
        const org = this._lista.find(o => o.org_id === org_id);
        const novoStatus = chk.checked ? 'ativo' : 'suspenso';
        try {
          await atualizarStatusOrganizacao(org_id, novoStatus);
          org.status = novoStatus;
          toast.show(`${org.nome_fantasia || org.nome_org} agora está ${novoStatus === 'ativo' ? 'ativa' : 'suspensa'}.`, 'success');
          this._atualizarTabela(onIrPara);
        } catch (e) {
          toast.show('Erro ao atualizar: ' + e.message, 'error');
          chk.checked = !chk.checked; // reverte visualmente
        }
      };
    });
    document.querySelectorAll('.btn-modulos').forEach(btn => {
      btn.onclick = () => this._abrirModalModulos(btn.dataset.org, btn.dataset.nome);
    });
    document.querySelectorAll('.btn-ver-auditoria').forEach(btn => {
      btn.onclick = () => onIrPara('auditoria', { org_id: btn.dataset.org });
    });
  },

  async _abrirModalModulos(org_id, nomeEmpresa) {
    const overlayId = 'modalModulosEmpresa';
    document.getElementById(overlayId)?.remove();
    const html = `
      <div id="${overlayId}" class="overlay">
        <div class="modal">
          <h3>Módulos — ${escapeHTML(nomeEmpresa)}</h3>
          <p class="sub">Marque só os módulos que essa empresa contratou. O menu lateral dela mostra só o que estiver marcado aqui.</p>
          <div id="modulosBody"><div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</div></div>
          <div class="modal-actions">
            <button class="btn" id="btnCancelarModulos">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarModulos">Salvar módulos</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById(overlayId);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('btnCancelarModulos').onclick = () => overlay.remove();

    const habilitadosAtuais = new Set((await getModulosDaEmpresa(org_id)).filter(m => m.habilitado === 'SIM').map(m => m.modulo_key));

    document.getElementById('modulosBody').innerHTML = MODULOS.map(grupo => `
      <div class="mod-group">
        <div class="mod-group-title">${escapeHTML(grupo.grupo)}</div>
        ${grupo.itens.map(item => `
          <div class="mod-item">
            <span>${escapeHTML(item.label)}</span>
            <label class="switch"><input type="checkbox" class="chk-modulo" value="${item.key}" ${habilitadosAtuais.has(item.key) ? 'checked' : ''}><span class="slider"></span></label>
          </div>`).join('')}
      </div>`).join('');

    document.getElementById('btnSalvarModulos').onclick = async () => {
      const selecionados = Array.from(document.querySelectorAll('.chk-modulo:checked')).map(c => c.value);
      try {
        await salvarModulosDaEmpresa(org_id, selecionados);
        toast.show('Módulos atualizados.', 'success');
        overlay.remove();
      } catch (e) {
        toast.show('Erro ao salvar módulos: ' + e.message, 'error');
      }
    };
  },
};