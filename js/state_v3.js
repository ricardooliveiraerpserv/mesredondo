// ══════════════════════════════════════════════════════════════════════
// state.js v3 — Estado global + acesso a dados via Supabase (db.js)
//
// MUDANÇAS em relação à versão anterior:
//   • loadData() / saveData() agora são ASYNC e usam o banco
//   • Cache em memória (_memCache) para performance durante a sessão
//   • localStorage é apenas cache offline — nunca fonte de verdade
//   • _lsGet/_lsSet mantidos apenas para dados de sessão/UI (não financeiros)
// ══════════════════════════════════════════════════════════════════════

let _currentUser = null;
let _isAdmin     = false;

// Namespace por usuário (ainda usado para preferências de UI, não dados financeiros)
function _lsKey(key) {
  const uid = _currentUser ? _currentUser.id.slice(0, 8) : 'guest';
  return uid + '_' + key;
}
function _lsGet(key, def) {
  try { const v = localStorage.getItem(_lsKey(key)); return v !== null ? v : (def !== undefined ? def : null); }
  catch { return def !== undefined ? def : null; }
}
function _lsSet(key, value) {
  try { localStorage.setItem(_lsKey(key), value); } catch {}
}
function _lsRemove(key) {
  try { localStorage.removeItem(_lsKey(key)); } catch {}
}

// ── STATE ──────────────────────────────────────────────────────────
let currentMonth = new Date().getMonth() + 1;
let currentYear  = new Date().getFullYear();
let editId       = null;
let tipoAtual    = 'receita';
let sortCol      = '_ts', sortDir = -1;
let recorrAtual  = 'unico';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Cache em memória (limpo a cada login) ─────────────────────────
const _memCache = {
  lancamentos:  null,   // todos os lançamentos carregados
  provisoes:    null,
  categorias:   null,
  pagamentos:   null,
  terceiros:    null,
  bancos:       null,
  config:       null
};

function _clearMemCache() {
  Object.keys(_memCache).forEach(k => { _memCache[k] = null; });
}

// ── Lançamentos ────────────────────────────────────────────────────

// loadData() — carrega TODOS os lançamentos do usuário (com cache em memória)
// Retorna um array — use junto com getMonthData() para filtrar por mês
async function loadData() {
  if (_memCache.lancamentos) return _memCache.lancamentos;
  const data = await dbLoadLancamentos();
  _memCache.lancamentos = data;
  return data;
}

// getMonthData() — helper síncrono para renderização (usa cache)
// ATENÇÃO: chame await loadData() antes de usar isso em contextos assíncronos
function getMonthData() {
  const all = _memCache.lancamentos || [];
  return all.filter(l => Number(l.mes) === currentMonth && Number(l.ano) === currentYear);
}

async function saveData(newData) {
  // newData = array completo de lançamentos do usuário
  // Estratégia: upsert (POST com merge-duplicates) — mais eficiente que delete+insert
  await dbSaveLancamentos(newData);
  _memCache.lancamentos = newData;
}

async function addLancamento(lanc) {
  await dbSaveLancamento(lanc);
  // Atualiza cache em memória
  if (_memCache.lancamentos) {
    const idx = _memCache.lancamentos.findIndex(l => l.id === lanc.id);
    if (idx >= 0) _memCache.lancamentos[idx] = lanc;
    else _memCache.lancamentos.unshift(lanc);
  }
}

async function updateLancamento(id, fields) {
  await dbUpdateLancamento(id, fields);
  if (_memCache.lancamentos) {
    const idx = _memCache.lancamentos.findIndex(l => l.id === id);
    if (idx >= 0) _memCache.lancamentos[idx] = { ..._memCache.lancamentos[idx], ...fields };
  }
}

async function deleteLancamento(id) {
  await dbDeleteLancamento(id);
  if (_memCache.lancamentos) {
    _memCache.lancamentos = _memCache.lancamentos.filter(l => l.id !== id);
  }
}

// ── Provisões ──────────────────────────────────────────────────────

async function loadProvisoes() {
  if (_memCache.provisoes) return _memCache.provisoes;
  const data = await dbLoadProvisoes();
  _memCache.provisoes = data;
  return data;
}

async function saveProvisoes(data) {
  await dbSaveProvisoes(data);
  _memCache.provisoes = data;
}

// ── Categorias ─────────────────────────────────────────────────────

async function loadCats() {
  if (_memCache.categorias && _memCache.categorias.length > 0) return _memCache.categorias;
  const data = await dbLoadCategorias();
  if (!data || !data.length) {
    // Inicializa categorias padrão para novo usuário
    const defaults = _getDefaultCategorias();
    await dbSaveCategorias(defaults);
    _memCache.categorias = defaults;
    return defaults;
  }
  _memCache.categorias = data;
  return data;
}

async function saveCats(data) {
  await dbSaveCategorias(data);
  _memCache.categorias = data;
}

// ── Formas de Pagamento ────────────────────────────────────────────

async function loadPagamentos() {
  if (_memCache.pagamentos && _memCache.pagamentos.length > 0) return _memCache.pagamentos;
  const data = await dbLoadPagamentos();
  if (!data || !data.length) {
    const defaults = _getDefaultPagamentos();
    await dbSavePagamentos(defaults);
    _memCache.pagamentos = defaults;
    return defaults;
  }
  _memCache.pagamentos = data;
  return data;
}

