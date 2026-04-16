// ======== A RECEBER / A PAGAR ========

var _aReceberSort      = { col: 'vencimento', dir: 1 };
var _aPagarSort        = { col: 'vencimento', dir: 1 };
var _aReceberFiltroSit = '';
var _aPagarFiltroSit   = '';
var _aReceberFiltroStatus = ''; // '' | 'pendente' | 'pago' | 'vencido_status'
var _aPagarFiltroStatus   = '';
var _aReceberFselInited = false;
var _aPagarFselInited   = false;

// Seleção para exclusão em massa
var _aReceberSelecionados = [];
var _aPagarSelecionados   = [];

function setAReceberSort(col) {
  if (_aReceberSort.col === col) _aReceberSort.dir *= -1;
  else { _aReceberSort.col = col; _aReceberSort.dir = 1; }
  renderAReceberTab();
}
function setAPagarSort(col) {
  if (_aPagarSort.col === col) _aPagarSort.dir *= -1;
  else { _aPagarSort.col = col; _aPagarSort.dir = 1; }
  renderAPagarTab();
}
function _setAReceberSit(v) {
  _aReceberFiltroSit = (_aReceberFiltroSit === v) ? '' : v;
  renderAReceberTab();
}
function _setAPagarSit(v) {
  _aPagarFiltroSit = (_aPagarFiltroSit === v) ? '' : v;
  renderAPagarTab();
}
function _setAReceberStatus(v) {
  _aReceberFiltroStatus = (_aReceberFiltroStatus === v) ? '' : v;
  _aReceberSelecionados = [];
  renderAReceberTab();
}
function _setAPagarStatus(v) {
  _aPagarFiltroStatus = (_aPagarFiltroStatus === v) ? '' : v;
  _aPagarSelecionados = [];
  renderAPagarTab();
}

function _fmtVencAP(v) {
  if (!v) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10).split('-').reverse().join('/');
  return v;
}
function _parseVencDateAP(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) { var p=v.slice(0,10).split('-'); return new Date(+p[0],+p[1]-1,+p[2]); }
  if (/^\d{2}\/\d{2}\/\d{4}/.test(v)) { var q=v.split('/'); return new Date(+q[2],+q[1]-1,+q[0]); }
  return null;
}
function _sitLancAP(venc, status) {
  if (status === 'pago') return 'pago';
  var hoje = new Date(); hoje.setHours(0,0,0,0);
  var vd = _parseVencDateAP(venc);
  if (!vd) return 'semdata';
  var diff = Math.round((vd - hoje) / 86400000);
  if (diff < 0) return 'vencido';
  if (diff === 0) return 'hoje';
  if (diff <= 7) return 'proximos';
  return 'futuro';
}
function _sitBadgeAP(sit) {
  var map = {
    vencido:  { cor:'#ef4444', label:'Vencido' },
    hoje:     { cor:'#f59e0b', label:'Hoje' },
    proximos: { cor:'#60a5fa', label:'Prox. 7d' },
    futuro:   { cor:'var(--muted)', label:'Futuro' },
    semdata:  { cor:'var(--muted)', label:'Sem data' },
    pago:     { cor:'var(--green)', label:'Pago' }
  };
  var s = map[sit] || map.semdata;
  return '<span style="font-size:0.68rem;padding:2px 7px;border-radius:10px;background:'+s.cor+'22;color:'+s.cor+';font-weight:700;white-space:nowrap">'+s.label+'</span>';
}
function _sortLancsAP(arr, sort) {
  return arr.slice().sort(function(a,b) {
    var av,bv;
    if(sort.col==='vencimento'){av=a.vencimento||'';bv=b.vencimento||'';}
    else if(sort.col==='desc'){av=(a.desc||'').toLowerCase();bv=(b.desc||'').toLowerCase();}
    else if(sort.col==='categoria'){av=a.categoria||'';bv=b.categoria||'';}
    else if(sort.col==='subCategoria'){av=a.subCategoria||'';bv=b.subCategoria||'';}
    else if(sort.col==='pagamento'){av=(a.pagamento||'').toLowerCase();bv=(b.pagamento||'').toLowerCase();}
    else if(sort.col==='banco'){av=a.banco||'';bv=b.banco||'';}
    else if(sort.col==='valor'){av=a.valor||0;bv=b.valor||0;}
    else{av=a.vencimento||'';bv=b.vencimento||'';}
    if(av<bv)return -1*sort.dir; if(av>bv)return 1*sort.dir; return 0;
  });
}

