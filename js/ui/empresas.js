import {
  getOrganizacoes, atualizarStatusOrganizacao,
  getModulosDaEmpresa, salvarModulosDaEmpresa,
  getPlanos, aplicarPlanoNaEmpresa,
  getSegmentos, aplicarSegmentoNaEmpresa,
  getAcessoSuporte, gerarOuRedefinirAcessoSuporte,
} from '../services/supabaseAdminService.js';
import { escapeHTML } from '../utils/escapeHTML.js';
import { toast } from '../utils/toast.js';
import { MODULOS } from './modulosLista.js';

export const EmpresasUI = {
  _lista: [],
  _planos: [],
  _segmentos: [],
  _filtroBusca: '',
  _filtroStatus: '',

  async carregar() {
    const [lista, planos, segmentos] = await Promise.all([
      getOrganizacoes({ busca: this._filtroBusca, status: this._filtroStatus }),
      getPlanos(),
      getSegmentos(),
    ]);
    this._lista = lista;
    this._planos = planos.filter(p => p.ativo === 'SIM');
    this._segmentos = segmentos.filter(s => s.ativo === 'SIM');
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
            <th>Segmento</th>
            <th>Usuários</th>
            <th>Status</th>
            <th style="width:110px">Ativo</th>
            <th style="width:150px">Módulos</th>
            <th style="width:120px">Suporte</th>
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
              <td>
                <select class="select sel-segmento" data-org="${o.org_id}" style="font-size:11.5px;padding:5px 8px">
                  <option value="">— nenhum —</option>
                  ${this._segmentos.map(s => `<option value="${s.segmento_key}" ${s.segmento_key === o.segmento ? 'selected' : ''}>${escapeHTML(s.nome)}</option>`).join('')}
                </select>
                <button class="link-btn btn-aplicar-segmento" data-org="${o.org_id}" style="display:block;margin-top:4px;font-size:10.5px">Aplicar sub-telas</button>
              </td>
              <td>${o.total_usuarios}</td>
              <td>${this._badgeStatus(o)}</td>
              <td><label class="switch"><input type="checkbox" class="chk-status" data-org="${o.org_id}" ${o.status !== 'suspenso' ? 'checked' : ''}><span class="slider"></span></label></td>
              <td><button class="link-btn btn-modulos" data-org="${o.org_id}" data-nome="${escapeHTML(o.nome_fantasia || o.nome_org)}"><i class="fa-solid fa-list-check"></i> Ver módulos</button></td>
              <td><button class="link-btn btn-suporte" data-org="${o.org_id}" data-nome="${escapeHTML(o.nome_fantasia || o.nome_org)}"><i class="fa-solid fa-user-shield"></i> Acesso</button></td>
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
    document.querySelectorAll('.btn-suporte').forEach(btn => {
      btn.onclick = () => this._abrirModalSuporte(btn.dataset.org, btn.dataset.nome);
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
    document.querySelectorAll('.btn-aplicar-segmento').forEach(btn => {
      btn.onclick = async () => {
        const org_id = btn.dataset.org;
        const select = document.querySelector(`.sel-segmento[data-org="${org_id}"]`);
        const segmento_key = select.value;
        if (!segmento_key) { toast.show('Escolha um segmento primeiro.', 'error'); return; }
        const segmento = this._segmentos.find(s => s.segmento_key === segmento_key);
        if (!confirm(`Aplicar o segmento "${segmento.nome}"? Isso ajusta as sub-telas de Configurações dessa empresa pro padrão desse segmento.`)) return;
        try {
          await aplicarSegmentoNaEmpresa(org_id, segmento_key);
          const org = this._lista.find(o => o.org_id === org_id);
          org.segmento = segmento_key;
          toast.show(`Segmento "${segmento.nome}" aplicado.`, 'success');
        } catch (e) {
          toast.show('Erro ao aplicar segmento: ' + e.message, 'error');
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

  // Conta oculta de suporte por empresa — 3 estados: sem acesso ainda,
  // já existe (oferece redefinir), e "senha visível só agora" depois de
  // gerar/redefinir. A senha nunca fica salva em nenhum lugar em texto
  // puro — só aparece nessa tela, uma vez, logo após ser gerada.
  async _abrirModalSuporte(org_id, nomeEmpresa) {
    const overlayId = 'modalSuporteEmpresa';
    document.getElementById(overlayId)?.remove();
    const html = `
      <div id="${overlayId}" class="overlay">
        <div class="modal">
          <h3>Acesso de suporte — ${escapeHTML(nomeEmpresa)}</h3>
          <p class="sub">Conta oculta pra entrar como se fosse essa empresa. Não aparece na lista de Usuários do cliente.</p>
          <div id="suporteBody"><div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</div></div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById(overlayId);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const gerar = async () => {
      document.getElementById('suporteBody').innerHTML = `<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Gerando...</div>`;
      try {
        const r = await gerarOuRedefinirAcessoSuporte(org_id);
        document.getElementById('suporteBody').innerHTML = `
          <div class="empty" style="border:1px solid #f59e0b;text-align:left;padding:14px">
            <strong style="color:#f59e0b">⚠️ Senha visível só agora — copie antes de fechar</strong>
            <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:13px">
              <span>Login</span><code>${escapeHTML(r.login)}</code>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:13px">
              <span>Senha</span>
              <span style="display:flex;align-items:center;gap:8px">
                <code id="senhaSuporteGerada">${escapeHTML(r.senha)}</code>
                <button class="link-btn" id="btnCopiarSenhaSuporte">Copiar</button>
              </span>
            </div>
          </div>
          <div class="modal-actions"><button class="btn btn-primary" id="btnFecharSuporteFinal">Fechar</button></div>`;
        document.getElementById('btnCopiarSenhaSuporte').onclick = () => {
          navigator.clipboard.writeText(r.senha);
          toast.show('Senha copiada.', 'success');
        };
        document.getElementById('btnFecharSuporteFinal').onclick = () => overlay.remove();
        toast.show(r.criadoAgora ? 'Acesso de suporte gerado.' : 'Senha redefinida.', 'success');
      } catch (e) {
        toast.show('Erro: ' + e.message, 'error');
        renderEstadoInicial();
      }
    };

    const renderEstadoInicial = async () => {
      let existente;
      try {
        existente = await getAcessoSuporte(org_id);
      } catch (e) {
        document.getElementById('suporteBody').innerHTML = `
          <p class="sub" style="color:var(--danger)">Erro ao consultar: ${escapeHTML(e.message)}</p>
          <div class="modal-actions"><button class="btn" id="btnFecharSuporte">Fechar</button></div>`;
        document.getElementById('btnFecharSuporte').onclick = () => overlay.remove();
        return;
      }

      if (!existente) {
        document.getElementById('suporteBody').innerHTML = `
          <div class="empty" style="margin-bottom:16px">Essa empresa ainda não tem acesso de suporte.</div>
          <div class="modal-actions">
            <button class="btn" id="btnCancelarSuporte">Cancelar</button>
            <button class="btn btn-primary" id="btnGerarSuporte">Gerar acesso de suporte</button>
          </div>`;
        document.getElementById('btnCancelarSuporte').onclick = () => overlay.remove();
        document.getElementById('btnGerarSuporte').onclick = gerar;
      } else {
        const criadoEm = this._formatarDataBR(existente.criado_em);
        document.getElementById('suporteBody').innerHTML = `
          <div class="empty" style="margin-bottom:16px">Já existe acesso de suporte pra essa empresa (login <code>${escapeHTML(existente.Login)}</code>). Criado em ${criadoEm}.</div>
          <div class="modal-actions">
            <button class="btn" id="btnCancelarSuporte">Fechar</button>
            <button class="btn btn-primary" id="btnRedefinirSuporte">Redefinir senha</button>
          </div>`;
        document.getElementById('btnCancelarSuporte').onclick = () => overlay.remove();
        document.getElementById('btnRedefinirSuporte').onclick = gerar;
      }
    };

    renderEstadoInicial();
  },
};