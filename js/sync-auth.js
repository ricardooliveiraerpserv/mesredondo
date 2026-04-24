// ══════════════════════════════════════════════════════
// sync-auth.js v3 — Auth + Sync via tabelas Supabase
// Depende de: db.js, state-v3.js
// ══════════════════════════════════════════════════════

// ── Constantes do projeto ────────────────────────────
const SB_URL = 'https://whupwjgvfuvuwmdvenak.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodXB3amd2ZnV2dXdtZHZlbmFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTIyNTMsImV4cCI6MjA4OTc4ODI1M30.z3lwBtV8iHoiJyfeXm3rsKkzuJHpCv1QXS8yr3uQn3g';

// ── Supabase client ──────────────────────────────────
const { createClient } = supabase;
const _sbClient = createClient(SB_URL, SB_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'mf_auth_session'
  }
});

// ── Token em memória — evita getSession() lento ──────
window._cachedAccessToken = null;
window._cachedTokenExp = 0;

function _setToken(t) {
  window._cachedAccessToken = t || null;
  if (t) {
    try {
      var exp = JSON.parse(atob(t.split('.')[1])).exp;
      window._cachedTokenExp = exp || 0;
    } catch(e) { window._cachedTokenExp = 0; }
  } else {
    window._cachedTokenExp = 0;
  }
}

function _tokenValid() {
  return !!(window._cachedAccessToken && window._cachedTokenExp > Date.now() / 1000 + 60);
}

async function _getValidToken() {
  if (_tokenValid()) return window._cachedAccessToken;
  try {
    const tout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
    const result = await Promise.race([_sbClient.auth.getSession(), tout]);
    const token = result?.data?.session?.access_token;
    if (token) { _setToken(token); return token; }
  } catch(e) { console.warn('[getValidToken] getSession falhou:', e.message); }
  try {
    const { data: rd } = await _sbClient.auth.refreshSession();
    const token = rd?.session?.access_token;
    if (token) { _setToken(token); return token; }
  } catch(e) { console.warn('[getValidToken] refresh falhou:', e.message); }
  return null;
}

// ── UI helpers ───────────────────────────────────────
function _sbSetStatus(msg, color) {
  const retryBtn = document.getElementById('sb-retry-btn');
  if (retryBtn) {
    const isError = msg.includes('⚠️') || msg.includes('❌') || msg.includes('Timeout') || msg.includes('Offline') || msg.includes('inválida') || msg.includes('expirada');
    const hasUser = window._currentUser || (typeof _currentUser !== 'undefined' && _currentUser);
    retryBtn.style.display = (isError && hasUser) ? 'block' : 'none';
  }
  const el = document.getElementById('sb-status');
  if (el) { el.innerHTML = msg; el.style.color = color || 'var(--muted)'; }
}

function _sbShowButtons(on) {
  ['sb-save-btn','sb-load-btn','sb-reset-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = on ? 'flex' : 'none';
  });
}

function _sbShowSyncToast(msg, color) {
  const ind = document.getElementById('sync-indicator');
  if (ind) { ind.textContent = msg; ind.title = msg; }
  const mob = document.getElementById('mobile-refresh-btn');
  if (mob && !mob.disabled) {
    mob.innerHTML = msg;
    if (msg === '☁️') setTimeout(() => { if (!mob.disabled) mob.innerHTML = '🔄'; }, 2500);
    if (msg === '⚠️') setTimeout(() => { if (!mob.disabled) mob.innerHTML = '🔄'; }, 3000);
  }
  const el = document.getElementById('sb-status');
  if (el) {
    el.style.background = color + '18';
    el.style.border = '1px solid ' + color + '55';
    el.style.color = color;
    el.textContent = msg === '☁️' ? '✅ Sincronizado às ' + new Date().toLocaleTimeString('pt-BR')
                   : msg === '⚠️' ? '❌ Erro ao sincronizar'
                   : '🔄 Sincronizando...';
  }
}

// ── Auto-sync com debounce ───────────────────────────
var _sbAutoSyncTimer = null;
var _sbSaveQueue = Promise.resolve();

function _sbAutoSync() {
  if (_sbAutoSyncTimer) clearTimeout(_sbAutoSyncTimer);
  _sbAutoSyncTimer = setTimeout(function() {
    _sbAutoSyncTimer = null;
    _sbSaveImmediate();
  }, 1000);
}

function _sbSaveImmediate() {
  if (!window._currentUser && !_currentUser) return;
  _sbShowSyncToast('🔄', '#f59e0b');
  _sbSaveQueue = _sbSaveQueue.then(async () => {
    try {
      // Flush pendências offline acumuladas
      await _flushPending();
      _sbShowSyncToast('☁️', '#4ade80');
      const now = new Date().toLocaleTimeString('pt-BR');
      _sbSetStatus('✅ Sincronizado às ' + now, '#4ade80');
    } catch(e) {
      _sbShowSyncToast('⚠️', '#f87171');
      console.error('[_sbSaveImmediate]', e.message);
    }
  }).catch(() => {});
}

// sbSave — mantido como alias público para compatibilidade com botões existentes no HTML
window.sbSave = async function() {
  try {
    await _flushPending();
    const now = new Date().toLocaleTimeString('pt-BR');
    _sbSetStatus('✅ Salvo às ' + now, '#4ade80');
  } catch(e) {
    _sbSetStatus('❌ Erro: ' + e.message, '#f87171');
  }
};

// sbLoad — recarrega todos os dados do banco para a memória e re-renderiza
window.sbLoad = async function() {
  if (!confirm('Recarregar todos os dados do servidor?')) return;
  _clearMemCache();
  try {
    if (typeof window._loadAllData === 'function') await window._loadAllData();
    renderAll();
    try { renderTerceirosTab(); renderParceladosTab(); renderVencimentosTab(); renderCartoesTab(); } catch(e) {}
    _sbSetStatus('✅ Dados recarregados!', '#4ade80');
  } catch(e) {
    _sbSetStatus('❌ Erro ao recarregar: ' + e.message, '#f87171');
  }
};

// ── Refresh mobile — recarrega do banco ─────────────
async function _mobileRefresh(btn) {
  if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
  let angle = 0;
  const interval = setInterval(() => {
    angle = (angle + 45) % 360;
    if (btn) btn.style.transform = `rotate(${angle}deg)`;
  }, 80);

  const _done = (icon, delay) => {
    clearInterval(interval);
    if (!btn) return;
    btn.style.transform = '';
    btn.innerHTML = icon;
    setTimeout(() => { btn.innerHTML = '🔄'; btn.disabled = false; btn.style.opacity = ''; }, delay);
  };

  const safetyTimeout = setTimeout(() => _done('⚠️', 0), 10000);

  try {
    if (!_currentUser) {
      renderAll();
      try { renderTerceirosTab(); renderParceladosTab(); renderVencimentosTab(); renderCartoesTab(); } catch(e) {}
      clearTimeout(safetyTimeout); _done('✅', 1000); return;
    }

    // Verifica sessão
    const { data, error } = await _sbClient.auth.getSession();
    if (error || !data.session) {
      const { data: rd } = await _sbClient.auth.refreshSession();
      if (!rd?.session) { clearTimeout(safetyTimeout); _done('⚠️', 2000); return; }
      _setToken(rd.session.access_token);
    } else {
      _setToken(data.session.access_token);
    }

    // Flush de pendências offline primeiro
    await _flushPending();

    // Limpa cache e recarrega tudo do banco
    _sbSetStatus('⬇️ Atualizando dados...', '#60a5fa');
    _clearMemCache();
    if (typeof window._loadAllData === 'function') await window._loadAllData();

    renderAll();
    try { renderTerceirosTab(); renderParceladosTab(); renderVencimentosTab(); renderCartoesTab(); } catch(e) {}
    _sbSetStatus('✅ Dados atualizados', '#4ade80');
    clearTimeout(safetyTimeout); _done('✅', 1200);

  } catch(e) {
    clearTimeout(safetyTimeout); _done('⚠️', 1800);
    console.error('[_mobileRefresh] erro:', e.message);
    _sbSetStatus('⚠️ Erro: ' + e.message, '#f87171');
  }
}

// ── Tela de login ────────────────────────────────────
function _showAuthScreen(show) {
  const s = document.getElementById('auth-screen');
  const h = document.querySelector('header');
  const m = document.querySelector('main');
  const sb = document.getElementById('sb-bar');
  if (show) {
    s.style.display = 'flex';
    if (h) h.style.display = 'none';
    if (m) m.style.display = 'none';
    if (sb) sb.style.display = 'none';
  } else {
    s.style.display = 'none';
    if (h) h.style.display = '';
    if (m) m.style.display = '';
    if (sb) sb.style.display = '';
  }
}

// ── Tela de redefinição de senha ─────────────────────
function _showResetPasswordScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  const rs = document.getElementById('reset-password-screen');
  rs.style.display = 'flex';
  document.getElementById('reset-password').value  = '';
  document.getElementById('reset-password2').value = '';
  document.getElementById('reset-msg').style.display = 'none';
}

