// ── Debug panel ──────────────────────────────────────────────────────
(function() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  if (!params.get('debug') && hash !== '#debug') return;

  const panel = document.getElementById('debug-panel');
  const log   = document.getElementById('debug-log');
  if (panel) panel.style.display = 'block';

  function _dlog(msg, color) {
    if (!log) return;
    const ts = new Date().toLocaleTimeString('pt-BR');
    const line = document.createElement('div');
    line.style.color = color || '#4af0a0';
    line.style.borderBottom = '1px solid #1e2330';
    line.style.paddingBottom = '3px';
    line.style.marginBottom = '3px';
    line.textContent = '[' + ts + '] ' + msg;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  window._debugLog = _dlog;
  window._debugClearLog = () => { if (log) log.innerHTML = ''; };

  window._debugRunTest = async function() {
    _dlog('=== INICIANDO TESTE DE SYNC ===', '#f0c040');

    // 1. Verifica usuário
    _dlog('1. _currentUser: ' + (window._currentUser ? window._currentUser.email : 'NULL ❌'), window._currentUser ? '#4af0a0' : '#f05060');

    // 2. Verifica SB_URL e SB_KEY
    _dlog('2. SB_URL: ' + (typeof SB_URL !== 'undefined' ? SB_URL.substring(0,40) + '...' : 'UNDEFINED ❌'), typeof SB_URL !== 'undefined' ? '#4af0a0' : '#f05060');
    _dlog('3. SB_KEY: ' + (typeof SB_KEY !== 'undefined' ? SB_KEY.substring(0,20) + '...' : 'UNDEFINED ❌'), typeof SB_KEY !== 'undefined' ? '#4af0a0' : '#f05060');

    // 3. Verifica sessão Supabase
    try {
      const { data, error } = await _sbClient.auth.getSession();
      if (error) { _dlog('4. Sessão: ERRO — ' + error.message, '#f05060'); }
      else if (!data.session) { _dlog('4. Sessão: NULL — não logado ❌', '#f05060'); }
      else {
        const exp = new Date(data.session.expires_at * 1000).toLocaleString('pt-BR');
        _dlog('4. Sessão: OK ✅ | expira: ' + exp, '#4af0a0');
        _dlog('   Token: ' + data.session.access_token.substring(0,30) + '...', '#8890a8');
      }
    } catch(e) { _dlog('4. Sessão: EXCEÇÃO — ' + e.message, '#f05060'); }

    // 4. Testa fetch no Supabase + diagnóstico de timestamp
    try {
      const userId = window._currentUser?.id;
      if (!userId) { _dlog('5. Fetch: sem userId, pulando', '#f59e0b'); }
      else {
        const { data } = await _sbClient.auth.getSession();
        const token = data?.session?.access_token;
        const res = await fetch(SB_URL + '/rest/v1/meufinanceiro_backup?id=eq.' + encodeURIComponent(userId) + '&select=updated_at', {
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + token }
        });
        const body = await res.text();
        _dlog('5. Fetch GET: HTTP ' + res.status + (res.ok ? ' ✅' : ' ❌'), res.ok ? '#4af0a0' : '#f05060');
        _dlog('   Resposta: ' + body.substring(0, 120), '#8890a8');

        // Diagnóstico de estratégia de refresh (timestamp comparison)
        if (res.ok) {
          try {
            const rows = JSON.parse(body);
            if (rows && rows.length && rows[0].updated_at) {
              const cloudTs = new Date(rows[0].updated_at).getTime();
              const localTs = parseInt(localStorage.getItem('sb_last_save') || '0');
              const diff = cloudTs - localTs;
              _dlog('── Diagnóstico de Refresh ──', '#f0c040');
              _dlog('   localTs : ' + (localTs ? new Date(localTs).toLocaleString('pt-BR') : 'nunca salvo'), '#8890a8');
              _dlog('   cloudTs : ' + new Date(cloudTs).toLocaleString('pt-BR'), '#8890a8');
              if (diff > 1000) {
                _dlog('   ⬇ PULL-ONLY: servidor mais recente por ' + Math.round(diff/1000) + 's → refresh só carregará do servidor', '#60a5fa');
              } else if (diff < -1000) {
                _dlog('   🔄 SYNC BIDIRECIONAL: local mais recente por ' + Math.round(-diff/1000) + 's → refresh vai fazer merge + push', '#f59e0b');
              } else {
                _dlog('   ✅ EM SINCRONIA: timestamps equivalentes → refresh sem push', '#4af0a0');
              }
            }
          } catch(pe) { _dlog('   (não foi possível parsear updated_at)', '#8890a8'); }
        }
      }
    } catch(e) { _dlog('5. Fetch: EXCEÇÃO — ' + e.message, '#f05060'); }

    // 5. Testa window.sbSave
    _dlog('6. window.sbSave: ' + typeof window.sbSave, typeof window.sbSave === 'function' ? '#4af0a0' : '#f05060');

    // 6. localStorage + dirty flag
    const ls = localStorage.getItem('sb_last_save');
    const dirty = localStorage.getItem('sb_local_dirty');
    _dlog('7. sb_last_save: ' + (ls ? new Date(parseInt(ls)).toLocaleString('pt-BR') : 'null'), '#8890a8');
    _dlog('   sb_local_dirty: ' + (dirty ? '🟡 SIM — alterações locais pendentes (' + new Date(parseInt(dirty)).toLocaleString('pt-BR') + ')' : '🟢 NÃO — em sincronia com o servidor'), dirty ? '#f59e0b' : '#4af0a0');

    // 7. Deploy version
    _dlog('8. _DEPLOY_VERSAO: ' + (window._DEPLOY_VERSAO || 'não injetado (local)'), '#8890a8');
    _dlog('9. _DEPLOY_TS: ' + (window._DEPLOY_TS || 'não injetado'), '#8890a8');

    _dlog('=== FIM DO TESTE ===', '#f0c040');
  };

  // Intercepta console.error para mostrar no painel
  const _origErr = console.error;
  console.error = function(...args) {
    _dlog('❌ ' + args.join(' '), '#f05060');
    _origErr.apply(console, args);
  };
  const _origWarn = console.warn;
  console.warn = function(...args) {
    _dlog('⚠️ ' + args.join(' '), '#f59e0b');
    _origWarn.apply(console, args);
  };

  _dlog('Debug panel ativo. Clique em "Rodar Teste de Sync" para diagnosticar.', '#a78bfa');
})();
