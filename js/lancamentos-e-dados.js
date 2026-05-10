// ======== TERCEIROS ========
const CAT_TERC_SET = new Set(['Entrada Terceiro','Dividas de terceiros']);

// Ajusta padding-top para compensar header fixo no mobile (iOS)
(function _fixMobileHeader() {
  function _adjust() {
    var h = document.querySelector('header');
    var isMobile = window.matchMedia("(max-width:768px)").matches;
    if (h && isMobile) {
      var height = h.offsetHeight;
      if (height < 50) return; // medição prematura — header ainda não renderizou
      // Atualiza AMBAS as variáveis CSS usadas por padding e sticky shell
      document.documentElement.style.setProperty('--mobile-header-height', height + 'px');
      document.documentElement.style.setProperty('--header-h', height + 'px');
      document.body.style.paddingTop = height + 'px';
      console.log('[fixMobileHeader] altura:', height + 'px');
    } else if (!isMobile) {
      document.body.style.paddingTop = '';
    }
  }
  // Dispara em múltiplos momentos para garantir medição correta
  document.addEventListener('DOMContentLoaded', _adjust);  // logo que o DOM carrega
  window.addEventListener('load', _adjust);                // após todos os recursos
  window.addEventListener('resize', _adjust);              // ao redimensionar
  setTimeout(_adjust, 100);   // muito cedo (fallback rápido)
  setTimeout(_adjust, 400);   // após reflow inicial
  setTimeout(_adjust, 900);   // após fontes e dados carregarem
  setTimeout(_adjust, 2000);  // garantia final
})();

// Handler global único para excluir sequência em terceiros (evita listeners acumulados)
window._tercDelGrp = function(btn, e) {
  if (e) e.stopPropagation();
  var gid = btn.getAttribute('data-gid');
  var sid = btn.getAttribute('data-sid');
  if (gid && sid && typeof deleteGroup === 'function') deleteGroup(gid, sid, e);
};


// ── Proteção de pagamentos customizados ─────────────────────────────
// Sobrescreve loadPagamentos/savePagamentos para usar localStorage como
// cache primário — garante que cartões não somam após deploy/reload
(function _protectPagamentos() {
  var _LS_KEY_PREFIX = 'mf_cache_pagamentos_';

  function _lsGet() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.startsWith(_LS_KEY_PREFIX)) {
          var v = localStorage.getItem(k);
          if (v) { var p = JSON.parse(v); if (p && p.length > 0) return { key: k, data: p }; }
        }
      }
    } catch(e) {}
    return null;
  }

  function _lsSet(key, data) {
    try { if (key) localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
  }

  // Aguarda o sistema carregar e então instala a proteção
  function _install() {
    var _origLoad = window.loadPagamentos;
    var _origSave = window.savePagamentos;
    if (!_origLoad || !_origSave) return; // ainda não carregou

    window.loadPagamentos = function() {
      var fromOrig = _origLoad();
      // Se retornou PAG_DEFAULT (6 itens padrão sem cartão customizado),
      // tenta recuperar do localStorage
      if (fromOrig && fromOrig.length > 0) {
        var hasCustom = fromOrig.some(function(p) { return p.id && !p.id.startsWith('pag_'); });
        if (hasCustom) return fromOrig; // tem customizados, está ok
      }
      var ls = _lsGet();
      if (ls) {
        var hasCustomLS = ls.data.some(function(p) { return p.id && !p.id.startsWith('pag_'); });
        if (hasCustomLS) {
          // Restaura no memCache via savePagamentos original
          try { if (window._memCache) window._memCache.pagamentos = ls.data; } catch(e) {}
          return ls.data;
        }
      }
      return fromOrig;
    };

    window.savePagamentos = function(data) {
      // Salva no localStorage usando a chave existente ou cria uma nova
      var ls = _lsGet();
      var key = ls ? ls.key : _LS_KEY_PREFIX + 'default';
      try {
        // Tenta usar _cacheKey do db.js se disponível
        if (typeof _cacheKey === 'function') key = _cacheKey('pagamentos');
      } catch(e) {}
      _lsSet(key, data);
      _origSave(data);
    };

    console.log('[MR] Proteção de pagamentos instalada');
  }

  // Instala imediatamente; re-instala uma vez após o login carregar os dados
  _install();
  setTimeout(_install, 1200);
})();
// ── Fim proteção de pagamentos ───────────────────────────────────────