async function authConfirmReset() {
  const pass  = document.getElementById('reset-password').value;
  const pass2 = document.getElementById('reset-password2').value;
  const msgEl = document.getElementById('reset-msg');
  const showMsg = (txt, ok) => {
    msgEl.style.display = 'block';
    msgEl.style.background = ok ? 'rgba(240,192,64,0.10)' : 'rgba(240,80,96,0.12)';
    msgEl.style.border = ok ? '1px solid rgba(240,192,64,0.30)' : '1px solid rgba(240,80,96,0.3)';
    msgEl.style.color = ok ? '#4af0a0' : '#f05060';
    msgEl.textContent = txt;
  };
  if (!pass)           { showMsg('⚠️ Digite a nova senha.', false); return; }
  if (pass.length < 6) { showMsg('⚠️ Senha precisa ter ao menos 6 caracteres.', false); return; }
  if (pass !== pass2)  { showMsg('⚠️ As senhas não coincidem.', false); return; }
  msgEl.style.display = 'block';
  msgEl.style.background = 'rgba(255,255,255,0.05)';
  msgEl.style.border = '1px solid #1e2330';
  msgEl.style.color = '#8890a8';
  msgEl.textContent = '🔄 Salvando...';
  const { error } = await _sbClient.auth.updateUser({ password: pass });
  if (error) {
    showMsg('❌ ' + error.message, false);
  } else {
    showMsg('✅ Senha alterada! Redirecionando...', true);
    setTimeout(async () => {
      document.getElementById('reset-password-screen').style.display = 'none';
      await _sbClient.auth.signOut();
      _showAuthScreen(true);
    }, 2000);
  }
}

// ── Esqueci a senha ──────────────────────────────────
function showForgotPassword() {
  document.getElementById('auth-login-form').style.display = 'none';
  document.getElementById('auth-forgot-form').style.display = 'block';
  const el = document.getElementById('forgot-msg');
  el.style.display = 'none';
  const emailVal = document.getElementById('auth-email').value;
  if (emailVal) document.getElementById('forgot-email').value = emailVal;
}

function showLoginForm() {
  document.getElementById('auth-forgot-form').style.display = 'none';
  document.getElementById('auth-login-form').style.display = 'block';
}

async function authSendReset() {
  const email = document.getElementById('forgot-email').value.trim();
  const msgEl = document.getElementById('forgot-msg');
  if (!email) {
    msgEl.style.display = 'block';
    msgEl.style.background = 'rgba(240,80,96,0.12)';
    msgEl.style.border = '1px solid rgba(240,80,96,0.3)';
    msgEl.style.color = '#f05060';
    msgEl.textContent = '⚠️ Digite seu e-mail.';
    return;
  }
  msgEl.style.display = 'block';
  msgEl.style.background = 'rgba(255,255,255,0.05)';
  msgEl.style.border = '1px solid #1e2330';
  msgEl.style.color = '#8890a8';
  msgEl.textContent = '🔄 Enviando...';
  const { error } = await _sbClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) {
    msgEl.style.background = 'rgba(240,80,96,0.12)';
    msgEl.style.border = '1px solid rgba(240,80,96,0.3)';
    msgEl.style.color = '#f05060';
    msgEl.textContent = '❌ ' + error.message;
  } else {
    msgEl.style.background = 'rgba(240,192,64,0.10)';
    msgEl.style.border = '1px solid rgba(240,192,64,0.30)';
    msgEl.style.color = '#30d080';
    msgEl.textContent = '✅ Link enviado! Verifique seu e-mail.';
  }
}

// ── Login ────────────────────────────────────────────
async function authDoLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  const loadEl= document.getElementById('auth-loading');
  errEl.style.display = 'none';
  loadEl.style.display = 'block';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(SB_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const json = await res.json();
    if (!res.ok) {
      loadEl.style.display = 'none';
      const msg = json.error_description || json.msg || json.message || 'Erro ao entrar.';
      errEl.textContent = (msg.includes('Invalid') || msg.includes('invalid')) ? 'E-mail ou senha incorretos.' : msg;
      errEl.style.display = 'block';
      return;
    }
    const userData = json.user || {};
    userData.access_token  = json.access_token;
    userData.refresh_token = json.refresh_token;
    _sbClient.auth.setSession({ access_token: json.access_token, refresh_token: json.refresh_token })
      .catch(e => console.warn('setSession bg:', e));
    loadEl.style.display = 'none';
    await _onLogin(userData, json.access_token);
  } catch(e) {
    loadEl.style.display = 'none';
    errEl.textContent = e.name === 'AbortError' ? 'Sem resposta do servidor. Tente novamente.' : (e.message || 'Erro de conexão.');
    errEl.style.display = 'block';
  }
}

// ── Logout ───────────────────────────────────────────
async function authLogout() {
  if (!confirm('Deseja sair da sua conta?')) return;
  await _flushPending(); // envia pendências antes de sair
  await _sbClient.auth.signOut();
  _currentUser = null;
  _isAdmin = false;
  _clearMemCache();
  _setToken(null);
  // Limpa apenas chaves de UI/sessão — dados financeiros ficam no banco
  ['sb_last_save', 'sb_local_dirty', 'mf_auth_session'].forEach(k => localStorage.removeItem(k));
  const _dadosSec = document.getElementById('dados-admin-section');
  if (_dadosSec) _dadosSec.style.display = 'none';
  const _toolsSec = document.getElementById('dados-tools-admin');
  if (_toolsSec) _toolsSec.style.display = 'none';
  _showAuthScreen(true);
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
}

// ── _onLogin — executado após autenticação bem-sucedida ──
async function _onLogin(user, sessionToken) {
  _currentUser = user;
  window._currentUser = user;
  _setToken(sessionToken || user.access_token || null);

  const meta = user.user_metadata || user.app_metadata || {};
  _isAdmin = meta.role === 'admin';

  console.log('[Auth] _isAdmin:', _isAdmin, '| uid:', user.id);

  // Verifica se usuário está desativado (tabela mf_usuarios)
  if (!_isAdmin) {
    try {
      const chkRes = await fetch(SB_URL + '/rest/v1/mf_usuarios?id=eq.' + user.id + '&select=ativo', {
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + (window._cachedAccessToken || '') }
      });
      if (chkRes.ok) {
        const rows = await chkRes.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].ativo === false) {
          await _sbClient.auth.signOut();
          _currentUser = null;
          _showAuthScreen(true);
          const errEl = document.getElementById('auth-error');
          if (errEl) { errEl.textContent = '⛔ Conta desativada. Entre em contato com o administrador.'; errEl.style.display = 'block'; }
          return;
        }
      }
    } catch(e) { /* silencioso */ }
  }

  // Garante que o usuário existe na tabela mf_usuarios
  _upsertUsuario(user).catch(() => {});

  _showAuthScreen(false);

  // Atualiza UI do header
  const userInfo  = document.getElementById('user-info');
  const emailLbl  = document.getElementById('user-email-label');
  const adminBtn  = document.getElementById('admin-btn');
  const perfilBtn = document.getElementById('perfil-btn');
  if (userInfo)  userInfo.style.display  = 'flex';
  if (emailLbl)  emailLbl.textContent    = user.email;
  if (adminBtn)  adminBtn.style.display  = _isAdmin ? 'block' : 'none';
  if (perfilBtn) perfilBtn.style.display = _isAdmin ? 'none' : 'block';

  const sbConta  = document.getElementById('sidebar-conta');
  const sbPerfil = document.getElementById('sidebar-perfil-btn');
  const sbAdmin  = document.getElementById('sidebar-admin-btn');
  const sbDeploy = document.getElementById('sidebar-deploy-btn');
  if (sbConta)  sbConta.style.display  = 'block';
  if (sbPerfil) sbPerfil.style.display = _isAdmin ? 'none' : 'block';
  if (sbAdmin)  sbAdmin.style.display  = _isAdmin ? 'block' : 'none';
  if (sbDeploy) sbDeploy.style.display = (_isAdmin && !_isMobile()) ? 'block' : 'none';

  const dadosSection  = document.getElementById('dados-admin-section');
  const deploySection = document.getElementById('deploy-config-section');
  const dadosTools    = document.getElementById('dados-tools-admin');
  if (dadosSection)  dadosSection.style.display  = 'block';
  if (deploySection) deploySection.style.display = _isAdmin ? 'block' : 'none';
  if (dadosTools)    dadosTools.style.display    = _isAdmin ? 'block' : 'none';

  _sbSetStatus('🔄 Carregando dados...', '#f59e0b');
  _sbShowButtons(true);

  // Carrega todos os dados do banco para memória via compat._loadAllData
  try {
    _clearMemCache();
    if (typeof window._loadAllData === 'function') await window._loadAllData();
  } catch(e) { console.warn('[_onLogin] erro ao carregar dados:', e.message); }

  _sbSetStatus('🟢 Conectado como ' + user.email, '#4ade80');

  // Inicializa app (migrações + popula selects + render completo)
  if (typeof window._initApp === 'function') {
    try { window._initApp(); } catch(e) { console.warn('[_onLogin] _initApp:', e.message); }
  } else {
    try { renderAll(); renderTerceirosTab(); renderParceladosTab(); renderVencimentosTab(); renderCartoesTab(); } catch(e) {}
  }

  // Restaura aba e mês/ano salvos, ou vai para Dashboard
  try {
    const savedTab = (typeof _lsGet === 'function') ? (_lsGet('nav_tab') || 'dashboard') : 'dashboard';
    const savedMes = parseInt((typeof _lsGet === 'function') ? (_lsGet('nav_mes') || '') : '') || null;
    const savedAno = parseInt((typeof _lsGet === 'function') ? (_lsGet('nav_ano') || '') : '') || null;

    // Restaura mês/ano se salvos
    if (savedMes && savedAno) {
      currentMonth = savedMes;
      currentYear  = savedAno;
      window._rangeFilter = { de: { mes: savedMes, ano: savedAno }, ate: { mes: savedMes, ano: savedAno } };
      try {
        const s = (v, id) => { const el = document.getElementById(id); if (el) el.value = v; };
        s(savedMes, 'filterMonthDe'); s(savedMes, 'filterMonthAte');
        s(savedAno, 'filterYearDe');  s(savedAno, 'filterYearAte');
      } catch(e) {}
    }

    // Encontra o botão da aba pelo atributo onclick
    const allTabBtns = document.querySelectorAll('#desktop-nav .nav-tab');
    let tabBtn = null;
    allTabBtns.forEach(function(btn) {
      if ((btn.getAttribute('onclick') || '').indexOf("'" + savedTab + "'") !== -1) tabBtn = btn;
    });
    if (!tabBtn) tabBtn = allTabBtns[0]; // fallback: dashboard

    if (tabBtn) showTab(savedTab, tabBtn);
    const sidebarDashBtn = document.querySelector('.sidebar-tab');
    if (sidebarDashBtn) {
      document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'));
      sidebarDashBtn.classList.add('active');
    }
  } catch(e) {}

  // Show welcome modal para usuários sem lançamentos
  try {
    const lncs2 = await loadData();
    if (!lncs2.length) {
      const wm = document.getElementById('welcomeModalOverlay');
      if (wm) wm.classList.add('open');
    }
  } catch(e) {}
}

