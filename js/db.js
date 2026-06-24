// ══════════════════════════════════════════════════════════════════════
// db.js — Camada de acesso ao Supabase (substitui localStorage como
//          fonte primária de dados)
//
// COMO FUNCIONA:
//   • Todas as leituras/escritas vão direto ao Supabase via REST API
//   • localStorage ainda é usado como CACHE local (offline fallback)
//   • Cada função é async — o código que chama precisa usar await
//
// DEPENDÊNCIAS: sync-auth.js deve ter definido SB_URL, SB_KEY, _sbClient
// ══════════════════════════════════════════════════════════════════════

// ── Helpers de request ───────────────────────────────────────────────

async function _dbHeaders(method) {
  const token = await _getValidToken();
  return {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal'
  };
}

async function _dbFetch(path, method, body) {
  const headers = await _dbHeaders(method);
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error('[DB] ' + method + ' ' + path + ' → HTTP ' + res.status + ': ' + err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function _uid() {
  const u = window._currentUser || _currentUser;
  if (!u) throw new Error('[DB] Usuário não autenticado');
  return u.id;
}

// ── Cache local (fallback offline) ──────────────────────────────────

function _cacheKey(table) { return 'mf_cache_' + table + '_' + _uid().slice(0, 8); }

function _cacheSet(table, data) {
  try { localStorage.setItem(_cacheKey(table), JSON.stringify(data)); } catch {}
}
function _cacheGet(table) {
  try {
    const v = localStorage.getItem(_cacheKey(table));
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

// ── Pendências offline ───────────────────────────────────────────────
// Quando offline, operações são enfileiradas e executadas quando voltar conexão

const _pendingKey = () => 'mf_pending_' + (_uid().slice(0, 8));

function _addPending(op) {
  try {
    const q = JSON.parse(localStorage.getItem(_pendingKey()) || '[]');
    q.push({ ...op, at: Date.now() });
    localStorage.setItem(_pendingKey(), JSON.stringify(q));
  } catch {}
}

async function _flushPending() {
  try {
    const q = JSON.parse(localStorage.getItem(_pendingKey()) || '[]');
    if (!q.length) return;
    console.log('[DB] Flushing', q.length, 'operações pendentes...');
    const failed = [];
    for (const op of q) {
      try {
        await _dbFetch(op.path, op.method, op.body);
      } catch (e) {
        console.warn('[DB] Pendente falhou:', e.message);
        failed.push(op);
      }
    }
    localStorage.setItem(_pendingKey(), JSON.stringify(failed));
  } catch {}
}

// ── Lançamentos ─────────────────────────────────────────────────────

async function dbLoadLancamentos(mes, ano) {
  try {
    const uid = _uid();
    const baseFilter = 'user_id=eq.' + uid + '&deleted=eq.false' + (mes && ano ? '&mes=eq.' + mes + '&ano=eq.' + ano : '');
    const PAGE = 1000;
    let all = [];
    let offset = 0;
    // Pagina até buscar todos os registros
    while (true) {
      const path = 'mf_lancamentos?' + baseFilter + '&order=_ts.desc&limit=' + PAGE + '&offset=' + offset;
      const rows = await _dbFetch(path, 'GET');
      if (!rows || rows.length === 0) break;
      all = all.concat(rows);
      if (rows.length < PAGE) break; // última página
      offset += PAGE;
    }
    console.log('[DB] loadLancamentos total:', all.length);
    const normalized = all.map(_dbRowToLanc);
    _cacheSet('lancamentos_' + (mes || 'all') + '_' + (ano || ''), normalized);
    return normalized;
  } catch (e) {
    console.warn('[DB] loadLancamentos offline, usando cache:', e.message);
    return _cacheGet('lancamentos_' + (mes || 'all') + '_' + (ano || '')) || [];
  }
}

async function dbSaveLancamento(lanc) {
  const uid = _uid();
  const row = _lancToDbRow(lanc, uid);
  try {
    await _flushPending();
    await _dbFetch('mf_lancamentos', 'POST', row);
    _invalidateCache('lancamentos');
  } catch (e) {
    console.warn('[DB] saveLancamento offline, enfileirando:', e.message);
    _addPending({ path: 'mf_lancamentos', method: 'POST', body: row });
  }
}

async function dbSaveLancamentos(lancs) {
  const uid = _uid();
  const rows = lancs.map(l => _lancToDbRow(l, uid));
  const BATCH = 500;
  console.log('[DB] INSERT', lancs.length, 'lançamentos');
  try {
    await _flushPending();
    for (let i = 0; i < rows.length; i += BATCH) {
      await _dbFetch('mf_lancamentos', 'POST', rows.slice(i, i + BATCH));
    }
    _invalidateCache('lancamentos');
    console.log('[DB] INSERT OK');
  } catch (e) {
    console.error('[DB] saveLancamentos ERRO:', e.message);
    rows.forEach(r => _addPending({ path: 'mf_lancamentos', method: 'POST', body: r }));
  }
}

async function dbUpdateLancamento(id, fields) {
  const uid = _uid();

  // Se fields é um lançamento completo, converte tudo via _lancToDbRow
  // Se é parcial (ex: { status: 'pago' }), mapeia só os campos presentes
  let row;
  const isPartial = !fields.tipo && !fields.data && !fields.valor && !fields.desc;
  if (isPartial) {
    // Mapeamento direto dos campos parciais para colunas do Supabase
    const map = {
      status: 'status', tipo: 'tipo', valor: 'valor', desc: 'descricao',
      categoria: 'categoria', subCategoria: 'sub_categoria', pagamento: 'pagamento',
      banco: 'banco', terceiro: 'terceiro', vencimento: 'vencimento',
      tipoLanc: 'tipo_lanc', mes: 'mes', ano: 'ano', data: 'data',
      parcAtual: 'parc_atual', parcTotal: 'parc_total', groupId: 'group_id',
      totalParcelas: 'total_parcelas', recorr: 'recorr', recebido: 'recebido'
    };
    row = { _ts: Date.now() };
    Object.keys(fields).forEach(function(k) {
      const col = map[k];
      if (col) row[col] = fields[k] === undefined ? null : fields[k];
    });
  } else {
    row = _lancToDbRow(fields, uid);
    delete row.id; delete row.user_id;
    row._ts = Date.now();
  }

  console.log('[DB] PATCH lancamento', id, row);
  try {
    await _flushPending();
    await _dbFetch('mf_lancamentos?id=eq.' + encodeURIComponent(id) + '&user_id=eq.' + uid, 'PATCH', row);
    _invalidateCache('lancamentos');
    console.log('[DB] PATCH OK', id);
  } catch (e) {
    console.warn('[DB] updateLancamento erro:', e.message);
    _addPending({ path: 'mf_lancamentos?id=eq.' + id + '&user_id=eq.' + uid, method: 'PATCH', body: row });
  }
}

async function dbDeleteLancamento(id) {
  const uid = _uid();
  // Não mutar _memCache aqui — saveData já removeu o registro de forma síncrona
  // antes de chamar esta função. Mutação assíncrona aqui causaria race condition.
  const path = 'mf_lancamentos?id=eq.' + encodeURIComponent(id) + '&user_id=eq.' + uid;
  try {
    await _dbFetch(path, 'PATCH', { deleted: true });
    console.log('[DB] deleteLancamento (soft) OK:', id);
  } catch (e) {
    _addPending({ path, method: 'PATCH', body: { deleted: true } });
    console.warn('[DB] deleteLancamento enfileirado para retry:', id, e.message);
  }
}

async function dbLoadDeletedLancamentos() {
  try {
    const uid = _uid();
    const rows = await _dbFetch(
      'mf_lancamentos?user_id=eq.' + uid + '&deleted=eq.true&order=_ts.desc',
      'GET'
    );
    return (rows || []).map(_dbRowToLanc);
  } catch (e) {
    console.warn('[DB] loadDeletedLancamentos erro:', e.message);
    return [];
  }
}

// ── Conversão de formato ─────────────────────────────────────────────

function _lancToDbRow(l, uid) {
  // Helper: converte string vazia ou undefined para null (Supabase exige chaves consistentes)
  const v = x => (x === undefined || x === '' || x === null) ? null : x;
  return {
    id:             String(l.id),
    user_id:        uid,
    tipo:           l.tipo || 'despesa',
    data:           _toIsoDate(l.data) || null,
    valor:          l.valor != null ? l.valor : null,
    descricao:      v(l.desc),
    categoria:      v(l.categoria),
    sub_categoria:  v(l.subCategoria),
    status:         l.status || 'pendente',
    pagamento:      v(l.pagamento),
    tipo_lanc:      v(l.tipoLanc),
    vencimento:     _toIsoDate(l.vencimento) || null,
    mes:            l.mes != null ? Number(l.mes) : null,
    ano:            l.ano != null ? Number(l.ano) : null,
    group_id:       v(l.groupId),
    recorr:         v(l.recorr),
    total_parcelas: l.totalParcelas != null ? Number(l.totalParcelas) : null,
    origem:         v(l.origem),
    original_sign:  v(l.originalSign),
    terceiro:       v(l.terceiro),
    banco:          v(l.banco),
    parc_atual:     l.parcAtual != null ? Number(l.parcAtual) : null,
    parc_total:     l.parcTotal != null ? Number(l.parcTotal) : null,
    _ts:            l._ts || Date.now(),
    deleted:        false
  };
}

function _dbRowToLanc(r) {
  return {
    id:           r.id,
    tipo:         r.tipo,
    data:         r.data ? r.data.slice(0, 10) : '',
    valor:        r.valor != null ? parseFloat(r.valor) : 0,
    desc:         r.descricao,
    categoria:    r.categoria,
    subCategoria: r.sub_categoria,
    status:       r.status,
    pagamento:    r.pagamento,
    tipoLanc:     r.tipo_lanc,
    vencimento:   r.vencimento ? r.vencimento.slice(0, 10) : '',
    mes:          r.mes,
    ano:          r.ano,
    groupId:      r.group_id,
    recorr:       r.recorr,
    totalParcelas: r.total_parcelas,
    origem:       r.origem,
    originalSign: r.original_sign,
    terceiro:     r.terceiro,
    banco:        r.banco,
    parcAtual:      r.parc_atual,
    parcTotal:      r.parc_total,
    recebido:       r.recebido === true,
    _ts:            r._ts
  };
}

function _toIsoDate(d) {
  if (!d) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    const [dd, mm, yyyy] = d.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }
  return d.slice(0, 10);
}

// ── Provisões ────────────────────────────────────────────────────────

async function dbLoadProvisoes() {
  try {
    const uid = _uid();
    const rows = await _dbFetch('mf_provisoes?user_id=eq.' + uid + '&order=ano.asc,mes.asc', 'GET');
    const data = (rows || []).map(r => ({
      id:           r.id,
      groupId:      r.group_id,
      categoria:    r.categoria,
      subCategoria: r.sub_categoria,
      valor:        parseFloat(r.valor),
      mes:          r.mes,
      ano:          r.ano,
      banco:        r.banco || ''
    }));
    _cacheSet('provisoes', data);
    return data;
  } catch (e) {
    console.warn('[DB] loadProvisoes offline:', e.message);
    return _cacheGet('provisoes') || [];
  }
}

async function dbSaveProvisoes(provisoes) {
  const uid = _uid();
  // Estratégia: apaga as do grupo e recria (mais simples para parcelados)
  const rows = provisoes.map(p => ({
    id:           p.id,
    user_id:      uid,
    group_id:     p.groupId,
    categoria:    p.categoria,
    sub_categoria: p.subCategoria,
    valor:        p.valor,
    mes:          p.mes,
    ano:          p.ano,
    banco:        p.banco || null
  }));
  try {
    await _flushPending();
    await _dbFetch('mf_provisoes', 'POST', rows);
    _cacheSet('provisoes', provisoes);
  } catch (e) {
    console.warn('[DB] saveProvisoes offline:', e.message);
    rows.forEach(r => _addPending({ path: 'mf_provisoes', method: 'POST', body: r }));
  }
}

async function dbDeleteProvisoesByGroup(groupId) {
  const uid = _uid();
  try {
    await _dbFetch('mf_provisoes?user_id=eq.' + uid + '&group_id=eq.' + groupId, 'DELETE');
  } catch (e) {
    console.warn('[DB] deleteProvisoes offline:', e.message);
    _addPending({ path: 'mf_provisoes?user_id=eq.' + uid + '&group_id=eq.' + groupId, method: 'DELETE' });
  }
}

// ── Categorias ───────────────────────────────────────────────────────

async function dbLoadCategorias() {
  try {
    const uid = _uid();
    const rows = await _dbFetch('mf_categorias?user_id=eq.' + uid + '&order=ordem.asc', 'GET');
    const data = (rows || []).map(r => ({ ...r }));
    _cacheSet('categorias', data);
    return data;
  } catch (e) {
    console.warn('[DB] loadCategorias offline:', e.message);
    return _cacheGet('categorias') || [];
  }
}

async function dbSaveCategorias(cats) {
  const uid = _uid();
  const rows = cats.map((c, i) => ({ ...c, user_id: uid, ordem: i }));
  try {
    await _flushPending();
    // Upsert completo: apaga e recria (categorias mudam pouco)
    await _dbFetch('mf_categorias?user_id=eq.' + uid, 'DELETE');
    if (rows.length) await _dbFetch('mf_categorias', 'POST', rows);
    _cacheSet('categorias', cats);
  } catch (e) {
    console.warn('[DB] saveCategorias offline:', e.message);
    _addPending({ path: 'mf_categorias?user_id=eq.' + uid, method: 'DELETE' });
    rows.forEach(r => _addPending({ path: 'mf_categorias', method: 'POST', body: r }));
  }
}

// ── Formas de Pagamento ──────────────────────────────────────────────

async function dbLoadPagamentos() {
  try {
    const uid = _uid();
    const rows = await _dbFetch('mf_pagamentos?user_id=eq.' + uid + '&order=ordem.asc', 'GET');
    // Mapeia colunas do Supabase (snake_case) para o formato usado pelo app (camelCase)
    const data = (rows || []).map(function(p) {
      return {
        id:             p.id,
        nome:           p.nome,
        icone:          p.icone || null,
        cor:            p.cor || null,
        cartao:         p.cartao || false,
        diaVencimento:  p.dia_vencimento || null,
        diaCorte:       p.dia_fechamento || null,
        ordem:          p.ordem
      };
    });
    _cacheSet('pagamentos', data);
    return data;
  } catch (e) {
    console.warn('[DB] loadPagamentos offline:', e.message);
    return _cacheGet('pagamentos') || [];
  }
}

async function dbSavePagamentos(pags) {
  const uid = _uid();
  // Normaliza todos os objetos com os mesmos campos para evitar erro 400 do Supabase
  // "All object keys must match" ocorre quando objetos do array têm campos diferentes
  // Mapeia para os nomes reais das colunas do Supabase
  const rows = pags.map((p, i) => ({
    id:              p.id || ('pag_' + Date.now() + '_' + i),
    user_id:         uid,
    nome:            p.nome || '',
    icone:           p.icone || null,
    cor:             p.cor || null,
    cartao:          p.cartao || false,
    dia_vencimento:  p.diaVencimento || p.dia_vencimento || null,
    dia_fechamento:  p.diaCorte || p.dia_fechamento || null,
    ordem:           i
  }));
  try {
    await _flushPending();
    if (rows.length) await _dbFetch('mf_pagamentos', 'POST', rows);
    const pIds = pags.map(p => p.id).filter(Boolean);
    if (pIds.length) {
      await _dbFetch('mf_pagamentos?user_id=eq.' + uid + '&id=not.in.(' + pIds.map(id => '"' + id + '"').join(',') + ')', 'DELETE');
    } else {
      await _dbFetch('mf_pagamentos?user_id=eq.' + uid, 'DELETE');
    }
    _cacheSet('pagamentos', pags);
  } catch (e) {
    console.warn('[DB] savePagamentos offline:', e.message);
  }
}

// ── Terceiros ────────────────────────────────────────────────────────

async function dbLoadTerceiros() {
  try {
    const uid = _uid();
    const rows = await _dbFetch('mf_terceiros?user_id=eq.' + uid + '&order=nome.asc', 'GET');
    _cacheSet('terceiros', rows || []);
    return rows || [];
  } catch (e) {
    console.warn('[DB] loadTerceiros offline:', e.message);
    return _cacheGet('terceiros') || [];
  }
}

async function dbSaveTerceiros(terceiros) {
  const uid = _uid();
  const rows = terceiros.map(t => ({ ...t, user_id: uid }));
  try {
    await _flushPending();
    if (rows.length) await _dbFetch('mf_terceiros', 'POST', rows);
    const ids = terceiros.map(t => t.id).filter(Boolean);
    if (ids.length) {
      await _dbFetch('mf_terceiros?user_id=eq.' + uid + '&id=not.in.(' + ids.map(id => '"' + id + '"').join(',') + ')', 'DELETE');
    } else {
      await _dbFetch('mf_terceiros?user_id=eq.' + uid, 'DELETE');
    }
    _cacheSet('terceiros', terceiros);
  } catch (e) {
    console.warn('[DB] saveTerceiros offline:', e.message);
  }
}

// ── Bancos ───────────────────────────────────────────────────────────

async function dbLoadBancos() {
  try {
    const uid = _uid();
    const rows = await _dbFetch('mf_bancos?user_id=eq.' + uid + '&order=ordem.asc', 'GET');
    const bancos = (rows || []).map(r => ({
      id:           r.id,
      nome:         r.nome || '',
      icone:        r.icone || '🏦',
      cor:          r.cor || '#4af0a0',
      saldoInicial: r.saldo_inicial != null ? Number(r.saldo_inicial) : 0,
      saldoData:    r.saldo_data || '',
      ordem:        r.ordem
    }));
    _cacheSet('bancos', bancos);
    return bancos;
  } catch (e) {
    console.warn('[DB] loadBancos offline:', e.message);
    return _cacheGet('bancos') || [];
  }
}

async function dbSaveBancos(bancos) {
  const uid = _uid();
  // Mapeia apenas colunas que existem na tabela mf_bancos
  // Colunas da tabela mf_bancos: id, user_id, nome, icone, cor, ativo, saldo_inicial, saldo_data, ordem
  const rows = bancos.map((b, i) => ({
    id:            b.id,
    user_id:       uid,
    nome:          b.nome || '',
    icone:         b.icone || null,
    cor:           b.cor || null,
    ativo:         b.ativo !== false,
    saldo_inicial: b.saldoInicial != null ? Number(b.saldoInicial) : 0,
    saldo_data:    b.saldoData || null,
    ordem:         i
  }));
  try {
    await _flushPending();
    if (rows.length) await _dbFetch('mf_bancos', 'POST', rows);
    // Remove bancos que não estão mais na lista
    const ids = bancos.map(b => b.id).filter(Boolean);
    if (ids.length) {
      await _dbFetch('mf_bancos?user_id=eq.' + uid + '&id=not.in.(' + ids.map(id => '"' + id + '"').join(',') + ')', 'DELETE');
    }
    _cacheSet('bancos', bancos);
    console.log('[DB] saveBancos OK:', bancos.length);
  } catch (e) {
    console.error('[DB] saveBancos erro:', e.message);
  }
}

// ── Configurações ────────────────────────────────────────────────────

async function dbLoadConfig() {
  try {
    const uid = _uid();
    const rows = await _dbFetch('mf_config?user_id=eq.' + uid, 'GET');
    const config = (rows && rows[0]) || {};
    _cacheSet('config', config);
    return config;
  } catch (e) {
    console.warn('[DB] loadConfig offline:', e.message);
    return _cacheGet('config') || {};
  }
}

async function dbSaveConfig(fields) {
  const uid = _uid();
  const body = { user_id: uid, ...fields };
  try {
    await _flushPending();
    await _dbFetch('mf_config', 'POST', body); // upsert via merge-duplicates
  } catch (e) {
    console.warn('[DB] saveConfig offline:', e.message);
    _addPending({ path: 'mf_config', method: 'POST', body });
  }
}

// ── Tombstones ───────────────────────────────────────────────────────

async function dbAddTombstone(id, tabela) {
  const uid = _uid();
  try {
    await _dbFetch('mf_tombstones', 'POST', {
      id: String(id), user_id: uid, tabela, deleted_at: Date.now()
    });
  } catch {}
}

async function dbGetTombstones() {
  try {
    const uid = _uid();
    const rows = await _dbFetch('mf_tombstones?user_id=eq.' + uid, 'GET');
    const map = {};
    (rows || []).forEach(r => { map[r.id] = r.deleted_at; });
    return map;
  } catch { return {}; }
}

// ── Cache invalidation ───────────────────────────────────────────────

function _invalidateCache(table) {
  try {
    // Remove todas as chaves de cache que começam com mf_cache_{table}
    const uid = _uid().slice(0, 8);
    Object.keys(localStorage)
      .filter(k => k.startsWith('mf_cache_' + table + '_' + uid))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
}

// ── Inicialização de dados para novo usuário ─────────────────────────

async function dbInitNewUser() {
  const uid = _uid();
  // Verifica se já tem dados
  try {
    const rows = await _dbFetch('mf_lancamentos?user_id=eq.' + uid + '&limit=1', 'GET');
    if (rows && rows.length > 0) return; // já tem dados
  } catch {}

  console.log('[DB] Novo usuário — inicializando dados padrão...');

  // Insere config inicial
  await dbSaveConfig({
    saldo_inicial: { valor: 0, data: '' },
    banco_modo: 'consolidado',
    catmap: {},
    submap: {}
  });

  // As categorias, pagamentos, bancos e terceiros padrão são inicializados
  // pelas próprias funções load* quando retornam array vazio (comportamento existente)
  // O código existente já faz isso — apenas precisamos garantir que após init
  // os dados sejam salvos no banco via as novas funções db*
}

// ── Evento: voltar online → flush pendências ─────────────────────────

window.addEventListener('online', async () => {
  console.log('[DB] Voltou online — enviando operações pendentes...');
  try {
    await _flushPending();
    // Re-render após sincronizar
    setTimeout(() => {
      try { renderAll(); renderTerceirosTab(); renderParceladosTab(); renderVencimentosTab(); renderCartoesTab(); } catch {}
    }, 500);
  } catch {}
});