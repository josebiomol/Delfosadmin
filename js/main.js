import { supabase, getAdminSession, saveAdminSession, clearAdminSession } from './services/supabaseAdminService.js';
import { LoginUI } from './ui/login.js';
import { ShellUI } from './ui/shell.js';

const app = document.getElementById('app');

async function iniciar() {
  // Confirma a sessão real do Supabase (não só o que está no localStorage) —
  // token pode ter expirado.
  const { data: { session } } = await supabase.auth.getSession();
  const adminSalvo = getAdminSession();

  if (session && adminSalvo) {
    mostrarShell(adminSalvo);
  } else {
    clearAdminSession();
    mostrarLogin();
  }
}

function mostrarLogin() {
  app.innerHTML = LoginUI.render();
  LoginUI.bind((admin) => {
    saveAdminSession(admin);
    mostrarShell(admin);
  });
}

function mostrarShell(admin) {
  app.innerHTML = ShellUI.render(admin);
  ShellUI.bind();
}

iniciar();