// ── Salva/atualiza usuário na tabela mf_usuarios ─────
async function _upsertUsuario(user) {
  const token = window._cachedAccessToken;
  if (!token) return;
  const meta = user.user_metadata || {};
  await fetch(SB_URL + '/rest/v1/mf_usuarios', {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      id:    user.id,
      email: user.email,
      name:  meta.full_name || meta.name || user.email?.split('@')[0] || '',
      role:  meta.role || 'user'
    })
  });
}

// ── Visibilitychange: flush pendências ao voltar ao foco ─
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible' && (_currentUser || window._currentUser)) {
    _flushPending().catch(() => {});
  }
});

// ── Admin: criar usuários ────────────────────────────
async function openAdminModal() {
  if (!_isAdmin) return;
  document.getElementById('admin-modal-overlay').style.display = 'flex';
  await adminLoadUsers();
}
function closeAdminModal() {
  document.getElementById('admin-modal-overlay').style.display = 'none';
}

function adminTogglePass() {
  const inp = document.getElementById('admin-new-password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function adminSelectRole(role) {
  document.getElementById('admin-new-role').value = role;
  const userBtn  = document.getElementById('role-user-btn');
  const adminBtn = document.getElementById('role-admin-btn');
  if (role === 'user') {
    userBtn.style.background  = 'rgba(240,192,64,0.10)';
    userBtn.style.borderColor = 'rgba(74,240,160,0.5)';
    userBtn.querySelector('div div:first-child').style.color = '#30d080';
    adminBtn.style.background  = 'rgba(0,0,0,0.2)';
    adminBtn.style.borderColor = '#1e2330';
    adminBtn.querySelector('div div:first-child').style.color = '#8890a8';
  } else {
    adminBtn.style.background  = 'rgba(240,192,64,0.12)';
    adminBtn.style.borderColor = 'rgba(240,192,64,0.5)';
    adminBtn.querySelector('div div:first-child').style.color = '#f0c040';
    userBtn.style.background  = 'rgba(0,0,0,0.2)';
    userBtn.style.borderColor = '#1e2330';
    userBtn.querySelector('div div:first-child').style.color = '#8890a8';
  }
}

async function adminCreateUser() {
  const name     = document.getElementById('admin-new-name').value.trim();
  const email    = document.getElementById('admin-new-email').value.trim();
  const password = document.getElementById('admin-new-password').value.trim();
  const role     = document.getElementById('admin-new-role').value || 'user';

  if (!email)              { _adminMsg('⚠️ Preencha o e-mail.', false); return; }
  if (!password)           { _adminMsg('⚠️ Preencha a senha.', false); return; }
  if (password.length < 6) { _adminMsg('⚠️ Senha precisa ter ao menos 6 caracteres.', false); return; }

  _adminMsg('🔄 Criando usuário...', null);

  const { data, error } = await _sbClient.auth.signUp({
    email, password,
    options: { data: { role, name: name || email.split('@')[0], full_name: name || email.split('@')[0] } }
  });

  if (error) { _adminMsg('❌ Erro: ' + error.message, false); return; }

  // Registra na tabela mf_usuarios
  if (data?.user?.id) {
    const session = (await _sbClient.auth.getSession()).data.session;
    await fetch(SB_URL + '/rest/v1/mf_usuarios', {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id:    data.user.id,
        email: email,
        name:  name || email.split('@')[0],
        role:  role,
        created_at: new Date().toISOString()
      })
    });
  }

  _adminMsg('✅ Usuário criado com sucesso!', true);
  document.getElementById('admin-new-name').value     = '';
  document.getElementById('admin-new-email').value    = '';
  document.getElementById('admin-new-password').value = '';
  adminSelectRole('user');
  await adminLoadUsers();
}

function _adminMsg(msg, ok) {
  const el = document.getElementById('admin-create-msg');
  el.style.display    = 'block';
  el.style.background = ok === true ? 'rgba(48,208,128,0.12)' : ok === false ? 'rgba(240,80,96,0.12)' : 'rgba(80,88,112,0.12)';
  el.style.border     = ok === true ? '1px solid rgba(48,208,128,0.3)' : ok === false ? '1px solid rgba(240,80,96,0.3)' : '1px solid #1e2330';
  el.style.color      = ok === true ? '#4ade80' : ok === false ? '#f05060' : '#8890a8';
  el.style.padding    = '8px 12px';
  el.style.borderRadius = '6px';
  el.textContent      = msg;
}

let _adminUsersCache = [];

