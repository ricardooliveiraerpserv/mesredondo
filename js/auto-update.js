// ── Auto-updater: verifica version.json no GitHub Pages ──────────────
(function _checkForUpdates() {
  const currentTs = window._DEPLOY_TS;
  const currentVer = window._DEPLOY_VERSAO;
  if (!currentTs) return; // não é deploy publicado

  // Descobre URL base pelo hostname (quando rodando no GitHub Pages)
  let baseUrl = '';
  try {
    const loc = window.location.hostname;
    const path = window.location.pathname;
    if (loc.endsWith('.github.io')) {
      const parts = path.split('/').filter(Boolean);
      baseUrl = 'https://' + loc + (parts.length ? '/' + parts[0] : '');
    } else if (loc !== 'localhost' && loc !== '127.0.0.1') {
      baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
    }
  } catch(e) {}

  if (!baseUrl) return;

  const versionUrl = baseUrl.replace(/\/$/, '') + '/version.json';

  function showUpdateBanner(remoteVer) {
    const banner = document.getElementById('update-banner');
    const verEl  = document.getElementById('update-banner-version');
    if (!banner) return;
    if (verEl) verEl.textContent = 'Disponível: ' + remoteVer + (currentVer ? ' (atual: ' + currentVer + ')' : '');
    banner.style.display = 'block';
  }

  async function checkVersion() {
    try {
      const res = await fetch(versionUrl + '?_=' + Date.now(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ts && data.ts > currentTs) {
        showUpdateBanner(data.version || 'nova versão');
      }
    } catch(e) { /* sem conexão ou arquivo não existe ainda */ }
  }

  // Primeira verificação após 4 segundos
  setTimeout(checkVersion, 4000);
  // Verifica a cada 10 minutos enquanto o app estiver aberto
  setInterval(checkVersion, 10 * 60 * 1000);
})();


(function(){
  try {
    // Priority: embedded JS variable (survives deploy) > localStorage
    var v = window._DEPLOY_VERSAO || ((typeof _lsGet==='function') ? _lsGet('gh_deploy_versao','') : localStorage.getItem('gh_deploy_versao')||'');
    var lbl = document.getElementById('app-version-label');
    var dt  = document.getElementById('app-deploy-date');
    if (lbl) lbl.textContent = v || '—';
    // Try embedded TS first, then HTML comment
    var tsStr = window._DEPLOY_TS || null;
    if (!tsStr) {
      var comments = [];
      var iter = document.createNodeIterator(document.head, NodeFilter.SHOW_COMMENT);
      var node;
      while ((node = iter.nextNode())) comments.push(node.nodeValue);
      var deployComment = comments.find(function(c){ return c.startsWith(' deploy:'); });
      if (deployComment) { var match = deployComment.match(/deploy:([\dT:.Z-]+)/); if (match) tsStr = match[1]; }
    }
    if (tsStr && dt) {
      var d = new Date(tsStr);
      dt.textContent = d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
    }
  } catch(e){}
})();