function _renderCardsAP(elId, all, filtroSit, isRec) {
  var el = document.getElementById(elId); if(!el) return;
  var cor = isRec ? 'var(--green)' : 'var(--red)';
  var tipo = isRec ? 'receber' : 'pagar';
  var fn = isRec ? '_setAReceberSit' : '_setAPagarSit';
  var pendentes = all.filter(function(l){return l.status!=='pago';});
  var pagos     = all.filter(function(l){return l.status==='pago';});
  var total=pendentes.reduce(function(s,l){return s+(l.valor||0);},0);
  var vencido=pendentes.filter(function(l){return _sitLancAP(l.vencimento,l.status)==='vencido';}).reduce(function(s,l){return s+(l.valor||0);},0);
  var hojeVal=pendentes.filter(function(l){return _sitLancAP(l.vencimento,l.status)==='hoje';}).reduce(function(s,l){return s+(l.valor||0);},0);
  var aVencer=pendentes.filter(function(l){var s=_sitLancAP(l.vencimento,l.status);return s==='proximos'||s==='futuro';}).reduce(function(s,l){return s+(l.valor||0);},0);
  function cs(sit){return filtroSit===sit?'cursor:pointer;box-shadow:0 0 0 2px '+(sit==='vencido'?'#ef4444':sit==='hoje'?'#f59e0b':'#60a5fa')+';':'cursor:pointer;opacity:0.85;';}
  el.innerHTML=
    '<div class="card sm" style="border-top:3px solid '+cor+'" onclick="'+fn+'(\'\')">'+
    '<div class="card-header"><span class="card-label" style="color:'+cor+'">Total a '+tipo+'</span><span>'+(isRec?'📥':'📤')+'</span></div>'+
    '<div class="card-value" style="color:'+cor+'">'+(isRec?'+':'-')+fmt(total)+'</div>'+
    '<div class="card-footer"><span class="card-sub">'+pendentes.length+' pendentes</span></div></div>'+
    '<div class="card sm" style="border-top:3px solid #ef4444;'+cs('vencido')+'" onclick="'+fn+'(\'vencido\')">'+
    '<div class="card-header"><span class="card-label" style="color:#ef4444">🔴 Vencido</span></div>'+
    '<div class="card-value" style="color:#ef4444">'+fmt(vencido)+'</div>'+
    '<div class="card-footer"><span class="card-sub">'+(filtroSit==='vencido'?'✓ filtrado':'clique p/ filtrar')+'</span></div></div>'+
    '<div class="card sm" style="border-top:3px solid #f59e0b;'+cs('hoje')+'" onclick="'+fn+'(\'hoje\')">'+
    '<div class="card-header"><span class="card-label" style="color:#f59e0b">🟡 Hoje</span></div>'+
    '<div class="card-value" style="color:#f59e0b">'+fmt(hojeVal)+'</div>'+
    '<div class="card-footer"><span class="card-sub">'+(filtroSit==='hoje'?'✓ filtrado':'clique p/ filtrar')+'</span></div></div>'+
    '<div class="card sm" style="border-top:3px solid #60a5fa;'+cs('proximos')+'" onclick="'+fn+'(\'proximos\')">'+
    '<div class="card-header"><span class="card-label" style="color:#60a5fa">🔵 A Vencer</span></div>'+
    '<div class="card-value" style="color:#60a5fa">'+fmt(aVencer)+'</div>'+
    '<div class="card-footer"><span class="card-sub">'+(filtroSit==='proximos'?'✓ filtrado':'clique p/ filtrar')+'</span></div></div>'+
    '<div class="card sm" style="border-top:3px solid var(--green)">'+
    '<div class="card-header"><span class="card-label" style="color:var(--green)">✅ '+(isRec?'Recebido':'Pago')+'</span></div>'+
    '<div class="card-value" style="color:var(--green)">'+fmt(pagos.reduce(function(s,l){return s+(l.valor||0);},0))+'</div>'+
    '<div class="card-footer"><span class="card-sub">'+pagos.length+' lançamentos</span></div></div>';
}

function _renderStatusFilter(isRec) {
  var filtro = isRec ? _aReceberFiltroStatus : _aPagarFiltroStatus;
  var fn = isRec ? '_setAReceberStatus' : '_setAPagarStatus';
  var opts = [
    { v:'',              label:'Todos',                    cor:'var(--accent2)' },
    { v:'pendente',      label:'Em aberto',                cor:'#f59e0b' },
    { v:'pago',          label: isRec ? 'Recebido':'Pago', cor:'var(--green)' },
    { v:'vencido_status',label:'Atrasado',                 cor:'#ef4444' }
  ];
  return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' +
    opts.map(function(o) {
      var ativo = filtro === o.v;
      return '<button onclick="'+fn+'(\''+o.v+'\')" style="padding:5px 16px;border-radius:20px;border:1px solid '+(ativo?o.cor:'var(--border)')+';background:'+(ativo?o.cor+'22':'var(--surface2)')+';color:'+(ativo?o.cor:'var(--text2)')+';font-size:0.75rem;font-weight:'+(ativo?'700':'400')+';cursor:pointer;transition:all 120ms">'+o.label+'</button>';
    }).join('') +
  '</div>';
}

