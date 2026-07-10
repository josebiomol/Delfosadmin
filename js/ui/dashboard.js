import { getDashboardStats, getAtividadeRecente } from '../services/supabaseAdminService.js';
import { escapeHTML } from '../utils/escapeHTML.js';

const CORES_ACAO = { criar: 'var(--green)', editar: 'var(--blue)', excluir: 'var(--danger)', reativar: 'var(--warn)' };

function tempoRelativo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

export const DashboardUI = {
  _dados: null,

  async render() {
    if (!this._dados) return `<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</div>`;
    const { stats, atividade } = this._dados;

    return `
      <h2>Painel inicial</h2>
      <p class="sub">Visão geral de todas as empresas cadastradas na plataforma.</p>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(56,189,248,.12);color:var(--blue)"><i class="fa-solid fa-building"></i></div>
          <div><div class="stat-label">Empresas cadastradas</div><div class="stat-value">${stats.total}</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(34,197,94,.12);color:var(--green)"><i class="fa-solid fa-circle-check"></i></div>
          <div><div class="stat-label">Ativas</div><div class="stat-value" style="color:var(--green)">${stats.ativas}</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(239,68,68,.12);color:var(--danger)"><i class="fa-solid fa-circle-exclamation"></i></div>
          <div><div class="stat-label">Suspensas</div><div class="stat-value" style="color:var(--danger)">${stats.suspensas}</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(217,119,6,.12);color:var(--warn)"><i class="fa-solid fa-hourglass-half"></i></div>
          <div><div class="stat-label">Em trial</div><div class="stat-value" style="color:var(--warn)">${stats.trial}</div></div>
        </div>
      </div>

      <div class="dash-2col">
        <div class="card">
          <h3><i class="fa-solid fa-triangle-exclamation" style="color:var(--warn);margin-right:6px"></i>Precisa de atenção</h3>
          ${stats.trialExpirando.length ? stats.trialExpirando.map(o => `
            <div class="attn-row">
              <span>${escapeHTML(o.nome_fantasia || o.nome_org)} — trial expira em ${Math.max(0, Math.ceil((new Date(o.trial_expira_em) - Date.now()) / 86400000))} dia(s)</span>
              <button class="link-btn" data-goto-empresas="${o.org_id}">Ver empresa →</button>
            </div>`).join('') : `<p style="color:var(--muted);font-size:12.5px;margin:0">Nada precisando de atenção agora.</p>`}
        </div>

        <div class="card">
          <h3><i class="fa-solid fa-bolt" style="color:var(--blue);margin-right:6px"></i>Atividade recente</h3>
          ${atividade.length ? atividade.map(a => `
            <div class="activity-row">
              <div class="activity-dot" style="background:${CORES_ACAO[a.acao] || 'var(--muted)'}"></div>
              <div>${escapeHTML(a.descricao)}<br><span style="color:var(--muted)">${tempoRelativo(a.criado_em)}</span></div>
            </div>`).join('') : `<p style="color:var(--muted);font-size:12.5px;margin:0">Sem atividade registrada ainda.</p>`}
          <button class="see-all" id="btnVerTudoAuditoria">Ver todo o histórico →</button>
        </div>
      </div>
    `;
  },

  async carregar() {
    const [stats, atividade] = await Promise.all([getDashboardStats(), getAtividadeRecente()]);
    this._dados = { stats, atividade };
  },

  bind(onIrPara) {
    document.getElementById('btnVerTudoAuditoria')?.addEventListener('click', () => onIrPara('auditoria'));
    document.querySelectorAll('[data-goto-empresas]').forEach(btn => {
      btn.addEventListener('click', () => onIrPara('empresas', { busca: btn.dataset.gotoEmpresas }));
    });
  },
};
