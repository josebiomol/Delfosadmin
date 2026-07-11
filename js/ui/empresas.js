import {
  getOrganizacoes, atualizarStatusOrganizacao,
  getModulosDaEmpresa, salvarModulosDaEmpresa,
  getPlanos, aplicarPlanoNaEmpresa,
} from '../services/supabaseAdminService.js';
import { escapeHTML } from '../utils/escapeHTML.js';
import { toast } from '../utils/toast.js';
import { MODULOS } from './modulosLista.js';

export const EmpresasUI = {
  _lista: [],
  _planos: [],
  _filtroBusca: '',
  _filtroStatus: '',

  async carregar() {
    const [lista, planos] = await Promise.all([
      getOrganizacoes({ busca: this._filtroBusca, status: this._filtroStatus }),
      getPlanos(),
    ]);
    this._lista = lista;
    this._planos = planos.filter(p => p.ativo === 'SIM');
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
              <td>
                <select class="select sel-plano" data-org="${o.org_id}" style="font-size:11.5px;padding:5px 8px">
                  <option value="">— nenhum —</option>
                  ${this._planos.map(p => `<option value="${p.plano_key}" ${p.plano_key === o.plano ? 'selected' : ''}>${escapeHTML(p.nome)}</option>`).join('')}
                </select>
                <button class="link-btn btn-aplicar-plano" data-org="${o.org_id}" style="display:block;margin-top:4px;font-size:10.5px">Aplicar módulos</button>
              </td>
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

  _formatarDataBR(iso) {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  _badgeStatus(o) {
    const criadoEm = this._formatarDataBR(o.criado_em);
    if (o.status === 'suspenso') {
      return `<span class="badge b-red">Suspenso</span><div style="font-size:10.5px;color:var(--muted);margin-top:4px">Criado em ${criadoEm}</div>`;
    }
    if (o.status === 'trial') {
      if (!o.trial_expira_em) {
        return `<span class="badge b-yellow">Trial</span><div style="font-size:10.5px;color:var(--muted);margin-top:4px">Criado em ${criadoEm}</div>`;
      }
      const dias = Math.ceil((new Date(o.trial_expira_em) - Date.now()) / 86400000);
      const vencaEm = this._formatarDataBR(o.trial_expira_em);
      if (dias < 0) {
        return `<span class="badge b-red">Trial vencido</span><div style="font-size:10.5px;color:var(--danger);margin-top:4px">Venceu em ${vencaEm} (há ${Math.abs(dias)}d) · criado ${criadoEm}</div>`;
      }
      return `<span class="badge b-yellow">Trial · ${dias}d restante${dias === 1 ? '' : 's'}</span><div style="font-size:10.5px;color:var(--muted);margin-top:4px">Criado ${criadoEm} · vence ${vencaEm}</div>`;
    }
    return `<span class="badge b-green">Ativo</span><div style="font-size:10.5px;color:var(--muted);margin-top:4px">Criado em ${criadoEm}</div>`;
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
    document.querySelectorAll('.btn-aplicar-plano').forEach(btn => {
      btn.onclick = async () => {
        const org_id = btn.dataset.org;
        const select = document.querySelector(`.sel-plano[data-org="${org_id}"]`);
        const plano_key = select.value;
        if (!plano_key) { toast.show('Escolha um plano primeiro.', 'error'); return; }
        const plano = this._planos.find(p => p.plano_key === plano_key);
        if (!confirm(`Aplicar o plano "${plano.nome}"? Isso substitui os módulos habilitados dessa empresa pelo pacote do plano.`)) return;
        try {
          await aplicarPlanoNaEmpresa(org_id, plano_key);
          const org = this._lista.find(o => o.org_id === org_id);
          org.plano = plano_key;
          toast.show(`Plano "${plano.nome}" aplicado.`, 'success');
        } catch (e) {
          toast.show('Erro ao aplicar plano: ' + e.message, 'error');
        }
      };
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