function _initFselAP(prefixo, onchange) {
  ['FiltroCat','FiltroSubCat','FiltroPag','FiltroBanco'].forEach(function(s) {
    var selId=prefixo+s, wrapId='fsel-'+selId, sel=document.getElementById(selId);
    if(!sel||!window.FSEL) return;
    var opts=Array.from(sel.options).map(function(o){return{value:o.value,text:o.text};});
    FSEL.build(wrapId,selId,opts,onchange);
  });
}
function _rebuildFselAP(id, items, placeholder) {
  var sel=document.getElementById(id); if(!sel) return;
  sel.innerHTML='<option value="">'+placeholder+'</option>'+items.map(function(v){return'<option value="'+v+'">'+v+'</option>';}).join('');
  if(window.FSEL) _fselRebuild(id);
}
function _rebuildBancoFselAP(id) {
  var bancos=loadBancos(), sel=document.getElementById(id); if(!sel) return;
  sel.innerHTML='<option value="">— Todos os bancos —</option>'+bancos.map(function(b){return'<option value="'+b.id+'">'+(b.icone||'🏦')+' '+b.nome+'</option>';}).join('');
  if(window.FSEL) _fselRebuild(id);
}
function _bancoCellAP(bancoId) {
  var b=loadBancos().find(function(x){return x.id===bancoId;});
  return b?'<span style="color:'+(b.cor||'var(--text)')+'">'+( b.icone||'🏦')+' '+b.nome+'</span>':'—';
}
// ── Mobile card renderer for A Receber / A Pagar ─────────────────────────────
function _apMobileCard(l, isRec) {
  var sid = String(l.id).replace(/'/g, "\'");
  var sit = _sitLancAP(l.vencimento, l.status);
  var isPago = l.status === 'pago';
  var cor = isRec ? 'var(--green)' : 'var(--red)';
  var bancoObj = loadBancos().find(function(b){ return b.id === l.banco; });
  var parc = l.parcAtual
    ? ('<span style="background:rgba(240,144,64,0.85);color:#000;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-left:6px">'
        + l.parcAtual + '/' + l.parcTotal + '</span>') : '';
  var renderFnName = isRec ? 'renderAReceberTab' : 'renderAPagarTab';
  var acaoLabel = isRec ? (isPago ? '↩ Desfazer' : '✓ Receber') : (isPago ? '↩ Desfazer' : '✓ Pagar');
  var acaoStatus = isPago ? 'pendente' : 'pago';
  var acaoCor = isPago ? 'rgba(255,255,255,0.06);border:1px solid var(--border);color:var(--muted)' : (isRec ? 'rgba(48,208,128,0.15);border:1px solid var(--green);color:var(--green)' : 'rgba(239,68,68,0.15);border:1px solid var(--red);color:var(--red)');
  var excluirFn = isRec ? 'renderAReceberTab' : 'renderAPagarTab';
  return '<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ' + cor + ';border-radius:10px;padding:12px 14px;margin-bottom:8px;' + (isPago ? 'opacity:0.65' : '') + '">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
      + '<div>' + _sitBadgeAP(sit) + '<div style="font-size:0.7rem;color:var(--text2);margin-top:3px">' + _fmtVencAP(l.vencimento) + '</div></div>'
      + '<span style="font-size:0.95rem;font-weight:700;color:' + cor + '">' + (isRec ? '+' : '-') + fmt(l.valor || 0) + '</span>'
    + '</div>'
    + '<div style="font-weight:700;font-size:0.9rem;margin-bottom:6px;">' + ((l.desc || '—').replace(/\s*\(\d+\/\d+\)\s*$/, '')) + parc + '</div>'
    + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">'
      + '<span style="font-size:0.75rem;color:var(--text2)">' + (l.categoria || '—') + (l.subCategoria ? ' › ' + l.subCategoria : '') + '</span>'
      + (l.pagamento ? '<span style="background:var(--surface2);border:1px solid var(--border);padding:2px 8px;border-radius:10px;font-size:0.7rem;color:var(--text2)">' + l.pagamento + '</span>' : '')
      + (bancoObj ? '<span style="background:' + bancoObj.cor + '18;border:1px solid ' + bancoObj.cor + '44;color:' + bancoObj.cor + ';padding:2px 8px;border-radius:10px;font-size:0.7rem">' + (bancoObj.icone || '🏦') + ' ' + bancoObj.nome + '</span>' : '')
      + (l.recorr && l.recorr !== 'unico' ? '<span class="badge ' + (l.recorr === 'fixo' ? 'badge-fixo' : 'badge-parcelado') + '">' + (l.recorr === 'fixo' ? '↻ Fixo' : '⊞ Parcelado') + '</span>' : '')
    + '</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">'
      + '<span class="badge badge-' + l.status + '">' + (isPago ? (isRec ? '✓ Recebido' : '✓ Pago') : '⏳ Pendente') + '</span>'
      + '<div style="display:flex;gap:5px;flex-wrap:wrap;">'
        + '<button onclick="toggleStatusLanc(\'' + sid + '\',\'' + acaoStatus + '\');setTimeout(' + renderFnName + ',100)" style="background:' + acaoCor + ';border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">' + acaoLabel + '</button>'
        + '<button onclick="editLancamento(\'' + sid + '\')" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.30);color:var(--accent2);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✎ Editar</button>'
        + '<button onclick="_excluirLancAP(\'' + sid + '\', ' + excluirFn + ')" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);color:#ef4444;border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">🗑</button>'
      + '</div>'
    + '</div>'
    + '</div>';
}

function _apShowMobileCards(containerId, tableEl, items, isRec) {
  // Walk up from tbody to hide all wrapping elements
  var el = tableEl;
  while (el && el.tagName !== 'SECTION' && el.tagName !== 'MAIN') {
    if (el.classList && (el.classList.contains('table-scroll-wrap') || el.classList.contains('panel'))) {
      el.style.display = 'none';
    }
    el = el.parentElement;
  }
  if (tableEl) tableEl.style.display = 'none';

  // Find or create card container — insert after the hidden panel as a sibling
  var cont = document.getElementById(containerId);
  if (!cont) {
    cont = document.createElement('div');
    cont.id = containerId;
    // Find the tab div (tab-areceber or tab-apagar) and append directly to it
    var tabDiv = tableEl ? tableEl.closest('[id^="tab-"]') : null;
    if (tabDiv) {
      tabDiv.appendChild(cont);
    }
  }
  cont.style.display = 'block';
  if (!items.length) {
    cont.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.85rem;">Nenhum lançamento encontrado.</div>';
  } else {
    cont.innerHTML = items.map(function(l){ return _apMobileCard(l, isRec); }).join('');
  }
}

function _apHideMobileCards(containerId, tableEl) {
  // Restore all wrapped elements
  var el = tableEl;
  while (el && el.tagName !== 'SECTION' && el.tagName !== 'MAIN') {
    if (el.classList && (el.classList.contains('table-scroll-wrap') || el.classList.contains('panel'))) {
      el.style.display = '';
    }
    el = el.parentElement;
  }
  if (tableEl) tableEl.style.display = '';
  var cont = document.getElementById(containerId);
  if (cont) cont.style.display = 'none';
}


function _updateSortHeadersAP(tabId, sortObj, fnName) {
  document.querySelectorAll('#tab-'+tabId+' thead th.sortable').forEach(function(th){
    th.classList.remove('sort-asc','sort-desc');
    var col=(th.getAttribute('onclick')||'').replace(fnName+"('","").replace("')","");
    if(col===sortObj.col) th.classList.add(sortObj.dir===1?'sort-asc':'sort-desc');
  });
}

// ── Exclusão ─────────────────────────────────────────────────────────

async function _excluirLancAP(id, renderFn) {
  var allData = await loadData();
  var item = allData.find(function(l){ return String(l.id) === String(id); });
  if (!item) return;

  var isFixo      = item.recorr === 'fixo'      || item.tipoLanc === 'fixo';
  var isParcelado = item.recorr === 'parcelado' || item.tipoLanc === 'parcelado';

  function _batchDeleteFromDB(idsSet) {
    (async function() {
      try {
        var _token = await _getValidToken();
        var _uid   = _currentUser.id;
        var _ids   = Array.from(idsSet);
        for (var _i = 0; _i < _ids.length; _i += 100) {
          var _lote   = _ids.slice(_i, _i + 100);
          var _filtro = _lote.map(function(x){ return '"' + x + '"'; }).join(',');
          await fetch(SB_URL + '/rest/v1/mf_lancamentos?user_id=eq.' + _uid + '&id=in.(' + _filtro + ')', {
            method: 'DELETE',
            headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + _token, 'Prefer': 'return=minimal' }
          });
        }
      } catch(e) { console.warn('[_excluirLancAP] erro banco:', e.message); }
    })();
  }

  if (isFixo || isParcelado) {
    var groupId = item.groupId;
    var groups  = {};
    if (!groupId) {
      // Lançamento avulso sem grupo — usa confirm simples
      if (!await _showSimpleConfirm('🗑 Excluir lançamento', 'Deseja excluir este lançamento?', 'Excluir', 'var(--red)')) return;
      _addTombstone(id);
      if (_memCache.lancamentos) {
        _memCache.lancamentos = _memCache.lancamentos.filter(function(l){ return String(l.id) !== String(id); });
      }
      safeRender(function(){ renderAll(); renderFn(); });
      if (typeof dbDeleteLancamento === 'function') dbDeleteLancamento(id).catch(function(e){ console.warn('[excluirLancAP]', e.message); });
      return;
    }
    if (isFixo)      groups = { parcelGroups: {}, fixoGroups: {} };
    else             groups = { parcelGroups: {}, fixoGroups: {} };
    var parcelGroups = isParcelado ? {} : {};
    var fixoGroups   = isFixo      ? {} : {};
    if (isFixo)      fixoGroups[String(groupId)]   = String(item.id);
    else             parcelGroups[String(groupId)]  = String(item.id);

    openDeleteParcelasModal(parcelGroups, fixoGroups).then(async function(result) {
      if (!result) return;
      var r = result[String(groupId)];
      if (!r) return;
      var allNow    = await loadData();
      var groupItems = allNow.filter(function(l){ return String(l.groupId) === String(groupId); });
      var selMes = item.mes, selAno = item.ano;
      var toDelete;
      if (r.mode === 'all') {
        toDelete = new Set(groupItems.map(function(l){ return String(l.id); }));
      } else if (r.mode === 'forward') {
        toDelete = new Set(groupItems
          .filter(function(l){ return l.ano > selAno || (l.ano === selAno && l.mes >= selMes); })
          .map(function(l){ return String(l.id); }));
      } else {
        toDelete = new Set([String(item.id)]);
      }
      toDelete.forEach(function(tid){ _addTombstone(tid); });
      if (_memCache.lancamentos) {
        _memCache.lancamentos = _memCache.lancamentos.filter(function(l){ return !toDelete.has(String(l.id)); });
      }
      safeRender(function(){ renderAll(); renderFn(); });
      _batchDeleteFromDB(toDelete);
    });
  } else {
    // Lançamento avulso — confirm simples
    if (!await _showSimpleConfirm('🗑 Excluir lançamento', 'Deseja excluir este lançamento?', 'Excluir', 'var(--red)')) return;
    _addTombstone(id);
    if (_memCache.lancamentos) {
      _memCache.lancamentos = _memCache.lancamentos.filter(function(l){ return String(l.id) !== String(id); });
    }
    safeRender(function(){ renderAll(); renderFn(); });
    if (typeof dbDeleteLancamento === 'function') dbDeleteLancamento(id).catch(function(e){ console.warn('[excluirLancAP]', e.message); });
  }
}