async function savePagamentos(data) {
  await dbSavePagamentos(data);
  _memCache.pagamentos = data;
}

// ── Terceiros ──────────────────────────────────────────────────────

async function loadTerceiros() {
  if (_memCache.terceiros) return _memCache.terceiros;
  const data = await dbLoadTerceiros();
  _memCache.terceiros = data || [];
  return _memCache.terceiros;
}

async function saveTerceiros(data) {
  await dbSaveTerceiros(data);
  _memCache.terceiros = data;
}

// ── Bancos ─────────────────────────────────────────────────────────

async function loadBancos() {
  if (_memCache.bancos && _memCache.bancos.length > 0) return _memCache.bancos;
  const data = await dbLoadBancos();
  if (!data || !data.length) {
    const defaults = _getDefaultBancos();
    await dbSaveBancos(defaults);
    _memCache.bancos = defaults;
    return defaults;
  }
  _memCache.bancos = data;
  return data;
}

async function saveBancos(data) {
  await dbSaveBancos(data);
  _memCache.bancos = data;
}

// ── Configurações ──────────────────────────────────────────────────

async function loadSaldoInicial() {
  const config = await _loadConfig();
  return config.saldo_inicial || { valor: 0, data: '' };
}

async function saveSaldoInicial(obj) {
  await dbSaveConfig({ saldo_inicial: obj });
  if (_memCache.config) _memCache.config.saldo_inicial = obj;
}

async function loadBancoModo() {
  const config = await _loadConfig();
  return config.banco_modo || 'consolidado';
}

async function saveBancoModo(modo) {
  await dbSaveConfig({ banco_modo: modo });
  if (_memCache.config) _memCache.config.banco_modo = modo;
}

async function loadCatMap() {
  const config = await _loadConfig();
  return config.catmap || {};
}

async function saveCatMap(m) {
  await dbSaveConfig({ catmap: m });
  if (_memCache.config) _memCache.config.catmap = m;
}

async function loadSubMap() {
  const config = await _loadConfig();
  return config.submap || {};
}

async function saveSubMap(m) {
  await dbSaveConfig({ submap: m });
  if (_memCache.config) _memCache.config.submap = m;
}

async function _loadConfig() {
  if (_memCache.config) return _memCache.config;
  const config = await dbLoadConfig();
  _memCache.config = config;
  return config;
}

// ── loadDataBanco() — aplica filtro de banco selecionado ──────────
// (mantém compatibilidade com código existente)
async function loadDataBanco() {
  const all    = await loadData();
  const modo   = await loadBancoModo();
  if (modo === 'consolidado') return all;
  return all.filter(l => (l.banco || '') === modo);
}

// ── Dados padrão para novos usuários ──────────────────────────────

function _getDefaultPagamentos() {
  return [
    { id: 'pag_dinheiro', nome: 'Dinheiro',        icone: '💵', cartao: false, ordem: 0 },
    { id: 'pag_pix',      nome: 'Pix',             icone: '🏦', cartao: false, ordem: 1 },
    { id: 'pag_debito',   nome: 'Débito',           icone: '💳', cartao: false, ordem: 2 },
    { id: 'pag_credito',  nome: 'Cartão Crédito',   icone: '💳', cartao: true,  dia_fechamento: 10, dia_vencimento: 20, ordem: 3 }
  ];
}

function _getDefaultBancos() {
  return [
    { id: 'banco_nubank',  nome: 'Nubank',   icone: '🟣', ativo: true, ordem: 0 },
    { id: 'banco_itau',    nome: 'Itaú',     icone: '🟠', ativo: true, ordem: 1 },
    { id: 'banco_bb',      nome: 'Bradesco', icone: '🔴', ativo: true, ordem: 2 }
  ];
}

function _getDefaultCategorias() {
  return [
    { id: 'cat_moradia',     nome: 'Moradia',      tipo: 'despesa', icone: '🏠', ordem: 0, subs: [] },
    { id: 'cat_alimentacao', nome: 'Alimentação',  tipo: 'despesa', icone: '🍽️', ordem: 1, subs: [] },
    { id: 'cat_transporte',  nome: 'Transporte',   tipo: 'despesa', icone: '🚗', ordem: 2, subs: [] },
    { id: 'cat_saude',       nome: 'Saúde',        tipo: 'despesa', icone: '💊', ordem: 3, subs: [] },
    { id: 'cat_lazer',       nome: 'Lazer',        tipo: 'despesa', icone: '🎬', ordem: 4, subs: [] },
    { id: 'cat_educacao',    nome: 'Educação',     tipo: 'despesa', icone: '📚', ordem: 5, subs: [] },
    { id: 'cat_salario',     nome: 'Salário',      tipo: 'receita', icone: '💰', ordem: 6, subs: [] },
    { id: 'cat_freelance',   nome: 'Freelance',    tipo: 'receita', icone: '💻', ordem: 7, subs: [] },
    { id: 'cat_outros',      nome: 'Outros',       tipo: 'despesa', icone: '📦', ordem: 8, subs: [] }
  ];
}

// ── Compatibilidade: saveData wrapper síncrono para código legado ──
// Funções que chamavam saveData() de forma síncrona agora retornam Promise.
// O código legado precisa ser migrado para usar await. Esta versão garante
// que o dado é salvo mesmo sem await (fire-and-forget com log de erro).
const _origSaveData = saveData;
window.saveData = function(data) {
  return _origSaveData(data).catch(e => console.error('[saveData]', e.message));
};