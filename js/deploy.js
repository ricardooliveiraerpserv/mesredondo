// ── DEPLOY GITHUB PAGES ──────────────────────────────────────────────────────
function openDeployModal() {
  var user  = (typeof _lsGet === 'function') ? _lsGet('gh_deploy_user', '') : '';
  var repo  = (typeof _lsGet === 'function') ? _lsGet('gh_deploy_repo', '') : '';
  var token = (typeof _lsGet === 'function') ? _lsGet('gh_deploy_token', '') : '';
  var versao = (typeof _lsGet === 'function') ? _lsGet('gh_deploy_versao', '') : '';
  // Auto-gera versão baseada na data atual
  var now = new Date();
  var mm = String(now.getMonth()+1).padStart(2,'0');
  var yy = String(now.getFullYear()).slice(2);
  var prefix = 'v' + mm + yy + '-';
  // Se não tem versão salva OU a versão salva é de outro mês, gera nova
  if (!versao || !versao.startsWith(prefix)) {
    versao = prefix + '01';
  }
  // Garante que não mostra placeholder — sempre um valor real
  document.getElementById('ghUser').value  = user;
  document.getElementById('ghRepo').value  = repo;
  document.getElementById('ghToken').value = token;
  document.getElementById('ghVersao').value = versao;
  document.getElementById('deployStatus').style.display = 'none';
  var btn = document.getElementById('btnRunDeploy');
  btn.disabled = false; btn.textContent = '🚀 Publicar agora';
  document.getElementById('deployModalOverlay').classList.add('open');
}

function closeDeployModal() {
  document.getElementById('deployModalOverlay').classList.remove('open');
}

function clearDeployFields() {
  if (!confirm('Limpar usuário, repositório e token salvos?')) return;
  if (typeof _lsRemove === 'function') {
    _lsRemove('gh_deploy_user');
    _lsRemove('gh_deploy_repo');
    _lsRemove('gh_deploy_token');
  }
  document.getElementById('ghUser').value = '';
  document.getElementById('ghRepo').value = '';
  document.getElementById('ghToken').value = '';
  document.getElementById('deployStatus').style.display = 'none';
  _deployStatus('✅ Campos limpos. Preencha com os dados corretos.', '#30d080');
}