async function _excluirSelecionadosAP(isRec) {
  var ids = isRec ? _aReceberSelecionados.slice() : _aPagarSelecionados.slice();
  var renderFn = isRec ? renderAReceberTab : renderAPagarTab;
  if (!ids || !ids.length) return;
  if (!await _showSimpleConfirm('🗑 Excluir selecionados', 'Deseja excluir os ' + ids.length + ' itens selecionados?', 'Excluir', 'var(--red)')) return;
  var idsSet = new Set(ids.map(String));
  ids.forEach(function(id){ _addTombstone(id); });
  if (_memCache.lancamentos) {
    _memCache.lancamentos = _memCache.lancamentos.filter(function(l){ return !idsSet.has(String(l.id)); });
  }
  ids.forEach(function(id){
    if (typeof dbDeleteLancamento === 'function') {
      dbDeleteLancamento(id).catch(function(e){ console.warn('[excluirSelecionadosAP]', e.message); });
    }
  });
  if (isRec) _aReceberSelecionados = [];
  else _aPagarSelecionados = [];
  safeRender(function(){ renderAll(); renderFn(); });
}

function _toggleSelAP(id, isRec) {
  var arr = isRec ? _aReceberSelecionados : _aPagarSelecionados;
  var sid = String(id);
  var idx = arr.indexOf(sid);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(sid);
  _updateBulkBarAP(isRec);
}

