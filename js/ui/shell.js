import { DashboardUI } from './dashboard.js';
import { EmpresasUI } from './empresas.js';
import { AuditoriaUI } from './auditoria.js';
import { logoutAdmin } from '../services/supabaseAdminService.js';
import { escapeHTML } from '../utils/escapeHTML.js';

const VIEWS = {
  dashboard: { label: 'Painel inicial', icon: 'fa-gauge-high', modulo: DashboardUI },
  empresas: { label: 'Empresas', icon: 'fa-building', modulo: EmpresasUI },
  auditoria: { label: 'Auditoria', icon: 'fa-clock-rotate-left', modulo: AuditoriaUI },
};

export const ShellUI = {
  _viewAtual: 'dashboard',
  _admin: null,

  render(admin) {
    this._admin = admin;
    return `
      <div class="sidebar">
        <div class="brand"><i class="fa-solid fa-shield-halved"></i> Delfos <span class="admin-pill">Admin</span></div>
        <div class="sidebar-nav">
          ${Object.entries(VIEWS).map(([key, v]) => `
            <div class="nav-item ${key === this._viewAtual ? 'active' : ''}" data-view="${key}">
              <i class="fa-solid ${v.icon}"></i> ${v.label}
            </div>`).join('')}
        </div>
        <div class="nav-footer">
          <span class="nav-footer-nome">${escapeHTML(admin.nome)} <span class="nav-footer-cargo">· dono da plataforma</span></span>
          <span class="logout" id="btnLogout">Sair</span>
        </div>
      </div>
      <div class="main" id="mainContent"><div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</div></div>
    `;
  },

  async bind() {
    document.getElementById('btnLogout').onclick = async () => {
      await logoutAdmin();
      location.reload();
    };
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => this._irPara(item.dataset.view));
    });
    await this._renderView();
  },

  async _irPara(viewKey, filtroInicial) {
    this._viewAtual = viewKey;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === viewKey));
    await this._renderView(filtroInicial);
  },

  async _renderView(filtroInicial) {
    const main = document.getElementById('mainContent');
    const view = VIEWS[this._viewAtual];
    main.innerHTML = `<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</div>`;
    try {
      if (this._viewAtual === 'dashboard') {
        await view.modulo.carregar();
        main.innerHTML = await view.modulo.render();
        view.modulo.bind((destino, filtro) => this._irPara(destino, filtro));
      } else if (this._viewAtual === 'empresas') {
        if (filtroInicial?.busca) view.modulo._filtroBusca = filtroInicial.busca;
        await view.modulo.carregar();
        main.innerHTML = view.modulo.render();
        view.modulo.bind((destino, filtro) => this._irPara(destino, filtro));
      } else if (this._viewAtual === 'auditoria') {
        await view.modulo.carregar(filtroInicial);
        main.innerHTML = view.modulo.render();
        view.modulo.bind((destino, filtro) => this._irPara(destino, filtro));
      }
    } catch (e) {
      main.innerHTML = `<div class="empty">Erro ao carregar: ${escapeHTML(e.message)}</div>`;
    }
  },
};