async function runDeploy() {
  var user  = document.getElementById('ghUser').value.trim();
  var repo  = document.getElementById('ghRepo').value.trim();
  var token = document.getElementById('ghToken').value.trim();
  var versao = (document.getElementById('ghVersao').value || '').trim();
  if (!user || !repo || !token) { _deployStatus('⚠️ Preencha todos os campos.', '#f59e0b'); return; }
  if (!versao) { _deployStatus('⚠️ Informe a versão antes de publicar (ex: v0326-01).', '#f59e0b'); document.getElementById('ghVersao').focus(); return; }
  if (user.includes('@')) { _deployStatus('⚠️ Use o USERNAME do GitHub, não o e-mail.', '#f59e0b'); return; }
  if (repo.length > 50 || /[^a-zA-Z0-9._-]/.test(repo)) { _deployStatus('⚠️ Nome do repositório inválido.', '#f59e0b'); return; }

  if (typeof _lsSet === 'function') {
    _lsSet('gh_deploy_user', user);
    _lsSet('gh_deploy_repo', repo);
    _lsSet('gh_deploy_token', token);
    _lsSet('gh_deploy_versao', versao);
  }

  var btn = document.getElementById('btnRunDeploy');
  btn.disabled = true; btn.textContent = '⏳ Publicando...';

  // Helper: fetch com tratamento de erro detalhado
  async function ghFetch(url, opts) {
    var resp;
    try {
      resp = await fetch('https://api.github.com' + url, {
        ...opts,
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          ...(opts && opts.headers || {})
        }
      });
    } catch(netErr) {
      throw new Error(
        'Falha de rede ao contatar o GitHub.\n\n' +
        '🔍 Possíveis causas:\n' +
        '• Token sem permissão "repo" (ou "public_repo")\n' +
        '• Bloqueio de CORS — tente abrir o app direto pelo arquivo (file://) ou pelo GitHub Pages\n' +
        '• Token expirado ou inválido\n' +
        '• Sem conexão com a internet\n\n' +
        'Detalhe técnico: ' + netErr.message
      );
    }
    if (!resp.ok) {
      var body = await resp.json().catch(()=>({}));
      throw new Error('GitHub API ' + resp.status + ': ' + (body.message || JSON.stringify(body)));
    }
    return resp;
  }

  try {
    var apiBase = '/repos/' + user + '/' + repo;

    // ── Prepara o conteúdo HTML ──
    _deployStatus('🔄 Preparando arquivo...', '#818cf8');
    var htmlContent = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    // Remove any open modal state from deployed HTML
    htmlContent = htmlContent.replace(/(<div[^>]*class="[^"]*modal-overlay[^"]*"[^>]*)\bopen\b([^>]*>)/g, '$1$2');
    htmlContent = htmlContent.replace(/class="modal-overlay open"/g, 'class="modal-overlay"');
    // Inject deploy timestamp + version as comment and as JS variable
    var ts = new Date().toISOString();
    htmlContent = htmlContent.replace('</head>',
      '<!-- deploy:' + ts + ' v:' + versao + ' -->\n' +
      '<script>window._DEPLOY_VERSAO="' + versao + '";window._DEPLOY_TS="' + ts + '";<\/script>\n' +
      '</head>');
    // Encode UTF-8 → base64 (suporta emojis e acentos)
    var encoded;
    try {
      var bytes = new TextEncoder().encode(htmlContent);
      var binary = '';
      var chunkSize = 8192;
      for (var i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      encoded = btoa(binary);
    } catch(e) {
      encoded = btoa(unescape(encodeURIComponent(htmlContent)));
    }

    // ── Verifica repositório ──
    _deployStatus('🔄 Verificando repositório...', '#818cf8');
    var repoResp = await ghFetch(apiBase);
    var repoData = await repoResp.json();
    var defaultBranch = repoData.default_branch || 'main';

    // ── Garante que há pelo menos um commit no repo ──
    _deployStatus('🔄 Verificando histórico...', '#818cf8');
    var refsResp = await fetch('https://api.github.com' + apiBase + '/git/refs/heads', {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' }
    });
    var refsData = refsResp.ok ? await refsResp.json() : [];
    if (!Array.isArray(refsData) || refsData.length === 0) {
      _deployStatus('🔄 Criando commit inicial...', '#818cf8');
      var bR = await ghFetch(apiBase + '/git/blobs', { method:'POST', body: JSON.stringify({content:'# Finclaro\n', encoding:'utf-8'}) });
      var bD = await bR.json();
      var tR = await ghFetch(apiBase + '/git/trees', { method:'POST', body: JSON.stringify({tree:[{path:'README.md',mode:'100644',type:'blob',sha:bD.sha}]}) });
      var tD = await tR.json();
      var cR = await ghFetch(apiBase + '/git/commits', { method:'POST', body: JSON.stringify({message:'chore: initial commit',tree:tD.sha,parents:[]}) });
      var cD = await cR.json();
      await ghFetch(apiBase + '/git/refs', { method:'POST', body: JSON.stringify({ref:'refs/heads/'+defaultBranch, sha:cD.sha}) });
    }

    // ── Pega o branch que o GitHub Pages está usando ──
    _deployStatus('🔄 Verificando configuração do GitHub Pages...', '#818cf8');
    var deployBranch = 'main'; // fallback
    try {
      var pagesCheck = await fetch('https://api.github.com' + apiBase + '/pages', {
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' }
      });
      if (pagesCheck.ok) {
        var pagesInfo = await pagesCheck.json();
        if (pagesInfo.source && pagesInfo.source.branch) {
          deployBranch = pagesInfo.source.branch;
        }
      }
    } catch(e) { /* usa main como fallback */ }
    _deployStatus('🔄 Branch de deploy: <strong>' + deployBranch + '</strong>...', '#818cf8', true);

    // ── Pega o SHA atual do branch de deploy ──
    var branchResp = await ghFetch(apiBase + '/git/refs/heads/' + deployBranch);
    var branchData = await branchResp.json();
    var parentCommitSha = branchData.object ? branchData.object.sha : null;
    if (!parentCommitSha) throw new Error('Não foi possível obter SHA do branch ' + deployBranch);

    // ── Usa Git Data API: blob → tree → commit → update ref ──
    _deployStatus('🔄 Criando blob do arquivo (' + Math.round(encoded.length/1024) + ' KB)...', '#818cf8');
    var blobResp = await ghFetch(apiBase + '/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: encoded, encoding: 'base64' })
    });
    var blobData = await blobResp.json();

    _deployStatus('🔄 Criando tree...', '#818cf8');
    var parentCommitResp = await ghFetch(apiBase + '/git/commits/' + parentCommitSha);
    var parentCommitData = await parentCommitResp.json();
    var baseTreeSha = parentCommitData.tree ? parentCommitData.tree.sha : null;

    // ── version.json para cache busting ──
    var versionJson = JSON.stringify({ version: versao, ts: ts, deployed: new Date().toISOString() });
    var vBlobResp = await ghFetch(apiBase + '/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: btoa(unescape(encodeURIComponent(versionJson))), encoding: 'base64' })
    });
    var vBlobData = await vBlobResp.json();

    // ── Service Worker: network-first para index.html e assets JS/CSS ──
    var swCode = `
const CACHE = 'mf-v${versao}';
const INDEX = 'index.html';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    fetch(INDEX + '?_sw=' + Date.now(), { cache: 'no-store' })
      .then(r => caches.open(CACHE).then(c => c.put(INDEX, r)))
      .catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isIndex = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  const isAsset = url.pathname.match(/\\.(js|css)$/);
  if (isIndex || isAsset) {
    // Network-first: sempre tenta buscar versão nova
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return r;
        })
        .catch(() => caches.match(e.request))
    );
  }
  // Outros assets: cache normal
});
`.trim();
    var swEncoded = btoa(unescape(encodeURIComponent(swCode)));
    var swBlobResp = await ghFetch(apiBase + '/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: swEncoded, encoding: 'base64' })
    });
    var swBlobData = await swBlobResp.json();

    // ── JS files que precisam ser publicados junto com index.html ──
    _deployStatus('🔄 Preparando arquivos JS...', '#818cf8');
    const jsFiles = [
      'js/render.js',
      'js/terceiros.js',
      'js/lancamentos-e-dados.js',
      'js/navigation.js',
      'js/areceber-apagar.js',
      'js/vencimentos.js',
      'js/parcelados.js',
      'js/categorias.js',
      'js/bancos.js',
      'js/cartoes-config.js',
      'js/fsel.js',
      'js/backup.js',
      'js/deploy.js',
      'js/auto-update.js',
      'js/debug.js',
      'js/ia.js',
      'js/db.js',
      'js/sync-auth.js',
      'js/compat.js',
      'js/state_v3.js',
      'js/pwa-bootstrap.js',
      'css/main.css',
    ];

    const jsBlobs = [];
    for (const filePath of jsFiles) {
      try {
        // Tenta buscar o arquivo do repositório atual (GitHub Pages)
        const fileUrl = window.location.origin + window.location.pathname.replace('index.html','') + filePath;
        const fileResp = await fetch(fileUrl + '?_nocache=' + Date.now(), { cache: 'no-store' });
        if (!fileResp.ok) continue;
        const fileText = await fileResp.text();
        const fileBytes = new TextEncoder().encode(fileText);
        let fileBinary = '';
        for (let i = 0; i < fileBytes.length; i += 8192) {
          fileBinary += String.fromCharCode.apply(null, fileBytes.subarray(i, i + 8192));
        }
        const fileEncoded = btoa(fileBinary);
        const fBlobResp = await ghFetch(apiBase + '/git/blobs', {
          method: 'POST',
          body: JSON.stringify({ content: fileEncoded, encoding: 'base64' })
        });
        const fBlobData = await fBlobResp.json();
        jsBlobs.push({ path: filePath, mode: '100644', type: 'blob', sha: fBlobData.sha });
      } catch(e) { console.warn('Skipping', filePath, e.message); }
    }

    var treeBody = { tree: [
      { path: 'index.html',   mode: '100644', type: 'blob', sha: blobData.sha },
      { path: 'version.json', mode: '100644', type: 'blob', sha: vBlobData.sha },
      { path: 'sw.js',        mode: '100644', type: 'blob', sha: swBlobData.sha },
      ...jsBlobs
    ]};
    if (baseTreeSha) treeBody.base_tree = baseTreeSha;

    var treeResp = await ghFetch(apiBase + '/git/trees', { method:'POST', body: JSON.stringify(treeBody) });
    var treeData = await treeResp.json();

    _deployStatus('🔄 Criando commit...', '#818cf8');
    var commitResp = await ghFetch(apiBase + '/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: '🚀 [' + versao + '] Deploy Mês Redondo — ' + new Date().toLocaleString('pt-BR'),
        tree: treeData.sha,
        parents: [parentCommitSha]
      })
    });
    var commitData = await commitResp.json();

    _deployStatus('🔄 Atualizando branch ' + deployBranch + '...', '#818cf8');
    var patchResp = await ghFetch(apiBase + '/git/refs/heads/' + deployBranch, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commitData.sha, force: true })
    });
    var patchData = await patchResp.json();
    var commitFinal = patchData.object ? patchData.object.sha : commitData.sha;

    var url = 'https://' + user + '.github.io/' + repo + '/';
    var nextVersao = versao.replace(/(\d+)$/, function(n){ return String(parseInt(n)+1).padStart(n.length,'0'); });
    document.getElementById('ghVersao').value = nextVersao;
    if (typeof _lsSet === 'function') _lsSet('gh_deploy_versao', nextVersao);
    // Atualiza labels de versão em todo o app
    var dtStr2 = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
    _fillDeployVersionLabel(versao, dtStr2);
    _deployStatus(
      '✅ Deploy <strong style="color:#f0c040">' + versao + '</strong> realizado!<br>' +
      '<a href="' + url + '" target="_blank" style="color:var(--accent);font-weight:700;text-decoration:underline">' + url + ' ↗</a><br>' +
      '<span style="font-size:0.7rem;color:var(--muted)">Branch: <strong style="color:var(--accent)">' + deployBranch + '</strong> · Commit: <code style="font-size:0.68rem">' + commitFinal.slice(0,7) + '</code></span><br>' +
      '<span style="font-size:0.7rem;opacity:0.6">⏱ Aguarde 1–2 min · Próxima versão: <strong>' + nextVersao + '</strong></span>',
      '#F0C040', true
    );
    btn.textContent = '✅ ' + versao + ' publicado!';

  } catch(e) {
    _deployStatus('❌ ' + e.message, '#ef4444');
    btn.disabled = false;
    btn.textContent = '🚀 Tentar novamente';
  }
}

function _deployStatus(msg, color, isHtml) {
  var el = document.getElementById('deployStatus');
  el.style.display = 'block';
  el.style.background = color + '18';
  el.style.border = '1px solid ' + color + '55';
  el.style.color = color;
  if (isHtml) el.innerHTML = msg; else el.textContent = msg;
}
