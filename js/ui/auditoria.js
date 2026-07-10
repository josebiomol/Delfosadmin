import { getAuditLogs, restaurarExclusao, getOrganizacoes } from '../services/supabaseAdminService.js';
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
  _filtro: { org_id: '', user_id: '', modulo: '', texto: '', data_inicio: '', data_fim: '' },

  async carregar(filtroInicial) {
    if (filtroInicial) this._filtro = { ...this._filtro, ...filtroInicial };
    if (!this._empresas.length) this._empresas = await getOrganizacoes();
    this._logs = await getAuditLogs(this._filtro);
  },

  render() {
    const modulosUnicos = [...new Set(this._logs.map(l => l.modulo))];
    return `
      <h2>Auditoria</h2>
      <p class="sub">Pesquise ações feitas por qualquer usuário, em qualquer empresa.</p>

      <div class="toolbar">
        <input id="fAudInicio" class="select" type="date" style="max-width:150px" value="${this._filtro.data_inicio}">
        <span style="color:var(--muted);font-size:12px">até</span>
        <input id="fAudFim" class="select" type="date" style="max-width:150px" value="${this._filtro.data_fim}">
        <select id="fAudEmpresa" class="select">
          <option value="">Empresa: Todas</option>
          ${this._empresas.map(o => `<option value="${o.org_id}" ${o.org_id === this._filtro.org_id ? 'selected' : ''}>${escapeHTML(o.nome_fantasia || o.nome_org)}</option>`).join('')}
        </select>
        <select id="fAudModulo" class="select">
          <option value="">Módulo: Todos</option>
          ${modulosUnicos.map(m => `<option value="${m}" ${m === this._filtro.modulo ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('')}
        </select>
        <input id="fAudTexto" class="input" placeholder="Buscar na descrição da ação..." value="${escapeHTML(this._filtro.texto)}">
        <button id="btnLimparAud" class="btn"><i class="fa-solid fa-filter-circle-xmark"></i> Limpar</button>
      </div>

      <div id="auditoriaTableBox">${this._renderTabela()}</div>
    `;
  },

  _renderTabela() {
    if (!this._logs.length) return `<div class="empty">Nenhuma ação encontrada com esse filtro.</div>`;
    return `
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
            return `
            <tr>
              <td>${formatarData(l.criado_em)}</td>
              <td style="color:var(--muted)">${escapeHTML(org?.nome_fantasia || org?.nome_org || l.org_id)}</td>
              <td>${escapeHTML(l.user_id)}</td>
              <td><span class="badge ${acaoInfo.cls}">${acaoInfo.label}</span></td>
              <td><span class="code">${escapeHTML(l.modulo)}</span></td>
              <td style="color:var(--muted)">${escapeHTML(l.descricao)}</td>
              <td>${l.acao === 'excluir' ? `<button class="restore-link btn-restaurar" data-log="${l.log_id}"><i class="fa-solid fa-clock-rotate-left"></i> Restaurar</button>` : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  },

  bind(onIrPara) {
    const aplicarEAtualizar = async () => {
      await this.carregar();
      const box = document.getElementById('auditoriaTableBox');
      if (box) box.innerHTML = this._renderTabela();
      this._bindTabela();
    };

    document.getElementById('fAudInicio').addEventListener('change', (e) => { this._filtro.data_inicio = e.target.value; aplicarEAtualizar(); });
    document.getElementById('fAudFim').addEventListener('change', (e) => { this._filtro.data_fim = e.target.value; aplicarEAtualizar(); });
    document.getElementById('fAudEmpresa').addEventListener('change', (e) => { this._filtro.org_id = e.target.value; aplicarEAtualizar(); });
    document.getElementById('fAudModulo').addEventListener('change', (e) => { this._filtro.modulo = e.target.value; aplicarEAtualizar(); });
    const elTexto = document.getElementById('fAudTexto');
    const disparaTexto = () => { this._filtro.texto = elTexto.value; aplicarEAtualizar(); };
    elTexto.addEventListener('keydown', (e) => { if (e.key === 'Enter') disparaTexto(); });
    elTexto.addEventListener('blur', disparaTexto);
    document.getElementById('btnLimparAud').addEventListener('click', () => {
      this._filtro = { org_id: '', user_id: '', modulo: '', texto: '', data_inicio: '', data_fim: '' };
      aplicarEAtualizar();
    });
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