function _toggleSelAllAP(isRec, ids) {
  var arr = isRec ? _aReceberSelecionados : _aPagarSelecionados;
  var allSelected = ids.length > 0 && ids.every(function(id){ return arr.indexOf(String(id)) >= 0; });
  if (allSelected) {
    ids.forEach(function(id){ var i=arr.indexOf(String(id)); if(i>=0) arr.splice(i,1); });
  } else {
    ids.forEach(function(id){ if(arr.indexOf(String(id))<0) arr.push(String(id)); });
  }
  if (isRec) _aReceberSelecionados = arr;
  else _aPagarSelecionados = arr;
  if (isRec) renderAReceberTab();
  else renderAPagarTab();
}

function _updateBulkBarAP(isRec) {
  var bar = document.getElementById(isRec ? 'aReceberBulkBar' : 'aPagarBulkBar');
  if (!bar) return;
  var arr = isRec ? _aReceberSelecionados : _aPagarSelecionados;
  if (arr.length > 0) {
    bar.style.display = 'flex';
    var countEl = bar.querySelector('.ap-bulk-count');
    if (countEl) countEl.textContent = arr.length + ' selecionado(s)';
  } else {
    bar.style.display = 'none';
  }
}

// ── A RECEBER ────────────────────────────────────────────────────────