async function adminLoadUsers() {
  const listEl = document.getElementById('admin-users-list');
  listEl.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;padding:8px 0;">🔄 Carregando...</div>';
  try {
    const session = (await _sbClient.auth.getSession()).data.session;

    // Busca lista de usuários na tabela mf_usuarios
    const usersRes = await fetch(SB_URL + '/rest/v1/mf_usuarios?select=id,email,name,role,ativo,created_at&order=created_at.asc', {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token }
    });
    let registeredUsers = usersRes.ok ? (await usersRes.json()) : [];
    if (!Array.isArray(registeredUsers)) registeredUsers = [];

    // Busca última atualização de dados de cada usuário (tabela mf_lancamentos)
    const syncRes = await fetch(SB_URL + '/rest/v1/mf_lancamentos?select=user_id,updated_at&order=updated_at.desc', {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token }
    });
    const syncRows = syncRes.ok ? (await syncRes.json()) : [];
    const syncMap  = {};
    (Array.isArray(syncRows) ? syncRows : []).forEach(r => {
      if (!syncMap[r.user_id]) syncMap[r.user_id] = r.updated_at;
    });

    // Garante que o admin aparece mesmo sem registro
    const adminAlreadyListed = registeredUsers.find(u => u.id === _currentUser.id);
    if (!adminAlreadyListed) {
      const adminEntry = {
        id:         _currentUser.id,
        email:      _currentUser.email || '',
        name:       _currentUser.user_metadata?.full_name || _currentUser.user_metadata?.name || '',
        role:       _isAdmin ? 'admin' : 'user',
        created_at: new Date().toISOString()
      };
      registeredUsers = [adminEntry, ...registeredUsers];
      fetch(SB_URL + '/rest/v1/mf_usuarios', {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(adminEntry)
      }).catch(() => {});
    }

    const allRows = registeredUsers.map(u => ({ ...u, updated_at: syncMap[u.id] || null }));
    _adminUsersCache = allRows;

    const banner = document.getElementById('admin-sql-banner');
    if (banner) banner.style.display = usersRes.ok ? 'none' : 'flex';

    if (!allRows.length) {
      listEl.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;padding:8px 0;">Nenhum usuário encontrado.</div>';
      return;
    }

    allRows.sort((a, b) => {
      if (a.id === _currentUser.id) return -1;
      if (b.id === _currentUser.id) return 1;
      return (a.email || a.id).localeCompare(b.email || b.id);
    });

    listEl.innerHTML = allRows.map((r, i) => {
      const isMe    = r.id === _currentUser.id;
      const isAdm   = r.role === 'admin';
      const isAtivo = r.ativo !== false;
      const dt      = r.updated_at ? new Date(r.updated_at).toLocaleString('pt-BR') : 'Sem dados';
      const border  = i < allRows.length - 1 ? 'border-bottom:1px solid #1e2330;' : '';
      const displayEmail = r.email || r.id.slice(0,22)+'…';
      const displayName  = r.name ? `<div style="font-size:0.65rem;color:var(--muted);margin-bottom:1px;">${r.name}</div>` : '';
      const rowOpacity   = isAtivo ? '1' : '0.55';

      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;${border}gap:8px;opacity:${rowOpacity}">
        <div style="min-width:0;flex:1;">
          ${displayName}
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;flex-wrap:wrap;">
            <span style="font-size:0.78rem;color:#e8eaf0;word-break:break-all;">${displayEmail}</span>
            ${isAdm ? '<span style="font-size:0.6rem;background:rgba(240,192,64,0.15);color:#f0c040;padding:1px 7px;border-radius:10px;font-weight:700;white-space:nowrap;">👑 ADMIN</span>' : '<span style="font-size:0.6rem;background:rgba(74,240,160,0.08);color:var(--accent);padding:1px 7px;border-radius:10px;font-weight:600;white-space:nowrap;opacity:0.7;">👤 USER</span>'}
            ${!isAtivo ? '<span style="font-size:0.6rem;background:rgba(240,80,96,0.18);color:#f05060;padding:1px 7px;border-radius:10px;font-weight:700;white-space:nowrap;">⛔ INATIVO</span>' : ''}
            ${isMe ? '<span style="font-size:0.6rem;background:rgba(64,144,240,0.15);color:#4090f0;padding:1px 7px;border-radius:10px;font-weight:700;white-space:nowrap;">Você</span>' : ''}
          </div>
          <div style="font-size:0.63rem;color:var(--muted);">🆔 ${r.id.slice(0,16)}… · 💾 ${dt}</div>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
          <button onclick="openAdminEditModal('${r.id}')"
            style="background:rgba(240,192,64,0.08);border:1px solid rgba(240,192,64,0.30);color:var(--accent);border-radius:6px;padding:5px 9px;font-size:0.72rem;cursor:pointer;font-weight:700;"
            title="Editar usuário">✎</button>
          ${!isMe ? `
          <button onclick="adminToggleUserAtivo('${r.id}', ${isAtivo})"
            style="background:${isAtivo ? 'rgba(240,80,96,0.08)' : 'rgba(74,240,160,0.08)'};border:1px solid ${isAtivo ? 'rgba(240,80,96,0.3)' : 'rgba(74,240,160,0.3)'};color:${isAtivo ? '#f05060' : '#4ade80'};border-radius:6px;padding:5px 9px;font-size:0.72rem;cursor:pointer;font-weight:700;"
            title="${isAtivo ? 'Desativar' : 'Reativar'}">${isAtivo ? '⛔' : '✅'}</button>
          <button onclick="adminDeleteUserFull('${r.id}', '${(r.email||'').replace(/'/g,'')}')"
            style="background:rgba(120,0,20,0.15);border:1px solid rgba(240,80,96,0.5);color:#f05060;border-radius:6px;padding:5px 9px;font-size:0.72rem;cursor:pointer;font-weight:700;"
            title="Excluir permanentemente">🗑 Excluir</button>
          ` : ''}
        </div>
      </div>`;
    }).join('');

  } catch(e) {
    listEl.innerHTML = '<div style="color:#f05060;font-size:0.8rem;padding:8px 0;">❌ Erro: ' + e.message + '</div>';
  }
}

async function adminToggleUserAtivo(userId, ativoAtual) {
  const novoStatus = !ativoAtual;
  const acao = novoStatus ? 'REATIVAR' : 'DESATIVAR';
  if (!confirm(acao + ' este usuário?')) return;
  const session = (await _sbClient.auth.getSession()).data.session;
  const res = await fetch(SB_URL + '/rest/v1/mf_usuarios?id=eq.' + userId, {
    method: 'PATCH',
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ativo: novoStatus })
  });
  if (res.ok) {
    alert(novoStatus ? '✅ Usuário reativado!' : '⛔ Usuário desativado.');
  } else {
    alert('⚠️ Erro ao alterar status.');
  }
  await adminLoadUsers();
}

async function adminDeleteUserFull(userId, userEmail) {
  if (!confirm('⚠️ EXCLUIR PERMANENTEMENTE?\n\nUsuário: ' + userEmail + '\n\nIsso apagará todos os dados financeiros e a conta de acesso.\n\nNÃO poderá ser desfeito.')) return;
  if (!confirm('Confirme novamente: excluir ' + userEmail + '?')) return;

  const session = (await _sbClient.auth.getSession()).data.session;
  const headers = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token };

  // Remove dados das tabelas mf_*
  await fetch(SB_URL + '/rest/v1/mf_lancamentos?user_id=eq.'  + userId, { method: 'DELETE', headers });
  await fetch(SB_URL + '/rest/v1/mf_provisoes?user_id=eq.'    + userId, { method: 'DELETE', headers });
  await fetch(SB_URL + '/rest/v1/mf_categorias?user_id=eq.'   + userId, { method: 'DELETE', headers });
  await fetch(SB_URL + '/rest/v1/mf_pagamentos?user_id=eq.'   + userId, { method: 'DELETE', headers });
  await fetch(SB_URL + '/rest/v1/mf_terceiros?user_id=eq.'    + userId, { method: 'DELETE', headers });
  await fetch(SB_URL + '/rest/v1/mf_bancos?user_id=eq.'       + userId, { method: 'DELETE', headers });
  await fetch(SB_URL + '/rest/v1/mf_config?user_id=eq.'       + userId, { method: 'DELETE', headers });
  await fetch(SB_URL + '/rest/v1/mf_tombstones?user_id=eq.'   + userId, { method: 'DELETE', headers });
  await fetch(SB_URL + '/rest/v1/mf_usuarios?id=eq.'          + userId, { method: 'DELETE', headers });

  // Tenta deletar do auth via Edge Function
  let authDeleted = false;
  try {
    const efRes = await fetch(SB_URL + '/functions/v1/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ user_id: userId })
    });
    authDeleted = efRes.ok;
  } catch(e) {}

  if (authDeleted) {
    alert('✅ Usuário excluído completamente!');
  } else {
    alert('⚠️ Dados excluídos das tabelas.\n\nPara liberar o e-mail no Auth:\nAuthentication → Users → Delete');
  }
  await adminLoadUsers();
}

// ── Modal Editar Usuário (Admin) ─────────────────────
let _adminEditUserId = null;

function openAdminEditModal(userId) {
  _adminEditUserId = userId;
  const isMe   = userId === _currentUser.id;
  const cached = _adminUsersCache.find(u => u.id === userId);
  const email  = cached?.email || (isMe ? _currentUser.email : '');
  const name   = cached?.name  || (isMe ? (_currentUser.user_metadata?.full_name || '') : '');
  const role   = cached?.role  || (isMe ? (_isAdmin ? 'admin' : 'user') : 'user');

  document.getElementById('admin-edit-uid').value   = userId;
  document.getElementById('admin-edit-name').value  = name;
  document.getElementById('admin-edit-email').value = email;
  document.getElementById('admin-edit-subtitle').textContent = email || userId.slice(0,30)+'…';
  document.getElementById('admin-edit-password').value  = '';
  document.getElementById('admin-edit-password2').value = '';
  adminEditSelectRole(role);
  adminEditTab('dados');
  _adminEditMsg('', null);
  document.getElementById('admin-edit-overlay').style.display = 'flex';
}

function closeAdminEditModal() {
  document.getElementById('admin-edit-overlay').style.display = 'none';
  _adminEditUserId = null;
}

function adminEditTab(tab) {
  const isDados = tab === 'dados';
  document.getElementById('edit-panel-dados').style.display = isDados ? 'flex' : 'none';
  document.getElementById('edit-panel-senha').style.display = isDados ? 'none' : 'flex';
  document.getElementById('edit-tab-dados').style.background = isDados ? '#f0c040' : 'none';
  document.getElementById('edit-tab-dados').style.color      = isDados ? '#000' : '#8890a8';
  document.getElementById('edit-tab-senha').style.background = !isDados ? '#f0c040' : 'none';
  document.getElementById('edit-tab-senha').style.color      = !isDados ? '#000' : '#8890a8';
  _adminEditMsg('', null);
}

function adminEditSelectRole(role) {
  document.getElementById('admin-edit-role').value = role;
  const u = document.getElementById('edit-role-user-btn');
  const a = document.getElementById('edit-role-admin-btn');
  if (role === 'user') {
    u.style.background = 'rgba(240,192,64,0.10)'; u.style.borderColor = 'rgba(74,240,160,0.5)';
    u.querySelector('div').style.color = '#30d080';
    a.style.background = 'rgba(0,0,0,0.2)'; a.style.borderColor = '#1e2330';
    a.querySelector('div').style.color = '#8890a8';
  } else {
    a.style.background = 'rgba(240,192,64,0.12)'; a.style.borderColor = 'rgba(240,192,64,0.5)';
    a.querySelector('div').style.color = '#f0c040';
    u.style.background = 'rgba(0,0,0,0.2)'; u.style.borderColor = '#1e2330';
    u.querySelector('div').style.color = '#8890a8';
  }
}

function adminToggleEditPass()  { const i = document.getElementById('admin-edit-password');  i.type = i.type==='password'?'text':'password'; }
function adminToggleEditPass2() { const i = document.getElementById('admin-edit-password2'); i.type = i.type==='password'?'text':'password'; }

function _adminEditMsg(msg, ok) {
  const el = document.getElementById('admin-edit-msg');
  if (!msg) { el.style.display='none'; return; }
  el.style.display = 'block';
  el.style.background = ok === true ? 'rgba(240,192,64,0.10)' : ok === false ? 'rgba(240,80,96,0.12)' : 'rgba(255,255,255,0.05)';
  el.style.color = ok === true ? '#4af0a0' : ok === false ? '#f05060' : '#8890a8';
  el.textContent = msg;
}

async function adminSaveEdit() {
  const uid   = _adminEditUserId;
  const name  = document.getElementById('admin-edit-name').value.trim();
  const email = document.getElementById('admin-edit-email').value.trim();
  const role  = document.getElementById('admin-edit-role').value || 'user';
  if (!email) { _adminEditMsg('⚠️ Preencha o e-mail.', false); return; }
  _adminEditMsg('🔄 Salvando...', null);
  try {
    const session = (await _sbClient.auth.getSession()).data.session;
    const isMe = uid === _currentUser.id;
    if (isMe) {
      const { error } = await _sbClient.auth.updateUser({
        email: email !== _currentUser.email ? email : undefined,
        data: { full_name: name, name, role }
      });
      if (error) { _adminEditMsg('❌ ' + error.message, false); return; }
      _currentUser.email = email;
    } else {
      await fetch(SB_URL + '/auth/v1/admin/users/' + uid, {
        method: 'PUT',
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, user_metadata: { full_name: name, name, role } })
      }).catch(() => {});
    }
    await fetch(SB_URL + '/rest/v1/mf_usuarios?id=eq.' + uid, {
      method: 'PATCH',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, role })
    });
    _adminEditMsg('✅ Dados salvos!', true);
    await adminLoadUsers();
  } catch(e) { _adminEditMsg('❌ ' + e.message, false); }
}

async function adminSavePassword() {
  const uid   = _adminEditUserId;
  const pass  = document.getElementById('admin-edit-password').value;
  const pass2 = document.getElementById('admin-edit-password2').value;
  if (!pass)            { _adminEditMsg('⚠️ Digite a nova senha.', false); return; }
  if (pass.length < 6)  { _adminEditMsg('⚠️ Mínimo 6 caracteres.', false); return; }
  if (pass !== pass2)   { _adminEditMsg('⚠️ As senhas não coincidem.', false); return; }
  _adminEditMsg('🔄 Alterando...', null);
  try {
    const session = (await _sbClient.auth.getSession()).data.session;
    const isMe = uid === _currentUser.id;
    if (isMe) {
      const { error } = await _sbClient.auth.updateUser({ password: pass });
      if (error) { _adminEditMsg('❌ ' + error.message, false); return; }
    } else {
      const res = await fetch(SB_URL + '/auth/v1/admin/users/' + uid, {
        method: 'PUT',
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        _adminEditMsg('❌ ' + (err.message || 'Erro. API Admin requerida.'), false); return;
      }
    }
    _adminEditMsg('✅ Senha alterada!', true);
    document.getElementById('admin-edit-password').value  = '';
    document.getElementById('admin-edit-password2').value = '';
  } catch(e) { _adminEditMsg('❌ ' + e.message, false); }
}

// ── Modal Meu Perfil (Usuário Comum) ─────────────────
function openPerfilModal() {
  const u = _currentUser;
  document.getElementById('perfil-name').value = u.user_metadata?.full_name || u.user_metadata?.name || '';
  document.getElementById('perfil-email-readonly').value = u.email || '';
  document.getElementById('perfil-password').value  = '';
  document.getElementById('perfil-password2').value = '';
  perfilTab('dados');
  _perfilMsg('', null);
  document.getElementById('perfil-modal-overlay').style.display = 'flex';
}

async function perfilApagarMovimentacoes() {
  const confirmVal = (document.getElementById('perfil-del-confirm')?.value || '').trim().toUpperCase();
  if (confirmVal !== 'APAGAR') { _perfilMsg('⚠️ Digite APAGAR para confirmar.', false); return; }
  const all     = await loadDataBanco();
  const mantidos = all.filter(l => l.tipo !== 'despesa' && l.tipo !== 'receita');
  await saveData(mantidos);
  const removidos = all.length - mantidos.length;
  _perfilMsg('✅ ' + removidos + ' movimentações apagadas.', true);
  document.getElementById('perfil-del-confirm').value = '';
  renderAll();
}

function closePerfilModal() {
  document.getElementById('perfil-modal-overlay').style.display = 'none';
}

function perfilTab(tab) {
  const tabs   = ['dados', 'senha', 'dados-del'];
  const colors = { 'dados': '#4af0a0', 'senha': '#f0c040', 'dados-del': '#ef4444' };
  tabs.forEach(t => {
    const btn = document.getElementById('perfil-tab-' + t);
    const pan = document.getElementById('perfil-panel-' + t);
    const active = t === tab;
    if (btn) { btn.style.background = active ? colors[t] : 'none'; btn.style.color = active ? '#000' : '#8890a8'; }
    if (pan) pan.style.display = active ? 'flex' : 'none';
  });
  _perfilMsg('', null);
  if (tab === 'dados-del') { const el = document.getElementById('perfil-del-confirm'); if (el) el.value = ''; }
}

function perfilTogglePass()  { const i = document.getElementById('perfil-password');  i.type = i.type==='password'?'text':'password'; }
function perfilTogglePass2() { const i = document.getElementById('perfil-password2'); i.type = i.type==='password'?'text':'password'; }

function _perfilMsg(msg, ok) {
  const el = document.getElementById('perfil-msg');
  if (!msg) { el.style.display='none'; return; }
  el.style.display    = 'block';
  el.style.background = ok === true ? 'rgba(240,192,64,0.10)' : ok === false ? 'rgba(240,80,96,0.12)' : 'rgba(255,255,255,0.05)';
  el.style.color      = ok === true ? '#4af0a0' : ok === false ? '#f05060' : '#8890a8';
  el.textContent      = msg;
}

async function perfilSaveDados() {
  const name = document.getElementById('perfil-name').value.trim();
  _perfilMsg('🔄 Salvando...', null);
  try {
    const { error } = await _sbClient.auth.updateUser({ data: { full_name: name, name } });
    if (error) { _perfilMsg('❌ ' + error.message, false); return; }
    // Atualiza também na tabela mf_usuarios
    const token = await _getValidToken();
    await fetch(SB_URL + '/rest/v1/mf_usuarios?id=eq.' + _currentUser.id, {
      method: 'PATCH',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    _perfilMsg('✅ Dados atualizados!', true);
    const emailLabel = document.getElementById('user-email-label');
    if (emailLabel) emailLabel.textContent = _currentUser.email;
  } catch(e) { _perfilMsg('❌ ' + e.message, false); }
}

async function perfilSavePassword() {
  const pass  = document.getElementById('perfil-password').value;
  const pass2 = document.getElementById('perfil-password2').value;
  if (!pass)           { _perfilMsg('⚠️ Digite a nova senha.', false); return; }
  if (pass.length < 6) { _perfilMsg('⚠️ Mínimo 6 caracteres.', false); return; }
  if (pass !== pass2)  { _perfilMsg('⚠️ As senhas não coincidem.', false); return; }
  _perfilMsg('🔄 Alterando...', null);
  try {
    const { error } = await _sbClient.auth.updateUser({ password: pass });
    if (error) { _perfilMsg('❌ ' + error.message, false); return; }
    _perfilMsg('✅ Senha alterada!', true);
    document.getElementById('perfil-password').value  = '';
    document.getElementById('perfil-password2').value = '';
  } catch(e) { _perfilMsg('❌ ' + e.message, false); }
}

// ── Init: verifica sessão existente ──────────────────
(function() {
  _showAuthScreen(true);

  let _recoveryHandled = false;
  let _loginDone = false;

  _sbClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      _recoveryHandled = true;
      window.history.replaceState(null, '', window.location.pathname);
      _showResetPasswordScreen();
    } else if (event === 'SIGNED_IN' && session && !_recoveryHandled) {
      if (_loginDone) return;
      _loginDone = true;
      await _onLogin(session.user, session.access_token);
    } else if (event === 'TOKEN_REFRESHED' && session && _currentUser) {
      _currentUser = session.user;
      window._currentUser = session.user;
      _setToken(session.access_token);
    } else if (event === 'SIGNED_OUT') {
      _recoveryHandled = false;
      _loginDone = false;
      _showAuthScreen(true);
    }
  });

  window.addEventListener('load', async function() {
    const hashStr    = window.location.hash.replace('#', '');
    const parseParams = str => {
      const p = {};
      str.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) p[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
      });
      return p;
    };
    const hashParams = parseParams(hashStr);

    if (hashParams.error) {
      window.history.replaceState(null, '', window.location.pathname);
      _showAuthScreen(true);
      const errEl = document.getElementById('auth-error');
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = '⚠️ O link expirou ou é inválido. Solicite um novo.'; }
      return;
    }

    if (_recoveryHandled) return;
    await new Promise(r => setTimeout(r, 100));
    if (_loginDone) return;

    try {
      const sessionPromise = _sbClient.auth.getSession();
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000));
      const { data: { session } } = await Promise.race([sessionPromise, timeout]);
      if (session && session.user) {
        if (_loginDone) return;
        _loginDone = true;
        await _onLogin(session.user, session.access_token);
      } else {
        _showAuthScreen(true);
      }
    } catch(e) {
      console.warn('[load] getSession falhou:', e.message);
      await new Promise(r => setTimeout(r, 5000));
      if (!_loginDone) _showAuthScreen(true);
    }
  });
})();

// ── Sidebar ──────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').style.left = '0';
  document.getElementById('sidebar-overlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('sidebar').style.left = '-280px';
  document.getElementById('sidebar-overlay').style.display = 'none';
  document.body.style.overflow = '';
}
function sidebarShowTab(tab, btn) {
  const desktopBtns = document.querySelectorAll('#desktop-nav .nav-tab');
  desktopBtns.forEach(b => b.classList.remove('active'));
  const match = Array.from(desktopBtns).find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + tab + "'"));
  if (match) match.classList.add('active');
  document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  showTab(tab, btn);
  closeSidebar();
}

// ══════════════════════════════════════════════════════
// MOBILE CARDS — converte tabelas em cards no mobile
// (mantido integralmente do arquivo original)
// ══════════════════════════════════════════════════════
const _isMobile = () => window.innerWidth <= 768;

function _mobileCardContainer(tbodyId) {
  let c = document.getElementById(tbodyId + '-mcards');
  if (!c) {
    c = document.createElement('div');
    c.id = tbodyId + '-mcards';
    const tbody = document.getElementById(tbodyId);
    if (tbody) tbody.closest('table').parentNode.appendChild(c);
  }
  return c;
}

function _toggleMobileTable(tbodyId, showCards) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const table = tbody.closest('table');
  if (table) table.style.display = showCards ? 'none' : '';
  const c = document.getElementById(tbodyId + '-mcards');
  if (c) c.style.display = showCards ? 'block' : 'none';
}

function _renderTerceirosTableMobile(tbodyId, sorted) {
  const container = _mobileCardContainer(tbodyId);
  _toggleMobileTable(tbodyId, true);
  if (!sorted.length) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.85rem;">Nenhum lançamento.</div>';
    return;
  }
  container.innerHTML = sorted.map(l => {
    const isRec = l.tipo === 'receita';
    const borderColor = isRec ? 'var(--green)' : 'var(--red)';
    const sid = String(l.id).replace(/'/g, "\\'");
    return `<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${borderColor};border-radius:10px;padding:12px 14px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span style="font-family:'Space Mono',monospace;font-size:0.72rem;color:var(--text2)">${l.vencimento||formatDate(l.data)}</span>
        <span style="${isRec?'color:var(--green)':'color:var(--red)'};font-family:'Space Mono',monospace;font-size:0.95rem;font-weight:700;">${isRec?'+':'-'}${fmt(l.valor)}</span>
      </div>
      <div style="font-weight:700;font-size:0.88rem;margin-bottom:5px;">${(l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,'')}${l.parcAtual?'<span style="background:rgba(240,144,64,0.85);color:#000;padding:0 5px;border-radius:3px;font-size:0.65rem;font-weight:700;margin-left:4px">'+l.parcAtual+'/'+l.parcTotal+'</span>':''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;align-items:center;">
        ${l.terceiro?`<span style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;padding:2px 8px;border-radius:10px;font-size:0.7rem;">👤 ${l.terceiro}</span>`:''}
        <span style="font-size:0.73rem;color:var(--muted)">${l.categoria||'—'}</span>
        ${l.pagamento?`<span style="background:var(--surface2);border:1px solid var(--border);padding:2px 7px;border-radius:10px;font-size:0.7rem;color:var(--text2)">${l.pagamento}</span>`:''}
        <span class="badge badge-${isRec?'receita':'despesa'}">${isRec?'↑ Entrada':'↓ Dívida'}</span>
        <span class="badge badge-${l.status}">${l.status==='pago'?'✓ Pago':'⏳ Pendente'}</span>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:6px;">
        <button onclick="editLancamento('${sid}')" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.30);color:var(--accent2);border-radius:6px;padding:5px 12px;font-size:0.73rem;cursor:pointer;font-weight:700;">✎ Editar</button>
        <button onclick="copiarLancamento('${sid}')" style="background:rgba(96,165,250,0.10);border:1px solid rgba(96,165,250,0.30);color:#60a5fa;border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">⧉</button>
        <button onclick="deleteLancamento('${sid}')" style="background:rgba(240,80,96,0.12);border:1px solid rgba(240,80,96,0.3);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✕</button>
      </div>
    </div>`;
  }).join('');
}

function _renderVencimentosMobile(tbodyId, filtered) {
  const container = _mobileCardContainer(tbodyId);
  _toggleMobileTable(tbodyId, true);
  if (!filtered.length) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.85rem;">✅ Nenhum vencimento encontrado.</div>';
    return;
  }
  container.innerHTML = filtered.map(l => {
    const sit = l._sit;
    const isRec = l.tipo === 'receita';
    const sid = String(l.id).replace(/'/g, "\\'");
    const sitColors = { atrasado:'#ef4444', hoje:'#f59e0b', proximos:'#60a5fa', mes:'#a78bfa' };
    const sitLabels = { atrasado:'🔴 Atrasado', hoje:'🟡 Hoje', proximos:'⏳ Próximo', mes:'📅 No mês' };
    const cor = sitColors[sit] || 'var(--text2)';
    return `<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${cor};border-radius:10px;padding:12px 14px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span style="font-size:0.7rem;background:rgba(0,0,0,0.2);color:${cor};padding:2px 8px;border-radius:10px;font-weight:700;">${sitLabels[sit]||'📅'}</span>
        <span style="${isRec?'color:var(--green)':'color:var(--red)'};font-family:'Space Mono',monospace;font-size:0.95rem;font-weight:700;">${isRec?'+':'-'}${fmt(l.valor)}</span>
      </div>
      <div style="font-weight:700;font-size:0.88rem;margin-bottom:5px;">${(l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,'')}${l.parcAtual?'<span style="background:rgba(240,144,64,0.85);color:#000;padding:0 5px;border-radius:3px;font-size:0.65rem;font-weight:700;margin-left:4px">'+l.parcAtual+'/'+l.parcTotal+'</span>':''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;align-items:center;">
        ${l.vencimento?`<span style="font-family:'Space Mono',monospace;font-size:0.72rem;color:${cor}">Venc: ${l.vencimento}</span>`:''}
        <span style="font-size:0.72rem;color:var(--muted)">${l.categoria||'—'}</span>
        ${l.pagamento?`<span style="background:var(--surface2);border:1px solid var(--border);padding:2px 7px;border-radius:10px;font-size:0.7rem;color:var(--accent2)">${l.pagamento}</span>`:''}
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;">
        ${l.status==='pendente'
          ?`<button onclick="toggleStatusLanc('${sid}','pago')" style="background:rgba(48,208,128,0.15);border:1px solid rgba(48,208,128,0.4);color:var(--green);border-radius:6px;padding:5px 12px;font-size:0.73rem;cursor:pointer;font-weight:700;">✓ Pagar</button>`
          :`<button onclick="toggleStatusLanc('${sid}','pendente')" style="background:rgba(240,80,96,0.15);border:1px solid rgba(240,80,96,0.4);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">↩</button>`
        }
        <button onclick="editLancamento('${sid}')" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.30);color:var(--accent2);border-radius:6px;padding:5px 12px;font-size:0.73rem;cursor:pointer;font-weight:700;">✎ Editar</button>
        <button onclick="copiarLancamento('${sid}')" style="background:rgba(96,165,250,0.10);border:1px solid rgba(96,165,250,0.30);color:#60a5fa;border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">⧉</button>
        <button onclick="deleteLancamento('${sid}')" style="background:rgba(240,80,96,0.12);border:1px solid rgba(240,80,96,0.3);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✕</button>
      </div>
    </div>`;
  }).join('');
}

function _renderParceladosMobile(containerId, summaries, titulo, corTitulo) {
  if (!summaries.length) return '';
  return summaries.map(s => {
    const pctPago = s.pctPago || 0;
    const proxCor = s.proxAtrasada ? '#ef4444' : s.isQuitado ? '#22c55e' : 'var(--text2)';
    const statusColor = s.isQuitado ? '#22c55e' : s.proxAtrasada ? '#ef4444' : '#f59e0b';
    const statusLabel = s.isQuitado ? '✓ Quitado' : s.proxAtrasada ? '⚠️ Atrasado' : '⏳ Ativo';
    const noMesBadge = s.noMes ? `<span style="background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.4);color:#a78bfa;padding:2px 7px;border-radius:10px;font-size:0.68rem;">Parcela ${s.numParcelaMes||'?'}/${s.total} neste mês</span>` : '';
    const barColor = s.isQuitado ? '#22c55e' : corTitulo;
    return `<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${corTitulo};border-radius:10px;padding:12px 14px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div style="font-weight:700;font-size:0.88rem;flex:1;margin-right:8px;">${s.descClean}</div>
        <span style="font-family:'Space Mono',monospace;font-size:0.9rem;font-weight:700;color:${corTitulo};white-space:nowrap">-${fmt(s.vlParcela)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:8px;">
        <div style="flex:1;height:5px;background:var(--surface2);border-radius:4px;overflow:hidden;">
          <div style="width:${pctPago}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.4s;"></div>
        </div>
        <span style="font-size:0.68rem;color:var(--muted);white-space:nowrap">${s.pagas}/${s.total} · ${pctPago}%</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;align-items:center;">
        <span style="font-size:0.7rem;color:${statusColor};font-weight:700;">${statusLabel}</span>
        <span style="font-size:0.7rem;color:var(--muted)">${s.categoria||'—'}</span>
        ${s.pagamento?`<span style="background:var(--surface2);border:1px solid var(--border);padding:1px 7px;border-radius:10px;font-size:0.68rem;color:var(--accent2)">${s.pagamento}</span>`:''}
        ${noMesBadge}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--muted);">
        <span>Próx: <span style="color:${proxCor};font-weight:600">${s.proxLabel}</span></span>
        <span>Restante: <span style="color:var(--text2);font-weight:600">${fmt(s.vlRestante)}</span></span>
      </div>
    </div>`;
  }).join('');
}

const _origRenderTerceirosTab = window.renderTerceirosTab;
window.renderTerceirosTab = function() {
  _origRenderTerceirosTab.apply(this, arguments);
  if (_isMobile()) {
    const tbody = document.getElementById('terceirosTable');
    if (tbody) {
      const sorted = (() => {
        const nomeF   = window.FSEL ? FSEL.getValues('filtroTerceiroNome')   : [];
        const tipoF   = window.FSEL ? FSEL.getValues('filtroTerceiroTipo')   : [];
        const statusF = window.FSEL ? FSEL.getValues('filtroTerceiroStatus') : [];
        const descF   = (document.getElementById('filtroTerceiroDesc')?.value || '').toLowerCase();
        return (_memCache.lancamentos || []).filter(l => {
          if (!CAT_TERC_SET.has(l.categoria)) return false;
          if (Number(l.mes) !== currentMonth || Number(l.ano) !== currentYear) return false;
          if (nomeF.length   && !nomeF.includes(l.terceiro||'')) return false;
          if (statusF.length && !statusF.includes(l.status)) return false;
          if (descF && !((l.desc||'')+(l.terceiro||'')+(l.pagamento||'')).toLowerCase().includes(descF)) return false;
          return true;
        });
      })();
      _renderTerceirosTableMobile('terceirosTable', sorted);
    }
  }
};

const _origRenderVencimentosTab = window.renderVencimentosTab;
window.renderVencimentosTab = function() {
  _origRenderVencimentosTab.apply(this, arguments);
  if (_isMobile()) {
    const tbody = document.getElementById('vencTableBody');
    if (tbody) {
      const tipoF  = window.FSEL ? FSEL.getValues('vencFiltroTipo') : [];
      const catF   = window.FSEL ? FSEL.getValues('vencFiltroCat')  : [];
      const pagF   = window.FSEL ? FSEL.getValues('vencFiltroPag')  : [];
      const busca  = (document.getElementById('vencFiltroBusca')?.value || '').toLowerCase();
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      const em7d = new Date(hoje); em7d.setDate(em7d.getDate()+7);
      const parseDMY = s => {
        if (!s) return null;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d,m,y]=s.split('/'); return new Date(+y,+m-1,+d); }
        if (/^\d{4}-\d{2}-\d{2}$/.test(s))   { const [y,m,d]=s.split('-'); return new Date(+y,+m-1,+d); }
        return null;
      };
      const isMesAtual = (currentMonth === hoje.getMonth()+1 && currentYear === hoje.getFullYear());
      const classificar = l => {
        const vd = parseDMY(l.vencimento); if (!vd) return 'mes';
        vd.setHours(0,0,0,0);
        if (!isMesAtual) return 'mes';
        if (vd < hoje) return 'atrasado';
        if (vd.getTime() === hoje.getTime()) return 'hoje';
        if (vd <= em7d) return 'proximos';
        return 'mes';
      };
      const items = getMonthData()
        .filter(l => l.status === 'pendente')
        .map(l => ({ ...l, _sit: classificar(l), _vd: parseDMY(l.vencimento) }))
        .filter(l => {
          if (tipoF.length && !tipoF.includes(l._sit)) return false;
          if (catF.length  && !catF.includes(l.categoria)) return false;
          if (pagF.length  && !pagF.includes(l.pagamento)) return false;
          if (busca && !(l.desc||'').toLowerCase().includes(busca)) return false;
          return true;
        });
      _renderVencimentosMobile('vencTableBody', items);
    }
  }
};

const _origRenderParceladosTab = window.renderParceladosTab;
window.renderParceladosTab = function() {
  _origRenderParceladosTab.apply(this, arguments);
  if (_isMobile()) {
    const mesListaEl = document.getElementById('parcMesLista');
    if (mesListaEl) {
      const noMesList = window._parcNoMesList || [];
      if (noMesList.length) {
        const pend  = noMesList.filter(s => s.statusMes === 'pendente');
        const pagos = noMesList.filter(s => s.statusMes === 'pago');
        let html = '';
        if (pend.length)  html += `<div style="font-size:0.7rem;font-weight:700;color:#f59e0b;letter-spacing:.06em;margin:8px 0 6px;">⏳ PENDENTES</div>` + _renderParceladosMobile('', pend, 'PENDENTES', '#f59e0b');
        if (pagos.length) html += `<div style="font-size:0.7rem;font-weight:700;color:#22c55e;letter-spacing:.06em;margin:8px 0 6px;">✓ PAGAS</div>` + _renderParceladosMobile('', pagos, 'PAGAS', '#22c55e');
        if (!html) html = '<div style="padding:14px;text-align:center;color:var(--muted)">Nenhuma parcela neste mês.</div>';
        mesListaEl.innerHTML = html;
      }
    }
  }
};

const _origRenderCartoesTab = window.renderCartoesTab;
window.renderCartoesTab = function() {
  _origRenderCartoesTab.apply(this, arguments);
  if (!_isMobile()) return;
  const tbody = document.getElementById('cartaoTableBody');
  if (!tbody) return;
  const normStr = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const pags    = _memCache.pagamentos || [];
  const cartoes = pags.filter(p => p.cartao);
  const cartaoMap = {};
  cartoes.forEach(p => { cartaoMap[normStr(p.nome)] = p; });
  const resolveNome = pagamento => { const c = cartaoMap[normStr(pagamento||'')]; return c ? c.nome : pagamento; };
  const isCartaoLanc = l => !!cartaoMap[normStr(l.pagamento||'')];
  const nomeF   = window.FSEL ? FSEL.getValues('cartaoFiltroNome')   : [];
  const statusF = window.FSEL ? FSEL.getValues('cartaoFiltroStatus') : [];
  const busca   = (document.getElementById('cartaoBusca')?.value || '').toLowerCase();
  const filtered = (_memCache.lancamentos || []).filter(l => {
    if (!isCartaoLanc(l)) return false;
    if (!_inRange(l)) return false;
    if (nomeF.length   && !nomeF.includes(resolveNome(l.pagamento))) return false;
    if (statusF.length && !statusF.includes(l.status))               return false;
    if (busca && !(l.desc||'').toLowerCase().includes(busca))         return false;
    return true;
  }).sort((a,b) => (b.data||'').localeCompare(a.data||''));
  const container = _mobileCardContainer('cartaoTableBody');
  _toggleMobileTable('cartaoTableBody', true);
  if (!filtered.length) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.85rem;">Nenhum lançamento encontrado.</div>';
    return;
  }
  const fmtDt = d => { if(!d) return '—'; if(/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.split('-').reverse().join('/'); return d; };
  container.innerHTML = filtered.map(l => {
    const pago = l.status === 'pago';
    const pm = l.parcAtual ? [null, l.parcAtual+'/'+l.parcTotal] : (l.desc||'').match(/\((\d+\/\d+)\)$/);
    const parcelaStr = l.tipoLanc==='parcelado' ? (pm ? ` · ${pm[1]}` : '') : l.tipoLanc==='fixo' ? ' · ↻ fixo' : '';
    const cartaoNome = resolveNome(l.pagamento);
    const cartaoObj  = pags.find(p => p.nome === cartaoNome);
    const icone      = cartaoObj?.icone || '💳';
    return `<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${pago?'var(--green)':'var(--accent)'};border-radius:10px;padding:12px 14px;margin-bottom:8px;${pago?'opacity:0.7':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span style="font-family:'Space Mono',monospace;font-size:0.72rem;color:var(--muted)">${fmtDt(l.data)}</span>
        <span style="color:var(--red);font-family:'Space Mono',monospace;font-size:0.95rem;font-weight:700;">-${fmt(l.valor)}</span>
      </div>
      <div style="font-weight:700;font-size:0.88rem;margin-bottom:6px;">${(l.desc||'—').replace(/\s*\(\d+\/\d+\)$/,'')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;align-items:center;">
        <span style="background:var(--surface2);border:1px solid var(--border);padding:2px 8px;border-radius:10px;font-size:0.7rem;color:var(--text2)">${icone} ${cartaoNome}</span>
        <span style="font-size:0.72rem;color:var(--muted)">${l.categoria||'—'}${parcelaStr}</span>
        <span style="font-size:0.68rem;padding:2px 8px;border-radius:20px;background:${pago?'rgba(48,208,128,.15)':'rgba(240,192,64,.12)'};color:${pago?'var(--green)':'var(--accent)'};">${pago?'✓ Pago':'⏳ Pendente'}</span>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:6px;">
        ${!pago
          ? `<button onclick="marcarPagoCartao('${l.id}')" style="background:rgba(48,208,128,0.15);border:1px solid rgba(48,208,128,0.4);color:var(--green);border-radius:6px;padding:5px 14px;font-size:0.73rem;cursor:pointer;font-weight:700;">✓ Pagar</button>`
          : `<button onclick="estornarPagoCartao('${l.id}')" style="background:rgba(240,80,96,0.15);border:1px solid rgba(240,80,96,0.4);color:var(--danger);border-radius:6px;padding:5px 14px;font-size:0.73rem;cursor:pointer;font-weight:700;">↩ Estornar</button>`
        }
        <button onclick="editLancamento('${l.id}')" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.30);color:var(--accent2);border-radius:6px;padding:5px 12px;font-size:0.73rem;cursor:pointer;font-weight:700;">✎</button>
        <button onclick="deleteLancamento('${l.id}')" style="background:rgba(240,80,96,0.12);border:1px solid rgba(240,80,96,0.3);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✕</button>
      </div>
    </div>`;
  }).join('');
};

const _origRenderProvisao = window.renderProvisao;
window.renderProvisao = function(despesas) {
  _origRenderProvisao.apply(this, arguments);
  if (!_isMobile()) return;
  const tbody = document.getElementById('provTable');
  if (!tbody) return;
  const container = _mobileCardContainer('provTable');
  _toggleMobileTable('provTable', true);
  let grupos = [];
  try { grupos = calcProvisaoAcumulada().grupos; } catch(e) {}
  const filtroEl  = document.getElementById('provFiltroCat');
  const filtroStr = filtroEl ? filtroEl.value.toLowerCase().trim() : '';
  const gruposFiltrados = filtroStr ? grupos.filter(g => g.categoria.toLowerCase().includes(filtroStr)) : grupos;
  if (!gruposFiltrados.length) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.85rem;">Nenhuma provisão. Clique em + Categoria para começar.</div>';
    return;
  }
  const mNames=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  container.innerHTML = gruposFiltrados.map(g => {
    const pctAcum = g.provAcum>0 ? Math.round(g.gastoAcum/g.provAcum*100) : (g.gastoAcum>0?999:0);
    const pct = pctAcum;
    const barColor = pct>100?'#dc2626':pct>=75?'#f59e0b':'#16a34a';
    const pctDisplay = pct>100?`<span style="color:#fff;background:#dc2626;padding:2px 8px;border-radius:4px;font-weight:700;font-size:0.82rem">${pct}%</span>`
      : pct>=75?`<span style="color:#000;background:#f59e0b;padding:2px 8px;border-radius:4px;font-weight:700;font-size:0.82rem">${pct}%</span>`
      : `<span style="color:#fff;background:#16a34a;padding:2px 8px;border-radius:4px;font-weight:700;font-size:0.82rem">${pct}%</span>`;
    const saldoMesCor  = g.saldoMes>=0  ? '#16a34a' : '#dc2626';
    const saldoAcumCor = g.saldoAcum>=0 ? '#16a34a' : '#dc2626';
    const prox    = g.futuras[0];
    const proxStr = prox ? mNames[prox.mes-1]+'/'+String(prox.ano).slice(2) : '—';
    return `<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${barColor};border-radius:10px;padding:12px 14px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div>
          <div style="font-weight:700;font-size:0.9rem;color:var(--accent2);cursor:pointer" onclick="verMovimentosProvisao('${g.categoria}','${g.subCategoria||''}')">${g.categoria} <span style="font-size:0.6rem;opacity:0.7">▼</span></div>
          ${g.subCategoria?`<div style="font-size:0.72rem;color:var(--accent);margin-top:1px">› ${g.subCategoria}</div>`:''}
          <div style="font-size:0.65rem;color:var(--muted);margin-top:2px">Próx: ${proxStr}</div>
        </div>
        ${pctDisplay}
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
        <div style="flex:1;height:6px;background:var(--surface2);border-radius:4px;overflow:hidden;">
          <div style="width:${Math.min(pct,100)}%;height:100%;background:${barColor};border-radius:4px;"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
        <div style="background:rgba(0,0,0,0.15);border-radius:6px;padding:7px 10px">
          <div style="font-size:0.55rem;color:var(--muted);letter-spacing:.06em;margin-bottom:3px">MÊS — PROVISÃO</div>
          <div style="font-size:0.78rem;font-weight:700;font-family:'Space Mono',monospace;color:var(--accent)">${fmt(g.provMes)}</div>
          <div style="font-size:0.7rem;color:var(--muted)">Gasto: <span style="color:var(--red)">${fmt(g.gastoMes)}</span></div>
          <div style="font-size:0.7rem;">Saldo: <span style="color:${saldoMesCor};font-weight:700">${g.saldoMes>=0?'':'-'}${fmt(Math.abs(g.saldoMes))}</span></div>
        </div>
        <div style="background:rgba(0,0,0,0.15);border-radius:6px;padding:7px 10px">
          <div style="font-size:0.55rem;color:var(--muted);letter-spacing:.06em;margin-bottom:3px">PROJEÇÃO DE CAIXA</div>
          <div style="font-size:0.78rem;font-weight:700;font-family:'Space Mono',monospace;color:var(--accent2)">${fmt(g.provAcum)}</div>
          <div style="font-size:0.7rem;color:var(--muted)">Gasto: <span style="color:var(--red)">${fmt(g.gastoAcum)}</span></div>
          <div style="font-size:0.7rem;">Saldo: <span style="color:${saldoAcumCor};font-weight:700">${g.saldoAcum>=0?'':'-'}${fmt(Math.abs(g.saldoAcum))}</span></div>
        </div>
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end;">
        <button onclick="verMovimentosProvisao('${g.categoria}','${g.subCategoria||''}')" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.40);color:var(--accent2);border-radius:6px;padding:5px 12px;font-size:0.73rem;cursor:pointer;font-weight:700;">+ mov.</button>
        <button onclick="openProvModal('${g.groupId}')" style="background:rgba(240,192,64,0.12);border:1px solid rgba(240,192,64,0.4);color:var(--accent);border-radius:6px;padding:5px 12px;font-size:0.73rem;cursor:pointer;font-weight:700;">✎ Editar</button>
        <button onclick="deleteProv('${g.groupId}','forward')" style="background:rgba(240,192,64,0.08);border:1px solid rgba(240,192,64,0.30);color:var(--accent2);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">⏩</button>
        <button onclick="deleteProv('${g.groupId}','all')" style="background:rgba(240,80,96,0.1);border:1px solid rgba(240,80,96,0.3);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✕</button>
      </div>
    </div>`;
  }).join('');
};
