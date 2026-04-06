// ══════════════════════════════════════════════════════════════════════
// compat.js — Camada de compatibilidade síncrona
//
// Define o _memCache e expõe versões síncronas de todas as funções
// de dados para que render.js, fsel.js e outros scripts legados
// continuem funcionando sem alteração.
//
// ORDEM DE CARREGAMENTO no index.html:
//   1. sync-auth.js  (SB_URL, SB_KEY, _sbClient, auth)
//   2. db.js         (REST API Supabase)
//   3. state-v3.js   (async load/save — opcional, só para código novo)
//   4. compat.js     ← ESTE ARQUIVO
//   5. bancos.js, categorias.js, lancamentos-e-dados.js
//   6. navigation.js ← DEVE vir ANTES de render.js
//   7. render.js, vencimentos.js, parcelados.js, etc.
//   8. fsel.js
// ══════════════════════════════════════════════════════════════════════


// ── Variáveis globais de estado (eram definidas em state.js) ─────────
var _currentUser = null;
var _isAdmin     = false;

let currentMonth = new Date().getMonth() + 1;
let currentYear  = new Date().getFullYear();
let editId       = null;
let tipoAtual    = 'receita';
let sortCol      = '_ts', sortDir = -1;
let recorrAtual  = 'unico';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── _lsGet/_lsSet/_lsRemove — localStorage com namespace por usuário ─
// Ainda usado por: navigation.js (preferências de UI), backup.js, etc.
function _lsKey(key) {
  var uid = _currentUser ? _currentUser.id.slice(0, 8) : 'guest';
  return uid + '_' + key;
}
function _lsGet(key, def) {
  try {
    var v = localStorage.getItem(_lsKey(key));
    return v !== null ? v : (def !== undefined ? def : null);
  } catch(e) { return def !== undefined ? def : null; }
}
function _lsSet(key, value) {
  try { localStorage.setItem(_lsKey(key), value); } catch(e) {}
}
function _lsRemove(key) {
  try { localStorage.removeItem(_lsKey(key)); } catch(e) {}
}

// ── _unpack — descompacta lançamentos com chaves curtas (legado) ──────
var _KR = {
  i:'id', t:'tipo', d:'data', v:'valor', de:'desc', c:'categoria',
  s:'subCategoria', st:'status', pg:'pagamento', tl:'tipoLanc',
  vc:'vencimento', m:'mes', a:'ano', g:'groupId', r:'recorr',
  tp:'totalParcelas', or:'origem', os:'originalSign', tc:'terceiro',
  bk:'banco', pa:'parcAtual', pt:'parcTotal'
};
function _unpack(obj) {
  var u = {};
  Object.keys(obj).forEach(function(k) { u[_KR[k] || k] = obj[k]; });
  return u;
}

// ── Tombstones locais (fallback offline) ─────────────────────────────
function _getTombstones() {
  try { return JSON.parse(localStorage.getItem('sb_tombstones') || '{}'); } catch(e) { return {}; }
}
function _addTombstone(id) {
  var t = _getTombstones();
  t[String(id)] = Date.now();
  var cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  Object.keys(t).forEach(function(k) { if (t[k] < cutoff) delete t[k]; });
  localStorage.setItem('sb_tombstones', JSON.stringify(t));
}
function _mergeTombstones(localT, cloudT) {
  var merged = Object.assign({}, cloudT || {}, localT || {});
  Object.keys(cloudT || {}).forEach(function(k) {
    if (localT && localT[k]) merged[k] = Math.max(localT[k], cloudT[k]);
  });
  return merged;
}
function _markLocalDirty()  { /* no-op com banco real */ }
function _clearLocalDirty() { /* no-op com banco real */ }
function _isLocalDirty()    { return false; }

// ── Cache em memória (fonte de verdade durante a sessão) ─────────────
var _memCache = {
  lancamentos: null,
  provisoes:   null,
  categorias:  null,
  pagamentos:  null,
  terceiros:   null,
  bancos:      null,
  config:      null
};

function _clearMemCache() {
  Object.keys(_memCache).forEach(function(k) { _memCache[k] = null; });
}

