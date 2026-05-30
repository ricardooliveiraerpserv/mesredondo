// ======== BANCOS ========
const BANCO_LOGOS = {
  'banco_itau':   'https://www.google.com/s2/favicons?sz=64&domain=itau.com.br',
  'banco_nubank': 'https://www.google.com/s2/favicons?sz=64&domain=nubank.com.br',
  'banco_bb':     'https://www.google.com/s2/favicons?sz=64&domain=bb.com.br',
  'banco_caixa':  'https://www.google.com/s2/favicons?sz=64&domain=caixa.gov.br',
  'banco_inter':  'https://www.google.com/s2/favicons?sz=64&domain=bancointer.com.br',
  'itau':         'https://www.google.com/s2/favicons?sz=64&domain=itau.com.br',
  'itaú':         'https://www.google.com/s2/favicons?sz=64&domain=itau.com.br',
  'nubank':       'https://www.google.com/s2/favicons?sz=64&domain=nubank.com.br',
  'bradesco':     'https://www.google.com/s2/favicons?sz=64&domain=bradesco.com.br',
  'santander':    'https://www.google.com/s2/favicons?sz=64&domain=santander.com.br',
  'banco do brasil': 'https://www.google.com/s2/favicons?sz=64&domain=bb.com.br',
  'bb':           'https://www.google.com/s2/favicons?sz=64&domain=bb.com.br',
  'caixa':        'https://www.google.com/s2/favicons?sz=64&domain=caixa.gov.br',
  'inter':        'https://www.google.com/s2/favicons?sz=64&domain=bancointer.com.br',
  'c6':           'https://www.google.com/s2/favicons?sz=64&domain=c6bank.com.br',
  'c6bank':       'https://www.google.com/s2/favicons?sz=64&domain=c6bank.com.br',
  'xp':           'https://www.google.com/s2/favicons?sz=64&domain=xp.com.br',
  'picpay':       'https://www.google.com/s2/favicons?sz=64&domain=picpay.com',
  'mercado pago': 'https://www.google.com/s2/favicons?sz=64&domain=mercadopago.com.br',
  'neon':         'https://www.google.com/s2/favicons?sz=64&domain=neon.com.br',
  'sicoob':       'https://www.google.com/s2/favicons?sz=64&domain=sicoob.com.br',
  'sicredi':      'https://www.google.com/s2/favicons?sz=64&domain=sicredi.com.br',
};

function _logoTag(url, fallback, size) {
  size = size || 18;
  if (!url) return `<span>${fallback||''}</span>`;
  return `<img src="${url}" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<span>${fallback||''}</span>')"
    style="width:${size}px;height:${size}px;object-fit:contain;border-radius:4px;vertical-align:middle;display:inline-block;flex-shrink:0">`;
}

