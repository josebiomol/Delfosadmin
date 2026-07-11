import { getPlanos, salvarPlano, excluirPlano } from '../services/supabaseAdminService.js';
import { escapeHTML } from '../utils/escapeHTML.js';
import { toast } from '../utils/toast.js';
import { MODULOS } from './modulosLista.js';

export const PlanosUI = {
  _lista: [],

  async carregar() {
    this._lista = (await getPlanos()).filter(p => p.ativo === 'SIM');
  },

  render() {
    return `
      <h2>Planos</h2>
      <p class="sub">Templates de módulos + limite de usuários. Aplique um plano numa empresa na tela Empresas.</p>

      <button id="btnNovoPlano" class="btn btn-primary" style="margin-bottom:16px"><i class="fa-solid fa-plus"></i> Novo plano</button>

      <div id="planosBox">${this._renderLista()}</div>
    `;
  },

  _renderLista() {
    if (!this._lista.length) return `<div class="empty">Nenhum plano cadastrado ainda.</div>`;
    return `<div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th style="width:120px">Limite de usuários</th>
            <th style="width:110px">Preço/mês</th>
            <th style="width:110px">Módulos</th>
            <th style="width:140px"></th>
          </tr>
        </thead>
        <tbody>
          ${this._lista.map(p => `
            <tr>
              <td class="org-name">${escapeHTML(p.nome)}</td>
              <td>${p.limite_usuarios ? p.limite_usuarios : 'Sem limite'}</td>
              <td>${p.preco_mensal ? 'R$ ' + Number(p.preco_mensal).toFixed(2) : '—'}</td>
              <td>${(p.modulos_json || []).length} módulo(s)</td>
              <td>
                <button class="link-btn btn-editar-plano" data-key="${p.plano_key}">Editar</button>
                <button class="restore-link btn-excluir-plano" data-key="${p.plano_key}" style="margin-left:10px">Excluir</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  },

  bind() {
    document.getElementById('btnNovoPlano').onclick = () => this._abrirModal(null);
    this._bindLista();
  },

  _bindLista() {
    document.querySelectorAll('.btn-editar-plano').forEach(btn => {
      btn.onclick = () => this._abrirModal(this._lista.find(p => p.plano_key === btn.dataset.key));
    });
    document.querySelectorAll('.btn-excluir-plano').forEach(btn => {
      btn.onclick = async () => {
        const plano = this._lista.find(p => p.plano_key === btn.dataset.key);
        if (!confirm(`Excluir o plano "${plano.nome}"? Empresas que já usam esse plano não são afetadas, mas ele some da lista pra aplicar em novas.`)) return;
        try {
          await excluirPlano(plano.plano_key);
          toast.show('Plano excluído.', 'success');
          await this.carregar();
          document.getElementById('planosBox').innerHTML = this._renderLista();
          this._bindLista();
        } catch (e) {
          toast.show('Erro ao excluir: ' + e.message, 'error');
        }
      };
    });
  },

  _abrirModal(planoEditando) {
    const isEdit = !!planoEditando;
    const modulosSelecionados = new Set(planoEditando?.modulos_json || []);
    const overlayId = 'modalPlano';
    document.getElementById(overlayId)?.remove();

    const html = `
      <div id="${overlayId}" class="overlay">
        <div class="modal">
          <h3>${isEdit ? 'Editar' : 'Novo'} plano</h3>
          <p class="sub">Defina o pacote de módulos e o limite de usuários desse plano.</p>

          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:6px">Nome do plano</label>
          <input id="fPlanoNome" class="input" style="width:100%;margin-bottom:12px" value="${escapeHTML(planoEditando?.nome || '')}" placeholder="Ex: Essencial">

          <div style="display:flex;gap:10px;margin-bottom:12px">
            <div style="flex:1">
              <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:6px">Limite de usuários</label>
              <input id="fPlanoLimite" class="input" type="number" min="1" style="width:100%" value="${planoEditando?.limite_usuarios ?? ''}" placeholder="Sem limite">
            </div>
            <div style="flex:1">
              <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:6px">Preço mensal (R$)</label>
              <input id="fPlanoPreco" class="input" type="number" min="0" step="0.01" style="width:100%" value="${planoEditando?.preco_mensal ?? ''}" placeholder="Opcional">
            </div>
          </div>

          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:8px">Módulos incluídos</label>
          <div style="max-height:320px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:4px 12px">
            ${MODULOS.map(grupo => `
              <div class="mod-group">
                <div class="mod-group-title">${escapeHTML(grupo.grupo)}</div>
                ${grupo.itens.map(m => `
                  <label class="mod-item">
                    <span>${escapeHTML(m.label)}</span>
                    <label class="switch"><input type="checkbox" class="chk-modulo-plano" value="${m.key}" ${modulosSelecionados.has(m.key) ? 'checked' : ''}><span class="slider"></span></label>
                  </label>`).join('')}
              </div>`).join('')}
          </div>

          <div class="modal-actions">
            <button id="btnCancelarPlano" class="btn">Cancelar</button>
            <button id="btnSalvarPlano" class="btn btn-primary">Salvar plano</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById(overlayId);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('btnCancelarPlano').onclick = () => overlay.remove();

    document.getElementById('btnSalvarPlano').onclick = async () => {
      const nome = document.getElementById('fPlanoNome').value.trim();
      if (!nome) { toast.show('Dá um nome pro plano.', 'error'); return; }
      const limiteRaw = document.getElementById('fPlanoLimite').value;
      const precoRaw = document.getElementById('fPlanoPreco').value;
      const modulos_json = Array.from(document.querySelectorAll('.chk-modulo-plano:checked')).map(c => c.value);

      const btn = document.getElementById('btnSalvarPlano');
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      try {
        await salvarPlano({
          plano_key: planoEditando?.plano_key,
          nome,
          limite_usuarios: limiteRaw ? parseInt(limiteRaw) : null,
          preco_mensal: precoRaw ? parseFloat(precoRaw) : null,
          modulos_json,
        });
        toast.show('Plano salvo.', 'success');
        overlay.remove();
        await this.carregar();
        document.getElementById('planosBox').innerHTML = this._renderLista();
        this._bindLista();
      } catch (e) {
        toast.show('Erro ao salvar: ' + e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Salvar plano';
      }
    };
  },
};