// Carrega config do banco e armazena no cache (chamado por _onLogin)
async function _loadConfig() {
  if (_memCache.config) return _memCache.config;
  try {
    var config = await dbLoadConfig();
    _memCache.config = config || {};
    return _memCache.config;
  } catch(e) {
    _memCache.config = {};
    return _memCache.config;
  }
}

// ── Lançamentos ──────────────────────────────────────────────────────

window.loadData = function() {
  return (_memCache.lancamentos || []).slice(); // cópia — evita mutação acidental do cache
};

window.saveData = function(newData) {
  // IDs que existiam ANTES (cache ainda não foi atualizado)
  var oldIds = new Set((_memCache.lancamentos || []).map(function(l) { return String(l.id); }));

  // Atualiza cache imediatamente
  _memCache.lancamentos = newData;

  var newIds = new Set();
  var toInsert = [];
  var toDelete = [];

  newData.forEach(function(l) {
    var sid = String(l.id);
    newIds.add(sid);
    if (!oldIds.has(sid)) {
      toInsert.push(l); // genuinamente novo
    }
  });

  // Removidos do array → tombstone local + DELETE no Supabase
  oldIds.forEach(function(sid) {
    if (!newIds.has(sid)) {
      _addTombstone(sid);
      toDelete.push(sid);
    }
  });

  console.log('[saveData] cache:', newData.length, '| insert:', toInsert.length, '| delete:', toDelete.length);

  // INSERT dos lançamentos novos
  if (toInsert.length > 0) {
    dbSaveLancamentos(toInsert).catch(function(e) {
      console.error('[compat:saveData:insert]', e.message);
    });
  }

  // DELETE dos removidos no Supabase — evita duplicatas após reload
  if (toDelete.length > 0 && typeof dbDeleteLancamento === 'function') {
    toDelete.forEach(function(sid) {
      dbDeleteLancamento(sid).catch(function(e) {
        console.warn('[compat:saveData:delete]', sid, e.message);
      });
    });
  }
};

// ── Bancos ───────────────────────────────────────────────────────────

window.loadBancos = function() {
  return _memCache.bancos || [];
};

window.saveBancos = function(data) {
  _memCache.bancos = data;
  dbSaveBancos(data).catch(function(e) {
    console.error('[compat:saveBancos]', e.message);
  });
};

// ── Categorias ───────────────────────────────────────────────────────

window.loadCats = function() {
  var cats = _memCache.categorias;
  if (cats && cats.length > 0) return cats;
  return (typeof DEFAULT_CATS !== 'undefined') ? DEFAULT_CATS.map(function(c) {
    return {
      id: c.id, nome: c.nome, tipo: c.tipo, cor: c.cor, icone: c.icone,
      subs: (c.subs || []).map(function(s, i) {
        return { id: c.id + '_sub_' + i, nome: s, desc: '' };
      })
    };
  }) : [];
};

window.saveCats = function(data) {
  _memCache.categorias = data;
  dbSaveCategorias(data).catch(function(e) {
    console.error('[compat:saveCats]', e.message);
  });
};

// ── Formas de Pagamento ──────────────────────────────────────────────

window.loadPagamentos = function() {
  // 1) memCache
  if (_memCache.pagamentos && _memCache.pagamentos.length > 0) return _memCache.pagamentos;
  // 2) localStorage com chave do db.js (mf_cache_pagamentos_XXXXXXXX)
  try {
    // Tenta chave do db.js primeiro
    var dbKey = (typeof _cacheKey === 'function') ? _cacheKey('pagamentos') : null;
    if (dbKey) {
      var raw = localStorage.getItem(dbKey);
      if (raw) { var p = JSON.parse(raw); if (p && p.length > 0) { _memCache.pagamentos = p; return p; } }
    }
  } catch(e) {}
  try {
    // Fallback: varre todas as chaves do localStorage procurando pagamentos
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.startsWith('mf_cache_pagamentos_')) {
        var raw2 = localStorage.getItem(k);
        if (raw2) { var p2 = JSON.parse(raw2); if (p2 && p2.length > 0) { _memCache.pagamentos = p2; return p2; } }
      }
    }
  } catch(e) {}
  // 3) PAG_DEFAULT só se realmente não há nada
  return (typeof PAG_DEFAULT !== 'undefined') ? PAG_DEFAULT : [];
};

