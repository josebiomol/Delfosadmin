import { loginAdmin } from '../services/supabaseAdminService.js';
import { toast } from '../utils/toast.js';

export const LoginUI = {
  render() {
    return `
      <div class="login-wrap">
        <div class="login-card">
          <h1><i class="fa-solid fa-shield-halved"></i> Delfos Admin</h1>
          <p class="sub">Acesso restrito — painel de gestão da plataforma.</p>
          <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:6px">Email</label>
          <input id="fLoginEmail" class="input" style="width:100%;margin-bottom:12px" type="email" placeholder="seu@email.com">
          <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:6px">Senha</label>
          <input id="fLoginSenha" class="input" style="width:100%;margin-bottom:18px" type="password" placeholder="••••••••">
          <button id="btnLogin" class="btn btn-primary btn-block">Entrar</button>
        </div>
      </div>`;
  },

  bind(onSuccess) {
    const fazerLogin = async () => {
      const email = document.getElementById('fLoginEmail').value.trim();
      const senha = document.getElementById('fLoginSenha').value;
      if (!email || !senha) { toast.show('Preencha email e senha.', 'error'); return; }
      const btn = document.getElementById('btnLogin');
      btn.disabled = true; btn.textContent = 'Entrando...';
      const r = await loginAdmin(email, senha);
      if (!r.success) {
        toast.show(r.error, 'error');
        btn.disabled = false; btn.textContent = 'Entrar';
        return;
      }
      onSuccess(r.admin);
    };
    document.getElementById('btnLogin').onclick = fazerLogin;
    document.getElementById('fLoginSenha').addEventListener('keydown', (e) => { if (e.key === 'Enter') fazerLogin(); });
  },
};
