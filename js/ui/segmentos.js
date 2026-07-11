import { getSegmentos, salvarSegmento, excluirSegmento, getSubtelas, salvarSubtela, excluirSubtela } from '../services/supabaseAdminService.js';
import { escapeHTML } from '../utils/escapeHTML.js';
import { toast } from '../utils/toast.js';

export const SegmentosUI = {
  _lista: [],
  _subtelas: [],

  async carregar() {
    const [segmentos, subtelas] = await Promise.all([getSegmentos(), getSubtelas()]);
    this._lista = segmentos;
    this._subtelas = subtelas;
  },

  render() {
    return `
      <h2>Segmentos de negócio</h2>
      <p class="sub">Define quais sub-telas de Configurações (Hospitais, Médicos, etc.) cada tipo de negócio precisa ver. A empresa escolhe o segmento no cadastro; só o admin pode corrigir depois.</p>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
        <button id="btnNovoSegmento" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Novo segmento</button>
        <button id="btnGerenciarSubtelas" class="btn"><i class="fa-solid fa-table-list"></i> Gerenciar sub-telas disponíveis</button>
      </div>

      <div id="segmentosBox">${this._renderLista()}</div>
    `;
  },

  _renderLista() {
    if (!this._lista.length) return `<div class="empty">Nenhum segmento cadastrado ainda.</div>`;
    return `<div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Sub-telas ligadas</th>
            <th style="width:140px"></th>
          </tr>
        </thead>
        <tbody>
          ${this._lista.map(s => {
            const labels = (s.subtelas_json || []).map(key => this._subtelas.find(t => t.subtela_key === key)?.label || key);
            return `
            <tr>
              <td class="org-name">${escapeHTML(s.nome)}</td>
              <td style="color:var(--muted);font-size:12px">${labels.length ? escapeHTML(labels.join(', ')) : '— nenhuma —'}</td>
              <td>
                <button class="link-btn btn-editar-segmento" data-key="${s.segmento_key}">Editar</button>
                <button class="restore-link btn-excluir-segmento" data-key="${s.segmento_key}" style="margin-left:10px">Excluir</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  },

  bind() {
    document.getElementById('btnNovoSegmento').onclick = () => this._abrirModalSegmento(null);
    document.getElementById('btnGerenciarSubtelas').onclick = () => this._abrirModalSubtelas();
    this._bindLista();
  },

  _bindLista() {
    document.querySelectorAll('.btn-editar-segmento').forEach(btn => {
      btn.onclick = () => this._abrirModalSegmento(this._lista.find(s => s.segmento_key === btn.dataset.key));
    });
    document.querySelectorAll('.btn-excluir-segmento').forEach(btn => {
      btn.onclick = async () => {
        const segmento = this._lista.find(s => s.segmento_key === btn.dataset.key);
        if (!confirm(`Excluir o segmento "${segmento.nome}"? Empresas que já usam esse segmento não são afetadas.`)) return;
        try {
          await excluirSegmento(segmento.segmento_key);
          toast.show('Segmento excluído.', 'success');
          await this._recarregarLista();
        } catch (e) {
          toast.show('Erro ao excluir: ' + e.message, 'error');
        }
      };
    });
  },

  async _recarregarLista() {
    await this.carregar();
    document.getElementById('segmentosBox').innerHTML = this._renderLista();
    this._bindLista();
  },

  _abrirModalSegmento(segmentoEditando) {
    const isEdit = !!segmentoEditando;
    const subtelasSelecionadas = new Set(segmentoEditando?.subtelas_json || []);
    const overlayId = 'modalSegmento';
    document.getElementById(overlayId)?.remove();

    const html = `
      <div id="${overlayId}" class="overlay">
        <div class="modal">
          <h3>${isEdit ? 'Editar' : 'Novo'} segmento</h3>
          <p class="sub">Ex: Hospital, Laboratório/Clínica, Administrativo/Comercial...</p>

          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:6px">Nome do segmento</label>
          <input id="fSegmentoNome" class="input" style="width:100%;margin-bottom:16px" value="${escapeHTML(segmentoEditando?.nome || '')}" placeholder="Ex: Hospital">

          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:8px">Sub-telas de Configurações ligadas a esse segmento</label>
          <div style="border:1px solid var(--line);border-radius:8px;padding:4px 12px;max-height:280px;overflow-y:auto">
            ${this._subtelas.length ? this._subtelas.map(t => `
              <label class="mod-item">
                <span>${escapeHTML(t.label)}</span>
                <label class="switch"><input type="checkbox" class="chk-subtela-segmento" value="${t.subtela_key}" ${subtelasSelecionadas.has(t.subtela_key) ? 'checked' : ''}><span class="slider"></span></label>
              </label>`).join('') : `<p style="color:var(--muted);font-size:12.5px;margin:10px 0">Nenhuma sub-tela cadastrada ainda — usa "Gerenciar sub-telas disponíveis" primeiro.</p>`}
          </div>

          <div class="modal-actions">
            <button id="btnCancelarSegmento" class="btn">Cancelar</button>
            <button id="btnSalvarSegmento" class="btn btn-primary">Salvar segmento</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById(overlayId);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('btnCancelarSegmento').onclick = () => overlay.remove();

    document.getElementById('btnSalvarSegmento').onclick = async () => {
      const nome = document.getElementById('fSegmentoNome').value.trim();
      if (!nome) { toast.show('Dá um nome pro segmento.', 'error'); return; }
      const subtelas_json = Array.from(document.querySelectorAll('.chk-subtela-segmento:checked')).map(c => c.value);

      const btn = document.getElementById('btnSalvarSegmento');
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      try {
        await salvarSegmento({ segmento_key: segmentoEditando?.segmento_key, nome, subtelas_json });
        toast.show('Segmento salvo.', 'success');
        overlay.remove();
        await this._recarregarLista();
      } catch (e) {
        toast.show('Erro ao salvar: ' + e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Salvar segmento';
      }
    };
  },

  _abrirModalSubtelas() {
    const overlayId = 'modalSubtelas';
    document.getElementById(overlayId)?.remove();

    const renderListaSubtelas = () => this._subtelas.map(t => `
      <div class="mod-item">
        <span><span class="code" style="margin-right:8px">${escapeHTML(t.subtela_key)}</span>${escapeHTML(t.label)}</span>
        <button class="restore-link btn-excluir-subtela" data-key="${t.subtela_key}">Excluir</button>
      </div>`).join('') || `<p style="color:var(--muted);font-size:12.5px">Nenhuma sub-tela cadastrada ainda.</p>`;

    const html = `
      <div id="${overlayId}" class="overlay">
        <div class="modal">
          <h3>Sub-telas de Configurações disponíveis</h3>
          <p class="sub">Essa é a lista completa de sub-telas que podem ser ligadas a um segmento. Cadastre aqui toda vez que o sistema ganhar uma tela nova em Configurações que faça sentido restringir por tipo de negócio.</p>

          <div style="display:flex;gap:8px;margin-bottom:16px">
            <input id="fNovaSubtelaLabel" class="input" style="flex:1" placeholder="Nome da nova sub-tela (ex: Fornecedores)">
            <button id="btnAddSubtela" class="btn btn-primary">Adicionar</button>
          </div>

          <div id="listaSubtelasModal" style="border-top:1px solid var(--line)">${renderListaSubtelas()}</div>

          <div class="modal-actions">
            <button id="btnFecharSubtelas" class="btn">Fechar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById(overlayId);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('btnFecharSubtelas').onclick = () => overlay.remove();

    const bindExcluir = () => {
      document.querySelectorAll('.btn-excluir-subtela').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('Excluir essa sub-tela? Ela sai de todos os segmentos que a usavam.')) return;
          try {
            await excluirSubtela(btn.dataset.key);
            this._subtelas = await getSubtelas();
            document.getElementById('listaSubtelasModal').innerHTML = renderListaSubtelas();
            bindExcluir();
            toast.show('Sub-tela excluída.', 'success');
          } catch (e) {
            toast.show('Erro ao excluir: ' + e.message, 'error');
          }
        };
      });
    };
    bindExcluir();

    document.getElementById('btnAddSubtela').onclick = async () => {
      const label = document.getElementById('fNovaSubtelaLabel').value.trim();
      if (!label) { toast.show('Digita o nome da sub-tela.', 'error'); return; }
      try {
        await salvarSubtela({ label });
        this._subtelas = await getSubtelas();
        document.getElementById('listaSubtelasModal').innerHTML = renderListaSubtelas();
        bindExcluir();
        document.getElementById('fNovaSubtelaLabel').value = '';
        toast.show('Sub-tela adicionada.', 'success');
      } catch (e) {
        toast.show('Erro ao adicionar: ' + e.message, 'error');
      }
    };
  },
};