function _normBancoStr(s) {
  return (s||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function _getBancoLogo(banco) {
  if (!banco) return null;
  if (banco.logo) return banco.logo;
  const byId = BANCO_LOGOS[banco.id];
  if (byId) return byId;
  const norm = _normBancoStr(banco.nome);
  return BANCO_LOGOS[norm] || null;
}

function _logoFromName(nome) {
  const norm = _normBancoStr(nome);
  if (BANCO_LOGOS[norm]) return BANCO_LOGOS[norm];
  for (const key of Object.keys(BANCO_LOGOS)) {
    if (norm.includes(key) || key.includes(norm)) return BANCO_LOGOS[key];
  }
  return null;
}
function _setLogoPreview(previewId, url, fallback) {
  const el = document.getElementById(previewId);
  if (!el) return;
  if (url) {
    el.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;border-radius:6px;background:transparent"
      onerror="this.parentElement.innerHTML='${fallback||'💳'}'">`;
  } else {
    el.innerHTML = fallback || '💳';
  }
}
function _autoDetectBancoLogo() {
  const nome = document.getElementById('bancoNome')?.value || '';
  const logoInput = document.getElementById('bancoLogo');
  if (logoInput && !logoInput.value) {
    const auto = _logoFromName(nome);
    _setLogoPreview('bancoLogoPreview', auto, document.getElementById('bancoIcone')?.value || '🏦');
  }
}
function _previewBancoLogo() {
  const url = document.getElementById('bancoLogo')?.value || '';
  const icone = document.getElementById('bancoIcone')?.value || '🏦';
  const auto = url || _logoFromName(document.getElementById('bancoNome')?.value || '');
  _setLogoPreview('bancoLogoPreview', auto, icone);
}
function _autoDetectPagLogo() {
  const nome = document.getElementById('pagNome')?.value || '';
  const logoInput = document.getElementById('pagLogo');
  if (logoInput && !logoInput.value) {
    const auto = _logoFromName(nome);
    _setLogoPreview('pagLogoPreview', auto, document.getElementById('pagIcone')?.value || '💳');
  }
}
function _previewPagLogo() {
  const url = document.getElementById('pagLogo')?.value || '';
  const icone = document.getElementById('pagIcone')?.value || '💳';
  const auto = url || _logoFromName(document.getElementById('pagNome')?.value || '');
  _setLogoPreview('pagLogoPreview', auto, icone);
}

// Contexto do banco (armazenado em localStorage pois é preferência de UI, não dado financeiro)
function getBancoContexto() { return localStorage.getItem('mf_banco_ctx') || null; }
function setBancoContexto(val) {
  if (val) localStorage.setItem('mf_banco_ctx', val);
  else localStorage.removeItem('mf_banco_ctx');
  renderBancoCards();
  renderAll();
}
function getBancosConsolidadoIds() {
  try { return JSON.parse(localStorage.getItem('mf_banco_consolid') || '[]'); } catch(e) { return []; }
}
function saveBancosConsolidadoIds(ids) { localStorage.setItem('mf_banco_consolid', JSON.stringify(ids)); }

function getBancoAtivo() {
  const ctx = getBancoContexto();
  if (!ctx || ctx === 'consolidado') return null;
  return ctx;
}

function _applyBancoFilter(items) {
  const ctx = getBancoContexto();
  if (!ctx) return [];
  if (ctx === 'consolidado') {
    const ids = getBancosConsolidadoIds();
    if (!ids.length) return [];
    return items.filter(l => ids.includes(l.banco || ''));
  }
  return items.filter(l => (l.banco || '') === ctx);
}

var _bancoCorAtual = '#4af0a0';

function selectBancoCor(el, cor) {
  _bancoCorAtual = cor;
  document.querySelectorAll('#bancoCores span').forEach(s => s.style.borderColor = 'transparent');
  el.style.borderColor = '#fff';
  document.getElementById('bancoCorSel').value = cor;
}

async function openBancoModal(id) {
  const bancos = loadBancos();
  document.getElementById('bancoEditId').value = id || '';
  document.getElementById('bancoSaldoData').value = new Date().toISOString().split('T')[0];
  if (id) {
    const b = bancos.find(x => x.id === id);
    if (b) {
      document.getElementById('bancoModalTitle').textContent = 'Editar Banco';
      document.getElementById('bancoNome').value = b.nome || '';
      document.getElementById('bancoIcone').value = b.icone || '🏦';
      document.getElementById('bancoLogo').value = b.logo || '';
      document.getElementById('bancoSaldoInicial').value = b.saldoInicial || '';
      document.getElementById('bancoSaldoData').value = b.saldoData || new Date().toISOString().split('T')[0];
      _bancoCorAtual = b.cor || '#4af0a0';
      _setLogoPreview('bancoLogoPreview', b.logo || _logoFromName(b.nome), b.icone || '🏦');
    }
  } else {
    document.getElementById('bancoModalTitle').textContent = 'Novo Banco';
    document.getElementById('bancoNome').value = '';
    document.getElementById('bancoIcone').value = '🏦';
    document.getElementById('bancoLogo').value = '';
    document.getElementById('bancoSaldoInicial').value = '';
    _setLogoPreview('bancoLogoPreview', null, '🏦');
    _bancoCorAtual = '#4af0a0';
  }
  document.querySelectorAll('#bancoCores span').forEach(s => {
    s.style.borderColor = s.dataset.cor === _bancoCorAtual ? '#fff' : 'transparent';
  });
  document.getElementById('bancoCorSel').value = _bancoCorAtual;
  document.getElementById('bancoModalOverlay').classList.add('open');
}
function closeBancoModal() { document.getElementById('bancoModalOverlay').classList.remove('open'); }

async function salvarBanco() {
  const nome = document.getElementById('bancoNome').value.trim();
  if (!nome) { alert('Informe o nome do banco.'); return; }
  const bancos = loadBancos();
  const editId = document.getElementById('bancoEditId').value;
  const logoInput = document.getElementById('bancoLogo').value.trim();
  const obj = {
    id: editId || String(Date.now()),
    nome,
    icone: document.getElementById('bancoIcone').value || '🏦',
    logo: logoInput || null,
    cor: document.getElementById('bancoCorSel').value || '#4af0a0',
    saldoInicial: parseFloat(document.getElementById('bancoSaldoInicial').value) || 0,
    saldoData: document.getElementById('bancoSaldoData').value || ''
  };
  if (editId) { const idx=bancos.findIndex(b=>b.id===editId); if(idx>=0) bancos[idx]=obj; else bancos.push(obj); }
  else { bancos.push(obj); }
  saveBancos(bancos);
  closeBancoModal();
  renderBancoList();
  populateBancoSelects();
  renderAll();
}

async function deleteBanco(id) {
  if (!await _showSimpleConfirm('🗑 Remover banco', 'Remover este banco?\nOs lançamentos vinculados não serão afetados.', 'Remover', 'var(--red)')) return;
  saveBancos((loadBancos()).filter(b => b.id !== id));
  const ctx = getBancoContexto();
  if (ctx === id) setBancoContexto(null);
  const ids = getBancosConsolidadoIds().filter(x => x !== id);
  saveBancosConsolidadoIds(ids);
  renderBancoList(); populateBancoSelects(); renderAll();
}

async function openConsolidadoModal() {
  const bancos = loadBancos();
  const sel = getBancosConsolidadoIds();
  const el = document.getElementById('consolidadoModalBody');
  if (!el) return;
  el.innerHTML = bancos.map(b => `
    <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface2);border:1px solid ${sel.includes(b.id)?b.cor+'55':'var(--border)'};border-left:3px solid ${b.cor};border-radius:8px;cursor:pointer;transition:border .15s">
      <input type="checkbox" value="${b.id}" ${sel.includes(b.id)?'checked':''} style="accent-color:${b.cor};width:16px;height:16px">
      <span style="font-weight:700;color:var(--text)">${b.icone||'🏦'} ${b.nome}</span>
      <span style="margin-left:auto;font-size:0.75rem;color:var(--muted)">${fmt(calcSaldoBancoId(b.id))}</span>
    </label>`).join('');
  document.getElementById('consolidadoModalOverlay').classList.add('open');
}
function closeConsolidadoModal() { document.getElementById('consolidadoModalOverlay').classList.remove('open'); }
function salvarConsolidado() {
  const checked = Array.from(document.querySelectorAll('#consolidadoModalBody input[type=checkbox]:checked')).map(c=>c.value);
  if (!checked.length) { alert('Selecione pelo menos um banco para consolidar.'); return; }
  saveBancosConsolidadoIds(checked);
  closeConsolidadoModal();
  setBancoContexto('consolidado');
}

async function renderBancoList() {
  const el = document.getElementById('bancoList');
  if (!el) return;
  const bancos = loadBancos();
  if (!bancos.length) { el.innerHTML='<div class="empty-state">Nenhum banco cadastrado. Clique em "+ Novo" para adicionar.</div>'; return; }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;padding:4px 0">` +
    bancos.map(b => `
      <div style="background:var(--surface2);border:1px solid var(--border);border-left:4px solid ${b.cor};border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:700;font-size:0.88rem;color:var(--text)">${b.icone||'🏦'} ${b.nome}</span>
          <div style="display:flex;gap:4px">
            <button onclick="openBancoModal('${b.id}')" style="background:rgba(255,255,255,0.05);border:1px solid var(--border);color:var(--text2);border-radius:5px;padding:2px 8px;font-size:0.65rem;cursor:pointer">✎</button>
            <button onclick="deleteBanco('${b.id}')" style="background:rgba(240,80,96,0.1);border:1px solid rgba(240,80,96,0.3);color:var(--red);border-radius:5px;padding:2px 8px;font-size:0.65rem;cursor:pointer">✕</button>
          </div>
        </div>
        <div style="font-size:0.72rem;color:var(--muted)">Saldo inicial: <strong style="color:var(--text)">${fmt(b.saldoInicial||0)}</strong>${b.saldoData?' · Ref: '+b.saldoData:''}</div>
      </div>`).join('') + '</div>';
}

async function populateBancoSelects() {
  const bancos = loadBancos();
  const fBanco = document.getElementById('fBanco');
  if (fBanco) {
    const cur = fBanco.value;
    fBanco.innerHTML = '<option value="">— Nenhum —</option>' +
      bancos.map(b => `<option value="${b.id}">${b.icone||'🏦'} ${b.nome}</option>`).join('');
    if (cur) fBanco.value = cur;
  }
  const filtro = document.getElementById('filtroBanco');
  if (filtro) {
    filtro.innerHTML = '<option value="">Todos os bancos</option>' +
      bancos.map(b => `<option value="${b.id}">${b.icone||'🏦'} ${b.nome}</option>`).join('');
  }
  if (window.FSEL && document.getElementById('fsel-filtroBanco')) {
    const opts = bancos.map(b => ({ value: b.id, text: (b.icone||'🏦')+' '+b.nome }));
    FSEL.build('fsel-filtroBanco', 'filtroBanco', opts, function(){ renderAll(); });
  }
  const pBanco = document.getElementById('pBanco');
  if (pBanco) {
    const cur = pBanco.value;
    pBanco.innerHTML = '<option value="">— Selecione o banco —</option>' +
      bancos.map(b => `<option value="${b.id}">${b.icone||'🏦'} ${b.nome}</option>`).join('');
    if (cur) pBanco.value = cur;
  }
  const bBanco = document.getElementById('bulkBanco');
  if (bBanco) {
    const cur = bBanco.value;
    bBanco.innerHTML = '<option value="">— Alterar banco —</option>' +
      bancos.map(b => `<option value="${b.id}">${b.icone||'🏦'} ${b.nome}</option>`).join('');
    if (cur) bBanco.value = cur;
    if (window.SSEL) SSEL.build('bulkBanco');
  }
}

function calcSaldoBancoId(bancoId) {
  const bancos = loadBancos();
  const banco = bancos.find(b => b.id === bancoId);
  if (!banco) return 0;
  const si = banco.saldoInicial || 0;
  const todos = loadData();
  let rec = 0, desp = 0;
  todos.forEach(l => {
    if (l.banco !== bancoId) return;
    if (l.status !== 'pago') return;
    if (l.tipo === 'receita') rec  += (l.valor || 0);
    else                      desp += (l.valor || 0);
  });
  return si + rec - desp;
}

function renderBancoCards() {
  const bancos = loadBancos();
  const row = document.getElementById('bancosCardsRow');
  const bar = document.getElementById('bancoContextoBar');
  if (!row || !bar) return;
  if (!bancos.length) { bar.style.display='none'; return; }

  const ctx       = getBancoContexto();
  const consolIds = getBancosConsolidadoIds();
  const ctxVoltar = document.getElementById('bancoCtxVoltarBtn');
  const mob = window.innerWidth <= 768;
  const ctxModoEl = document.getElementById('bancoCtxModo');

  if (!ctx) {
    bar.style.background   = 'rgba(240,192,64,0.04)';
    bar.style.borderColor  = 'rgba(240,192,64,0.2)';
    if (ctxModoEl) { ctxModoEl.textContent = 'NENHUM SELECIONADO'; ctxModoEl.style.color = 'var(--muted)'; }
    if (ctxVoltar) ctxVoltar.style.display = 'none';
  } else if (ctx === 'consolidado') {
    bar.style.background   = 'rgba(74,240,160,0.04)';
    bar.style.borderColor  = 'rgba(74,240,160,0.2)';
    if (ctxModoEl) { ctxModoEl.textContent = 'CONSOLIDADO'; ctxModoEl.style.color = 'var(--accent2)'; }
    if (ctxVoltar) ctxVoltar.style.display = mob ? 'none' : 'block';
  } else {
    const ba = bancos.find(b => b.id === ctx);
    bar.style.background   = ba ? ba.cor + '10' : 'var(--surface2)';
    bar.style.borderColor  = ba ? ba.cor + '55' : 'var(--border)';
    if (ctxModoEl && ba) { ctxModoEl.textContent = ba.nome.toUpperCase(); ctxModoEl.style.color = ba.cor; }
    if (ctxVoltar) ctxVoltar.style.display = mob ? 'none' : 'block';
  }
  bar.style.display = mob ? 'none' : 'block';

  let html = '';
  for (const b of bancos) {
    const saldo    = calcSaldoBancoId(b.id);
    const corSaldo = saldo >= 0 ? 'var(--green)' : 'var(--red)';
    const isAtivo  = ctx === b.id;
    const inConsol = ctx === 'consolidado' && consolIds.includes(b.id);
    const dim      = (ctx && !isAtivo && !inConsol) ? 'opacity:0.3;filter:grayscale(0.8);' : '';
    const border   = isAtivo  ? `border:2px solid ${b.cor};box-shadow:0 0 10px ${b.cor}30`
                   : inConsol ? `border:1.5px solid ${b.cor}66`
                   :            `border:1px solid var(--border)`;
    const bg       = isAtivo  ? `background:${b.cor}12`
                   : inConsol ? `background:${b.cor}06`
                   :            `background:var(--surface2)`;
    const logo     = _getBancoLogo(b);
    const logoHtml = logo
      ? `<img src="${logo}" onerror="this.style.display='none';this.nextSibling.style.display='inline'"
           style="width:26px;height:26px;border-radius:6px;object-fit:contain;flex-shrink:0;display:block;background:transparent">
         <span style="display:none;font-size:1.1rem">${b.icone||'🏦'}</span>`
      : `<span style="font-size:1.1rem">${b.icone||'🏦'}</span>`;

    const isMobCard = window.innerWidth <= 768;
    if (isMobCard) {
      html += `
      <div onclick="setBancoContexto(${isAtivo ? 'null' : `'${b.id}'`})"
        style="${dim}${border};${bg};border-radius:20px;padding:5px 10px 5px 6px;cursor:pointer;
               display:inline-flex;align-items:center;gap:6px;flex-shrink:0;
               transition:all .18s;white-space:nowrap">
        ${logo
          ? `<img src="${logo}" onerror="this.style.display='none'" style="width:20px;height:20px;border-radius:50%;object-fit:contain;flex-shrink:0">`
          : `<span style="font-size:0.9rem">${b.icone||'🏦'}</span>`}
        <span style="font-size:0.7rem;font-weight:700;color:${b.cor}">${b.nome}</span>
        <span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:700;color:${corSaldo}">${fmt(saldo)}</span>
        ${isAtivo ? `<span style="width:6px;height:6px;border-radius:50%;background:${b.cor};flex-shrink:0"></span>` : ''}
      </div>`;
    } else {
      html += `
      <div onclick="setBancoContexto(${isAtivo ? 'null' : `'${b.id}'`})"
        style="${dim}${border};${bg};border-radius:9px;padding:7px 12px;cursor:pointer;
               display:flex;align-items:center;gap:9px;min-width:0;
               transition:all .18s;flex-shrink:0">
        ${logoHtml}
        <div style="display:flex;flex-direction:column;min-width:0">
          <span style="font-size:0.62rem;font-weight:700;color:${b.cor};letter-spacing:.04em;white-space:nowrap">
            ${b.nome}${isAtivo ? ` <span style="font-size:0.55rem;background:${b.cor}22;padding:1px 4px;border-radius:3px">●</span>` : ''}
          </span>
          <span style="font-family:'Space Mono',monospace;font-size:0.88rem;font-weight:700;color:${corSaldo};margin-top:1px">
            ${fmt(saldo)}
          </span>
          <span style="font-size:0.55rem;color:${isAtivo ? b.cor : inConsol ? 'var(--accent2)' : 'var(--muted)'};margin-top:1px">
            ${isAtivo ? '← deselecionar' : inConsol ? '✓ consolidado' : 'clique p/ ver'}
          </span>
        </div>
      </div>`;
    }
  }

  row.innerHTML = html;

  const lbl2 = document.getElementById('bancosCardsLabel2');
  if (lbl2) lbl2.style.display = 'none';

  const sm      = document.getElementById('bancoStickyOtherTabs');
  const smModo  = document.getElementById('bancoCtxModo2');
  const smBar   = document.getElementById('bancoCtxBarSmall');
  const smVoltar2 = document.getElementById('bancoCtxVoltarBtn2');
  const smBancos  = document.getElementById('bancoCtxBancos2');
  if (sm && smModo) {
    if (!ctx) {
      smModo.textContent = 'NENHUM BANCO'; smModo.style.color = 'var(--accent)';
      if (smBancos) smBancos.innerHTML = '<span style="font-size:0.7rem;color:var(--muted)">Clique em um banco para selecionar</span>';
      if (smVoltar2) smVoltar2.style.display = 'none';
      if (smBar) { smBar.style.background='rgba(240,192,64,0.04)'; smBar.style.borderColor='rgba(240,192,64,0.2)'; }
    } else if (ctx === 'consolidado') {
      const selB = bancos.filter(b => consolIds.includes(b.id));
      smModo.textContent = 'CONSOLIDADO'; smModo.style.color = 'var(--accent2)';
      if (smBancos) smBancos.innerHTML = selB.map((b,i)=>(i>0?'<span style="color:var(--muted);margin:0 3px">+</span>':'')+`<span style="font-size:0.75rem;color:${b.cor};font-weight:700">${b.icone||'🏦'} ${b.nome}</span>`).join('');
      if (smVoltar2) { smVoltar2.style.display='block'; smVoltar2.textContent='← Todos'; }
      if (smBar) { smBar.style.background='rgba(74,240,160,0.04)'; smBar.style.borderColor='rgba(74,240,160,0.2)'; }
    } else {
      const ba = bancos.find(b=>b.id===ctx);
      smModo.textContent = ba ? ba.nome.toUpperCase() : 'BANCO INDIVIDUAL'; smModo.style.color = ba ? ba.cor : 'var(--blue)';
      if (smBancos && ba) smBancos.innerHTML = `<span style="font-size:0.72rem;color:${ba.cor};font-weight:700">${ba.icone||'🏦'} BANCO INDIVIDUAL</span>`;
      if (smVoltar2) { smVoltar2.style.display='block'; smVoltar2.textContent='← Todos'; }
      if (smBar && ba) { smBar.style.background=ba.cor+'08'; smBar.style.borderColor=ba.cor+'44'; }
    }
  }

  ['bancoIndepActiveBanner','bancoContextoHeader'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });

  // ── Sincroniza select compacto do header ──
  const headerSel = document.getElementById('bancosHeaderSelect');
  if (headerSel) {
    // Reconstrói opções: bancos individuais + Consolidado (sem "Todos os bancos")
    let selHtml = '';
    for (const b of bancos) {
      const logo = b.icone || '🏦';
      selHtml += `<option value="${b.id}">${logo} ${b.nome}</option>`;
    }
    if (bancos.length > 1) {
      selHtml += '<option value="consolidado">🔗 Consolidado</option>';
    }
    headerSel.innerHTML = selHtml;
    // Sincroniza valor selecionado com contexto atual
    // Se nenhum banco selecionado (ctx=null), seleciona o primeiro banco disponível
    if (ctx) {
      headerSel.value = ctx;
    } else if (bancos.length > 0) {
      headerSel.value = bancos[0].id;
      // Aplica o contexto do primeiro banco silenciosamente
      localStorage.setItem('mf_banco_ctx', bancos[0].id);
    }
    // Destaca visualmente o banco ativo
    const activeCtx = ctx || (bancos.length > 0 ? bancos[0].id : null);
    if (activeCtx) {
      const ba = bancos.find(b => b.id === activeCtx);
      headerSel.style.borderColor = ba ? ba.cor + '88' : 'rgba(74,240,160,0.5)';
      headerSel.style.color = ba ? ba.cor : 'var(--accent2)';
    } else {
      headerSel.style.borderColor = '';
      headerSel.style.color = '';
    }
  }
}