window.savePagamentos = function(data) {
  _memCache.pagamentos = data;
  // Persiste no localStorage usando a mesma chave do db.js
  try {
    var dbKey2 = (typeof _cacheKey === 'function') ? _cacheKey('pagamentos') : null;
    if (dbKey2) localStorage.setItem(dbKey2, JSON.stringify(data));
  } catch(e) {}
  dbSavePagamentos(data).catch(function(e) {
    console.error('[compat:savePagamentos]', e.message);
  });
};

// ── Terceiros ────────────────────────────────────────────────────────

window.loadTerceiros = function() {
  return _memCache.terceiros || [];
};

window.saveTerceiros = function(data) {
  _memCache.terceiros = data;
  dbSaveTerceiros(data).catch(function(e) {
    console.error('[compat:saveTerceiros]', e.message);
  });
};

// ── Provisões ────────────────────────────────────────────────────────

window.loadProvisoes = function() {
  return _memCache.provisoes || [];
};

window.saveProvisoes = function(data) {
  _memCache.provisoes = data;
  dbSaveProvisoes(data).catch(function(e) {
    console.error('[compat:saveProvisoes]', e.message);
  });
};

// ── Configurações ────────────────────────────────────────────────────

window.loadSaldoInicial = function() {
  return (_memCache.config && _memCache.config.saldo_inicial) || { valor: 0, data: '' };
};

window.saveSaldoInicial = function(obj) {
  if (!_memCache.config) _memCache.config = {};
  _memCache.config.saldo_inicial = obj;
  dbSaveConfig({ saldo_inicial: obj }).catch(function(e) {
    console.error('[compat:saveSaldoInicial]', e.message);
  });
};

window.loadBancoModo = function() {
  return (_memCache.config && _memCache.config.banco_modo) || 'consolidado';
};

window.saveBancoModo = function(modo) {
  if (!_memCache.config) _memCache.config = {};
  _memCache.config.banco_modo = modo;
  dbSaveConfig({ banco_modo: modo }).catch(function(e) {
    console.error('[compat:saveBancoModo]', e.message);
  });
};

window.loadCatMap = function() {
  return (_memCache.config && _memCache.config.catmap) || {};
};

window.saveCatMap = function(m) {
  if (!_memCache.config) _memCache.config = {};
  _memCache.config.catmap = m;
  dbSaveConfig({ catmap: m }).catch(function(e) {
    console.error('[compat:saveCatMap]', e.message);
  });
};

window.loadSubMap = function() {
  return (_memCache.config && _memCache.config.submap) || {};
};

window.saveSubMap = function(m) {
  if (!_memCache.config) _memCache.config = {};
  _memCache.config.submap = m;
  dbSaveConfig({ submap: m }).catch(function(e) {
    console.error('[compat:saveSubMap]', e.message);
  });
};

// ── calcSaldoBancoId síncrono ────────────────────────────────────────

window.calcSaldoBancoId = function(bancoId) {
  var bancos = loadBancos();
  var banco = bancos.find(function(b) { return b.id === bancoId; });
  if (!banco) return 0;
  var si = banco.saldoInicial || 0;
  var todos = loadData();
  var rec = 0, desp = 0;
  todos.forEach(function(l) {
    if (l.banco !== bancoId) return;
    if (l.status !== 'pago') return;
    if (l.tipo === 'receita') rec  += (l.valor || 0);
    else                      desp += (l.valor || 0);
  });
  return si + rec - desp;
};

// ── Stubs de compatibilidade ─────────────────────────────────────────

window._sbAutoSync = window._sbAutoSync || function() { /* no-op: saves diretos ao banco */ };
window._markLocalDirty = window._markLocalDirty || function() { /* no-op */ };

