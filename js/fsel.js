// ======== FSEL — SEARCHABLE MULTI SELECT ========
// Replace old engine completely
(function(){
  // State: selId -> Set of selected values
  var _state = {};
  var _active = null; // selId currently open
  var _callbacks = {}; // selId -> onchange fn
  var _optsMap = {}; // selId -> opts array
  function _getOpts(selId){ return _optsMap[selId] || null; }

  function _getState(selId){ return _state[selId] || new Set(); }

  function _getLabel(selId, opts){
    var st = _getState(selId);
    if(st.size === 0) return opts[0] ? opts[0].text : '—';
    if(st.size === 1) {
      var v = [...st][0];
      var found = opts.find(function(o){ return o.value === v; });
      return found ? found.text : v;
    }
    return st.size + ' selecionados';
  }

  function _getValues(selId){
    var st = _getState(selId);
    // __nenhum__ = user explicitly cleared all = filter matches nothing
    if(st.size === 1 && st.has('__nenhum__')) return ['__nenhum__'];
    return [...st];
  }

  function _close(){
    if(_active){
      var drop = document.getElementById('fsd-'+_active);
      if(drop) drop.classList.remove('open');
      _active = null;
    }
  }

  function _renderChips(selId, opts){
    var st = _getState(selId);
    var isNenhum = st.size === 1 && st.has('__nenhum__');
    var isAll = st.size === 0;
    // update trigger label
    var inp = document.getElementById('fsi-'+selId);
    if(inp){
      if(isNenhum){
        inp.value = '— Nenhum —';
        inp.title = '';
      } else {
        inp.value = _getLabel(selId, opts);
        inp.title = st.size > 1 ? [...st].join(', ') : '';
      }
    }
    // update checkboxes
    var list = document.getElementById('fsl-'+selId);
    if(!list) return;
    list.querySelectorAll('.fsel-opt').forEach(function(d){
      var v = d.getAttribute('data-val');
      var chk = d.querySelector('.fsel-chk');
      var checked;
      if(isNenhum){
        checked = false; // nenhum marcado
      } else if(v === '') {
        checked = isAll;
      } else {
        checked = isAll || st.has(v);
      }
      if(chk) chk.checked = checked;
      d.classList.toggle('sel', checked);
    });
  }

  function _buildList(selId, opts, onchange){
    var list = document.getElementById('fsl-'+selId);
    if(!list) return;
    var html = '';
    opts.forEach(function(o){
      html += '<label class="fsel-opt" data-val="'+o.value.replace(/"/g,'&quot;')+'">'+
        '<input type="checkbox" class="fsel-chk" onclick="event.preventDefault();">'+
        '<span>'+o.text+'</span>'+
        '</label>';
    });
    html += '<div class="fsel-empty" id="fse-'+selId+'">Nenhum resultado</div>';
    list.innerHTML = html;
    list.querySelectorAll('.fsel-opt').forEach(function(d){
      var _handleOpt = function(e){
        e.stopPropagation();
        e.preventDefault();
        var v = this.getAttribute('data-val');
        var st = _getState(selId);
        if(v === ''){
          if(st.size === 0){
            _state[selId] = new Set(['__nenhum__']);
          } else {
            _state[selId] = new Set();
          }
        } else {
          if(st.size === 0){
            _state[selId] = new Set([v]);
          } else {
            if(st.has(v)){
              st.delete(v);
              _state[selId] = st.size > 0 ? st : new Set();
            } else {
              st.add(v);
              var allVals = opts.filter(function(o){ return o.value !== ''; }).map(function(o){ return o.value; });
              _state[selId] = allVals.every(function(val){ return st.has(val); }) ? new Set() : st;
            }
          }
        }
        _renderChips(selId, opts);
        if(onchange) onchange(_getValues(selId));
      };
      d.addEventListener('click', _handleOpt);
      d.addEventListener('touchstart', function(e){
        this._touched = true;
      }, {passive: true});
      d.addEventListener('touchend', function(e){
        if(this._touched){
          this._touched = false;
          e.preventDefault(); // impede o click subsequente no touch — sem isso _handleOpt dispara 2x e cancela o filtro
          _handleOpt.call(this, e);
        }
      });
    });
    // Sync visual state after building
    _renderChips(selId, opts);
  }

  function _filterList(selId, q){
    var list = document.getElementById('fsl-'+selId);
    var empty = document.getElementById('fse-'+selId);
    if(!list) return;
    var lo = q.toLowerCase();
    var none = true;
    list.querySelectorAll('.fsel-opt').forEach(function(d){
      var txt = d.querySelector('span') ? d.querySelector('span').textContent.toLowerCase() : '';
      var m = txt.indexOf(lo) !== -1;
      d.style.display = m ? '' : 'none';
      if(m) none = false;
    });
    if(empty) empty.style.display = none ? 'block' : 'none';
  }

  function _open(wrapId, selId){
    _close();
    var wrap = document.getElementById(wrapId);
    var drop = document.getElementById('fsd-'+selId);
    var srch = document.getElementById('fss-'+selId);
    if(!wrap||!drop) return;
    var rect = wrap.getBoundingClientRect();
    var isMobile = window.innerWidth <= 768;

    if (isMobile) {
      // No mobile: dropdown full width, alinhado à borda esquerda da tela com margem
      var dropW = Math.min(window.innerWidth - 16, 360);
      var leftPos = Math.max(8, Math.min(rect.left, window.innerWidth - dropW - 8));
      drop.style.left = leftPos + 'px';
      drop.style.minWidth = dropW + 'px';
      drop.style.maxWidth = dropW + 'px';
    } else {
      drop.style.left = rect.left + 'px';
      drop.style.minWidth = Math.max(rect.width, 200) + 'px';
      drop.style.maxWidth = '320px';
    }

    var spaceBelow = window.innerHeight - rect.bottom;
    if(spaceBelow >= 260 || spaceBelow >= rect.top){
      drop.style.top = (rect.bottom+4)+'px';
      drop.style.bottom = 'auto';
    } else {
      drop.style.top = 'auto';
      drop.style.bottom = (window.innerHeight - rect.top + 4)+'px';
    }
    drop.classList.add('open');
    _active = selId;
    if(srch){ srch.value = ''; if(!isMobile) srch.focus(); }
    _filterList(selId, '');
    // Re-sync checkboxes on open
    var opts = _getOpts(selId);
    if(opts) _renderChips(selId, opts);
  }

  window.FSEL = {
    build: function(wrapId, selId, opts, onchange){
      // opts: [{value, text}]
      var wrap = document.getElementById(wrapId);
      if(!wrap) return;
      _state[selId] = new Set();
      _callbacks[selId] = onchange;
      _optsMap[selId] = opts;

      wrap.innerHTML =
        '<input readonly class="fsel-input" id="fsi-'+selId+'" value="'+
          (opts[0]?opts[0].text:'').replace(/"/g,'&quot;')+'" placeholder="Selecione...">'+
        '<span class="fsel-arrow">▾</span>'+
        '<div class="fsel-drop" id="fsd-'+selId+'">'+
          '<input class="fsel-search" id="fss-'+selId+'" placeholder="🔍 Buscar..." autocomplete="off">'+
          '<div class="fsel-list" id="fsl-'+selId+'"></div>'+
        '</div>';

      _buildList(selId, opts, onchange);

      wrap.querySelector('.fsel-input').addEventListener('click', function(e){
        e.stopPropagation();
        if(_active === selId){ _close(); return; }
        _open(wrapId, selId);
      });
      var srch = document.getElementById('fss-'+selId);
      if(srch) srch.addEventListener('input', function(){ _filterList(selId, this.value); });
      document.getElementById('fsd-'+selId).addEventListener('click',function(e){ e.stopPropagation(); });
      // touchstart no dropdown removido — fechamento via touchend global inteligente
      document.getElementById('fsd-'+selId).addEventListener('wheel',function(e){ e.stopPropagation(); }, {passive:true});
      document.getElementById('fsd-'+selId).addEventListener('touchmove',function(e){ e.stopPropagation(); }, {passive:true});
    },

    rebuild: function(wrapId, selId, opts){
      _optsMap[selId] = opts;
      _buildList(selId, opts, _callbacks[selId]);
      _renderChips(selId, opts);
    },

    getValues: function(selId){ return _getValues(selId); },
    hasValue:  function(selId, v){ return _getState(selId).has(v); },
    isEmpty:   function(selId){ return _getState(selId).size === 0; },
    reset:     function(selId){ _state[selId] = new Set(); },
    _optsMap:  _optsMap,
    _selectAll: function(selId){
      _state[selId] = new Set();
      var opts = _optsMap[selId];
      if(opts) _renderChips(selId, opts);
      var cb = _callbacks[selId];
      if(cb) cb(_getValues(selId));
    },
    _clearAll: function(selId){
      var opts = _optsMap[selId] || [];
      // Seleciona explicitamente todos exceto o "Todos" (value='')
      // deixando nenhum checked = filtro que não passa nada
      // Usamos um placeholder impossível para sinalizar "nenhum"
      _state[selId] = new Set(['__nenhum__']);
      if(opts) _renderChips(selId, opts);
      var cb = _callbacks[selId];
      if(cb) cb(_getValues(selId));
    },
  };

  document.addEventListener('click', function(){ _close(); });
  // No mobile: fechar apenas no touchend fora do dropdown (não no touchstart, que conflita com seleção de itens)
  document.addEventListener('touchend', function(e){
    var drop = _active ? document.getElementById('fsd-'+_active) : null;
    var inp  = _active ? document.getElementById('fsi-'+_active) : null;
    if(drop && !drop.contains(e.target) && inp && !inp.contains(e.target)){
      _close();
    }
  }, {passive:true});
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') _close(); });
  window.addEventListener('resize', function(){ _close(); });
})();
// ======== FSEL END ========

// ── Migração: normaliza nomes de pagamento nos lançamentos para bater com cadastro ──
// migratePagNomes movida para _initApp — não pode rodar antes do login
function migratePagNomes() {
  const normStr = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const pags = loadPagamentos();
  if (!pags || pags.length === 0) return; // segurança: não rodar sem dados
  const pagMap = {};
  pags.forEach(p => { pagMap[normStr(p.nome)] = p.nome; });
  const all = loadDataBanco();
  let changed = false;
  const upd = all.map(l => {
    if (!l.pagamento) return l;
    const realNome = pagMap[normStr(l.pagamento)];
    if (realNome && realNome !== l.pagamento) { changed = true; return { ...l, pagamento: realNome }; }
    return l;
  });
  if (changed) { saveData(upd); console.log('[FinanceOS] Migração pagamentos: nomes normalizados.'); }
}

// ── Migração: corrige datas das parcelas existentes (data fixa = data da 1ª parcela) ──
// Exposta globalmente para poder ser chamada via botão também
async function migrarParcelas() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '⏳ Migrando...';

  // Diagnóstico: mostra quantos lançamentos têm (N/T) na desc
  const allBefore = loadData();
  const comParc = allBefore.filter(l => /\(\d+\/\d+\)/.test(l.desc || ''));
  const semCampo = allBefore.filter(l => l.tipoLanc === 'parcelado' && !l.parcAtual);
  console.log('[Migrar] Total:', allBefore.length, 'com (N/T) na desc:', comParc.length, 'parcelados sem campo:', semCampo.length);

  // Migração 1: extrai (N/T) da desc → campos
  const n = migrateParcFields();

  // Migração 2: para parcelados sem parcAtual, tenta inferir pelo groupId
  const allAfter = loadData();
  let inferred = 0;
  const groups = {};
  allAfter.filter(l => l.groupId).forEach(l => {
    if (!groups[l.groupId]) groups[l.groupId] = [];
    groups[l.groupId].push(l);
  });
  Object.values(groups).forEach(function(items) {
    const hasParc = items.some(l => l.parcAtual);
    if (hasParc) return; // já tem
    // Ordena por mês/ano e atribui parcAtual sequencial
    items.sort((a,b) => (a.ano*100+a.mes) - (b.ano*100+b.mes));
    const total = items.length;
    items.forEach(function(l, idx) {
      l.parcAtual = idx + 1;
      l.parcTotal = total;
      inferred++;
    });
  });
  if (inferred > 0) { saveData(allAfter); }

  const total = n + inferred;
  console.log('[Migrar] migrados por desc:', n, 'inferidos por grupo:', inferred);

  migrateParcelDates();
  renderAll();
  renderParceladosTab();
  renderVencimentosTab();

  if (total > 0) {
    btn.textContent = '✅ ' + total + ' migrados — salvando...';
    await sbSave();
    btn.textContent = '✅ ' + total + ' migrados e salvos!';
  } else {
    btn.textContent = '✅ Nada a migrar (verifique console)';
  }
  setTimeout(function() { btn.disabled = false; btn.textContent = '🔢 Migrar Parcelas → salvar'; }, 4000);
}

function migrateParcFields() {
  // Extrai parcAtual/parcTotal da desc e salva como campos separados
  var data = loadData();
  var changed = 0;
  data.forEach(function(l) {
    // Roda mesmo se parcAtual já existe — para limpar desc que ainda tem (N/T)
    var allMatches = Array.from((l.desc || '').matchAll(/\((\d+)\/(\d+)\)/g));
    if (allMatches.length > 0) {
      var last = allMatches[allMatches.length - 1];
      l.parcAtual = parseInt(last[1]);
      l.parcTotal = parseInt(last[2]);
      l.desc = l.desc.replace(/\s*\(\d+\/\d+\)\s*/g, ' ').trim();
      changed++;
    }
  });
  if (changed) { saveData(data); console.log('[MigParcFields] migrados:', changed); }
  return changed;
}

function migrateParcelDates() {
  const all = loadData();

  // Normaliza data para YYYY-MM-DD independente do formato armazenado
  const normData = d => {
    if (!d) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; // já ISO
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { // DD/MM/YYYY
      const [dd, mm, yyyy] = d.split('/');
      return yyyy + '-' + mm + '-' + dd;
    }
    return d;
  };

  // Agrupa por groupId
  const groups = {};
  all.forEach(l => {
    if (l.groupId && (l.tipoLanc === 'parcelado' || l.tipoLanc === 'fixo')) {
      if (!groups[l.groupId]) groups[l.groupId] = [];
      groups[l.groupId].push(l);
    }
  });

  const dataCompraByGroup = {};
  Object.entries(groups).forEach(([gid, items]) => {
    // 1º: acha desc "(1/N)" — parcela explicitamente marcada como primeira
    const parc1desc = items.find(x => /\(1\/\d+\)$/.test(x.desc || ''));
    if (parc1desc && parc1desc.data) {
      dataCompraByGroup[gid] = normData(parc1desc.data);
      return;
    }
    // 2º: menor número de parcela no desc "(N/X)" → menor N
    const comNum = items.map(x => {
      const m = (x.desc || '').match(/\((\d+)\/\d+\)$/);
      return m ? { n: parseInt(m[1]), item: x } : null;
    }).filter(Boolean).sort((a, b) => a.n - b.n);
    if (comNum.length) {
      dataCompraByGroup[gid] = normData(comNum[0].item.data);
      return;
    }
    // 3º: menor vencimento
    const comVenc = items.filter(x => x.vencimento).sort((a, b) => a.vencimento < b.vencimento ? -1 : 1);
    if (comVenc.length) {
      dataCompraByGroup[gid] = normData(comVenc[0].data || items[0].data);
      return;
    }
    // 4º fallback: data mais antiga
    const datas = items.map(x => normData(x.data)).filter(Boolean).sort();
    if (datas.length) dataCompraByGroup[gid] = datas[0];
  });

  let changed = 0;
  const fixed = all.map(l => {
    if (!l.groupId || (l.tipoLanc !== 'parcelado' && l.tipoLanc !== 'fixo')) return l;
    const dataCompra = dataCompraByGroup[l.groupId];
    const dataAtual = normData(l.data);
    if (dataCompra && dataAtual !== dataCompra) {
      changed++;
      return { ...l, data: dataCompra };
    }
    return l;
  });

  if (changed > 0) {
    saveData(fixed);
    console.log('[FinanceOS] Migração datas: ' + changed + ' lançamentos corrigidos em ' + Object.keys(dataCompraByGroup).length + ' grupos.');
    return changed;
  }
  return 0;
}
// migrateParcFields(); — moved to _initApp()
// migrateParcelDates(); — moved to _initApp()

// ── Migração: corrige valor total salvo no lugar do valor da parcela ──
// Detecta lançamentos parcelados onde valor = totalParcelas * valorCorreto
// (ou seja, o valor total foi salvo em vez da parcela)
function migrateParcelValues() {
  const data = loadData();
  let changed = 0;

  // Agrupa por groupId
  const groups = {};
  data.forEach(l => {
    if (!l.groupId || l.recorr !== 'parcelado') return;
    if (!groups[l.groupId]) groups[l.groupId] = [];
    groups[l.groupId].push(l);
  });

  const idsToFix = new Set();

  Object.values(groups).forEach(parcelas => {
    const n = parcelas[0].totalParcelas || parcelas.length;
    if (!n || n < 2) return;

    // Verifica se TODOS do grupo têm o mesmo valor
    const vals = parcelas.map(l => l.valor);
    const todosIguais = vals.every(v => Math.abs(v - vals[0]) < 0.02);
    if (!todosIguais) return;

    const vlAtual = vals[0];
    const vlParcela = Math.round((vlAtual / n) * 100) / 100;

    // Detecta se valor salvo é o TOTAL e não a parcela.
    // Usa parcAtual/parcTotal quando disponível: se vlAtual * parcTotal ≈ vlAtual
    // isso significa que vlAtual JÁ É a parcela (correto). Caso contrário, divide.
    // Regra: se vlAtual / n resulta num valor coerente E vlAtual > vlParcela * 1.5,
    // então vlAtual é o total — corrige dividindo por n.
    // Também cobre grupos parciais (nem todas as parcelas no dataset).
    const parece_total = (
      Math.abs(vlParcela * n - vlAtual) < 0.02 &&
      vlAtual > vlParcela * 1.5
    );

    if (parece_total) {
      parcelas.forEach(l => idsToFix.add(String(l.id)));
    }
  });

  if (!idsToFix.size) return 0;

  // Aplica correção
  const fixed = data.map(l => {
    if (!idsToFix.has(String(l.id))) return l;
    const n = l.totalParcelas || 1;
    const vlParcela = Math.round((l.valor / n) * 100) / 100;
    changed++;
    return { ...l, valor: vlParcela };
  });

  if (changed > 0) {
    saveData(fixed);
    console.log('[FinanceOS] migrateParcelValues: ' + changed + ' parcelas corrigidas (valor total → valor parcela)');
  }
  return changed;
}
// migrateParcelValues(); — moved to _initApp()


// All init calls moved to window._initApp() — called after login via _onLogin()







// Ajusta o top do sticky baseado na altura real do header
(function setStickyTop() {
  const header = document.querySelector('header');
  const shell  = document.getElementById('globalStickyShell');
  const other  = document.getElementById('bancoStickyOtherTabs');
  if (!header) return;
  const setTop = () => {
    const h = header.offsetHeight + 'px';
    if (shell) shell.style.top = h;
    if (other) other.style.top = h;
  };
  setTop();
  window.addEventListener('resize', setTop);
})();

// Build all FSEL after data is loaded
(function(){
  function optsFromSelect(selId){
    var sel = document.getElementById(selId);
    if(!sel) return [];
    return Array.from(sel.options).map(function(o){ return {value:o.value, text:o.text}; });
  }
  function mkOpts(arr){ return arr; }

  var tipoOpts = [{value:'',text:'Todos os tipos'},{value:'receita',text:'Receita'},{value:'despesa',text:'Despesa'}];
  var statusOpts = [{value:'',text:'Todos os status'},{value:'pago',text:'✓ Pago/Recebido'},{value:'pendente',text:'⏳ Pendente'}];
  var tipoLancOpts = [{value:'',text:'Todos os lançamentos'},{value:'variavel',text:'📦 Variável'},{value:'parcelado',text:'⊞ Parcelado'},{value:'fixo',text:'↻ Fixo'}];
  var tercTipoOpts = [{value:'',text:'Entradas e Dívidas'},{value:'entrada',text:'Entradas'},{value:'divida',text:'Dívidas'}];
  var vencTipoOpts = [{value:'',text:'Todas as situações'},{value:'atrasado',text:'🔴 Atrasados'},{value:'hoje',text:'🟡 Vencem hoje'},{value:'proximos',text:'🔵 Próximos 7 dias'},{value:'mes',text:'📅 Restante do mês'}];
  var parcTipoOpts = [{value:'',text:'Todos os tipos'},{value:'parcelado',text:'🔢 Parcelados'},{value:'fixo',text:'🔁 Fixos'}];
  var parcStatusOpts = [{value:'',text:'Todos os status'},{value:'ativo',text:'Ativos'},{value:'quitado',text:'Quitados'}];

  function rb(selId){ return optsFromSelect(selId); }

  FSEL.build('fsel-filtroTipo',          'filtroTipo',          tipoOpts,      function(){ renderAll(); });
  FSEL.build('fsel-filtroStatus',        'filtroStatus',        statusOpts,    function(){ renderAll(); });
  FSEL.build('fsel-filtroCategoria',     'filtroCategoria',     rb('filtroCategoria'), function(){ onFiltroCategChange(false); renderAll(); });
  FSEL.build('fsel-filtroSubCategoria',  'filtroSubCategoria',  rb('filtroSubCategoria'), function(){ onFiltroSubCatChange(); });
  FSEL.build('fsel-filtroSemCat',        'filtroSemCat',        [{value:'',text:'Todas classificações'},{value:'sem_cat',text:'⚠ Sem categoria'},{value:'sem_sub',text:'⚠ Sem sub-cat'}], function(){ renderAll(); });
  FSEL.build('fsel-filtroTipoLanc',      'filtroTipoLanc',      tipoLancOpts,  function(){ renderAll(); });
  FSEL.build('fsel-filtroPagamento',     'filtroPagamento',     rb('filtroPagamento'), function(){ renderAll(); });
  FSEL.build('fsel-filtroTerceiro',      'filtroTerceiro',      rb('filtroTerceiro'),  function(){ renderAll(); });
  FSEL.build('fsel-filtroBanco',         'filtroBanco',         rb('filtroBanco'),     function(){ renderAll(); });

  // Terceiros
  var tipoOpts = [{value:'',text:'Todos os tipos'},{value:'receita',text:'Receita'},{value:'despesa',text:'Despesa'}];
  var statusOpts = [{value:'',text:'Todos os status'},{value:'pago',text:'✓ Pago/Recebido'},{value:'pendente',text:'⏳ Pendente'}];
  var tipoLancOpts = [{value:'',text:'Todos os lançamentos'},{value:'variavel',text:'📦 Variável'},{value:'parcelado',text:'⊞ Parcelado'},{value:'fixo',text:'↻ Fixo'}];
  var tercTipoOpts = [{value:'',text:'Entradas e Dívidas'},{value:'entrada',text:'Entradas'},{value:'divida',text:'Dívidas'}];
  var vencTipoOpts = [{value:'',text:'Todas as situações'},{value:'atrasado',text:'🔴 Atrasados'},{value:'hoje',text:'🟡 Vencem hoje'},{value:'proximos',text:'🔵 Próximos 7 dias'},{value:'mes',text:'📅 Restante do mês'}];
  var parcTipoOpts = [{value:'',text:'Todos os tipos'},{value:'parcelado',text:'🔢 Parcelados'},{value:'fixo',text:'🔁 Fixos'}];
  var parcStatusOpts = [{value:'',text:'Todos os status'},{value:'ativo',text:'Ativos'},{value:'quitado',text:'Quitados'}];
  function rb(selId){ return Array.from((document.getElementById(selId)||{options:[]}).options).map(function(o){return {value:o.value,text:o.text};}); }

  // Lançamentos
  FSEL.build('fsel-filtroTipo','filtroTipo',tipoOpts,function(){renderAll();});
  FSEL.build('fsel-filtroStatus','filtroStatus',statusOpts,function(){renderAll();});
  FSEL.build('fsel-filtroCategoria','filtroCategoria',rb('filtroCategoria'),function(){onFiltroCategChange(false);renderAll();});
  FSEL.build('fsel-filtroSubCategoria','filtroSubCategoria',rb('filtroSubCategoria'),function(){onFiltroSubCatChange();});
  FSEL.build('fsel-filtroSemCat','filtroSemCat',[{value:'',text:'Todas classificações'},{value:'sem_cat',text:'⚠ Sem categoria'},{value:'sem_sub',text:'⚠ Sem sub-cat'}],function(){renderAll();});
  FSEL.build('fsel-filtroTipoLanc','filtroTipoLanc',tipoLancOpts,function(){renderAll();});
  FSEL.build('fsel-filtroPagamento','filtroPagamento',rb('filtroPagamento'),function(){renderAll();});
  FSEL.build('fsel-filtroTerceiro','filtroTerceiro',rb('filtroTerceiro'),function(){renderAll();});
  FSEL.build('fsel-filtroBanco','filtroBanco',rb('filtroBanco'),function(){renderAll();});
  // Terceiros — filtros: nome, tipo, status
  FSEL.build('fsel-filtroTerceiroNome','filtroTerceiroNome',rb('filtroTerceiroNome'),function(){renderTerceirosTab();});
  FSEL.build('fsel-filtroTerceiroTipo','filtroTerceiroTipo',[{value:'',text:'Entradas e Dívidas'},{value:'entrada',text:'↑ Entradas'},{value:'divida',text:'↓ Dívidas'}],function(){renderTerceirosTab();});
  FSEL.build('fsel-filtroTerceiroStatus','filtroTerceiroStatus',[{value:'',text:'Todos os status'},{value:'pago',text:'✓ Pago'},{value:'pendente',text:'⏳ Pendente'}],function(){renderTerceirosTab();});
  // Vencimentos
  FSEL.build('fsel-vencFiltroTipo','vencFiltroTipo',vencTipoOpts,function(){renderVencimentosTab();});
  FSEL.build('fsel-vencFiltroCat','vencFiltroCat',rb('vencFiltroCat'),function(){renderVencimentosTab();});
  FSEL.build('fsel-vencFiltroSubCat','vencFiltroSubCat',rb('vencFiltroSubCat'),function(){renderVencimentosTab();});
  FSEL.build('fsel-vencFiltroPag','vencFiltroPag',rb('vencFiltroPag'),function(){renderVencimentosTab();});
  FSEL.build('fsel-vencFiltroTerc','vencFiltroTerc',rb('vencFiltroTerc'),function(){renderVencimentosTab();});
  FSEL.build('fsel-vencFiltroBanco','vencFiltroBanco',rb('vencFiltroBanco'),function(){renderVencimentosTab();});
  // Parcelados
  FSEL.build('fsel-parcFiltroTipo','parcFiltroTipo',parcTipoOpts,function(){renderParceladosTab();});
  FSEL.build('fsel-parcFiltroStatus','parcFiltroStatus',parcStatusOpts,function(){renderParceladosTab();});
  FSEL.build('fsel-parcFiltroCat','parcFiltroCat',rb('parcFiltroCat'),function(){renderParceladosTab();});
  FSEL.build('fsel-parcFiltroSubCat','parcFiltroSubCat',rb('parcFiltroSubCat'),function(){renderParceladosTab();});
  FSEL.build('fsel-parcFiltroPag','parcFiltroPag',rb('parcFiltroPag'),function(){renderParceladosTab();});
  FSEL.build('fsel-parcFiltroTerc','parcFiltroTerc',rb('parcFiltroTerc'),function(){renderParceladosTab();});
  FSEL.build('fsel-parcFiltroBanco','parcFiltroBanco',rb('parcFiltroBanco'),function(){renderParceladosTab();});
  // Cartões
  FSEL.build('fsel-cartaoFiltroNome','cartaoFiltroNome',rb('cartaoFiltroNome'),function(){renderCartoesTab();});
  FSEL.build('fsel-cartaoFiltroStatus','cartaoFiltroStatus',[{value:'',text:'Todos os status'},{value:'pago',text:'✓ Pago'},{value:'pendente',text:'⏳ Pendente'}],function(){renderCartoesTab();});
  FSEL.build('fsel-cartaoFiltroCat','cartaoFiltroCat',rb('cartaoFiltroCat'),function(){renderCartoesTab();});
  FSEL.build('fsel-cartaoFiltroSubCat','cartaoFiltroSubCat',rb('cartaoFiltroSubCat'),function(){renderCartoesTab();});
  FSEL.build('fsel-cartaoFiltroTerc','cartaoFiltroTerc',rb('cartaoFiltroTerc'),function(){renderCartoesTab();});
})();

function _fselRebuild(selId){
  var wrapId = 'fsel-'+selId;
  var sel = document.getElementById(selId);
  if(!sel || !window.FSEL) return;
  var opts = Array.from(sel.options).map(function(o){ return {value:o.value, text:o.text}; });
  FSEL.rebuild(wrapId, selId, opts);
}

// ══════════════════════════════════════════════════════════════════════
// _initApp — chamado pelo _onLogin() em sync-auth.js após dados carregados
// Substitui as chamadas globais que existiam anteriormente no topo deste arquivo
// ══════════════════════════════════════════════════════════════════════
window._initApp = function() {
  // Migrações DESATIVADAS — dados já estão no Supabase com formato correto
  // try { migrateParcFields();   } catch(e) { console.warn('[initApp] migrateParcFields:', e.message); }
  // try { migrateParcelDates();  } catch(e) { console.warn('[initApp] migrateParcelDates:', e.message); }
  // try { migratePagNomes();     } catch(e) { console.warn('[initApp] migratePagNomes:', e.message); }

  // Popula selects e listas de configuração
  try { renderPagList();            } catch(e) {}
  try { populatePagSelects();       } catch(e) {}
  try { renderTerceiroList();       } catch(e) {}
  try { populateTerceiroSelects();  } catch(e) {}
  try { renderBancoList();          } catch(e) {}
  try { populateBancoSelects();     } catch(e) {}
  try { populateCatSelects();       } catch(e) {}

  // Render principal
  try { renderAll();                } catch(e) { console.warn('[initApp] renderAll:', e.message); }
  try { renderBancoCards();         } catch(e) {}
  try { renderSaldoBanco();         } catch(e) {}

  console.log('[_initApp] ✅ App inicializado após login');
};