function renderTerceiroList() {
  const el = document.getElementById('terceiroList');
  if (!el) return;
  const list = loadTerceiros();
  if (!list.length) { el.innerHTML = '<div class="empty-state">Nenhum terceiro cadastrado.</div>'; return; }
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;padding:4px 0">' +
    list.map(t => {
      const cor = t.tipo==='devedor'?'#4af0a0':t.tipo==='credor'?'#f05060':'#f0c040';
      const label = t.tipo==='devedor'?'Me deve':t.tipo==='credor'?'Devo a ele':'Ambos';
      return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="min-width:0">
          <div style="font-weight:600;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">👤 ${t.nome}</div>
          <div style="font-size:0.62rem;margin-top:2px;color:${cor}">${label}</div>
          ${t.obs?`<div style="font-size:0.6rem;color:var(--muted);margin-top:1px">${t.obs}</div>`:''}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button onclick="editTerceiroModal('${t.id}')" style="background:none;border:1px solid var(--border);border-radius:5px;color:var(--text2);padding:3px 7px;cursor:pointer;font-size:0.7rem">✎</button>
          <button onclick="deleteTerceiro('${t.id}')" style="background:none;border:1px solid rgba(220,38,38,0.4);border-radius:5px;color:#dc2626;padding:3px 7px;cursor:pointer;font-size:0.7rem">✕</button>
        </div>
      </div>`;
    }).join('') + '</div>';
}

function populateTerceiroSelects() {
  const list = loadTerceiros();
  const opts = '<option value="">— Selecione —</option>' +
    list.map(t => `<option value="${t.nome}">👤 ${t.nome}</option>`).join('');
  const fTerc = document.getElementById('fTerceiro');
  if (fTerc) { const c = fTerc.value; fTerc.innerHTML = opts; fTerc.value = c; }
}

function openTerceiroModal() {
  document.getElementById('terceiroEditId').value = '';
  document.getElementById('terceiroNome').value = '';
  document.getElementById('terceiroTipo').value = 'ambos';
  document.getElementById('terceiroObs').value = '';
  document.getElementById('terceiroModalTitle').textContent = 'Novo Terceiro';
  document.getElementById('terceiroModalOverlay').classList.add('open');
}

async function editTerceiroModal(id) {
  const t = (loadTerceiros()).find(x => x.id === id);
  if (!t) return;
  document.getElementById('terceiroEditId').value = t.id;
  document.getElementById('terceiroNome').value = t.nome;
  document.getElementById('terceiroTipo').value = t.tipo || 'ambos';
  document.getElementById('terceiroObs').value = t.obs || '';
  document.getElementById('terceiroModalTitle').textContent = 'Editar Terceiro';
  document.getElementById('terceiroModalOverlay').classList.add('open');
}

function closeTerceiroModal() {
  document.getElementById('terceiroModalOverlay').classList.remove('open');
}

async function saveTerceiroModal() {
  const nome = document.getElementById('terceiroNome').value.trim();
  if (!nome) { alert('Informe o nome.'); return; }
  const list = loadTerceiros();
  const editId = document.getElementById('terceiroEditId').value;
  const entry = {
    id:   editId || 'terc_' + Date.now(),
    nome,
    tipo: document.getElementById('terceiroTipo').value,
    obs:  document.getElementById('terceiroObs').value.trim(),
  };
  if (editId) { const i = list.findIndex(x => x.id === editId); if (i>=0) list[i] = entry; }
  else list.push(entry);
  saveTerceiros(list);
  closeTerceiroModal();
  renderTerceiroList();
  populateTerceiroSelects();
}

async function deleteTerceiro(id) {
  if (!await _showSimpleConfirm('🗑 Excluir terceiro', 'Excluir este terceiro?', 'Excluir', 'var(--red)')) return;
  saveTerceiros((loadTerceiros()).filter(x => x.id !== id));
  renderTerceiroList();
  populateTerceiroSelects();
}

function onCatChangeTerceiro() {
  const cat = document.getElementById('fCategoria').value;
  const row = document.getElementById('fTerceiroRow');
  const alerta = document.getElementById('alertaTerceiroCat');
  const alertaTexto = document.getElementById('alertaTerceiroTexto');
  const fTerc = document.getElementById('fTerceiro');
  const isTercCat = (typeof _CATS_TERCEIRO !== 'undefined' && _CATS_TERCEIRO.has(cat)) || CAT_TERC_SET.has(cat);
  if (row) row.style.display = isTercCat ? 'block' : 'none';
  if (fTerc) fTerc.required = isTercCat;
  if (!isTercCat && fTerc) fTerc.value = '';
  if (alerta) {
    if (isTercCat) {
      let msg = '';
      if (cat === 'Entrada Terceiro') {
        msg = `<strong style="color:#4ade80">Entrada de terceiro</strong>: registra um valor que alguém te deve. <strong style="color:var(--text)">Não entra no saldo bancário</strong> — controle paralelo, visível na aba Terceiros.`;
      } else {
        msg = `<strong style="color:#f87171">Dívida de terceiro</strong>: registra um valor que você emprestou. <strong style="color:var(--text)">Não deduz do saldo bancário</strong> — controle paralelo, visível na aba Terceiros.`;
      }
      if (alertaTexto) alertaTexto.innerHTML = msg;
      alerta.style.display = 'block';
    } else {
      alerta.style.display = 'none';
    }
  }
}

var tercSortCol = 'vencimento', tercSortDir = -1;
function setTercSort(col) {
  if (tercSortCol === col) tercSortDir *= -1;
  else { tercSortCol = col; tercSortDir = col === 'valor' ? -1 : 1; }
  document.querySelectorAll('#tab-terceiros thead th.sortable').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    const c = (th.getAttribute('onclick')||'').replace("setTercSort('","").replace("')","");
    if (c === tercSortCol) th.classList.add(tercSortDir===1?'sort-asc':'sort-desc');
  });
  renderTerceirosTab();
}

function renderTerceirosTab() {
  const COLORS_ENT = ['#22c55e','#4ade80','#86efac','#16a34a','#15803d'];
  const COLORS_DIV = ['#ef4444','#f87171','#fca5a5','#dc2626','#b91c1c'];
  const COLORS_MIX = ['#60a5fa','#34d399','#fbbf24','#a78bfa','#f472b6','#38bdf8'];

  // Card filter takes priority over FSEL filters
  const _cf = window._tercCardFilter;

  const nomeF    = _cf ? [_cf.nome] : (window.FSEL ? FSEL.getValues('filtroTerceiroNome')   : []);
  const tipoF    = _cf ? (_cf.tipo && _cf.tipo !== 'todos' ? [_cf.tipo] : []) : (window.FSEL ? FSEL.getValues('filtroTerceiroTipo')   : []);
  const statusF  = window.FSEL ? FSEL.getValues('filtroTerceiroStatus') : [];
  const subCatF  = window.FSEL ? FSEL.getValues('filtroTerceiroSubCat') : [];
  const pagF     = window.FSEL ? FSEL.getValues('filtroTerceiroPag')    : [];
  const bancoF   = window.FSEL ? FSEL.getValues('filtroTerceiroBanco')  : [];
  const descF    = (document.getElementById('filtroTerceiroDesc')?.value || '').toLowerCase();

  const all = loadDataBanco().filter(l => {
    if (!CAT_TERC_SET.has(l.categoria)) return false;
    return _inRange(l);
  });

  // Populate filtroTerceiroNome from actual lancamentos (not from cadastro)
  const nomeSelT = document.getElementById('filtroTerceiroNome');
  if (nomeSelT) {
    const prevNome = window.FSEL ? FSEL.getValues('filtroTerceiroNome') : [];
    nomeSelT.innerHTML = '<option value="">Todos os terceiros</option>';
    [...new Set(all.map(l => l.terceiro).filter(Boolean))].sort().forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = '👤 ' + n;
      nomeSelT.appendChild(o);
    });
    if (window.FSEL) _fselRebuild('filtroTerceiroNome');
  }

  // Populate new filters once
  const subCatSelT = document.getElementById('filtroTerceiroSubCat');
  if (subCatSelT) {
    subCatSelT.innerHTML = '<option value="">— Todas as sub-cat. —</option>';
    [...new Set(all.map(l=>l.subCategoria).filter(Boolean))].sort().forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;subCatSelT.appendChild(o);});
    if(window.FSEL) _fselRebuild('filtroTerceiroSubCat');
  }
  const pagSelT = document.getElementById('filtroTerceiroPag');
  if (pagSelT) {
    pagSelT.innerHTML = '<option value="">— Todos os pagamentos —</option>';
    [...new Set(all.map(l=>l.pagamento).filter(Boolean))].sort().forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;pagSelT.appendChild(o);});
    if(window.FSEL) _fselRebuild('filtroTerceiroPag');
  }
  const bancSelT = document.getElementById('filtroTerceiroBanco');
  if (bancSelT) {
    bancSelT.innerHTML = '<option value="">— Todos os bancos —</option>';
    loadBancos().forEach(b=>{const o=document.createElement('option');o.value=b.id;o.textContent=(b.icone||'🏦')+' '+b.nome;bancSelT.appendChild(o);});
    if(window.FSEL) _fselRebuild('filtroTerceiroBanco');
  }

  // ── Cards de Resumo ──
  const resumoEl = document.getElementById('tercResumoCards');
  if (resumoEl) {
    const todosTerc = loadDataBanco().filter(l => CAT_TERC_SET.has(l.categoria) && _inRange(l));
    const totalEnt  = todosTerc.filter(l=>l.categoria==='Entrada Terceiro').reduce((s,l)=>s+_valorExib(l),0);
    const totalDiv  = todosTerc.filter(l=>l.categoria==='Dividas de terceiros').reduce((s,l)=>s+_valorExib(l),0);
    const saldoTerc = totalEnt - totalDiv;
    const pendEnt   = todosTerc.filter(l=>l.categoria==='Entrada Terceiro'&&l.status==='pendente').reduce((s,l)=>s+_valorExib(l),0);
    const pendDiv   = todosTerc.filter(l=>l.categoria==='Dividas de terceiros'&&l.status==='pendente').reduce((s,l)=>s+_valorExib(l),0);
    resumoEl.innerHTML = `
      <div class="card sm" style="border-top:3px solid #f59e0b;border-color:rgba(245,158,11,0.35)">
        <div class="card-header"><span class="card-label" style="color:#f59e0b">↑ Entrada Terceiro</span><span style="font-size:1rem">🤝</span></div>
        <div class="card-value" style="color:#f59e0b">${fmt(totalEnt)}</div>
        <div class="card-footer"><span class="card-sub">${todosTerc.filter(l=>l.categoria==='Entrada Terceiro').length} entradas</span><span class="card-sub" style="color:var(--muted)">fora orç.</span></div>
      </div>
      <div class="card sm" style="border-top:3px solid #f59e0b;border-color:rgba(245,158,11,0.35)">
        <div class="card-header"><span class="card-label" style="color:#f59e0b">↓ Dívidas Terceiros</span><span style="font-size:1rem">🗑️</span></div>
        <div class="card-value" style="color:#f59e0b">${fmt(totalDiv)}</div>
        <div class="card-footer"><span class="card-sub">${todosTerc.filter(l=>l.categoria==='Dividas de terceiros').length} saídas</span><span class="card-sub" style="color:var(--muted)">fora orç.</span></div>
      </div>
      <div class="card sm" style="border-top:3px solid ${saldoTerc>=0?'#22c55e':'#ef4444'};border-color:${saldoTerc>=0?'rgba(34,197,94,0.35)':'rgba(239,68,68,0.35)'}">
        <div class="card-header"><span class="card-label" style="color:${saldoTerc>=0?'#22c55e':'#ef4444'}">⇌ Saldo Terceiros</span><span style="font-size:1rem">⚖️</span></div>
        <div class="card-value" style="color:${saldoTerc>=0?'var(--green)':'var(--red)'}">${saldoTerc>=0?'+':''}${fmt(saldoTerc)}</div>
        <div class="card-footer"><span class="card-sub">Ent − Dív</span></div>
      </div>`;
  }

  // ── Evolução Mensal (barras agrupadas) ──
  (function() {
    const el = document.getElementById('tercEvolucaoChart');
    if (!el) return;
    const allData = loadDataBanco().filter(l => CAT_TERC_SET.has(l.categoria));
    const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const months = [];
    let m = currentMonth, y = currentYear;
    for (let i = 5; i >= 0; i--) {
      let mm = m - i; let yy = y;
      if (mm <= 0) { mm += 12; yy--; }
      const mes = allData.filter(l => Number(l.mes)===mm && Number(l.ano)===yy);
      months.push({
        label: MESES[mm-1]+'/'+String(yy).slice(2),
        ent: mes.filter(l=>l.categoria==='Entrada Terceiro').reduce((s,l)=>s+_valorExib(l),0),
        div: mes.filter(l=>l.categoria==='Dividas de terceiros').reduce((s,l)=>s+_valorExib(l),0)
      });
    }
    const maxVal = Math.max(...months.flatMap(m=>[m.ent,m.div]), 1);
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;align-items:end;height:140px;padding:0 4px">` +
      months.map(m => {
        const hEnt = Math.round(m.ent/maxVal*110);
        const hDiv = Math.round(m.div/maxVal*110);
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="display:flex;align-items:flex-end;gap:2px;height:120px">
            <div title="Entradas: ${fmt(m.ent)}" style="width:14px;height:${hEnt}px;background:rgba(34,197,94,0.75);border-radius:2px 2px 0 0;min-height:2px;cursor:default"></div>
            <div title="Dívidas: ${fmt(m.div)}" style="width:14px;height:${hDiv}px;background:rgba(239,68,68,0.75);border-radius:2px 2px 0 0;min-height:2px;cursor:default"></div>
          </div>
          <div style="font-size:0.55rem;color:var(--muted);text-align:center;white-space:nowrap">${m.label}</div>
        </div>`;
      }).join('') +
    `</div>
    <div style="display:flex;gap:12px;justify-content:center;margin-top:6px;font-size:0.62rem">
      <span style="color:#22c55e">▮ Entradas</span>
      <span style="color:#ef4444">▮ Dívidas</span>
    </div>`; 
  })();

  // ── Barras Saldo por Terceiro ──
  (function() {
    const el = document.getElementById('tercSaldoBars');
    const lbl = document.getElementById('tercSaldoLabel');
    if (!el) return;
    const allData = loadDataBanco().filter(l => CAT_TERC_SET.has(l.categoria) && _inRange(l));
    const byT = {};
    allData.forEach(l => {
      if (!l.terceiro) return;
      if (!byT[l.terceiro]) byT[l.terceiro] = { ent: 0, div: 0 };
      if (l.categoria==='Entrada Terceiro') byT[l.terceiro].ent += _valorExib(l);
      else byT[l.terceiro].div += _valorExib(l);
    });
    const entries = Object.entries(byT).map(([nome,v])=>({ nome, saldo: v.ent-v.div, ent: v.ent, div: v.div }))
      .sort((a,b)=>b.saldo-a.saldo);
    if (!entries.length) { el.innerHTML='<div class="empty-state">Nenhum lançamento.</div>'; return; }
    const maxAbs = Math.max(...entries.map(e=>Math.abs(e.saldo)));
    if (lbl) lbl.textContent = `${entries.length} terceiro${entries.length>1?'s':''}`;
    el.innerHTML = entries.map(e => {
      const pct = maxAbs ? Math.round(Math.abs(e.saldo)/maxAbs*100) : 0;
      const cor = e.saldo>=0?'#22c55e':'#ef4444';
      return `<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:0.72rem;margin-bottom:3px">
          <span style="color:var(--text);font-weight:600">👤 ${e.nome}</span>
          <span style="color:${cor};font-weight:700;font-family:'Space Mono',monospace">${e.saldo>=0?'+':''}${fmt(e.saldo)}</span>
        </div>
        <div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${cor};border-radius:3px;transition:width .3s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--muted);margin-top:2px">
          <span>↑ ${fmt(e.ent)}</span><span>↓ ${fmt(e.div)}</span>
        </div>
      </div>`;
    }).join('');
  })();

  let filtered = all.filter(l => {
    if (nomeF.length   && !nomeF.includes(l.terceiro||'')) return false;
    if (tipoF.length && !tipoF.includes('')) {
      const wantEnt = tipoF.includes('entrada');
      const wantDiv = tipoF.includes('divida');
      if (wantEnt && !wantDiv && l.categoria !== 'Entrada Terceiro') return false;
      if (wantDiv && !wantEnt && l.categoria !== 'Dividas de terceiros') return false;
    }
    if (statusF.length && !statusF.includes(l.status)) return false;
    if (subCatF.length && !subCatF.includes(l.subCategoria||'')) return false;
    if (pagF.length    && !pagF.includes(l.pagamento||'')) return false;
    if (bancoF.length  && !bancoF.includes(l.banco||'')) return false;
    if (descF && !((l.desc||'')+(l.terceiro||'')+(l.pagamento||'')).toLowerCase().includes(descF)) return false;
    return true;
  });

  // Reset bulk bar on re-render
  const _bar = document.getElementById('tercBulkBar');
  if (_bar) _bar.style.display = 'none';
  const _ca = document.getElementById('tercCheckAll');
  if (_ca) { _ca.checked = false; _ca.indeterminate = false; }
  const _sel = document.getElementById('tercBulkTerceiroSelect');
  if (_sel) { _sel.innerHTML = '<option value="">— Selecione —</option>'; }

  // ── Cards por terceiro — apenas mês filtrado ──
  const cardsEl = document.getElementById('terceirosCards');
  const inadimplEl = document.getElementById('tercInadimplencia');
  if (cardsEl) {
    const terceiros = loadTerceiros();
    const byTerc = {}; // dados do mês filtrado

    // Só lançamentos do mês filtrado — checa l.mes/l.ano e também deriva da data como fallback
    const _inMesFiltrado = l => _inRange(l);
    all.filter(l => l.terceiro && _inMesFiltrado(l)).forEach(l => {
      const k = l.terceiro;
      if (!byTerc[k]) byTerc[k] = { ent:0, div:0, pendEnt:0, pendDiv:0, pagoEnt:0, pagoDiv:0 };
      if (l.categoria === 'Entrada Terceiro') {
        byTerc[k].ent += _valorExib(l);
        if (l.status === 'pendente') byTerc[k].pendEnt += _valorExib(l);
        else byTerc[k].pagoEnt += _valorExib(l);
      } else {
        byTerc[k].div += _valorExib(l);
        if (l.status === 'pendente') byTerc[k].pendDiv += _valorExib(l);
        else byTerc[k].pagoDiv += _valorExib(l);
      }
    });

    const entries = Object.entries(byTerc)
      .sort((a,b) => (b[1].ent - b[1].div) - (a[1].ent - a[1].div));

    if (!entries.length) {
      cardsEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:12px">Nenhum lançamento de terceiros neste mês.</div>';
    } else {
      cardsEl.innerHTML = entries.map(([nome, v]) => {
        const saldo = v.ent - v.div;
        const positivo = saldo >= 0;
        const borderC = positivo ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)';
        const topC    = positivo ? '#22c55e' : '#ef4444';
        const saldoC  = positivo ? 'var(--green)' : 'var(--red)';
        const terc    = terceiros.find(t => t.nome === nome);
        const tipoLabel = terc ? (terc.tipo==='devedor'?'Me deve':terc.tipo==='credor'?'Devo a ele':'Ambos') : '';
        const tipoC   = terc?.tipo==='devedor'?'#22c55e':terc?.tipo==='credor'?'#ef4444':'#94a3b8';
        const cardId = 'terc-card-' + nome.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
        const isActive = window._tercCardFilter && window._tercCardFilter.nome === nome;
        const activeTipo = isActive ? (window._tercCardFilter.tipo || 'todos') : 'todos';
        const activeGlow = isActive ? `box-shadow:0 0 0 2px ${topC},0 4px 16px rgba(0,0,0,0.3);` : '';
        return `<div id="${cardId}" style="background:var(--surface);border:1px solid ${isActive ? topC : borderC};border-top:3px solid ${topC};border-radius:8px;padding:10px 12px;cursor:pointer;transition:border-color 150ms,box-shadow 150ms;${activeGlow}" onclick="_tercCardClick('${nome.replace(/'/g,"\\'")}')">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:0.72rem;font-weight:700;color:var(--text)">👤 ${nome}</span>
            ${tipoLabel?`<span style="font-size:0.58rem;color:${tipoC};background:rgba(0,0,0,0.2);padding:1px 6px;border-radius:10px">${tipoLabel}</span>`:''}
          </div>
          <div style="font-family:var(--font-mono);font-size:0.95rem;font-weight:700;color:${saldoC};margin-bottom:6px">${positivo?'+':'-'}${fmt(Math.abs(saldo))}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">
            ${v.ent>0?`<div style="background:rgba(34,197,94,0.08);border-radius:5px;padding:4px 6px">
              <div style="font-size:0.52rem;color:#22c55e;margin-bottom:2px;letter-spacing:.04em">ENTRADAS</div>
              <div style="font-size:0.68rem;font-weight:700;color:var(--green);font-family:var(--font-mono)">${fmt(v.ent)}</div>
              ${v.pagoEnt>0?`<div style="font-size:0.55rem;color:var(--muted)">✓ pago ${fmt(v.pagoEnt)}</div>`:''}
              ${v.pendEnt>0?`<div style="font-size:0.55rem;color:#f59e0b">⏳ pend. ${fmt(v.pendEnt)}</div>`:''}
            </div>`:'<div></div>'}
            ${v.div>0?`<div style="background:rgba(239,68,68,0.08);border-radius:5px;padding:4px 6px">
              <div style="font-size:0.52rem;color:#ef4444;margin-bottom:2px;letter-spacing:.04em">DÍVIDAS</div>
              <div style="font-size:0.68rem;font-weight:700;color:var(--red);font-family:var(--font-mono)">${fmt(v.div)}</div>
              ${v.pagoDiv>0?`<div style="font-size:0.55rem;color:var(--muted)">✓ pago ${fmt(v.pagoDiv)}</div>`:''}
              ${v.pendDiv>0?`<div style="font-size:0.55rem;color:#f59e0b">⏳ pend. ${fmt(v.pendDiv)}</div>`:''}
            </div>`:'<div></div>'}
          </div>
          ${isActive ? `<div style="display:flex;gap:4px;border-top:1px solid var(--border);padding-top:7px" onclick="event.stopPropagation()">
            <button onclick="_tercCardTipo('${nome.replace(/'/g,"\\'")}','todos')" style="flex:1;padding:3px 0;border-radius:5px;border:1px solid ${activeTipo==='todos'?topC:'var(--border)'};background:${activeTipo==='todos'?topC+'22':'transparent'};color:${activeTipo==='todos'?topC:'var(--text2)'};font-size:0.6rem;font-weight:700;cursor:pointer;font-family:var(--font)">Todos</button>
            <button onclick="_tercCardTipo('${nome.replace(/'/g,"\\'")}','entrada')" style="flex:1;padding:3px 0;border-radius:5px;border:1px solid ${activeTipo==='entrada'?'#22c55e':'var(--border)'};background:${activeTipo==='entrada'?'rgba(34,197,94,0.15)':'transparent'};color:${activeTipo==='entrada'?'#22c55e':'var(--text2)'};font-size:0.6rem;font-weight:700;cursor:pointer;font-family:var(--font)">Receita</button>
            <button onclick="_tercCardTipo('${nome.replace(/'/g,"\\'")}','divida')" style="flex:1;padding:3px 0;border-radius:5px;border:1px solid ${activeTipo==='divida'?'#ef4444':'var(--border)'};background:${activeTipo==='divida'?'rgba(239,68,68,0.15)':'transparent'};color:${activeTipo==='divida'?'#ef4444':'var(--text2)'};font-size:0.6rem;font-weight:700;cursor:pointer;font-family:var(--font)">Despesa</button>
          </div>` : `<div style="font-size:0.58rem;color:var(--muted);text-align:center;opacity:0.6">clique para filtrar</div>`}
          ${terc?.obs?`<div style="font-size:0.6rem;color:var(--muted);margin-top:5px;font-style:italic">${terc.obs}</div>`:''}
        </div>`;
      }).join('');
    }

    // ── Tabela de Inadimplência — pendentes cujo mês de referência já passou ──
    if (inadimplEl) {
      const inadimpl = {};
      const _hoje = new Date();
      const _mesHoje = _hoje.getFullYear() * 100 + (_hoje.getMonth() + 1);

      loadDataBanco()
        .filter(l => l.terceiro && l.status === 'pendente' && CAT_TERC_SET.has(l.categoria))
        .filter(l => {
          // Usa vencimento como referência; fallback para mês/ano do lançamento
          let mesRef;
          if (l.vencimento) {
            const parts = l.vencimento.split('/');
            mesRef = parseInt(parts[2], 10) * 100 + parseInt(parts[1], 10);
          } else {
            mesRef = Number(l.ano) * 100 + Number(l.mes);
          }
          return mesRef > 0 && mesRef < _mesHoje;
        })
        .forEach(l => {
          const k = l.terceiro;
          if (!inadimpl[k]) inadimpl[k] = [];
          inadimpl[k].push(l);
        });

      const rows = Object.entries(inadimpl).sort((a,b) => a[0].localeCompare(b[0], 'pt-BR'));

      if (!rows.length) {
        inadimplEl.innerHTML = '';
        const hdr = document.getElementById('tercInadimplenciaPanel');
        if (hdr) hdr.style.display = 'none';
      } else {
        const hdr = document.getElementById('tercInadimplenciaPanel');
        if (hdr) hdr.style.display = '';
        const totalPend = rows.reduce((s,[,ls])=>s+ls.reduce((ss,l)=>ss+_valorExib(l),0),0);
        inadimplEl.innerHTML = `
          <table style="width:100%;border-collapse:collapse;font-size:0.78rem">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                <th style="text-align:left;padding:6px 8px;color:var(--muted);font-weight:600;font-size:0.7rem">TERCEIRO</th>
                <th style="text-align:left;padding:6px 8px;color:var(--muted);font-weight:600;font-size:0.7rem">REFERÊNCIA</th>
                <th style="text-align:left;padding:6px 8px;color:var(--muted);font-weight:600;font-size:0.7rem">DESCRIÇÃO</th>
              <th style="text-align:center;padding:9px 8px;font-size:0.7rem;color:var(--muted);font-weight:600;white-space:nowrap">PARC.</th>
                <th style="text-align:left;padding:6px 8px;color:var(--muted);font-weight:600;font-size:0.7rem">TIPO</th>
                <th style="text-align:right;padding:6px 8px;color:var(--muted);font-weight:600;font-size:0.7rem">VALOR</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(([nome, ls]) => {
                const totalTerc = ls.reduce((s,l)=>s+_valorExib(l),0);
                const isEnt = ls[0].categoria === 'Entrada Terceiro';
                const cor = isEnt ? '#22c55e' : '#ef4444';
                return ls.map((l, i) => {
                  // Usa vencimento como referência; fallback para mês/ano do lançamento
                  let ref;
                  if (l.vencimento) {
                    const parts = l.vencimento.split('/');
                    const vMes = parseInt(parts[1], 10);
                    const vAno = parseInt(parts[2], 10);
                    const mesNomeV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][vMes-1];
                    ref = `${mesNomeV}/${vAno}`;
                  } else {
                    const mesNome = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][l.mes-1];
                    ref = `${mesNome}/${l.ano}`;
                  }
                  const tipoLabel = l.categoria === 'Entrada Terceiro' ? '↑ A receber' : '↓ A pagar';
                  const corTipo  = l.categoria === 'Entrada Terceiro' ? '#22c55e' : '#ef4444';
                  return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);${i===0?'background:rgba(255,255,255,0.02)':''}">
                    <td style="padding:5px 8px;font-weight:${i===0?'700':'400'};color:${i===0?cor:'var(--text2)'}">
                      ${i===0?`👤 ${nome}`:''}
                    </td>
                    <td style="padding:5px 8px;font-family:'Space Mono',monospace;font-size:0.7rem;color:var(--muted)">${ref}</td>
                    <td style="padding:5px 8px;color:var(--text2);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(l.desc||'').replace(/\s*\(\d+\/\d+\)\s*$/,'')}">${(l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,'')}${l.parcAtual?'<span style="background:rgba(240,144,64,0.85);color:#000;padding:0 5px;border-radius:3px;font-size:0.65rem;font-weight:700;margin-left:4px">'+l.parcAtual+'/'+l.parcTotal+'</span>':''}</td>
                    <td style="padding:5px 8px"><span style="font-size:0.65rem;color:${corTipo};background:rgba(0,0,0,0.2);padding:1px 7px;border-radius:10px">${tipoLabel}</span></td>
                    <td style="padding:5px 8px;text-align:right;font-family:'Space Mono',monospace;font-weight:700;color:${corTipo}">${fmt(_valorExib(l))}</td>
                  </tr>`;
                }).join('') +
                `<tr style="background:rgba(0,0,0,0.15);border-bottom:2px solid rgba(255,255,255,0.08)">
                  <td colspan="4" style="padding:4px 8px;font-size:0.7rem;color:var(--muted);text-align:right">Total ${nome}</td>
                  <td style="padding:4px 8px;text-align:right;font-family:'Space Mono',monospace;font-size:0.78rem;font-weight:700;color:${cor}">${fmt(totalTerc)}</td>
                </tr>`;
              }).join('')}
              <tr style="border-top:2px solid rgba(255,255,255,0.15)">
                <td colspan="4" style="padding:6px 8px;font-weight:700;color:var(--text2);font-size:0.72rem;text-align:right">TOTAL INADIMPLENTE</td>
                <td style="padding:6px 8px;text-align:right;font-family:'Space Mono',monospace;font-weight:700;color:#f59e0b">${fmt(totalPend)}</td>
              </tr>
            </tbody>
          </table>`;
      }
    }
  }

  // ── Gráficos ──
  function makeTerc(elId, entries2, colors) {
    const el = document.getElementById(elId);
    if (!el) return;
    const pos = entries2.filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
    if (!pos.length) { el.innerHTML = '<div class="empty-state" style="padding:10px">Sem dados.</div>'; return; }
    const max = pos[0][1], tot = pos.reduce((s,[,v])=>s+v,0);
    el.innerHTML = pos.map(([label,val],i) => {
      const pct=(val/max*100).toFixed(1), pctT=tot>0?(val/tot*100).toFixed(0):'0';
      const c = Array.isArray(colors) ? colors[i%colors.length] : colors;
      return `<div class="cat-bar-row">
        <div class="cat-bar-header">
          <div class="cat-bar-label" title="${label}">
            <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c};margin-right:5px;vertical-align:middle"></span>${label}
          </div>
          <div class="cat-bar-pct">${pctT}%</div>
        </div>
        <div class="cat-bar-bg">
          <div class="cat-bar-fill" style="width:${pct}%;background:${c}"></div>
        </div>
        <div class="cat-bar-val" style="color:${c}">${fmt(val)}</div>
      </div>`;
    }).join('');
  }

  const byEnt = {}, byDiv = {};
  filtered.forEach(l => {
    const k = l.terceiro || '(sem terceiro)';
    if (l.categoria === 'Entrada Terceiro') byEnt[k] = (byEnt[k]||0) + _valorExib(l);
    else byDiv[k] = (byDiv[k]||0) + _valorExib(l);
  });

  makeTerc('tercBarsEntrada', Object.entries(byEnt), COLORS_ENT);
  makeTerc('tercBarsDivida',  Object.entries(byDiv), COLORS_DIV);

  const entTot = Object.values(byEnt).reduce((s,v)=>s+v,0);
  const divTot = Object.values(byDiv).reduce((s,v)=>s+v,0);
  const e1 = document.getElementById('tercGraficoEntTotal'); if(e1) e1.textContent = entTot>0?'Total: '+fmt(entTot):'';
  const e2 = document.getElementById('tercGraficoDivTotal'); if(e2) e2.textContent = divTot>0?'Total: '+fmt(divTot):'';

  // ── Tabela com ordenação ──
  const tbody = document.getElementById('terceirosTable');
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-state">Nenhum lançamento.</td></tr>';
    const te = document.getElementById('tercTabelaTotal'); if(te) te.textContent='';
    return;
  }

  const sorted = filtered.slice().sort((a,b) => {
    let av, bv;
    switch(tercSortCol) {
      case 'vencimento':   av = a.vencimento||a.data||''; bv = b.vencimento||b.data||''; break;
      case 'data':         av = a.data||'';        bv = b.data||'';        break;
      case 'terceiro':     av = (a.terceiro||'').toLowerCase(); bv = (b.terceiro||'').toLowerCase(); break;
      case 'desc':         av = (a.desc||'').toLowerCase(); bv = (b.desc||'').toLowerCase(); break;
      case 'categoria':    av = a.categoria||'';   bv = b.categoria||'';   break;
      case 'subCategoria': av = a.subCategoria||''; bv = b.subCategoria||''; break;
      case 'tipo':         av = a.tipo||'';        bv = b.tipo||'';        break;
      case 'status':       av = a.status||'';      bv = b.status||'';      break;
      case 'pagamento':    av = (a.pagamento||'').toLowerCase(); bv = (b.pagamento||'').toLowerCase(); break;
      case 'banco':        av = (a.banco||'');     bv = (b.banco||'');     break;
      case 'valor':        av = a.valor;           bv = b.valor;           break;
      default:          av = a.data||'';        bv = b.data||'';
    }
    if (av < bv) return -1 * tercSortDir;
    if (av > bv) return  1 * tercSortDir;
    return 0;
  });

  // update sort headers
  document.querySelectorAll('#tab-terceiros thead th.sortable').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    const c = (th.getAttribute('onclick')||'').replace("setTercSort('","").replace("')","");
    if (c === tercSortCol) th.classList.add(tercSortDir===1?'sort-asc':'sort-desc');
  });

  const totTabela = filtered.reduce((s,l)=>s+(l.tipo==='receita'?_valorExib(l):-_valorExib(l)),0);
  const te2 = document.getElementById('tercTabelaTotal');
  if(te2) te2.textContent = `${filtered.length} lançamentos · saldo ${totTabela>=0?'+':'-'}${fmt(Math.abs(totTabela))}`;

  const isMobTerc = window.matchMedia("(max-width:768px)").matches;
  if (isMobTerc) {
    const table = tbody.closest('table');
    const _tPanel = table ? table.closest('.panel') : null;
    if (_tPanel) _tPanel.classList.add('ap-hidden-mobile');
    const cardCont = document.getElementById('tercCardContainer');
    if (cardCont) cardCont.style.display = 'block';
    cardCont.innerHTML = sorted.map(l => {
      const sid = String(l.id).replace(/'/g,"\\'");
      const sgrp = l.groupId ? String(l.groupId).replace(/'/g,"\\'") : null;
      const srecorr = (l.recorr || l.tipoLanc || '').replace(/'/g,"\\'");
      const isRec = l.tipo === 'receita';
      const borderColor = isRec ? 'var(--green)' : 'var(--red)';
      const bancoObj = loadBancos().find(b => b.id === l.banco);
      const vencStr = (function(){ const v=l.vencimento; if(!v)return '—'; if(/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(0,10).split('-').reverse().join('/'); return v; })();
      return `<div data-id="${sid}" style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${borderColor};border-radius:10px;padding:12px 14px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div>
            <span style="font-family:'Space Mono',monospace;font-size:0.72rem;color:var(--text2)">${vencStr}</span>
            ${l.terceiro?`<span style="display:block;font-weight:700;font-size:0.78rem;color:#f59e0b;margin-top:1px">👤 ${l.terceiro}</span>`:''}
          </div>
          <span style="font-family:'Space Mono',monospace;font-size:1rem;font-weight:700;color:${isRec?'var(--green)':'var(--red)'}">${isRec?'+':'-'}${fmt(_valorExib(l))}</span>
        </div>
        <div style="font-weight:700;font-size:0.9rem;margin-bottom:6px;">${(l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,'')}${l.parcAtual?`<span style="background:rgba(240,144,64,0.85);color:#000;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-left:6px">${l.parcAtual}/${l.parcTotal}</span>`:''}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          <span style="font-size:0.75rem;color:var(--text2)">${l.categoria||'—'}${l.subCategoria?' › '+l.subCategoria:''}</span>
          ${l.pagamento?`<span style="background:var(--surface2);border:1px solid var(--border);padding:2px 8px;border-radius:10px;font-size:0.7rem;color:var(--text2)">${l.pagamento}</span>`:''}
          ${bancoObj?`<span style="background:${bancoObj.cor}18;border:1px solid ${bancoObj.cor}44;color:${bancoObj.cor};padding:2px 8px;border-radius:10px;font-size:0.7rem">${bancoObj.icone||'🏦'} ${bancoObj.nome}</span>`:''}
          <span class="badge badge-${isRec?'receita':'despesa'}">${isRec?'↑ Entrada':'↓ Dívida'}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
          <span class="badge badge-${l.status}">${l.status==='pago'?'✓ Pago':'⏳ Pendente'}</span>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            ${l.status==='pendente'
              ?`<button onclick="toggleStatusLanc('${sid}','pago')" style="background:rgba(48,208,128,0.15);border:1px solid rgba(48,208,128,0.4);color:var(--green);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✓ Pagar</button>`
              :`<button onclick="toggleStatusLanc('${sid}','pendente')" style="background:rgba(240,80,96,0.15);border:1px solid rgba(240,80,96,0.4);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">↩</button>`}
            <button onclick="editLancamento('${sid}')" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.30);color:var(--accent2);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✎ Editar</button>
            <button onclick="smartDelete('${sid}',${sgrp ? `'${sgrp}'` : 'null'},event,'${srecorr}')" style="background:rgba(240,80,96,0.12);border:1px solid rgba(240,80,96,0.3);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✕</button>
          </div>
        </div>
      </div>`;
    }).join('');
    return;
  } else {
    const table = tbody.closest('table');
    const _tPanel2 = table ? table.closest('.panel') : null;
    if (_tPanel2) _tPanel2.classList.remove('ap-hidden-mobile');
    const cardCont = document.getElementById('tercCardContainer');
    if (cardCont) cardCont.style.display = 'none';
  }

  tbody.innerHTML = sorted.map(l => {
    const sid = String(l.id).replace(/'/g,"\\'");
    const isRec = l.tipo==='receita';
    const catLabel = l.categoria || '—';
    return `<tr>
      <td style="padding:8px 6px;text-align:center"><input type="checkbox" class="terc-check" data-id="${l.id}" onchange="tercUpdateBulkBar()" style="cursor:pointer;accent-color:var(--accent)"></td>
      <td style="font-family:'Space Mono',monospace;font-size:0.75rem;color:var(--text2)">${(function(){
        const v=l.vencimento;
        if(!v)return '—';
        if(/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(0,10).split('-').reverse().join('/');
        return v;
      })()}</td>
      <td style="font-weight:600">${l.terceiro||'<span style="color:var(--muted)">—</span>'}</td>
      <td>${(l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,'')}${l.parcAtual?'<span style="background:rgba(240,144,64,0.85);color:#000;padding:0 5px;border-radius:3px;font-size:0.65rem;font-weight:700;margin-left:4px">'+l.parcAtual+'/'+l.parcTotal+'</span>':''}</td>
      <td style="font-size:0.72rem;color:var(--muted)">${catLabel}</td>
      <td style="font-size:0.68rem;color:var(--muted)">${l.subCategoria||'—'}</td>
      <td><span class="badge badge-${isRec?'receita':'despesa'}">${isRec?'↑ Entrada':'↓ Dívida'}</span></td>
      <td><span class="badge badge-${l.status}">${l.status==='pago'?'✓ Pago':'⏳ Pendente'}</span></td>
      <td style="font-size:0.73rem;color:var(--text2)">${l.pagamento||'—'}</td>
      <td style="font-size:0.68rem">${(()=>{const b=loadBancos().find(x=>x.id===l.banco);return b?`<span style="color:${b.cor}">${b.icone||'🏦'} ${b.nome}</span>`:'—';})()}</td>
      <td style="text-align:right"><span class="${isRec?'val-pos':'val-neg'}">${isRec?'+':'-'}${fmt(_valorExib(l))}</span></td>
      <td style="text-align:center;white-space:nowrap">
        ${l.status==='pendente'
          ? `<button class="del-btn" onclick="toggleStatusLanc('${sid}','pago')" title="Marcar como pago" style="color:var(--green);background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:5px;padding:2px 8px;font-size:0.72rem;font-weight:700;margin-right:3px">${l.tipo === 'receita' ? '✓ Receber' : '✓ Pagar'}</button>`
          : `<button class="del-btn" onclick="toggleStatusLanc('${sid}','pendente')" title="Estornar para pendente" style="color:var(--danger);background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:5px;padding:2px 8px;font-size:0.72rem;font-weight:700;margin-right:3px">↩</button>`}
        <button class="del-btn" onclick="editLancamento('${sid}')" style="color:var(--accent2)">✎</button>
        <button class="del-btn" onclick="smartDelete(this)" data-sid="${sid}" data-gid="${l.groupId||''}" title="Excluir" style="color:var(--danger)">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function tercUpdateBulkBar() {
  const checked = document.querySelectorAll('.terc-check:checked');
  const all2    = document.querySelectorAll('.terc-check');
  const bar     = document.getElementById('tercBulkBar');
  const countEl = document.getElementById('tercBulkCount');
  const chkAll  = document.getElementById('tercCheckAll');
  if (bar)     bar.style.display   = checked.length > 0 ? 'flex' : 'none';
  if (countEl) countEl.textContent = checked.length + ' selecionado' + (checked.length !== 1 ? 's' : '');
  if (chkAll) {
    chkAll.indeterminate = checked.length > 0 && checked.length < all2.length;
    chkAll.checked       = all2.length > 0 && checked.length === all2.length;
  }
}

function tercToggleAll(checked) { document.querySelectorAll('.terc-check').forEach(cb => cb.checked = checked); tercUpdateBulkBar(); }
function tercBulkClearSel() { document.querySelectorAll('.terc-check').forEach(cb => cb.checked = false); const ca=document.getElementById('tercCheckAll'); if(ca){ca.checked=false;ca.indeterminate=false;} tercUpdateBulkBar(); }

function applyTercBulk() {
  const terceiro = document.getElementById('tercBulkTerceiroSelect')?.value;
  if (!terceiro) { alert('Selecione um terceiro para aplicar.'); return; }
  const ids = new Set([...document.querySelectorAll('.terc-check:checked')].map(c => c.dataset.id));
  if (!ids.size) { alert('Selecione pelo menos um lançamento.'); return; }
  _memCache.lancamentos = (_memCache.lancamentos || []).map(l => ids.has(String(l.id)) ? { ...l, terceiro } : l);
  ids.forEach(id => dbUpdateLancamento(id, { terceiro }).catch(e => console.error('[applyTercBulk]', e.message)));
  tercBulkClearSel();
  renderTerceirosTab();
  safeRender(() => renderAll());
}

function clearTercBulk() {
  const ids = new Set([...document.querySelectorAll('.terc-check:checked')].map(c => c.dataset.id));
  if (!ids.size) { alert('Selecione pelo menos um lançamento.'); return; }
  if (!confirm(`Limpar o terceiro de ${ids.size} lançamento(s)?`)) return;
  _memCache.lancamentos = (_memCache.lancamentos || []).map(l => { if (ids.has(String(l.id))) { const c = {...l}; delete c.terceiro; return c; } return l; });
  ids.forEach(id => dbUpdateLancamento(id, { terceiro: null }).catch(e => console.error('[clearTercBulk]', e.message)));
  tercBulkClearSel();
  renderTerceirosTab();
  safeRender(() => renderAll());
}

window._tercCardFilter = null;
function _tercCardClick(nome) {
  if (window._tercCardFilter && window._tercCardFilter.nome === nome) { window._tercCardFilter = null; }
  else { window._tercCardFilter = { nome, tipo: 'todos' }; }
  renderTerceirosTab();
}
function _tercCardTipo(nome, tipo) { window._tercCardFilter = { nome, tipo }; renderTerceirosTab(); }


// ======== FORMAS DE PAGAMENTO ========
const PAG_DEFAULT = [
  { id:'pag_credito',  nome:'Cartão Crédito', icone:'💳', cartao:true,  diaVencimento:10, diaCorte:1 },
  { id:'pag_debito',   nome:'Débito',          icone:'🏦', cartao:false },
  { id:'pag_pix',      nome:'Pix',             icone:'⚡', cartao:false },
  { id:'pag_boleto',   nome:'Boleto',          icone:'📄', cartao:false },
  { id:'pag_transf',   nome:'Transferência',   icone:'🔁', cartao:false },
  { id:'pag_dinheiro', nome:'Dinheiro',        icone:'💵', cartao:false },
];

function _getCartaoConfig(pagamentoNome) {
  if (!pagamentoNome) return null;
  const pags = _memCache.pagamentos || [];
  const norm = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  return pags.find(p => p.cartao && norm(p.nome) === norm(pagamentoNome)) || null;
}

function mesAnoComCorte(dateStr, pagamentoNome) {
  const cartao = _getCartaoConfig(pagamentoNome);
  const parts = dateStr.split('-');
  let mes = parseInt(parts[1]);
  let ano = parseInt(parts[0]);
  const diaCompra = parseInt(parts[2]);
  if (cartao && cartao.diaCorte && diaCompra >= cartao.diaCorte) {
    mes++; if (mes > 12) { mes = 1; ano++; }
  }
  return { mes, ano };
}

function _calcVencimentoCartao(dateStr, cartaoConf) {
  if (!cartaoConf || !cartaoConf.diaVencimento) return null;
  const parts = dateStr.split('-');
  let mes = parseInt(parts[1]);
  let ano = parseInt(parts[0]);
  const diaCompra = parseInt(parts[2]);
  if (cartaoConf.diaCorte && diaCompra >= cartaoConf.diaCorte) {
    mes++; if (mes > 12) { mes = 1; ano++; }
  }
  const diaVenc = cartaoConf.diaVencimento;
  return `${ano}-${String(mes).padStart(2,'0')}-${String(diaVenc).padStart(2,'0')}`;
}

function _onPagamentoChange() {
  const pagNome    = document.getElementById('fPagamento')?.value || '';
  const cartaoConf = _getCartaoConfig(pagNome);
  const fPagSel    = document.getElementById('fPagamento');
  const fPagHint   = document.getElementById('fPagHint');
  if (fPagSel) {
    if (cartaoConf) { fPagSel.style.borderColor = '#fb923c'; fPagSel.style.color = '#fb923c'; }
    else            { fPagSel.style.borderColor = ''; fPagSel.style.color = ''; }
  }
  if (fPagHint) { fPagHint.style.display = 'none'; }
  if (!cartaoConf) {
    const fVenc = document.getElementById('fVencimento');
    const fHint = document.getElementById('fVencHint');
    const fVencLbl = document.getElementById('fVencLabel');
    if (fVenc) { fVenc.readOnly = false; fVenc.style.color = 'var(--accent2)'; fVenc.style.borderColor = ''; }
    if (fHint) { fHint.style.display = 'none'; fHint.textContent = ''; }
    if (fVencLbl) fVencLbl.innerHTML = `Vencimento <span style="color:var(--red)">*</span>`;
  }
  const dataVal = document.getElementById('fData')?.value;
  if (dataVal) _onDataChange();
}

function _onDataChange() {
  const pagNome  = document.getElementById('fPagamento')?.value || '';
  const dataVal  = document.getElementById('fData')?.value || '';
  const fVenc    = document.getElementById('fVencimento');
  const fHint    = document.getElementById('fVencHint');
  const fVencLbl = document.getElementById('fVencLabel');
  const fPagHint = document.getElementById('fPagHint');
  if (!fVenc) return;
  if (fPagHint && dataVal) fPagHint.style.display = 'none';
  const cartaoConf = _getCartaoConfig(pagNome);
  if (cartaoConf && cartaoConf.diaVencimento && dataVal) {
    // Usa hoje como base para o cálculo (não a data antiga do lançamento)
    const hoje = new Date();
    const hojeStr = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0') + '-' + String(hoje.getDate()).padStart(2,'0');
    const vencDate = _calcVencimentoCartao(hojeStr, cartaoConf);
    // Só preenche o vencimento se estiver vazio (não sobrescreve se usuário já editou)
    if (!fVenc.value) fVenc.value = vencDate;
    fVenc.readOnly = false; // campo sempre editável
    fVenc.style.color = '#fb923c'; fVenc.style.borderColor = '#fb923c';
    const diaHoje = hoje.getDate();
    const faturaProxima = cartaoConf.diaCorte && diaHoje >= cartaoConf.diaCorte;
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const vencRef = fVenc.value || vencDate;
    const mesVenc = parseInt(vencRef.split('-')[1]);
    const anoVenc = parseInt(vencRef.split('-')[0]);
    const mesVencNome = meses[mesVenc - 1];
    if (fHint) {
      fHint.style.display = 'block';
      if (faturaProxima) {
        fHint.innerHTML = `✂️ Dia ${diaHoje} ≥ corte (${cartaoConf.diaCorte}) → fatura <strong>${mesVencNome}/${anoVenc}</strong> · vence dia <strong>${cartaoConf.diaVencimento}/${mesVencNome}</strong>`;
      } else {
        fHint.innerHTML = `📅 Fatura de <strong>${mesVencNome}/${anoVenc}</strong> · vence dia <strong>${cartaoConf.diaVencimento}/${mesVencNome}</strong>`;
      }
    }
    if (fVencLbl) fVencLbl.innerHTML = `Vencimento <span style="font-size:0.6rem;padding:1px 6px;border-radius:3px;background:rgba(251,146,60,0.15);color:#fb923c;font-weight:700">✏️ auto cartão</span>`;
  } else {
    fVenc.readOnly = false; fVenc.title = '';
    fVenc.style.color = 'var(--accent2)'; fVenc.style.borderColor = '';
    if (fHint) { fHint.style.display = 'none'; fHint.textContent = ''; }
    if (fVencLbl) fVencLbl.innerHTML = `Vencimento <span style="color:var(--red)">*</span>`;
  }
}

function renderPagList() {
  const el = document.getElementById('pagList');
  if (!el) return;
  const pags = loadPagamentos();
  if (!pags.length) { el.innerHTML = '<div class="empty-state">Nenhum tipo cadastrado.</div>'; return; }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;padding:4px 0">` +
    pags.map(p => `
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid ${p.cartao?'rgba(251,146,60,0.4)':'var(--border)'};border-radius:8px;padding:10px 12px;gap:8px">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="font-size:1.1rem">${p.icone||'💳'}</span>
          <div style="min-width:0">
            <div style="font-weight:600;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nome}</div>
            ${p.cartao
              ? `<div style="font-size:0.62rem;color:#fb923c;margin-top:1px">💳 Cartão${p.diaVencimento ? ` · Venc. dia ${p.diaVencimento}` : ''}${p.diaCorte ? ` · Corte dia ${p.diaCorte}` : ''}</div>`
              : '<div style="font-size:0.62rem;color:var(--muted);margin-top:1px">Outro</div>'}
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button onclick="editPagModal('${p.id}')" style="background:none;border:1px solid var(--border);border-radius:5px;color:var(--text2);padding:3px 7px;cursor:pointer;font-size:0.7rem">✎</button>
          <button onclick="deletePag('${p.id}')" style="background:none;border:1px solid rgba(220,38,38,0.4);border-radius:5px;color:#dc2626;padding:3px 7px;cursor:pointer;font-size:0.7rem">✕</button>
        </div>
      </div>`).join('') + '</div>';
}

function populatePagSelects() {
  const pags = loadPagamentos();
  const opts = '<option value="">— Não informado —</option>' +
    pags.map(p => `<option value="${p.nome}">${p.icone ? p.icone+' ' : ''}${p.nome}${p.cartao?' 💳':''}</option>`).join('');
  const fPag = document.getElementById('fPagamento');
  if (fPag) { const cur = fPag.value; fPag.innerHTML = opts; fPag.value = cur; }
  const fFiltro = document.getElementById('filtroPagamento');
  if (fFiltro) {
    const cur2 = fFiltro.value;
    fFiltro.innerHTML = '<option value="">Todos pagamentos</option>' +
      pags.map(p => `<option value="${p.nome}">${p.icone ? p.icone+' ' : ''}${p.nome}</option>`).join('');
    fFiltro.value = cur2;
    if(window.FSEL) _fselRebuild('filtroPagamento');
  }
}

function openPagModal() {
  document.getElementById('pagEditId').value = '';
  document.getElementById('pagNome').value = '';
  document.getElementById('pagIcone').value = '💳';
  document.getElementById('pagLogo').value = '';
  document.getElementById('pagIsCartao').checked = false;
  document.getElementById('pagDiaVencimento').value = '';
  document.getElementById('pagDiaCorte').value = '';
  document.getElementById('pagCartaoFields').style.display = 'none';
  document.getElementById('pagCortePrev').textContent = '';
  _setLogoPreview('pagLogoPreview', null, '💳');
  document.getElementById('pagModalTitle').textContent = 'Novo Tipo de Pagamento';
  document.getElementById('pagModalOverlay').classList.add('open');
}

async function editPagModal(id) {
  const pags = loadPagamentos();
  const p = pags.find(x => x.id === id);
  if (!p) return;
  document.getElementById('pagEditId').value = p.id;
  document.getElementById('pagNome').value = p.nome;
  document.getElementById('pagIcone').value = p.icone || '';
  document.getElementById('pagLogo').value = p.logo || '';
  document.getElementById('pagIsCartao').checked = !!p.cartao;
  document.getElementById('pagDiaVencimento').value = p.diaVencimento || '';
  document.getElementById('pagDiaCorte').value = p.diaCorte || '';
  document.getElementById('pagCartaoFields').style.display = p.cartao ? 'block' : 'none';
  _setLogoPreview('pagLogoPreview', p.logo || _logoFromName(p.nome), p.icone || '💳');
  _updatePagCortePrev();
  document.getElementById('pagModalTitle').textContent = 'Editar Tipo de Pagamento';
  document.getElementById('pagModalOverlay').classList.add('open');
}
function closePagModal() { document.getElementById('pagModalOverlay').classList.remove('open'); }

function _togglePagCartaoFields() {
  const isCartao = document.getElementById('pagIsCartao').checked;
  document.getElementById('pagCartaoFields').style.display = isCartao ? 'block' : 'none';
  if (isCartao) _updatePagCortePrev();
}

function _updatePagCortePrev() {
  const prev = document.getElementById('pagCortePrev'); if (!prev) return;
  const diaVenc  = parseInt(document.getElementById('pagDiaVencimento').value) || null;
  const diaCorte = parseInt(document.getElementById('pagDiaCorte').value) || null;
  if (!diaVenc && !diaCorte) { prev.textContent = ''; return; }
  const partes = [];
  if (diaCorte) partes.push(`📅 Compras a partir do dia <strong>${diaCorte}</strong> entram na <strong>próxima fatura</strong>`);
  if (diaVenc) partes.push(`💳 Fatura vence todo dia <strong>${diaVenc}</strong>`);
  prev.innerHTML = partes.join('<br>');
}

async function savePagModal() {
  const nome = document.getElementById('pagNome').value.trim();
  if (!nome) { alert('Informe o nome.'); return; }
  const pags = loadPagamentos();
  const editId = document.getElementById('pagEditId').value;
  const entry = {
    id:    editId || 'pag_' + Date.now(),
    nome,
    icone: document.getElementById('pagIcone').value.trim() || '💳',
    logo:  document.getElementById('pagLogo').value.trim() || null,
    cartao: document.getElementById('pagIsCartao').checked,
    diaVencimento: document.getElementById('pagIsCartao').checked ? (parseInt(document.getElementById('pagDiaVencimento').value)||null) : null,
    diaCorte:      document.getElementById('pagIsCartao').checked ? (parseInt(document.getElementById('pagDiaCorte').value)||null)      : null,
  };
  if (editId) { const idx = pags.findIndex(p => p.id === editId); if (idx >= 0) pags[idx] = entry; }
  else { pags.push(entry); }
  savePagamentos(pags);
  closePagModal();
  renderPagList();
  populatePagSelects();
}

async function deletePag(id) {
  if (!await _showSimpleConfirm('🗑 Excluir pagamento', 'Excluir este tipo de pagamento?', 'Excluir', 'var(--red)')) return;
  savePagamentos((loadPagamentos()).filter(p => p.id !== id));
  renderPagList();
  populatePagSelects();
}

async function exportarExcel() {
  if (typeof XLSX === 'undefined') { alert('Biblioteca de Excel não carregada.'); return; }
  const all = getMonthData();
  const tipo      = window.FSEL ? FSEL.getValues('filtroTipo')         : [];
  const status    = window.FSEL ? FSEL.getValues('filtroStatus')       : [];
  const cat       = window.FSEL ? FSEL.getValues('filtroCategoria')    : [];
  const subCat    = window.FSEL ? FSEL.getValues('filtroSubCategoria') : [];
  const tipoLanc  = window.FSEL ? FSEL.getValues('filtroTipoLanc')     : [];
  const pagFiltro = window.FSEL ? FSEL.getValues('filtroPagamento')    : [];
  const busca     = (document.getElementById('filtroBusca')?.value || '').toLowerCase();

  let dados = all.filter(l => {
    if (tipo.length     && !tipo.includes(l.tipo)) return false;
    if (status.length   && !status.includes(l.status)) return false;
    if (cat.length      && !cat.includes(l.categoria)) return false;
    if (subCat.length   && !subCat.includes(l.subCategoria)) return false;
    if (tipoLanc.length && !tipoLanc.includes(l.tipoLanc || 'variavel')) return false;
    if (busca && ![l.desc, l.categoria, l.subCategoria, l.pagamento].join(' ').toLowerCase().includes(busca)) return false;
    return true;
  });

  if (!dados.length) { alert('Nenhum lançamento para exportar.'); return; }

  const fmtDate = d => { if (!d) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.split('-').reverse().join('/'); return d; };

  const rows = dados.map(l => ({
    'Data':            fmtDate(l.data),
    'Vencimento':      l.vencimento || '',
    'Descrição':       (l.desc||'').replace(/\s*\(\d+\/\d+\)\s*$/,'') || '',
    'Parcela':         l.parcAtual ? l.parcAtual + '/' + l.parcTotal : '',
    'Tipo':            l.tipo || '',
    'Categoria':       l.categoria || '',
    'Sub-Categoria':   l.subCategoria || '',
    'Pagamento':       l.pagamento || '',
    'Status':          l.status || '',
    'Valor (R$)':      l.tipo === 'receita' ? _valorExib(l) : -_valorExib(l),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch:12 },{ wch:12 },{ wch:40 },{ wch:10 },{ wch:10 },{ wch:20 },{ wch:20 },{ wch:18 },{ wch:10 },{ wch:14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos');
  const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  XLSX.writeFile(wb, `MeuFinanceiro_${MONTHS_PT[currentMonth-1]}${currentYear}.xlsx`);
}


// ======== SALDO EM BANCO ========
function calcSaldoBanco() {
  const bancos = loadBancos();
  const ctx = getBancoContexto();
  const consolIds = getBancosConsolidadoIds();

  function calcFromBancos(lista) {
    if (!lista.length) {
      const si = loadSaldoInicial();
      const valor = si.valor || 0;
      const refData = si.data || '';
      if (!refData) return { saldo: valor, soma: 0, countPos: 0, countNeg: 0, saldoInicial: valor, refLabel: 'sem data inicial', semRef: true };
      let refTs = 0;
      if (/^\d{4}-\d{2}-\d{2}$/.test(refData)) refTs = new Date(refData+'T00:00:00').getTime();
      else if (/^\d{2}\/\d{2}\/\d{4}$/.test(refData)) { const p=refData.split('/'); refTs=new Date(p[2]+'-'+p[1]+'-'+p[0]+'T00:00:00').getTime(); }
      const today = new Date(); today.setHours(23,59,59,0);
      let soma=0, countPos=0, countNeg=0;
      (loadData()).forEach(l => {
        if (l.status!=='pago') return;
        const ds=l.data||''; let ld;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(ds)){const p=ds.split('/');ld=new Date(p[2]+'-'+p[1]+'-'+p[0]+'T00:00:00');}
        else if (/^\d{4}-\d{2}-\d{2}$/.test(ds)){ld=new Date(ds+'T00:00:00');}else return;
        if (isNaN(ld)||ld.getTime()<refTs||ld.getTime()>today.getTime()) return;
        if (l.tipo==='receita'){soma+=_valorExib(l);countPos++;}else{soma-=_valorExib(l);countNeg++;}
      });
      const refLabel = refData.includes('-') ? refData.split('-').reverse().join('/') : refData;
      return { saldo: valor+soma, soma, countPos, countNeg, saldoInicial: valor, refLabel };
    }

    let totalSaldo = 0, totalInicial = 0, countPos = 0, countNeg = 0;
    const todos = loadData();
    lista.forEach(b => {
      const si = b.saldoInicial || 0;
      totalInicial += si;
      let rec = 0, desp = 0;
      todos.forEach(l => {
        if (l.banco !== b.id) return;
        if (l.status !== 'pago') return;
        if (l.tipo==='receita'){rec+=_valorExib(l)||0;countPos++;}else{desp+=_valorExib(l)||0;countNeg++;}
      });
      totalSaldo += si + rec - desp;
    });
    const nomes = lista.map(b=>(b.icone||'🏦')+' '+b.nome).join(' + ');
    return { saldo: totalSaldo, soma: totalSaldo-totalInicial, countPos, countNeg, saldoInicial: totalInicial, refLabel: nomes, fromBancos: true };
  }

  if (ctx && ctx !== 'consolidado') {
    const b = bancos.find(x => x.id === ctx);
    return b ? calcFromBancos([b]) : calcFromBancos([]);
  }
  if (ctx === 'consolidado') return calcFromBancos(bancos.filter(b => consolIds.includes(b.id)));
  return calcFromBancos([]);
}

function renderSaldoBanco() {
  const r = calcSaldoBanco();
  const _fill = (sfx) => {
    const el  = document.getElementById('saldoBanco'  + sfx);
    const sub = document.getElementById('saldoBancoSub' + sfx);
    const ref = document.getElementById('saldoBancoRef' + sfx);
    const ini = document.getElementById('saldoInicialLabel' + sfx);
    if (!el) return;
    const _pos = r.saldo >= 0;
    el.textContent = (_pos ? '' : '-') + fmt(Math.abs(r.saldo));
    el.style.color = _pos ? 'var(--green)' : 'var(--red)';
    // Atualiza card-banco-hero com cor dinâmica + animação
    const _heroEl = document.getElementById('cardBancoHero');
    const _heroValor = sfx === '' ? el : null;
    if (_heroEl && sfx === '') {
      _heroEl.classList.toggle('neg', !_pos);
      // Re-triggar animação entrada
      el.style.animation = 'none';
      el.offsetHeight;
      el.style.animation = '_saldoIn .45s cubic-bezier(.22,1,.36,1) both';
      const _dot = document.getElementById('cbhDot');
      if (_dot) _dot.classList.toggle('neg', !_pos);
    }
    if (r.semRef) {
      if (sub) sub.innerHTML = '<span style="color:var(--accent);cursor:pointer" onclick="openSaldoInicialModal()">⚙ Configure saldo e data inicial</span>';
      if (ref) ref.textContent = '—';
    } else {
      if (sub) sub.textContent = `+${r.countPos} receb. / −${r.countNeg} pag.`;
      if (ref) ref.textContent = r.fromBancos ? 'Bancos cadastrados' : r.refLabel;
    }
    if (ini) ini.textContent = (r.saldoInicial >= 0 ? '' : '-') + fmt(Math.abs(r.saldoInicial));
  };
  _fill('');
  _fill('2');
}

async function openSaldoInicialModal() {
  const bancos = loadBancos();
  const ctx = getBancoContexto();
  const bancoAtivo = ctx && ctx !== 'consolidado' ? bancos.find(b => b.id === ctx) : null;
  const ctxEl = document.getElementById('saldoInicialBancoCtx');
  let valor = 0, data = '';
  if (bancoAtivo) {
    valor = bancoAtivo.saldoInicial || 0;
    data  = bancoAtivo.saldoData   || '';
    if (ctxEl) { ctxEl.style.display = 'block'; ctxEl.innerHTML = `${bancoAtivo.icone || '🏦'} Configurando: <strong>${bancoAtivo.nome}</strong>`; }
  } else {
    const si = loadSaldoInicial();
    valor = si.valor || 0;
    data  = si.data  || '';
    if (ctxEl) ctxEl.style.display = 'none';
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) { const p = data.split('/'); data = p[2] + '-' + p[1] + '-' + p[0]; }
  document.getElementById('saldoInicialValor').value = valor || '';
  document.getElementById('saldoInicialData').value  = data  || new Date().toISOString().split('T')[0];
  document.getElementById('saldoInicialOverlay').classList.add('open');
}
function closeSaldoInicialModal() { document.getElementById('saldoInicialOverlay').classList.remove('open'); }

async function salvarSaldoInicial() {
  const valor = parseFloat(document.getElementById('saldoInicialValor').value) || 0;
  const data  = document.getElementById('saldoInicialData').value || '';
  const bancos = loadBancos();
  const ctx = getBancoContexto();
  const bancoAtivo = ctx && ctx !== 'consolidado' ? bancos.find(b => b.id === ctx) : null;
  if (bancoAtivo) {
    const idx = bancos.findIndex(b => b.id === bancoAtivo.id);
    if (idx >= 0) { bancos[idx] = { ...bancos[idx], saldoInicial: valor, saldoData: data }; saveBancos(bancos); }
  } else {
    saveSaldoInicial({ valor, data });
  }
  closeSaldoInicialModal();
  renderSaldoBanco();
  renderBancoCards();
}


// ======== MODAL DE LANÇAMENTO ========
function setRecorr(r) {
  recorrAtual = r;
  document.getElementById('extraParcelado').style.display = r === 'parcelado' ? 'block' : 'none';
  document.getElementById('extraFixo').style.display = r === 'fixo' ? 'block' : 'none';
  document.getElementById('fValorLabel').textContent = r === 'parcelado' ? 'Valor Total (R$)' : 'Valor (R$)';
  const sel = document.getElementById('fTipoLanc');
  if (sel) sel.value = (r === 'unico' ? 'variavel' : r);
  atualizarPreview();
}

function onTipoLancChange() {
  const v = document.getElementById('fTipoLanc').value;
  recorrAtual = v === 'variavel' ? 'unico' : v;
  document.getElementById('extraParcelado').style.display = v === 'parcelado' ? 'block' : 'none';
  document.getElementById('extraFixo').style.display = v === 'fixo' ? 'block' : 'none';
  document.getElementById('fValorLabel').textContent = v === 'parcelado' ? 'Valor Total (R$)' : 'Valor (R$)';
  atualizarPreview();
}

function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let newM = m + n;
  let newY = y + Math.floor((newM - 1) / 12);
  newM = ((newM - 1) % 12) + 1;
  return `${newY}-${String(newM).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function atualizarPreview() {
  const _rawVal = (document.getElementById('fValor').value || '0').replace(/\./g,'').replace(',','.');
  const val = parseFloat(_rawVal) || 0;
  const dataBase = document.getElementById('fData').value;
  if (recorrAtual === 'parcelado') {
    const n = parseInt(document.getElementById('fParcelas').value) || 2;
    const parcela = val / n;
    // Usa vencimento como base das parcelas se disponível, senão usa data de compra
    const vencBase = document.getElementById('fVencimento') ? document.getElementById('fVencimento').value : '';
    const baseParc = vencBase || dataBase;
    if (val > 0 && baseParc) {
      let lines = [];
      for (let i = 0; i < Math.min(n, 4); i++) {
        const d = addMonths(baseParc, i);
        lines.push(`${formatDate(d)} → Parcela ${i+1}/${n} = ${fmt(parcela)}`);
      }
      if (n > 4) lines.push(`... e mais ${n-4} parcelas`);
      document.getElementById('previewParcelado').innerHTML = lines.join('<br>');
    } else { document.getElementById('previewParcelado').innerHTML = ''; }
  }
  if (recorrAtual === 'fixo') {
    const n = parseInt(document.getElementById('fMesesFixo').value) || 12;
    // Usa vencimento como base se disponível, senão usa data
    const vencBase = document.getElementById('fVencimento') ? document.getElementById('fVencimento').value : '';
    const baseDate = vencBase || dataBase;
    if (val > 0 && baseDate) {
      let lines = [];
      for (let i = 0; i < Math.min(n, 4); i++) {
        const d = addMonths(baseDate, i);
        lines.push(`${formatDate(d)} → ${fmt(val)}`);
      }
      if (n > 4) lines.push(`... e mais ${n-4} meses`);
      document.getElementById('previewFixo').innerHTML = lines.join('<br>');
    } else { document.getElementById('previewFixo').innerHTML = ''; }
  }
}

function openModal(id, _prefill) {
  document.body.classList.add('modal-open');
  editId = (id !== undefined && id !== null) ? String(id) : null;
  var cs = document.getElementById('fCategoriaSearch'); if (cs) cs.value = '';
  var ss = document.getElementById('fSubCatSearch'); if (ss) ss.value = '';
  const data = loadData();
  _filterCatsByTipo(tipoAtual);
  populateTerceiroSelects();
  populatePagSelects();
  populateBancoSelects();

  // Se veio de uma cópia, pré-preenche com dados do original (sem salvar)
  if (editId === null && _prefill) {
    const l = _prefill;
    setTipo(l.tipo);
    document.getElementById('fDesc').value = l.desc || '';
    document.getElementById('fCategoria').value = l.categoria || '';
    onCatChange();
    document.getElementById('fSubCategoria').value = l.subCategoria || '';
    document.getElementById('fStatus').value = 'pendente';
    document.getElementById('fPagamento').value = l.pagamento || '';
    if (document.getElementById('fBanco')) document.getElementById('fBanco').value = l.banco || '';
    document.getElementById('fTipoLanc').value = l.tipoLanc || 'variavel';
    onTipoLancChange();
    const _nParc = l.parcTotal || l.totalParcelas || 2;
    document.getElementById('fParcelas').value = _nParc;
    document.getElementById('fMesesFixo').value = _nParc;
    if ((l.tipoLanc || l.recorr) === 'parcelado') {
      setBRLValue(document.getElementById('fValor'), Math.abs(l.valor) * _nParc);
    } else {
      setBRLValue(document.getElementById('fValor'), Math.abs(l.valor));
    }
    onValorTotalChange();
    if (document.getElementById('fData')) document.getElementById('fData').value = l.data || '';
    const _fv = document.getElementById('fVencimento');
    if (_fv && l.vencimento) {
      const _p = l.vencimento.split('/');
      if (_p.length === 3) _fv.value = _p[2] + '-' + _p[1] + '-' + _p[0];
    }
    if (l.terceiro) { const ft = document.getElementById('fTerceiro'); if (ft) ft.value = l.terceiro; }
    onCatChange(); onTipoLancChange(); onCatChangeTerceiro(); _onDataChange(); atualizarPreview();
    document.getElementById('modalTitle').textContent = 'Novo Lançamento (cópia)';
    document.getElementById('recorrRow').style.display = 'block';
    document.getElementById('modalOverlay').classList.add('open');
    return;
  }

  if (editId !== null) {
    const l = data.find(x => String(x.id) === editId);
    if (!l) {
      editId = null;
    } else {
      setTipo(l.tipo);
      setBRLValue(document.getElementById('fValor'), l.valor);
      document.getElementById('fDesc').value = l.desc;
      document.getElementById('fCategoria').value = l.categoria;
      onCatChange();
      document.getElementById('fSubCategoria').value = l.subCategoria || '';
      document.getElementById('fStatus').value = l.status;
      // Seta pagamento com fallback de match case-insensitive
      (function() {
        const fPag = document.getElementById('fPagamento');
        if (!fPag || !l.pagamento) return;
        fPag.value = l.pagamento;
        if (fPag.value !== l.pagamento) {
          // Tenta match case-insensitive
          const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
          const opt = Array.from(fPag.options).find(o => norm(o.value) === norm(l.pagamento) || norm(o.text) === norm(l.pagamento));
          if (opt) fPag.value = opt.value;
        }
      })();
      if (document.getElementById('fBanco')) document.getElementById('fBanco').value = l.banco || '';
      document.getElementById('fTipoLanc').value = l.tipoLanc || 'variavel';
      onTipoLancChange();
      const _parcTotalFromDesc = (function() {
        const m = (l.desc || '').match(/\((\d+)\/(\d+)\)$/) || (l.desc || '').match(/(\d+)\/(\d+)/);
        return m ? parseInt(m[2]) : null;
      })();
      const _nParc = l.parcTotal || l.totalParcelas || _parcTotalFromDesc || 2;
      document.getElementById('fParcelas').value = _nParc;
      document.getElementById('fMesesFixo').value = _nParc;
      if ((l.tipoLanc || l.recorr) === 'parcelado') {
        const valorParcela = typeof _valorExib === 'function' ? Math.abs(_valorExib(l)) : Math.abs(l.valor);
        setBRLValue(document.getElementById('fValor'), valorParcela * _nParc);
      } else {
        setBRLValue(document.getElementById('fValor'), l.valor);
      }
      onValorTotalChange();
      document.getElementById('modalTitle').textContent = 'Editar Lançamento';
      document.getElementById('recorrRow').style.display = 'block';
      const _btnDup = document.getElementById('btn-duplicar-lanc');
      if (_btnDup) _btnDup.style.display = 'inline-flex';
      const _normDate = d => {
        if (!d) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dd,mm,yyyy] = d.split('/'); return `${yyyy}-${mm}-${dd}`; }
        return d;
      };
      const _dataVal = _normDate(l.data);
      const _tercVal = l.terceiro || '';
      document.getElementById('fData').value = _dataVal;
      // Para cartão (exceto terceiros): calcula vencimento com base em hoje; caso contrário usa o salvo
      const _isCartaoEdit = !!_getCartaoConfig(l.pagamento || '');
      const _isTerceiroEdit = CAT_TERC_SET.has(l.categoria || '');
      let _vencVal = '';
      // Sempre usa o vencimento salvo no lançamento como padrão
      if (l.vencimento) {
        _vencVal = vencToInputDate(l.vencimento);
      } else if (_isCartaoEdit && !_isTerceiroEdit) {
        // Só recalcula pelo cartão se não tem vencimento salvo
        const _cartaoConf = _getCartaoConfig(l.pagamento || '');
        if (_cartaoConf && _cartaoConf.diaVencimento) {
          const _hoje = new Date();
          const _hojeStr = _hoje.getFullYear() + '-' + String(_hoje.getMonth()+1).padStart(2,'0') + '-' + String(_hoje.getDate()).padStart(2,'0');
          _vencVal = _calcVencimentoCartao(_hojeStr, _cartaoConf) || '';
        }
      } else {
        _vencVal = _dataVal || '';
      }
      document.getElementById('fVencimento').value = _vencVal;
      requestAnimationFrame(() => {
        const fd = document.getElementById('fData');
        const fv = document.getElementById('fVencimento');
        if (fd && !fd.value && _dataVal) fd.value = _dataVal;
        if (fv && !fv.value && _vencVal) fv.value = _vencVal;
        // Se vencimento ainda vazio, usa a data do lançamento como fallback visual
        if (fv && !fv.value && _dataVal) fv.value = _dataVal;
        const ft = document.getElementById('fTerceiro');
        if (ft && _tercVal) {
          ft.value = _tercVal;
          if (ft.value !== _tercVal) {
            const tmp = document.createElement('option');
            tmp.value = _tercVal; tmp.textContent = '👤 ' + _tercVal;
            ft.appendChild(tmp);
            ft.value = _tercVal;
          }
        }
      });
      document.getElementById('modalOverlay').classList.add('open');
      return;
    }
  }

  tipoAtual = null;
  document.getElementById('btnReceita').className = 'tipo-btn';
  document.getElementById('btnDespesa').className = 'tipo-btn';
  document.getElementById('tipoError').style.display = 'none';
  setRecorr('unico');
  document.getElementById('fData').value = new Date().toISOString().split('T')[0];
  document.getElementById('fVencimento').value = '';
  document.getElementById('fValor').value = '';
  document.getElementById('fDesc').value = '';
  onCatChange();
  document.getElementById('fSubCategoria').value = '';
  document.getElementById('fStatus').value = 'pendente';
  document.getElementById('fPagamento').value = '';
  document.getElementById('fTipoLanc').value = 'variavel';
  if (document.getElementById('fBanco')) document.getElementById('fBanco').value = getBancoAtivo() || '';
  onTipoLancChange();
  document.getElementById('fParcelas').value = 2;
  document.getElementById('fMesesFixo').value = 12;
  document.getElementById('fValorParcela').value = '';
  document.getElementById('previewParcelado').innerHTML = '';
  document.getElementById('previewFixo').innerHTML = '';
  document.getElementById('modalTitle').textContent = 'Novo Lançamento';
  document.getElementById('recorrRow').style.display = 'block';
  const _btnDupNovo = document.getElementById('btn-duplicar-lanc');
  if (_btnDupNovo) _btnDupNovo.style.display = 'none';
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); document.body.classList.remove('modal-open'); }

function highlightRequired(id) { const el = document.getElementById(id); if (el) { el.style.borderColor = 'var(--red)'; el.style.boxShadow = '0 0 0 2px rgba(240,80,96,0.18)'; } }
function clearRequired(id) { const el = document.getElementById(id); if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; } }

function maskValorBRL(el) {
  let v = el.value.replace(/\D/g, '');
  if (!v) { el.value = ''; return; }
  v = parseInt(v, 10);
  let formatted = (v / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const parts = formatted.split(',');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  el.value = parts.join(',');
}
function parseBRL(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
}
function setBRLValue(el, num) {
  if (!el) return;
  if (!num && num !== 0) { el.value = ''; return; }
  const v = Math.abs(num).toFixed(2);
  let [int, dec] = v.split('.');
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  el.value = int + ',' + dec;
}

function onValorTotalChange() {
  const n = parseInt(document.getElementById('fParcelas').value) || 0;
  const total = parseBRL(document.getElementById('fValor').value);
  if (n > 0 && total > 0) { setBRLValue(document.getElementById('fValorParcela'), Math.round((total / n) * 100) / 100); }
  else if (!total) { document.getElementById('fValorParcela').value = ''; }
  atualizarPreview();
}
function onValorParcelaChange() {
  const n = parseInt(document.getElementById('fParcelas').value) || 0;
  const vp = parseBRL(document.getElementById('fValorParcela').value);
  if (n > 0 && vp > 0) { setBRLValue(document.getElementById('fValor'), Math.round((vp * n) * 100) / 100); }
  atualizarPreview();
}
function onParcelasChange() {
  const n = parseInt(document.getElementById('fParcelas').value) || 0;
  const total = parseBRL(document.getElementById('fValor').value);
  const vp = parseBRL(document.getElementById('fValorParcela').value);
  if (total > 0 && n > 0) { setBRLValue(document.getElementById('fValorParcela'), Math.round((total / n) * 100) / 100); }
  else if (vp > 0 && n > 0) { setBRLValue(document.getElementById('fValor'), Math.round((vp * n) * 100) / 100); }
  atualizarPreview();
}

function setTipo(t) {
  tipoAtual = t;
  document.getElementById('btnReceita').className = 'tipo-btn' + (t === 'receita' ? ' active-receita' : '');
  document.getElementById('btnDespesa').className = 'tipo-btn' + (t === 'despesa' ? ' active-despesa' : '');
  const te = document.getElementById('tipoError'); if (te) te.style.display = 'none';
  _filterCatsByTipo(t);
}

/**
 * Gera os espelhos de "Entrada Terceiro" para cada lançamento de despesa
 * com categoria "Dividas de terceiros". O espelho copia desc, valor,
 * data, vencimento, terceiro, banco, status e pagamento — apenas o
 * tipo e a categoria mudam (vira receita / Entrada Terceiro).
 */
function _criarEspelhosTerceiros(items) {
  const espelhos = [];
  let nextId = Date.now() + 1; // garante id único e diferente dos originais
  for (const l of items) {
    if (l.tipo === 'despesa' && l.categoria === 'Dividas de terceiros') {
      espelhos.push({
        ...l,
        id: nextId++,
        tipo: 'receita',
        categoria: 'Entrada Terceiro',
        subCategoria: 'Entrada Terceiro',
        _ts: Date.now(),
        _espelhoDe: l.id,
      });
    }
  }
  return espelhos;
}

async function salvarLancamento() {
  const _btn = document.querySelector('button[onclick="salvarLancamento()"]');
  if (_btn && _btn.disabled) return;
  if (_btn) { _btn.disabled = true; _btn.textContent = 'Salvando...'; }
  try {
    let erros = [];
    if (!tipoAtual) { document.getElementById('tipoError').style.display = 'block'; erros.push('tipo'); }
    else { document.getElementById('tipoError').style.display = 'none'; }

    const _fData  = document.getElementById('fData').value;
    const _fVenc  = document.getElementById('fVencimento').value;
    const _fValor = document.getElementById('fValor').value;
    const _fDesc  = document.getElementById('fDesc').value.trim();
    const _fCat   = document.getElementById('fCategoria').value;
    const _fBanco = document.getElementById('fBanco')?.value || '';

    const _isTercCat = CAT_TERC_SET.has(_fCat) || (typeof _CATS_TERCEIRO !== 'undefined' && _CATS_TERCEIRO.has(_fCat));
    const _fTerc  = document.getElementById('fTerceiro')?.value || '';

    if (!_fData)  { erros.push('data');  highlightRequired('fData'); }  else clearRequired('fData');
    if (!_fVenc)  { erros.push('venc');  highlightRequired('fVencimento'); } else clearRequired('fVencimento');
    if (!_fValor || parseBRL(_fValor) <= 0) { erros.push('valor'); highlightRequired('fValor'); } else clearRequired('fValor');
    if (!_fDesc)  { erros.push('desc');  highlightRequired('fDesc'); }  else clearRequired('fDesc');
    if (!_fCat)   { erros.push('cat');   highlightRequired('fCategoria'); } else clearRequired('fCategoria');
    if (!_fBanco) { erros.push('banco'); highlightRequired('fBanco'); }  else clearRequired('fBanco');
    if (_isTercCat && !_fTerc) { erros.push('terceiro'); highlightRequired('fTerceiro'); } else clearRequired('fTerceiro');
    if (erros.length > 0) return;

    const data = loadData();
    const dataBase = _fData;
    const vencInput = document.getElementById('fVencimento').value;
    let vencimento = vencInput ? inputDateToVenc(vencInput) : '';
    const _existingRec = editId !== null ? (data.find(x => String(x.id) === String(editId)) || null) : null;
    if (!vencimento) {
      if (_existingRec && _existingRec.vencimento) vencimento = _existingRec.vencimento;
      if (!vencimento && document.getElementById('fData').value) {
        vencimento = inputDateToVenc(document.getElementById('fData').value);
      }
    }
    let valorTotal = parseBRL(document.getElementById('fValor').value) || 0;
    if (!valorTotal && _existingRec && _existingRec.valor) valorTotal = Math.abs(_existingRec.valor);
    const desc = document.getElementById('fDesc').value || '—';
    const categoria = document.getElementById('fCategoria').value || 'Outros';
    const subCategoria = document.getElementById('fSubCategoria').value || '';
    const status = document.getElementById('fStatus').value;
    const pagamento = document.getElementById('fPagamento').value || '';
    const tipoLanc = document.getElementById('fTipoLanc').value || 'variavel';
    const terceiro = document.getElementById('fTerceiro')?.value || '';
    const banco = document.getElementById('fBanco')?.value || '';

    function mesAno(dateStr, venc) {
      if (venc) { const p = venc.split('/'); if (p.length === 3) return { mes: parseInt(p[1]), ano: parseInt(p[2]) }; }
      const cartaoConf = _getCartaoConfig(pagamento);
      if (cartaoConf && cartaoConf.diaCorte && !venc) return mesAnoComCorte(dateStr, pagamento);
      return { mes: parseInt(dateStr.split('-')[1]), ano: parseInt(dateStr.split('-')[0]) };
    }

    if (desc && desc !== '—' && categoria) {
      if (typeof learnCat === 'function') learnCat(desc, categoria);
      if (subCategoria && typeof learnSub === 'function') learnSub(desc, categoria, subCategoria);
    }

    if (editId !== null) {
      // Detecta transição da categoria PARA "Dividas de terceiros" (despesa)
      // e pergunta ao usuário se deve criar o espelho "Entrada Terceiro".
      const _existingForMirror = data.find(x => String(x.id) === String(editId));
      const _wasDivida3 = _existingForMirror && _existingForMirror.categoria === 'Dividas de terceiros';
      const _isDivida3Now = categoria === 'Dividas de terceiros' && tipoAtual === 'despesa';
      let _editCreateMirror = false;
      if (!_wasDivida3 && _isDivida3Now) {
        _editCreateMirror = confirm('Esse lançamento foi alterado para "Dívida de terceiros". Deseja criar a receita espelho como "Entrada Terceiro"?');
      }

      if (tipoLanc === 'parcelado') {
        const existing = data.find(x => String(x.id) === String(editId));
        if (existing && existing.groupId) {
          const _nParcelasPending = parseInt(document.getElementById('fParcelas').value) || (existing?.parcTotal || existing?.totalParcelas || 2);
          window._pendingEditData = { tipoLanc, tipoAtual, dataBase, valorTotal, desc, categoria, subCategoria, status, pagamento, vencimento, banco, terceiro, nParcelasPending: _nParcelasPending, createMirror: _editCreateMirror };
          document.getElementById('editScopeOverlay').style.display = 'flex';
          return;
        }
      }
      if (tipoLanc === 'fixo') {
        const n = parseInt(document.getElementById('fMesesFixo').value) || 12;
        const groupId = Date.now();
        const existing = data.find(x => String(x.id) === String(editId));
        const removedIds = existing && existing.groupId
          ? data.filter(x => String(x.groupId) === String(existing.groupId)).map(x => String(x.id))
          : [String(editId)];
        const newItems = [];
        for (let i = 0; i < n; i++) {
          const vp = vencimento ? addMonthsToVenc(vencimento, i) : '';
          const ma = mesAno(dataBase, vp);
          newItems.push({ id: groupId + i, tipo: tipoAtual, data: dataBase, valor: valorTotal, desc, categoria, subCategoria, status, pagamento, tipoLanc, vencimento: vp, banco, terceiro, mes: ma.mes, ano: ma.ano, groupId, recorr: 'fixo', totalParcelas: n });
        }
        for (const sid of removedIds) { _addTombstone(sid); await dbDeleteLancamento(sid); }
        await dbSaveLancamentos(newItems);
        if (_editCreateMirror) {
          const espelhos = _criarEspelhosTerceiros(newItems);
          if (espelhos.length) await dbSaveLancamentos(espelhos);
        }
      } else {
        const existing = data.find(x => String(x.id) === String(editId));
        const nParc = parseInt(document.getElementById('fParcelas').value) || (existing?.parcTotal || existing?.totalParcelas || 1);
        if (tipoLanc === 'parcelado' && nParc > 1) {
          const parcela = Math.round((valorTotal / nParc) * 100) / 100;
          const groupId = Date.now();
          const newItems = [];
          for (let i = 0; i < nParc; i++) {
            const vp = vencimento ? addMonthsToVenc(vencimento, i) : '';
            const ma = mesAno(dataBase, vp);
            newItems.push({ id: groupId + i, tipo: tipoAtual, data: dataBase, valor: parcela, desc, parcAtual: i+1, parcTotal: nParc, categoria, subCategoria, status, pagamento, tipoLanc: 'parcelado', vencimento: vp, banco, terceiro, mes: ma.mes, ano: ma.ano, groupId, recorr: 'parcelado', totalParcelas: nParc, _ts: groupId });
          }
          _addTombstone(String(editId));
          await dbDeleteLancamento(String(editId));
          await dbSaveLancamentos(newItems);
          if (_editCreateMirror) {
            const espelhos = _criarEspelhosTerceiros(newItems);
            if (espelhos.length) await dbSaveLancamentos(espelhos);
          }
        } else {
          const ma = mesAno(dataBase, vencimento);
          const l = { ...existing, id: editId, tipo: tipoAtual, data: dataBase, valor: valorTotal, desc, categoria, subCategoria, status, pagamento, tipoLanc, vencimento, banco, terceiro, mes: ma.mes, ano: ma.ano, _ts: Date.now() };
          await dbUpdateLancamento(editId, l);
          if (_editCreateMirror) {
            const espelhos = _criarEspelhosTerceiros([l]);
            if (espelhos.length) await dbSaveLancamentos(espelhos);
          }
        }
      }
    } else if (recorrAtual === 'parcelado') {
      const n = parseInt(document.getElementById('fParcelas').value) || 2;
      const parcela = Math.round((valorTotal / n) * 100) / 100;
      const groupId = Date.now();
      const newItems = [];
      for (let i = 0; i < n; i++) {
        const vp = vencimento ? addMonthsToVenc(vencimento, i) : '';
        const ma = mesAno(dataBase, vp);
        newItems.push({ id: groupId + i, tipo: tipoAtual, data: dataBase, valor: parcela, desc, parcAtual: i+1, parcTotal: n, categoria, subCategoria, status, pagamento, tipoLanc: 'parcelado', vencimento: vp, terceiro, banco, mes: ma.mes, ano: ma.ano, groupId, recorr: 'parcelado', totalParcelas: n, _ts: groupId });
      }
      await dbSaveLancamentos(newItems);
      const espelhos = _criarEspelhosTerceiros(newItems);
      if (espelhos.length) await dbSaveLancamentos(espelhos);
    } else if (recorrAtual === 'fixo') {
      const n = parseInt(document.getElementById('fMesesFixo').value) || 12;
      const groupId = Date.now();
      const newItems = [];
      for (let i = 0; i < n; i++) {
        const vp = vencimento ? addMonthsToVenc(vencimento, i) : '';
        const ma = mesAno(dataBase, vp);
        newItems.push({ id: groupId + i, tipo: tipoAtual, data: dataBase, valor: valorTotal, desc, categoria, subCategoria, status, pagamento, tipoLanc: 'fixo', vencimento: vp, terceiro, banco, mes: ma.mes, ano: ma.ano, groupId, recorr: 'fixo', totalParcelas: n, _ts: groupId });
      }
      await dbSaveLancamentos(newItems);
      const espelhos = _criarEspelhosTerceiros(newItems);
      if (espelhos.length) await dbSaveLancamentos(espelhos);
    } else {
      const ma = mesAno(dataBase, vencimento);
      const _tsNow = Date.now();
      const _novoLanc = { id: _tsNow, tipo: tipoAtual, data: dataBase, valor: valorTotal, desc, categoria, subCategoria, status, pagamento, tipoLanc, vencimento, terceiro, banco, mes: ma.mes, ano: ma.ano, _ts: _tsNow };
      await dbSaveLancamentos([_novoLanc]);
      const espelhos = _criarEspelhosTerceiros([_novoLanc]);
      if (espelhos.length) await dbSaveLancamentos(espelhos);
    }

    closeModal();
    await carregarApp();
  } catch(e) {
    console.error('[salvarLancamento]', e.message);
    alert('Erro ao salvar. Tente novamente.');
  } finally {
    if (_btn) { _btn.disabled = false; _btn.textContent = 'Salvar'; }
  }
}

async function _editScopeChoice(scope) {
  document.getElementById('editScopeOverlay').style.display = 'none';
  const d = window._pendingEditData;
  if (!d) return;
  const data = loadData();
  const existing = data.find(x => String(x.id) === String(editId));
  const n = d.nParcelasPending || parseInt(document.getElementById('fParcelas').value) || (existing?.totalParcelas || 2);
  try {
    if (scope === 'single') {
      const ma = { mes: parseInt(d.dataBase.split('-')[1]), ano: parseInt(d.dataBase.split('-')[0]) };
      if (d.vencimento) {
        const _vm = _parseVencMesAno(d.vencimento);
        if (_vm) { ma.mes = _vm.mes; ma.ano = _vm.ano; }
      }
      const parcela = existing ? Math.abs(existing.valor) : Math.round((d.valorTotal / n) * 100) / 100;
      const updatedItem = { ...existing, tipo: d.tipoAtual, data: d.dataBase, valor: parcela, desc: d.desc, categoria: d.categoria, subCategoria: d.subCategoria, status: d.status, pagamento: d.pagamento, vencimento: d.vencimento, banco: d.banco, terceiro: d.terceiro, mes: ma.mes, ano: ma.ano, _ts: Date.now() };
      await dbUpdateLancamento(String(editId), updatedItem);
      if (d.createMirror) {
        const espelhos = _criarEspelhosTerceiros([updatedItem]);
        if (espelhos.length) await dbSaveLancamentos(espelhos);
      }
    } else {
      const parcela = Math.round((d.valorTotal / n) * 100) / 100;
      const groupId = Date.now();
      const removedIds = existing && existing.groupId
        ? data.filter(x => String(x.groupId) === String(existing.groupId)).map(x => String(x.id))
        : [String(editId)];
      const newItems = [];
      for (let i = 0; i < n; i++) {
        const vp = d.vencimento ? addMonthsToVenc(d.vencimento, i) : '';
        const mes = vp ? parseInt(vp.split('/')[1]) : parseInt(d.dataBase.split('-')[1]);
        const ano = vp ? parseInt(vp.split('/')[2]) : parseInt(d.dataBase.split('-')[0]);
        newItems.push({ id: groupId + i, tipo: d.tipoAtual, data: d.dataBase, valor: parcela, desc: d.desc, parcAtual: i+1, parcTotal: n, categoria: d.categoria, subCategoria: d.subCategoria, status: d.status, pagamento: d.pagamento, tipoLanc: 'parcelado', vencimento: vp, banco: d.banco, terceiro: d.terceiro, mes, ano, groupId, recorr: 'parcelado', totalParcelas: n });
      }
      for (const sid of removedIds) { _addTombstone(sid); await dbDeleteLancamento(sid); }
      await dbSaveLancamentos(newItems);
      if (d.createMirror) {
        const espelhos = _criarEspelhosTerceiros(newItems);
        if (espelhos.length) await dbSaveLancamentos(espelhos);
      }
    }
    window._pendingEditData = null;
    editId = null;
    closeModal();
    await carregarApp();
  } catch(e) {
    console.error('[_editScopeChoice]', e.message);
    alert('Erro ao salvar. Tente novamente.');
  }
}