// ── Carregamento inicial dos dados após login ─────────────────────────
// Chamado por _onLogin() em sync-auth.js após autenticação
window._loadAllData = async function() {
  try {
    var lncs  = await dbLoadLancamentos();   _memCache.lancamentos = lncs  || [];
  } catch(e) { _memCache.lancamentos = []; }
  try {
    var cats  = await dbLoadCategorias();    _memCache.categorias  = cats  || [];
  } catch(e) { _memCache.categorias = []; }
  try {
    var pags  = await dbLoadPagamentos();
    // Nunca sobrescrever pagamentos reais com array vazio — mantém cache anterior se retornar vazio
    if (pags && pags.length) {
      _memCache.pagamentos = pags;
    } else {
      _memCache.pagamentos = _memCache.pagamentos && _memCache.pagamentos.length ? _memCache.pagamentos : [];
      console.warn('[compat] pagamentos retornou vazio — mantendo cache existente');
    }
  } catch(e) { console.warn('[compat] erro ao carregar pagamentos:', e); }
  try {
    var bancs = await dbLoadBancos();        _memCache.bancos      = bancs || [];
  } catch(e) { _memCache.bancos = []; }
  try {
    var tercs = await dbLoadTerceiros();     _memCache.terceiros   = tercs || [];
  } catch(e) { _memCache.terceiros = []; }
  try {
    var provs = await dbLoadProvisoes();     _memCache.provisoes   = provs || [];
  } catch(e) { _memCache.provisoes = []; }
  try {
    var conf  = await dbLoadConfig();        _memCache.config      = conf  || {};
  } catch(e) { _memCache.config = {}; }

  // Inicializa defaults se novo usuário
  if (!_memCache.categorias.length && typeof DEFAULT_CATS !== 'undefined') {
    _memCache.categorias = DEFAULT_CATS.map(function(c) {
      return {
        id: c.id, nome: c.nome, tipo: c.tipo, cor: c.cor, icone: c.icone,
        subs: (c.subs || []).map(function(s, i) {
          return { id: c.id + '_sub_' + i, nome: s, desc: '' };
        })
      };
    });
  }
  // Só aplica PAG_DEFAULT se não há nada no memCache NEM no localStorage
  if (!_memCache.pagamentos || !_memCache.pagamentos.length) {
    // Tenta localStorage antes de usar PAG_DEFAULT
    var _pagsFromLS = null;
    try {
      var _dbKey3 = (typeof _cacheKey === 'function') ? _cacheKey('pagamentos') : null;
      if (_dbKey3) {
        var _raw2 = localStorage.getItem(_dbKey3);
        if (_raw2) { var _p2 = JSON.parse(_raw2); if (_p2 && _p2.length) _pagsFromLS = _p2; }
      }
      // Fallback: varre localStorage
      if (!_pagsFromLS) {
        for (var _ki = 0; _ki < localStorage.length; _ki++) {
          var _kk = localStorage.key(_ki);
          if (_kk && _kk.startsWith('mf_cache_pagamentos_')) {
            var _rr = localStorage.getItem(_kk);
            if (_rr) { var _pp = JSON.parse(_rr); if (_pp && _pp.length) { _pagsFromLS = _pp; break; } }
          }
        }
      }
    } catch(e) {}
    if (_pagsFromLS) {
      _memCache.pagamentos = _pagsFromLS;
      console.log('[compat] Pagamentos restaurados do localStorage:', _pagsFromLS.length);
      // Re-salva no Supabase para garantir sincronização
      if (typeof dbSavePagamentos === 'function') {
        try { dbSavePagamentos(_pagsFromLS); } catch(e) {}
      }
    } else if (typeof PAG_DEFAULT !== 'undefined') {
      console.log('[compat] Primeiro acesso — aplicando pagamentos padrão');
      _memCache.pagamentos = PAG_DEFAULT;
      if (typeof savePagamentos === 'function') {
        try { savePagamentos(PAG_DEFAULT); } catch(e) {}
      }
    }
  }

  console.log('[compat] ✅ Dados carregados — lançamentos:', _memCache.lancamentos.length,
    '| bancos:', _memCache.bancos.length,
    '| categorias:', _memCache.categorias.length,
    '| pagamentos:', (_memCache.pagamentos || []).length);
};

console.log('[compat.js] ✅ Camada de compatibilidade carregada');