function renderAReceberTab() {
  if(!_aReceberFselInited && window.FSEL) {
    _initFselAP('aReceber', function(){renderAReceberTab();});
    _aReceberFselInited = true;
  }
  var CAT_EXCL = ['Entrada Terceiro','Dividas de terceiros'];

  var base = _applyBancoFilter(getMonthData().filter(function(l){
    return l.tipo==='receita' && CAT_EXCL.indexOf(l.categoria||'')<0;
  }));

  var all;
  if (_aReceberFiltroStatus === 'pendente') {
    all = base.filter(function(l){ return l.status !== 'pago'; });
  } else if (_aReceberFiltroStatus === 'pago') {
    all = base.filter(function(l){ return l.status === 'pago'; });
  } else if (_aReceberFiltroStatus === 'vencido_status') {
    all = base.filter(function(l){ return l.status !== 'pago' && _sitLancAP(l.vencimento, l.status) === 'vencido'; });
  } else {
    all = base;
  }

  _renderCardsAP('aReceberCards', base, _aReceberFiltroSit, true);

  // Injeta filtro de status
  var sfEl = document.getElementById('aReceberStatusFilter');
  if (sfEl) sfEl.innerHTML = _renderStatusFilter(true);

  _rebuildFselAP('aReceberFiltroCat',    [...new Set(all.map(function(l){return l.categoria;}).filter(Boolean))].sort(), '— Todas as categorias —');
  _rebuildFselAP('aReceberFiltroSubCat', [...new Set(all.map(function(l){return l.subCategoria;}).filter(Boolean))].sort(), '— Todas as sub-cat. —');
  _rebuildFselAP('aReceberFiltroPag',    [...new Set(all.map(function(l){return l.pagamento;}).filter(Boolean))].sort(), '— Todos os pagamentos —');
  _rebuildBancoFselAP('aReceberFiltroBanco');

  var catF    = window.FSEL ? FSEL.getValues('aReceberFiltroCat')    : [];
  var subCatF = window.FSEL ? FSEL.getValues('aReceberFiltroSubCat') : [];
  var pagF    = window.FSEL ? FSEL.getValues('aReceberFiltroPag')    : [];
  var bancF   = window.FSEL ? FSEL.getValues('aReceberFiltroBanco')  : [];
  var busca   = (document.getElementById('aReceberBusca')?.value||'').toLowerCase();

  var filtered = all.filter(function(l){
    if(_aReceberFiltroSit && _sitLancAP(l.vencimento,l.status)!==_aReceberFiltroSit) return false;
    if(catF.length    && catF.indexOf(l.categoria||'')<0)    return false;
    if(subCatF.length && subCatF.indexOf(l.subCategoria||'')<0) return false;
    if(pagF.length    && pagF.indexOf(l.pagamento||'')<0)    return false;
    if(bancF.length   && bancF.indexOf(l.banco||'')<0)       return false;
    if(busca && (l.desc||'').toLowerCase().indexOf(busca)<0) return false;
    return true;
  });

  var infoEl = document.getElementById('aReceberInfo');
  if(infoEl) infoEl.textContent = filtered.length+' lançamentos · Total: +'+fmt(filtered.reduce(function(s,l){return s+(l.valor||0);},0));

  var sorted = _sortLancsAP(filtered, _aReceberSort);
  var tbody  = document.getElementById('aReceberTableBody'); if(!tbody) return;

  var filteredIds = sorted.map(function(l){ return String(l.id); });
  var allSelected = filteredIds.length > 0 && filteredIds.every(function(id){ return _aReceberSelecionados.indexOf(id) >= 0; });

  var cbHeader = document.getElementById('aReceberCbAll');
  if (cbHeader) cbHeader.checked = allSelected;

  var bulkBar = document.getElementById('aReceberBulkBar');
  if (bulkBar) {
    bulkBar.style.display = _aReceberSelecionados.length > 0 ? 'flex' : 'none';
    var countEl = bulkBar.querySelector('.ap-bulk-count');
    if (countEl) countEl.textContent = _aReceberSelecionados.length + ' selecionado(s)';
  }

  var _recTable = tbody.closest('table');
  if (window.matchMedia("(max-width:768px)").matches) {
    _apShowMobileCards('aReceberCardContainer', _recTable, sorted, true);
  } else {
    _apHideMobileCards('aReceberCardContainer', _recTable);
    if(!sorted.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhum lançamento encontrado.</td></tr>';
    } else {
      tbody.innerHTML = sorted.map(function(l){
      var sit=_sitLancAP(l.vencimento,l.status), sid=String(l.id).replace(/'/g,"\\'");
      var parc=l.parcAtual?'<span style="background:rgba(240,144,64,0.85);color:#000;padding:0 5px;border-radius:3px;font-size:0.65rem;font-weight:700;margin-left:4px">'+l.parcAtual+'/'+l.parcTotal+'</span>':'';
      var isSel = _aReceberSelecionados.indexOf(String(l.id)) >= 0;
      var isPago = l.status === 'pago';
      return '<tr style="border-bottom:1px solid var(--border);opacity:'+(isPago?'0.7':'1')+'">'+
        '<td style="padding:8px 10px;text-align:center"><input type="checkbox" id="ap-cb-'+l.id+'" '+(isSel?'checked':'')+' onchange="_toggleSelAP(\''+sid+'\',true)" style="cursor:pointer;width:15px;height:15px;accent-color:var(--accent)"></td>'+
        '<td style="padding:8px 12px;white-space:nowrap">'+_sitBadgeAP(sit)+'<div style="font-size:0.7rem;color:var(--text2);margin-top:3px">'+_fmtVencAP(l.vencimento)+'</div></td>'+
        '<td style="padding:8px 10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+((l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,''))+parc+'</td>'+
        '<td style="padding:8px 10px;font-size:0.74rem;color:var(--muted)">'+(l.categoria||'—')+'</td>'+
        '<td style="padding:8px 10px;font-size:0.72rem;color:var(--muted)">'+(l.subCategoria||'—')+'</td>'+
        '<td style="padding:8px 10px;font-size:0.74rem">'+(l.pagamento||'—')+'</td>'+
        '<td style="padding:8px 10px;font-size:0.74rem">'+_bancoCellAP(l.banco)+'</td>'+
        '<td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--green)">+'+fmt(l.valor||0)+'</td>'+
        '<td style="padding:8px 12px;text-align:center;white-space:nowrap">'+
          (!isPago
            ? '<button onclick="toggleStatusLanc(\''+sid+'\',\'pago\');setTimeout(renderAReceberTab,100)" style="background:rgba(48,208,128,0.15);border:1px solid var(--green);color:var(--green);border-radius:6px;padding:4px 10px;font-size:0.72rem;font-weight:700;cursor:pointer">✓ Receber</button>'
            : '<button onclick="toggleStatusLanc(\''+sid+'\',\'pendente\');setTimeout(renderAReceberTab,100)" style="background:rgba(255,255,255,0.06);border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:4px 10px;font-size:0.72rem;cursor:pointer">↩ Desfazer</button>')+
          ' <button onclick="editLancamento(\''+sid+'\')" style="background:none;border:1px solid var(--border);color:var(--accent2);border-radius:6px;padding:4px 8px;font-size:0.72rem;cursor:pointer">✎</button>'+
          ' <button onclick="_excluirLancAP(\''+sid+'\',renderAReceberTab)" style="background:none;border:1px solid rgba(239,68,68,0.4);color:#ef4444;border-radius:6px;padding:4px 8px;font-size:0.72rem;cursor:pointer" title="Excluir">🗑</button>'+
        '</td></tr>';
    }).join('');
    }
  }
  _updateSortHeadersAP('areceber', _aReceberSort, 'setAReceberSort');
}

// ── A PAGAR ──────────────────────────────────────────────────────────

function renderAPagarTab() {
  if(!_aPagarFselInited && window.FSEL) {
    _initFselAP('aPagar', function(){renderAPagarTab();});
    _aPagarFselInited = true;
  }
  var CAT_EXCL = ['Entrada Terceiro','Dividas de terceiros'];

  var base = _applyBancoFilter(getMonthData().filter(function(l){
    return l.tipo==='despesa' && CAT_EXCL.indexOf(l.categoria||'')<0;
  }));

  var all;
  if (_aPagarFiltroStatus === 'pendente') {
    all = base.filter(function(l){ return l.status !== 'pago'; });
  } else if (_aPagarFiltroStatus === 'pago') {
    all = base.filter(function(l){ return l.status === 'pago'; });
  } else if (_aPagarFiltroStatus === 'vencido_status') {
    all = base.filter(function(l){ return l.status !== 'pago' && _sitLancAP(l.vencimento, l.status) === 'vencido'; });
  } else {
    all = base;
  }

  _renderCardsAP('aPagarCards', base, _aPagarFiltroSit, false);

  var sfEl = document.getElementById('aPagarStatusFilter');
  if (sfEl) sfEl.innerHTML = _renderStatusFilter(false);

  _rebuildFselAP('aPagarFiltroCat',    [...new Set(all.map(function(l){return l.categoria;}).filter(Boolean))].sort(), '— Todas as categorias —');
  _rebuildFselAP('aPagarFiltroSubCat', [...new Set(all.map(function(l){return l.subCategoria;}).filter(Boolean))].sort(), '— Todas as sub-cat. —');
  _rebuildFselAP('aPagarFiltroPag',    [...new Set(all.map(function(l){return l.pagamento;}).filter(Boolean))].sort(), '— Todos os pagamentos —');
  _rebuildBancoFselAP('aPagarFiltroBanco');

  var catF    = window.FSEL ? FSEL.getValues('aPagarFiltroCat')    : [];
  var subCatF = window.FSEL ? FSEL.getValues('aPagarFiltroSubCat') : [];
  var pagF    = window.FSEL ? FSEL.getValues('aPagarFiltroPag')    : [];
  var bancF   = window.FSEL ? FSEL.getValues('aPagarFiltroBanco')  : [];
  var busca   = (document.getElementById('aPagarBusca')?.value||'').toLowerCase();

  var filtered = all.filter(function(l){
    if(_aPagarFiltroSit && _sitLancAP(l.vencimento,l.status)!==_aPagarFiltroSit) return false;
    if(catF.length    && catF.indexOf(l.categoria||'')<0)    return false;
    if(subCatF.length && subCatF.indexOf(l.subCategoria||'')<0) return false;
    if(pagF.length    && pagF.indexOf(l.pagamento||'')<0)    return false;
    if(bancF.length   && bancF.indexOf(l.banco||'')<0)       return false;
    if(busca && (l.desc||'').toLowerCase().indexOf(busca)<0) return false;
    return true;
  });

  var infoEl = document.getElementById('aPagarInfo');
  if(infoEl) infoEl.textContent = filtered.length+' lançamentos · Total: -'+fmt(filtered.reduce(function(s,l){return s+(l.valor||0);},0));

  var sorted = _sortLancsAP(filtered, _aPagarSort);
  var tbody  = document.getElementById('aPagarTableBody'); if(!tbody) return;

  var filteredIds = sorted.map(function(l){ return String(l.id); });
  var allSelected = filteredIds.length > 0 && filteredIds.every(function(id){ return _aPagarSelecionados.indexOf(id) >= 0; });

  var cbHeader = document.getElementById('aPagarCbAll');
  if (cbHeader) cbHeader.checked = allSelected;

  var bulkBar = document.getElementById('aPagarBulkBar');
  if (bulkBar) {
    bulkBar.style.display = _aPagarSelecionados.length > 0 ? 'flex' : 'none';
    var countEl = bulkBar.querySelector('.ap-bulk-count');
    if (countEl) countEl.textContent = _aPagarSelecionados.length + ' selecionado(s)';
  }

  if(!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum lançamento encontrado.</td></tr>';
    return;
  }

  var grupos = {};
  sorted.forEach(function(l){
    var cat=l.categoria||'— Sem categoria';
    if(!grupos[cat]) grupos[cat]=[];
    grupos[cat].push(l);
  });

  var html = '';
  Object.entries(grupos).sort(function(a,b){return a[0].localeCompare(b[0],'pt-BR');}).forEach(function(entry){
    var cat=entry[0], items=entry[1];
    var totalCat=items.reduce(function(s,l){return s+(l.valor||0);},0);
    html+='<tr style="background:rgba(255,255,255,0.04);border-bottom:1px solid var(--border)">'+
      '<td></td>'+
      '<td colspan="5" style="padding:6px 12px;font-size:0.72rem;font-weight:700;color:var(--accent2)">📁 '+cat+'</td>'+
      '<td style="padding:6px 12px;text-align:right;font-size:0.73rem;font-weight:700;color:var(--red)">-'+fmt(totalCat)+'</td><td></td></tr>';
    items.forEach(function(l){
      var sit=_sitLancAP(l.vencimento,l.status), sid=String(l.id).replace(/'/g,"\\'");
      var parc=l.parcAtual?'<span style="background:rgba(240,144,64,0.85);color:#000;padding:0 5px;border-radius:3px;font-size:0.65rem;font-weight:700;margin-left:4px">'+l.parcAtual+'/'+l.parcTotal+'</span>':'';
      var isSel = _aPagarSelecionados.indexOf(String(l.id)) >= 0;
      var isPago = l.status === 'pago';
      html+='<tr style="border-bottom:1px solid rgba(255,255,255,0.04);opacity:'+(isPago?'0.7':'1')+'">'+
        '<td style="padding:7px 10px;text-align:center"><input type="checkbox" id="ap-cb-'+l.id+'" '+(isSel?'checked':'')+' onchange="_toggleSelAP(\''+sid+'\',false)" style="cursor:pointer;width:15px;height:15px;accent-color:var(--accent)"></td>'+
        '<td style="padding:7px 12px;white-space:nowrap">'+_sitBadgeAP(sit)+'<div style="font-size:0.7rem;color:var(--text2);margin-top:2px">'+_fmtVencAP(l.vencimento)+'</div></td>'+
        '<td style="padding:7px 10px;font-size:0.78rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+((l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,''))+parc+'</td>'+
        '<td style="padding:7px 10px;font-size:0.73rem;color:var(--muted)">'+(l.subCategoria||'—')+'</td>'+
        '<td style="padding:7px 10px;font-size:0.73rem">'+(l.pagamento||'—')+'</td>'+
        '<td style="padding:7px 10px;font-size:0.73rem">'+_bancoCellAP(l.banco)+'</td>'+
        '<td style="padding:7px 12px;text-align:right;font-weight:700;color:var(--red)">-'+fmt(l.valor||0)+'</td>'+
        '<td style="padding:7px 12px;text-align:center;white-space:nowrap">'+
          (!isPago
            ? '<button onclick="toggleStatusLanc(\''+sid+'\',\'pago\');setTimeout(renderAPagarTab,100)" style="background:rgba(239,68,68,0.15);border:1px solid var(--red);color:var(--red);border-radius:6px;padding:4px 10px;font-size:0.72rem;font-weight:700;cursor:pointer">✓ Pagar</button>'
            : '<button onclick="toggleStatusLanc(\''+sid+'\',\'pendente\');setTimeout(renderAPagarTab,100)" style="background:rgba(255,255,255,0.06);border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:4px 10px;font-size:0.72rem;cursor:pointer">↩ Desfazer</button>')+
          ' <button onclick="editLancamento(\''+sid+'\')" style="background:none;border:1px solid var(--border);color:var(--accent2);border-radius:6px;padding:4px 8px;font-size:0.72rem;cursor:pointer">✎</button>'+
          ' <button onclick="_excluirLancAP(\''+sid+'\',renderAPagarTab)" style="background:none;border:1px solid rgba(239,68,68,0.4);color:#ef4444;border-radius:6px;padding:4px 8px;font-size:0.72rem;cursor:pointer" title="Excluir">🗑</button>'+
        '</td></tr>';
    });
  });
  var _pagTable = tbody.closest('table');
  if (window.matchMedia("(max-width:768px)").matches) {
    // On mobile: render cards grouped by category
    _pagTable && (_pagTable.style.display = 'none');
    var _pagCont = document.getElementById('aPagarCardContainer');
    if (!_pagCont) {
      _pagCont = document.createElement('div');
      _pagCont.id = 'aPagarCardContainer';
      _pagTable && _pagTable.parentNode.insertBefore(_pagCont, _pagTable.nextSibling);
    }
    _pagCont.style.display = 'block';
    if (!sorted.length) {
      _pagCont.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.85rem;">Nenhum lançamento encontrado.</div>';
    } else {
      // Group by category for mobile too
      var _gruposMob = {};
      sorted.forEach(function(l) {
        var cat = l.categoria || '— Sem categoria';
        if (!_gruposMob[cat]) _gruposMob[cat] = [];
        _gruposMob[cat].push(l);
      });
      var _mobHtml = '';
      Object.entries(_gruposMob).sort(function(a,b){return a[0].localeCompare(b[0],'pt-BR');}).forEach(function(entry) {
        var cat = entry[0], items = entry[1];
        var totalCat = items.reduce(function(s,l){return s+(l.valor||0);},0);
        _mobHtml += '<div style="font-size:0.65rem;font-weight:700;color:var(--accent2);letter-spacing:.05em;padding:8px 4px 4px">📁 ' + cat + ' — -' + fmt(totalCat) + '</div>';
        _mobHtml += items.map(function(l){ return _apMobileCard(l, false); }).join('');
      });
      _pagCont.innerHTML = _mobHtml;
    }
  } else {
    _pagTable && (_pagTable.style.display = '');
    var _pagCont = document.getElementById('aPagarCardContainer');
    if (_pagCont) _pagCont.style.display = 'none';
    tbody.innerHTML = html;
  }
  _updateSortHeadersAP('apagar', _aPagarSort, 'setAPagarSort');
}