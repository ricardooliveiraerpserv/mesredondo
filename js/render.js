// ======== RENDER ========

// Helper: filtro incremental de valor.
// Compara o valor formatado (ex: "100,50") com o que o user digitou.
// Aceita digitação parcial: "100" filtra 100,00 / 1000,00 / 100,50 / 1100 etc.
function _matchValor(valor, inputRaw) {
  if (!inputRaw) return true;
  const norm = String(inputRaw).replace(/[^\d,]/g, '');
  if (!norm) return true;
  const valorStr = (Math.abs(Number(valor) || 0)).toFixed(2).replace('.', ',');
  return valorStr.includes(norm);
}
window._matchValor = _matchValor;

// Helper: extrai { mes, ano } de uma string de vencimento em qualquer formato
// Aceita YYYY-MM-DD (Supabase) e DD/MM/YYYY (legado)
function _parseVencMesAno(venc) {
  if (!venc) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(venc)) {
    const p = venc.slice(0, 10).split('-');
    const a = parseInt(p[0]), m = parseInt(p[1]);
    if (m >= 1 && m <= 12 && a > 2000) return { mes: m, ano: a };
  }
  const p = venc.split('/');
  if (p.length === 3) {
    const m = parseInt(p[1]), a = parseInt(p[2]);
    if (m >= 1 && m <= 12 && a > 2000) return { mes: m, ano: a };
  }
  return null;
}

// Helper: retorna o valor correto de exibição para um lançamento.
// Lançamentos parcelados criados pelo app têm l.valor = valor da parcela (correto).
// Lançamentos importados sem groupId podem ter l.valor = valor total — nesse caso divide.
function _valorExib(l) {
  const isParc = (l.tipoLanc === 'parcelado' || l.recorr === 'parcelado');
  const nP = l.parcTotal || l.totalParcelas || 1;
  if (isParc && nP > 1 && !l.groupId) {
    return Math.round((l.valor / nP) * 100) / 100;
  }
  return l.valor;
}

function getMesAno(l) {
  const v = _parseVencMesAno(l.vencimento);
  if (v) return v;
  return { mes: l.mes, ano: l.ano };
}

// ── Filtro rápido de status por botões (Todos / Pendente / Pago / Atrasado) ──
// Padrão usado em Lançamentos, Terceiros e A Pagar/A Receber.
window._lancStatusQuick = window._lancStatusQuick || '';
window._tercStatusQuick = window._tercStatusQuick || '';

// HTML dos botões. fnName = nome global da função de clique.
window._renderStatusBtns = function(currentVal, fnName) {
  var opts = [
    { v:'',               label:'Todos',    cor:'var(--accent2)' },
    { v:'pendente',       label:'Pendente', cor:'#f59e0b' },
    { v:'pago',           label:'Pago',     cor:'var(--green)' },
    { v:'vencido_status', label:'Atrasado', cor:'#ef4444' },
  ];
  return '<div style="display:flex;gap:6px;flex-wrap:wrap">' + opts.map(function(o) {
    var ativo = (currentVal || '') === o.v;
    return '<button onclick="'+fnName+'(\''+o.v+'\')" style="padding:5px 16px;border-radius:20px;border:1px solid '
      + (ativo?o.cor:'var(--border)') + ';background:' + (ativo?o.cor+'22':'var(--surface2)') + ';color:'
      + (ativo?o.cor:'var(--text2)') + ';font-size:0.75rem;font-weight:' + (ativo?'700':'400')
      + ';cursor:pointer;transition:all 120ms">' + o.label + '</button>';
  }).join('') + '</div>';
};

// Lançamento vencido = não pago E vencimento (ou data) anterior a hoje.
window._isVencidoStatus = function(l) {
  if (l.status === 'pago') return false;
  var hoje = new Date(); hoje.setHours(0,0,0,0);
  var ds = l.vencimento || l.data || '';
  var vd = null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(ds)) { var p = ds.split('/'); vd = new Date(p[2]+'-'+p[1]+'-'+p[0]+'T00:00:00'); }
  else if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) { vd = new Date(ds+'T00:00:00'); }
  if (!vd || isNaN(vd)) return false;
  return vd.getTime() < hoje.getTime();
};

// Aplica o filtro rápido de status a uma lista de lançamentos.
window._applyStatusQuick = function(items, statusVal) {
  if (!statusVal) return items;
  if (statusVal === 'pago')           return items.filter(function(l){ return l.status === 'pago'; });
  if (statusVal === 'pendente')       return items.filter(function(l){ return l.status !== 'pago'; });
  if (statusVal === 'vencido_status') return items.filter(function(l){ return l.status !== 'pago' && window._isVencidoStatus(l); });
  return items;
};

window._setLancStatus = function(v) {
  window._lancStatusQuick = (window._lancStatusQuick === v) ? '' : v;
  if (typeof renderAll === 'function') renderAll();
};
window._setTercStatus = function(v) {
  window._tercStatusQuick = (window._tercStatusQuick === v) ? '' : v;
  if (typeof renderTerceirosTab === 'function') renderTerceirosTab();
};


// Helper: verifica se lançamento está no range filtrado
function _inRange(l) {
  const rng = window._rangeFilter || { de: { mes: currentMonth, ano: currentYear }, ate: { mes: currentMonth, ano: currentYear } };
  let mes = Number(l.mes), ano = Number(l.ano);
  if (!mes || !ano) {
    if (l.data) { const p=l.data.split('-'); ano=parseInt(p[0]); mes=parseInt(p[1]); }
  }
  if (!mes || !ano) return false;
  const v = ano*100+mes, de = rng.de.ano*100+rng.de.mes, ate = rng.ate.ano*100+rng.ate.mes;
  return v >= de && v <= ate;
}
// Igual ao _inRange, mas pelo VENCIMENTO (qual fatura o lançamento pertence).
// Usado nos CARTÕES — a fatura é definida pelo vencimento, não pela competência.
function _inRangeVenc(l) {
  const rng = window._rangeFilter || { de: { mes: currentMonth, ano: currentYear }, ate: { mes: currentMonth, ano: currentYear } };
  let mes, ano;
  const vc = String(l.vencimento || '');
  let m1 = vc.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  let m2 = vc.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) { mes = parseInt(m1[2]); ano = parseInt(m1[3]); }
  else if (m2) { mes = parseInt(m2[2]); ano = parseInt(m2[1]); }
  else { mes = Number(l.mes); ano = Number(l.ano); if ((!mes || !ano) && l.data) { const p = String(l.data).split('-'); ano = parseInt(p[0]); mes = parseInt(p[1]); } }
  if (!mes || !ano) return false;
  const v = ano*100+mes, de = rng.de.ano*100+rng.de.mes, ate = rng.ate.ano*100+rng.ate.mes;
  return v >= de && v <= ate;
}
// Mês/ano de um lançamento PELO VENCIMENTO (fallback p/ mes/ano). Usado p/ agrupar
// fatura de cartão por vencimento (pagar/estornar/somar).
function _vencMesAno(l) {
  const vc = String(l && l.vencimento || '');
  let m1 = vc.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  let m2 = vc.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) return { mes: parseInt(m1[2]), ano: parseInt(m1[3]) };
  if (m2) return { mes: parseInt(m2[2]), ano: parseInt(m2[1]) };
  return { mes: Number(l && l.mes), ano: Number(l && l.ano) };
}
// ── Filtro de banco centralizado ──
// Retorna todos os lançamentos já filtrados pelo contexto de banco ativo
function _applyBancoFilter(items) {
  const bancoAtivo     = getBancoAtivo();
  const bancosIndepIds = loadBancos().filter(b => b.modo === 'independente').map(b => b.id);
  return items.filter(l => {
    if (bancoAtivo) return (l.banco || '') === bancoAtivo;
    if (bancosIndepIds.length && bancosIndepIds.includes(l.banco || '')) return false;
    return true;
  });
}
function loadDataBanco()    { return _applyBancoFilter(loadData()); }
function getMonthData() {
  const de  = window._rangeFilter ? window._rangeFilter.de  : { mes: currentMonth, ano: currentYear };
  const ate = window._rangeFilter ? window._rangeFilter.ate : { mes: currentMonth, ano: currentYear };
  const deVal  = de.ano  * 100 + de.mes;
  const ateVal = ate.ano * 100 + ate.mes;
  return loadDataBanco().filter(function(l) {
    const ma = getMesAno(l);
    const v = ma.ano * 100 + ma.mes;
    return v >= deVal && v <= ateVal;
  });
}

function clearLancFiltros() {
  if (window.FSEL) {
    ['filtroTipo','filtroStatus','filtroCategoria','filtroSubCategoria','filtroSemCat','filtroTipoLanc','filtroPagamento','filtroTerceiro','filtroBanco'].forEach(id => FSEL.reset(id));
  }
  const _fb = document.getElementById('filtroBusca');
  if (_fb) _fb.value = '';
  const _bc = document.getElementById('btnClearLancFiltros');
  if (_bc) _bc.style.display = 'none';
  renderAll();
}

function _checkLancFiltrosAtivos() {
  const filtroBuscaEl = document.getElementById('filtroBusca');
  if (!filtroBuscaEl) return; // aba Lançamentos ainda não renderizada
  const busca = (filtroBuscaEl.value || '').trim();
  const fselIds = ['filtroTipo','filtroStatus','filtroCategoria','filtroSubCategoria','filtroSemCat','filtroTipoLanc','filtroPagamento','filtroTerceiro','filtroBanco'];
  const algumAtivo = busca.length > 0 || (window.FSEL && fselIds.some(id => FSEL.getValues(id).length > 0));
  const btn = document.getElementById('btnClearLancFiltros');
  if (btn) btn.style.display = algumAtivo ? 'inline-flex' : 'none';
}

// ── Preservação de posição de scroll ──────────────────────────────────────────
// Captura o estado de scroll atual: posição Y + o primeiro elemento [data-id]
// que está visível dentro da viewport.
function getScrollContext() {
  const scrollY = window.scrollY;
  // Percorre todos os elementos com data-id e encontra o primeiro dentro da viewport
  let anchorId = null;
  const candidates = document.querySelectorAll('[data-id]');
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    // Considera visível se o topo está na metade superior da viewport
    if (rect.top >= 0 && rect.top < window.innerHeight * 0.6) {
      anchorId = el.getAttribute('data-id');
      break;
    }
  }
  return { scrollY, anchorId };
}

// Restaura o scroll: tenta scrollIntoView no elemento pelo data-id,
// com fallback para a posição Y capturada.
function restoreScrollContext(ctx) {
  if (!ctx) return;
  if (ctx.anchorId) {
    const el = document.querySelector(`[data-id="${CSS.escape(ctx.anchorId)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      return;
    }
  }
  // Fallback: restaurar posição Y
  window.scrollTo({ top: ctx.scrollY, behavior: 'instant' });
}

// Envolve qualquer função de render preservando o contexto de scroll.
// ── normalizarData — única fonte de conversão de datas no app ────────
// Aceita YYYY-MM-DD, DD/MM/YYYY ou objeto Date. Devolve YYYY-MM-DD.
function normalizarData(d) {
  if (!d) return '';
  if (d instanceof Date) return isNaN(d) ? '' : d.toISOString().slice(0, 10);
  var s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { var p = s.split('/'); return p[2] + '-' + p[1] + '-' + p[0]; }
  var parsed = new Date(s);
  return isNaN(parsed) ? '' : parsed.toISOString().slice(0, 10);
}

// ── _scheduleRender — debounce de renderAll para evitar renders duplos ─
var _renderTimer = null;
function _scheduleRender() {
  if (_renderTimer) clearTimeout(_renderTimer);
  _renderTimer = setTimeout(function() {
    _renderTimer = null;
    renderAll();
    try {
      var _activeTab = document.querySelector('.tab-content.active');
      var _tab = _activeTab ? _activeTab.id.replace('tab-', '') : '';
      if (_tab === 'terceiros'  && typeof renderTerceirosTab  === 'function') renderTerceirosTab();
      if (_tab === 'parcelados' && typeof renderParceladosTab === 'function') renderParceladosTab();
      if (_tab === 'vencimentos'&& typeof renderVencimentosTab=== 'function') renderVencimentosTab();
      if (_tab === 'cartoes'    && typeof renderCartoesTab    === 'function') renderCartoesTab();
    } catch(e) {}
  }, 0);
}

// Usa requestAnimationFrame para restaurar após o DOM ser atualizado.
function safeRender(fn) {
  const ctx = getScrollContext();
  fn();
  requestAnimationFrame(() => {
    restoreScrollContext(ctx);
  });
  // Re-renderiza aba Terceiros se estiver ativa (com delay para garantir cache atualizado)
  setTimeout(function() {
    const _activeTab = document.querySelector('.tab-content.active');
    if (_activeTab && _activeTab.id === 'tab-terceiros' && typeof renderTerceirosTab === 'function') {
      renderTerceirosTab();
    }
  }, 50);
}

// Toggle do dashboard: alterna entre resultado COM provisão de orçamento e
// só com o gasto real/lançado. Lido em _renderAll() via window._dashSemProv.
window.toggleDashProvisao = function() {
  window._dashSemProv = !window._dashSemProv;
  renderAll();
};

function renderAll() {
  try { _renderAll(); setTimeout(_updateTableWrapHeight, 100); } catch(e) {
    console.error('[FinanceOS] ERRO CRÍTICO no renderAll:', e);
    // Não usar alert() — bloqueia a UI no mobile; usa banner não-bloqueante
    try {
      var _eb = document.getElementById('_renderErrBanner');
      if (!_eb) {
        _eb = document.createElement('div');
        _eb.id = '_renderErrBanner';
        _eb.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#f05060;color:#fff;padding:10px 18px;border-radius:8px;font-size:0.82rem;z-index:99999;max-width:90vw;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.4);cursor:pointer';
        _eb.onclick = function() { _eb.style.display = 'none'; };
        document.body.appendChild(_eb);
      }
      _eb.textContent = 'Erro ao renderizar: ' + e.message + ' (toque para fechar)';
      _eb.style.display = 'block';
      setTimeout(function() { if (_eb) _eb.style.display = 'none'; }, 6000);
    } catch(_) {}
  }
}
function _renderAll() {
  updatePeriodoLabel();
  _checkLancFiltrosAtivos();

  // Garante que os wrappers sticky (bancos, cards) estejam visíveis para a aba atual.
  // updateCardSections só é chamado em showTab(), que não roda no boot nem no F5.
  (function() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    const tab = activeTab.id.replace('tab-', '');
    updateCardSections(tab);
  })();

  renderBancoCards();
  _applyMobileLayout();

  // getMonthData() já aplica _applyBancoFilter. FSEL adicional para filtro manual.
  const _bancoFiltroFSEL = window.FSEL ? FSEL.getValues('filtroBanco') : [];
  const all = _bancoFiltroFSEL.length
    ? getMonthData().filter(l => _bancoFiltroFSEL.includes(l.banco || ''))
    : getMonthData();

  // Categorias fora do orçamento
  const CAT_TERCEIROS_REC  = 'Entrada Terceiro';
  const CAT_TERCEIROS_DESP = 'Dividas de terceiros';
  const CAT_TRANSF_NOME    = 'Transferência';
  const isTerceiro = l => l.categoria === CAT_TERCEIROS_REC || l.categoria === CAT_TERCEIROS_DESP;
  const isTransferencia = l => l.categoria === CAT_TRANSF_NOME;

  const orcamento = all.filter(l => !isTerceiro(l) && !isTransferencia(l));
  const receitas  = orcamento.filter(l => l.tipo === 'receita');
  const despesas  = orcamento.filter(l => l.tipo === 'despesa');
  const totalR = receitas.reduce((s, l) => s + _valorExib(l), 0);

  // ── Orçamento (para aba Orçamento e subtexto do card) ──
  let _provGrupos = [], _totProvMes = 0, _totGastoMes = 0;
  try {
    const _pc = calcProvisaoAcumulada();
    _provGrupos  = _pc.grupos      || [];
    _totProvMes  = _pc.totProvMes  || 0;
    _totGastoMes = _pc.totGastoMes || 0;
  } catch(e) { console.warn('calcProvisaoAcumulada error:', e); }
  const provs = _provGrupos;

  // ── Despesa Mensal — regras por mês ──
  // 1) Exclui categoria "Dívidas de terceiros"
  // 2) Mês passado com orçamento   → gasto real (ignora orçamento)
  // 3) Mês vigente com orçamento   → gasto real + saldo positivo (prov - gasto) se > 0
  // 4) Mês futuro com orçamento    → gasto real já lançado + provisionado restante
  // 5) Sem orçamento               → gasto real

  const CAT_EXCLUIR_DESP = 'Dividas de terceiros';
  const hoje = new Date();
  const mesHoje = hoje.getMonth() + 1;
  const anoHoje = hoje.getFullYear();

  // Gasto real do mês filtrado por categoria (excluindo Dívidas de terceiros)
  // Inclui negativos (estornos/créditos) pois reduzem o gasto real
  const gastoRealCat = {};
  despesas.filter(l => l.categoria !== CAT_EXCLUIR_DESP).forEach(l => {
    gastoRealCat[l.categoria] = (gastoRealCat[l.categoria] || 0) + _valorExib(l);
  });
  const gastoRealTotal = Object.values(gastoRealCat).reduce((s, v) => s + v, 0);

  // Mapa orçamento do mês filtrado por categoria
  const provMesCat = {};
  // Orçamento usa mês final do range como referência
  const _rngProv  = window._rangeFilter || { ate: { mes: currentMonth, ano: currentYear } };
  const _mesProv  = _rngProv.ate.mes, _anoProv = _rngProv.ate.ano;
  provs.forEach(g => {
    const entMes = (g.entradas || []).find(e =>
      e.mes === _mesProv && e.ano === _anoProv
    );
    if (entMes) provMesCat[g.categoria] = entMes.valor;
  });

  // Determina se mês de referência é passado, vigente ou futuro
  const isMesVigente = (_mesProv === mesHoje && _anoProv === anoHoje);
  const isMesFuturo  = (_anoProv > anoHoje || (_anoProv === anoHoje && _mesProv > mesHoje));
  const isMesPassado = !isMesVigente && !isMesFuturo;

  // Toggle do dashboard: ver resultado sem a provisão de orçamento (só gasto real)
  const _semProv = !!window._dashSemProv;
  // Provisão extra do mês (orçamento ainda não gasto) — independe do toggle.
  // Saldo da orçamento = orçamento total do mês - gasto calculado pela lógica de orçamento (parcela 1 etc)
  const _provExtra = (!isMesPassado && _totProvMes > 0) ? Math.max(0, _totProvMes - _totGastoMes) : 0;

  let totalDCard = gastoRealTotal; // base = gasto real (sem terceiros)
  if (!_semProv) totalDCard += _provExtra; // soma a provisão, salvo se o toggle "sem provisão" estiver ativo

  const saldo = totalR - totalDCard;

  const totalD = despesas.reduce((s, l) => s + _valorExib(l), 0); // gasto real bruto (para pendentes/efetuado)

  // Pendentes orçamento (só despesas com valor > 0 — negativos já são créditos)
  const pendentes = despesas.filter(l => l.status === 'pendente' && l.valor > 0);
  const totalPend = pendentes.reduce((s, l) => s + _valorExib(l), 0);
  const totalCreditosImp = 0;
  const totalPendLiq = totalPend;
  const pendentesRec = receitas.filter(l => l.status === 'pendente');
  const totalPendRec = pendentesRec.reduce((s, l) => s + _valorExib(l), 0);

  // Recebido e Efetuado (status = pago)
  const recebidos = receitas.filter(l => l.status === 'pago');
  const totalRecebido = recebidos.reduce((s, l) => s + _valorExib(l), 0);
  const efetuados = despesas.filter(l => l.status === 'pago' && l.valor > 0);
  const totalEfetuado = efetuados.reduce((s, l) => s + _valorExib(l), 0);

  // Terceiros (fora do orçamento)
  const entradaTerceiro = all.filter(l => l.categoria === CAT_TERCEIROS_REC);
  const dividaTerceiro  = all.filter(l => l.categoria === CAT_TERCEIROS_DESP);
  const totalEntTer = entradaTerceiro.reduce((s, l) => s + _valorExib(l), 0);
  const totalDivTer = dividaTerceiro.reduce((s, l) => s + _valorExib(l), 0);
  const saldoTer = totalEntTer - totalDivTer;

  // Transferências do período (informativo — fora do orçamento). Conta cada
  // transferência uma vez por groupId, independente de qual ponta está visível
  // no filtro de banco atual (origem=saída, destino=entrada).
  const transfLancs = all.filter(isTransferencia);
  const _seenTransfG = new Set();
  let totalTransfMes = 0;
  transfLancs.forEach(l => {
    const g = String(l.groupId || l.id);
    if (_seenTransfG.has(g)) return;
    _seenTransfG.add(g);
    totalTransfMes += _valorExib(l);
  });
  const qtdTransfMes = _seenTransfG.size;

  const temProv = provs.length > 0;

  // Cards orçamento (null-safe para evitar throw se o DOM ainda não estiver pronto)
  const _s1 = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
  _s1('totalReceita',  fmt(totalR));
  _s1('totalRecebido', fmt(totalRecebido));
  const _elRecPend = document.getElementById('totalRecebidoPend');
  if (_elRecPend) _elRecPend.textContent = fmt(totalPendRec);
  const _qtdRecEl = document.getElementById('qtdReceitas');
  if (_qtdRecEl) _qtdRecEl.textContent = `${receitas.length} entrada${receitas.length !== 1 ? 's' : ''}`;
  _s1('totalDespesa',  fmt(totalDCard));
  _s1('qtdDespesas',   temProv ? `${despesas.length} saídas · ${provs.length} prov.` : `${despesas.length} saídas`);
  _s1('totalEfetuado', fmt(totalEfetuado));
  const _elDespPend = document.getElementById('totalDespPend');
  if (_elDespPend) _elDespPend.textContent = fmt(totalPendLiq);

  // Breakdown despesa real vs orçamento
  const saldoProvParaCard = _semProv ? 0 : _provExtra;
  const provRow  = document.getElementById('despesaProvRow');
  const provReal = document.getElementById('despesaProvReal');
  const provProv = document.getElementById('despesaProvProv');
  const lblDesp  = document.getElementById('labelDespesaCard');
  if (saldoProvParaCard > 0) {
    if (provRow)  { provRow.style.display = 'flex'; }
    if (provReal) provReal.textContent = 'Gasto: ' + fmt(gastoRealTotal);
    if (provProv) provProv.textContent  = '📦 Prov: ' + fmt(saldoProvParaCard);
    if (lblDesp)  lblDesp.textContent   = '↓ Despesa + Prov';
  } else {
    if (provRow)  { provRow.style.display = 'none'; }
    if (lblDesp)  lblDesp.textContent   = '↓ Despesa';
  }
  _s1('saldoMensal', (saldo >= 0 ? '' : '-') + fmt(Math.abs(saldo)));
  // Resultado do mês — hero decisor com cor dinâmica
  const _elSaldoMensal = document.getElementById('saldoMensal');
  if (_elSaldoMensal) {
    const _resPos = saldo >= 0;
    _elSaldoMensal.style.color = '';
    _elSaldoMensal.classList.toggle('neg', !_resPos);
    // Re-triggar animação
    _elSaldoMensal.style.animation = 'none';
    _elSaldoMensal.offsetHeight;
    _elSaldoMensal.style.animation = '_saldoIn .45s cubic-bezier(.22,1,.36,1) both';
    // Card container: borda/fundo contextual
    const _cardRes = document.getElementById('cardResultado');
    if (_cardRes) _cardRes.classList.toggle('neg', !_resPos);
    // Badge de alerta
    const _resIcon = document.getElementById('resultadoAlertaIcon');
    if (_resIcon) _resIcon.style.display = !_resPos ? 'inline' : 'none';
  }
  // Botão "ver sem provisão" — só aparece quando há provisão a alternar neste mês
  const _btnProv = document.getElementById('btnToggleProv');
  if (_btnProv) {
    if (_provExtra > 0) {
      _btnProv.style.display = 'inline-block';
      _btnProv.textContent = _semProv
        ? '📦 Incluir provisão (+' + fmt(_provExtra) + ')'
        : '💸 Ver só gasto real';
      _btnProv.title = _semProv
        ? 'Mostrando só o gasto real/lançado. Clique para somar a provisão de orçamento (' + fmt(_provExtra) + ').'
        : 'Despesa inclui ' + fmt(_provExtra) + ' de provisão de orçamento. Clique para ver só o gasto real/lançado.';
    } else {
      _btnProv.style.display = 'none';
    }
  }
  // Linha de transferências do período no card de saldo (informativo)
  const _transfRow = document.getElementById('transfMesRow');
  if (_transfRow) {
    if (qtdTransfMes > 0) {
      _transfRow.style.display = 'flex';
      const _tv = document.getElementById('transfMesValor');
      if (_tv) _tv.textContent = fmt(totalTransfMes);
      const _tq = document.getElementById('transfMesQtd');
      if (_tq) _tq.textContent = '· ' + qtdTransfMes + (qtdTransfMes === 1 ? ' movimentação' : ' movimentações');
    } else {
      _transfRow.style.display = 'none';
    }
  }

  // Renderizar insights
  _renderInsights(saldo, totalR, totalDCard);

  // Hero card — saldo final projetado
  const heroEl = document.getElementById('heroSaldoFinal');
  const heroStatus = document.getElementById('heroStatusLabel');
  const heroBar = document.getElementById('heroProgressBar');
  if (heroEl) {
    heroEl.textContent = (saldo >= 0 ? '+' : '') + (saldo < 0 ? '-' : '') + fmt(Math.abs(saldo));
    heroEl.style.color = saldo >= 0 ? 'var(--green)' : 'var(--red)';
    heroEl.style.textShadow = saldo >= 0 ? '0 0 24px rgba(0,255,136,0.35)' : '0 0 24px rgba(255,69,96,0.35)';
  }
  if (heroStatus) {
    heroStatus.textContent = saldo >= 0 ? '✓ Você vai fechar positivo' : '⚠ Atenção: saldo negativo projetado';
    heroStatus.style.color = saldo >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (heroBar) {
    const pct = totalR > 0 ? Math.min(100, Math.round((saldo / totalR) * 100)) : 0;
    heroBar.style.width = '100%';
    heroBar.style.background = 'linear-gradient(90deg,#22c55e,#facc15,#ef4444)';
    heroBar.style.opacity = '0.85';
    heroBar.style.boxShadow = 'none';
  }
  const _elSaldoRec  = document.getElementById('saldoRecRef');  if (_elSaldoRec)  _elSaldoRec.textContent  = fmt(totalR);
  const _elSaldoDesp = document.getElementById('saldoDespRef'); if (_elSaldoDesp) _elSaldoDesp.textContent = fmt(totalDCard);
  const _elPendPag = document.getElementById('pendentePag'); if(_elPendPag) _elPendPag.textContent = fmt(totalPendLiq);
  const _elPendRec = document.getElementById('pendenteRec'); if(_elPendRec) _elPendRec.textContent = fmt(totalPendRec);
  const _elQtdPend = document.getElementById('qtdPendentes'); if(_elQtdPend) _elQtdPend.textContent = `${pendentes.length} pendentes`;
  const _elQtdPendRec = document.getElementById('qtdPendentesRec'); if(_elQtdPendRec) _elQtdPendRec.textContent = `${pendentesRec.length} pendentes`;

  // Card Pago/Recebido removido — valores integrados nos cards de Receita e Despesa
  const elCPN  = document.getElementById('cardTotalPendente');
  const elCPNq = document.getElementById('cardQtdPendente');
  if (elCPN || elCPNq) {
    const todoPendentes = all.filter(l => l.status !== 'pago');
    const vTodoPend = todoPendentes.reduce((s,l) => s + Math.abs(_valorExib(l)), 0);
    if (elCPN)  elCPN.textContent  = fmt(vTodoPend);
    if (elCPNq) elCPNq.textContent = todoPendentes.length + ' lançamento' + (todoPendentes.length !== 1 ? 's' : '');
  }

  // Cards terceiros
  document.getElementById('totalEntradaTerceiro').textContent = fmt(totalEntTer);
  document.getElementById('qtdEntradaTerceiro').textContent = `${entradaTerceiro.length} entrada${entradaTerceiro.length !== 1 ? 's' : ''}`;
  document.getElementById('totalDividaTerceiro').textContent = fmt(totalDivTer);
  document.getElementById('qtdDividaTerceiro').textContent = `${dividaTerceiro.length} saída${dividaTerceiro.length !== 1 ? 's' : ''}`;
  const saldoTerEl = document.getElementById('saldoTerceiros');
  saldoTerEl.textContent = (saldoTer >= 0 ? '+' : '-') + fmt(Math.abs(saldoTer));
  saldoTerEl.style.color = saldoTer >= 0 ? 'var(--green)' : 'var(--red)';

  // ── Totais acumulados ──
  (function() {
    const allHist = _applyBancoFilter(loadData());
    const ctx5 = getBancoContexto();
    const consolIds5 = getBancosConsolidadoIds();
    const allBancos5 = loadBancos();
    const bancosConsolid = ctx5 === 'consolidado' ? allBancos5.filter(b=>consolIds5.includes(b.id))
                         : ctx5 ? allBancos5.filter(b=>b.id===ctx5)
                         : [];

    const hoje    = new Date();
    const mesHoje = hoje.getMonth() + 1;
    const anoHoje = hoje.getFullYear();
    const rng     = window._rangeFilter || { de: { mes: currentMonth, ano: currentYear }, ate: { mes: currentMonth, ano: currentYear } };
    const isSingleMonth = (rng.de.mes === rng.ate.mes && rng.de.ano === rng.ate.ano);
    const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    let saldoInicialBancos = bancosConsolid.length
      ? bancosConsolid.reduce((s,b) => s+(b.saldoInicial||0), 0)
      : 0;

    let acumRec = 0, acumDesp = 0;

    allHist.forEach(function(l) {
      const ma = getMesAno(l);
      let mes = ma.mes, ano = ma.ano;
      if (!mes || !ano) {
        if (l.data) { const p=l.data.split('-'); if(p.length===3){ano=parseInt(p[0]);mes=parseInt(p[1]);} }
      }
      if (!mes || !ano) return;
      if (l.categoria === CAT_TERCEIROS_REC || l.categoria === CAT_TERCEIROS_DESP) return;

      const v = ano * 100 + mes;

      if (isSingleMonth) {
        const limAte = rng.ate.ano * 100 + rng.ate.mes;
        if (v > limAte) return;
      } else {
        const limDe  = rng.de.ano  * 100 + rng.de.mes;
        const limAte = rng.ate.ano * 100 + rng.ate.mes;
        if (v < limDe || v > limAte) return;
      }

      if (l.tipo === 'receita') acumRec  += _valorExib(l);
      if (l.tipo === 'despesa') acumDesp += _valorExib(l);
    });

    // Para mês vigente/futuro em modo single, adiciona saldo de orçamento
    if (isSingleMonth) {
      const isMesVig = (rng.ate.mes === mesHoje && rng.ate.ano === anoHoje);
      const isMesFut = (rng.ate.ano > anoHoje || (rng.ate.ano === anoHoje && rng.ate.mes > mesHoje));
      if ((isMesVig || isMesFut) && _totProvMes > 0) {
        const saldoProv = _totProvMes - _totGastoMes;
        if (saldoProv > 0) acumDesp += saldoProv;
      }
    }

    const acumSaldo = saldoInicialBancos + acumRec - acumDesp;
    document.getElementById('totalAcumRec').textContent  = fmt(acumRec);
    document.getElementById('totalAcumDesp').textContent = fmt(acumDesp);
    const sEl = document.getElementById('totalAcumSaldo');
    // Cor dinâmica + glow premium: verde positivo / vermelho negativo
    const _isPos = acumSaldo >= 0;
    const _cor   = _isPos ? '#4ade80' : '#f87171';
    const _glow  = _isPos
      ? '0 0 24px rgba(74,222,128,0.75), 0 0 48px rgba(74,222,128,0.25)'
      : '0 0 24px rgba(248,113,113,0.75), 0 0 48px rgba(248,113,113,0.25)';
    sEl.textContent  = (acumSaldo >= 0 ? '+' : '-') + fmt(Math.abs(acumSaldo));
    sEl.style.color  = _cor;
    sEl.style.textShadow = _glow;
    // Re-triggar animação de entrada
    sEl.style.animation = 'none';
    sEl.offsetHeight; // reflow
    sEl.style.animation = '_saldoIn 0.4s cubic-bezier(0.22,1,0.36,1) both';

    // Label do período
    const lbl = document.getElementById('acumMesLabel');
    if (lbl) {
      if (isSingleMonth) {
        lbl.textContent = 'até ' + MESES[rng.ate.mes-1] + '/' + String(rng.ate.ano).slice(2);
      } else {
        lbl.textContent = MESES[rng.de.mes-1] + '/' + String(rng.de.ano).slice(2)
                        + ' → ' + MESES[rng.ate.mes-1] + '/' + String(rng.ate.ano).slice(2);
      }
    }
  })();

  renderAllTable();
  renderCatChart(despesas);
  renderProvisao(despesas);
  populateCatSelects();
  renderCatTab();
  renderSaldoBanco();
  _renderSparkline(all);
} // end _renderAll

function _renderSparkline(lancamentos) {
  const canvas = document.getElementById('sparklineCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || canvas.parentElement.offsetWidth || 200;
  const H = 52;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  // Agrupa receitas e despesas por dia do mês filtrado
  const rng = window._rangeFilter || { de: { mes: new Date().getMonth()+1, ano: new Date().getFullYear() }, ate: { mes: new Date().getMonth()+1, ano: new Date().getFullYear() } };
  const mes = rng.ate.mes, ano = rng.ate.ano;
  const daysInMonth = new Date(ano, mes, 0).getDate();
  const saldoDia = new Array(daysInMonth).fill(0);

  lancamentos.forEach(l => {
    if (!l.data) return;
    const [y, m, d] = l.data.split('-').map(Number);
    if (y !== ano || m !== mes) return;
    const idx = d - 1;
    if (idx < 0 || idx >= daysInMonth) return;
    saldoDia[idx] += l.tipo === 'receita' ? _valorExib(l) : -_valorExib(l);
  });

  // Cumulative saldo
  const cumulative = [];
  let running = 0;
  saldoDia.forEach(v => { running += v; cumulative.push(running); });

  const minV = Math.min(0, ...cumulative);
  const maxV = Math.max(...cumulative, 1);
  const range = maxV - minV || 1;
  const pad = 8;
  const toX = (i) => pad + (i / (cumulative.length - 1 || 1)) * (W - pad * 2);
  const toY = (v) => H - pad - ((v - minV) / range) * (H - pad * 2);

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,255,136,0.18)');
  grad.addColorStop(1, 'rgba(0,255,136,0)');

  ctx.beginPath();
  cumulative.forEach((v, i) => {
    const x = toX(i), y = toY(v);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(toX(cumulative.length - 1), H);
  ctx.lineTo(toX(0), H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  cumulative.forEach((v, i) => {
    const x = toX(i), y = toY(v);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#00FF88';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,255,136,0.5)';
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function renderTable(tbodyId, items) {
  const isMobile = window.matchMedia("(max-width:768px)").matches;
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return; // elemento removido do DOM
  const cats = loadCats();

  // Helper: ensure card container exists
  function getCardContainer() {
    let c = document.getElementById(tbodyId + '-cards');
    if (!c) {
      c = document.createElement('div');
      c.id = tbodyId + '-cards';
      tbody.closest('table').parentNode.appendChild(c);
    }
    return c;
  }

  if (!items.length) {
    if (isMobile) {
      tbody.closest('table').style.display = 'none';
      const c = getCardContainer();
      c.style.display = 'block';
      c.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.85rem;">Nenhum lançamento neste período.</div>';
    } else {
      tbody.innerHTML = '<tr><td colspan="14" class="empty-state">Nenhum lançamento neste período.</td></tr>';
    }
    return;
  }

  if (isMobile) {
    tbody.closest('table').style.display = 'none';
    const container = getCardContainer();
    container.style.display = 'block';
    container.innerHTML = items.map(l => {
      const cat = cats.find(c => c.nome === l.categoria);
      const dot = cat ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${cat.cor};margin-right:5px;flex-shrink:0"></span>` : '';
      const recorrBadge = l.recorr === 'parcelado'
        ? `<span class="badge badge-parcelado">⊞ Parcelado</span>`
        : l.recorr === 'fixo'
        ? `<span class="badge badge-fixo">↻ Fixo</span>` : '';
      const sid = String(l.id).replace(/'/g, "\\'");
      const sgrp = l.groupId ? String(l.groupId).replace(/'/g, "\\'") : null;

      const _vExib = _valorExib(l);
      const valClass = l.tipo === 'receita' ? 'val-pos' : _vExib < 0 ? 'val-pos' : 'val-neg';
      const valSign = l.tipo === 'receita' ? '+' : _vExib < 0 ? '+' : '-';
      const borderColor = l.tipo === 'receita' ? 'var(--green)' : 'var(--red)';
      return `<div data-id="${sid}" style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${borderColor};border-radius:10px;padding:12px 14px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="display:flex;flex-direction:column;gap:1px">
            <span style="font-family:'Space Mono',monospace;font-size:0.72rem;color:var(--text2)">${formatDate(l.data)}</span>
            ${l._ts ? `<span style="font-family:'Space Mono',monospace;font-size:0.6rem;color:var(--muted)" title="Data/hora de entrada">⏱ ${new Date(l._ts).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} ${new Date(l._ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>` : ''}
          </div>
          <span class="${valClass}" style="font-family:'Space Mono',monospace;font-size:1rem;font-weight:700;">${valSign}${fmt(_vExib)}</span>
        </div>
        <div style="font-weight:700;font-size:0.9rem;margin-bottom:6px;">${(l.desc||"").replace(/\s*\(\d+\/\d+\)\s*$/, "")}${l.parcAtual ? '<span style="background:rgba(240,144,64,0.85);color:#000;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-left:6px">'+ l.parcAtual+'/'+l.parcTotal+'</span>' : ''}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          ${dot}<span style="font-size:0.75rem;color:var(--text2)">${l.categoria||'—'}${l.subCategoria ? ' › '+l.subCategoria : ''}</span>
          ${l.pagamento ? (() => { const _pc=loadPagamentos().find(p=>p.nome===l.pagamento); const _pl=_pc?((_pc.logo||_logoFromName(_pc.nome))):null; return `<span style="background:var(--surface2);border:1px solid var(--border);padding:2px 8px;border-radius:10px;font-size:0.7rem;color:var(--text2);display:inline-flex;align-items:center;gap:4px">${_logoTag(_pl,_pc?.icone||'',13)} ${l.pagamento}</span>`; })() : ''}
          ${l.banco ? (() => { const _b=loadBancos().find(b=>b.id===l.banco); if(!_b) return ''; const _bl=_getBancoLogo(_b); return `<span style="background:${_b.cor}18;border:1px solid ${_b.cor}44;color:${_b.cor};padding:2px 8px;border-radius:10px;font-size:0.7rem;display:inline-flex;align-items:center;gap:4px">${_logoTag(_bl,_b.icone||'🏦',13)} ${_b.nome}</span>`; })() : ''}
          ${l.terceiro ? `<span style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;padding:2px 8px;border-radius:10px;font-size:0.7rem;">${l.terceiro}</span>` : ''}
          ${recorrBadge}
          ${l.vencimento ? `<span style="font-size:0.7rem;color:var(--accent2)">Venc: ${l.vencimento}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
          <span class="badge badge-${l.status}">${l.status === 'pago' ? '✓ Pago' : '⏳ Pendente'}</span>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            ${l.status === 'pendente'
              ? `<button onclick="toggleStatusLanc('${sid}','pago')" style="background:rgba(48,208,128,0.15);border:1px solid rgba(48,208,128,0.4);color:var(--green);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✓ Pagar</button>`
              : `<button onclick="toggleStatusLanc('${sid}','pendente')" style="background:rgba(240,80,96,0.15);border:1px solid rgba(240,80,96,0.4);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">↩</button>`
            }
            <button onclick="editLancamento('${sid}')" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.30);color:var(--accent2);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✎ Editar</button>
            <button onclick="smartDelete('${sid}',${sgrp ? `'${sgrp}'` : 'null'},event)" style="background:rgba(240,80,96,0.12);border:1px solid rgba(240,80,96,0.3);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✕</button>
          </div>
        </div>
      </div>`;
    }).join('');
    return;
  }

  // Desktop: tabela normal
  tbody.closest('table').style.display = '';
  const cardContainer = document.getElementById(tbodyId + '-cards');
  if (cardContainer) cardContainer.style.display = 'none';

  tbody.innerHTML = items.map(l => {
    const cat = cats.find(c => c.nome === l.categoria);
    const dot = cat ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cat.cor};margin-right:5px;vertical-align:middle"></span>` : '';
    const subLabel = l.subCategoria ? `<span style="font-size:0.65rem;color:var(--muted);margin-left:4px">› ${l.subCategoria}</span>` : '';
    const recorrBadge = l.recorr === 'parcelado'
      ? `<span class="badge badge-parcelado">⊞ Parcelado</span>`
      : l.recorr === 'fixo'
      ? `<span class="badge badge-fixo">↻ Fixo</span>` : '';
    const sid = String(l.id).replace(/'/g, "\\'");
    const sgrp = l.groupId ? String(l.groupId).replace(/'/g, "\\'") : null;

    const tercLabel = l.terceiro
      ? `<span style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;padding:1px 7px;border-radius:10px;font-size:0.7rem;white-space:nowrap">${l.terceiro}</span>`
      : `<span style="color:var(--muted)">—</span>`;
    const bancos = loadBancos();
    const bancoObj = l.banco ? bancos.find(b => b.id === l.banco) : null;
    const bancoLogo = bancoObj ? _getBancoLogo(bancoObj) : null;
    const bancoLabel = bancoObj
      ? `<span style="background:${bancoObj.cor}18;border:1px solid ${bancoObj.cor}44;color:${bancoObj.cor};padding:1px 7px;border-radius:10px;font-size:0.7rem;white-space:nowrap;display:inline-flex;align-items:center;gap:4px">${_logoTag(bancoLogo, bancoObj.icone||'🏦', 14)} ${bancoObj.nome}</span>`
      : `<span style="color:var(--muted)">—</span>`;

    // Logo do pagamento
    const pagConf = l.pagamento ? loadPagamentos().find(p => p.nome === l.pagamento) : null;
    const pagLogoUrl = pagConf ? (pagConf.logo || _logoFromName(pagConf.nome)) : null;
    const pagLabel = l.pagamento
      ? `<span style="background:var(--surface2);border:1px solid var(--border);padding:2px 7px;border-radius:10px;white-space:nowrap;font-size:0.7rem;display:inline-flex;align-items:center;gap:4px">${_logoTag(pagLogoUrl, pagConf?.icone||'', 14)} ${l.pagamento}</span>`
      : '—';
    const sgrpArg = sgrp ? `'${sgrp}'` : 'null';
    return `<tr data-id="${sid}">
      <td style="padding:4px 6px;text-align:center;white-space:nowrap">
        <button class="row-menu-btn" onclick="_openRowMenu('${sid}',${sgrpArg},'${l.status}',this)" title="Ações" style="background:none;border:none;color:var(--muted);font-size:1.1rem;line-height:1;cursor:pointer;padding:2px 5px;border-radius:5px;transition:color 0.15s,background 0.15s" onmouseenter="this.style.color='var(--text)';this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.color='var(--muted)';this.style.background='none'">⋯</button>
        <input type="checkbox" class="row-check" data-id="${sid}" onchange="onRowCheck()" style="cursor:pointer;accent-color:var(--text2)">
      </td>
      <td style="font-family:'Space Mono',monospace;font-size:0.75rem;color:var(--accent2)">${l.vencimento || '—'}</td>
      <td style="font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/, '')}</td>
      <td style="text-align:center">${l.parcAtual ? '<span style="background:rgba(240,144,64,0.85);color:#000;padding:1px 7px;border-radius:4px;font-size:0.72rem;font-weight:700">'+l.parcAtual+'/'+l.parcTotal+'</span>' : '<span style="color:var(--muted)">—</span>'}</td>
      <td>${dot}<span style="font-size:0.75rem;color:var(--text2)">${l.categoria||'—'}</span></td>
      <td style="font-size:0.72rem;color:var(--muted)">${l.subCategoria||'—'}</td>
      <td><span class="badge badge-${l.status}">${l.status === 'pago' ? '✓ Pago' : '⏳ Pendente'}</span></td>
      <td style="text-align:right">${(()=>{ const v=_valorExib(l); const cls=l.tipo==='receita'?'val-pos':v<0?'val-pos':'val-neg'; const s=l.tipo==='receita'?'+':v<0?'+':'-'; return `<span class="${cls}">${s}${fmt(v)}</span>`; })()}</td>
      <td style="font-family:'Space Mono',monospace;font-size:0.7rem;color:var(--muted);white-space:nowrap" title="${l._ts ? new Date(l._ts).toLocaleString('pt-BR') : '—'}">${l._ts ? (()=>{ const d=new Date(l._ts); return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' <span style="opacity:0.6">'+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</span>'; })() : '<span style="color:var(--muted)">—</span>'}</td>
      <td style="font-family:'Space Mono',monospace;font-size:0.75rem;color:var(--text2)">${formatDate(l.data)}</td>
      <td style="font-size:0.73rem;color:var(--text2)">${pagLabel}</td>
      <td>${tercLabel}</td>
      <td>${bancoLabel}</td>
      <td><span class="badge badge-${l.tipo}">${l.tipo === 'receita' ? '↑ Receita' : '↓ Despesa'}</span> ${recorrBadge}</td>
    </tr>`;
  }).join('');
  updateBulkBar();
}

// Re-renderiza a aba atualmente visível após uma mudança de dados.
// toggleStatusLanc é disparado de várias abas (Lançamentos, Vencimentos,
// Terceiros, Parcelados, Dashboard, A Pagar/A Receber). Antes só chamava
// renderAllTable() — que atualiza apenas a tabela principal de Lançamentos —
// então o botão "parecia não funcionar" nas outras abas: o status mudava no
// cache/banco mas a view visível não refletia.
function _rerenderActiveView() {
  // renderAll() cobre dashboard, cards de banco, provisão E a tabela principal.
  if (typeof renderAll === 'function') { try { renderAll(); } catch (e) { console.error('[_rerenderActiveView] renderAll', e); } }
  var active = document.querySelector('.tab-content.active');
  var tab = active ? active.id.replace('tab-', '') : '';
  var extraFn = {
    terceiros:   'renderTerceirosTab',
    parcelados:  'renderParceladosTab',
    vencimentos: 'renderVencimentosTab',
    cartoes:     'renderCartoesTab',
    areceber:    'renderAReceberTab',
    apagar:      'renderAPagarTab'
  }[tab];
  if (extraFn && typeof window[extraFn] === 'function') {
    try { window[extraFn](); } catch (e) { console.error('[_rerenderActiveView] ' + extraFn, e); }
  }
}

function toggleStatusLanc(id, novoStatus) {
  // Atualização otimista: reflete na UI imediatamente, persiste no banco em paralelo.
  // Não chama carregarApp() — um reload completo por clique de status é excessivo
  // e cria janela de cache vazio que quebra ordenações concurrent.
  _memCache.lancamentos = (_memCache.lancamentos || []).map(
    function(l) { return String(l.id) === String(id) ? Object.assign({}, l, { status: novoStatus }) : l; }
  );
  _rerenderActiveView();
  dbUpdateLancamento(id, { status: novoStatus }).catch(function(e) {
    console.error('[toggleStatusLanc] falha no banco, revertendo:', e.message);
    // Reverte cache e re-renderiza se persistência falhou
    _memCache.lancamentos = (_memCache.lancamentos || []).map(
      function(l) { return String(l.id) === String(id) ? Object.assign({}, l, { status: novoStatus === 'pago' ? 'pendente' : 'pago' }) : l; }
    );
    _rerenderActiveView();
  });
}

function editLancamento(id) { openModal(id); }

// ── Row context menu (⋯) ──────────────────────────────────────────────────────
(function() {
  var _menuEl = null;
  var _outsideHandler = null;

  function _getMenu() {
    if (_menuEl) return _menuEl;
    _menuEl = document.createElement('div');
    _menuEl.id = 'rowCtxMenu';
    _menuEl.style.cssText = 'display:none;position:fixed;z-index:9999;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:4px 0;box-shadow:0 6px 24px rgba(0,0,0,0.5);min-width:170px;font-size:0.82rem';
    document.body.appendChild(_menuEl);
    return _menuEl;
  }

  function _menuItem(icon, label, color, onclick) {
    return `<button onclick="${onclick};_closeRowMenu()" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;color:${color||'var(--text)'};padding:9px 16px;cursor:pointer;text-align:left;font-size:0.82rem;transition:background 0.12s" onmouseenter="this.style.background='rgba(255,255,255,0.07)'" onmouseleave="this.style.background='none'"><span style="font-size:1rem;width:16px;text-align:center">${icon}</span>${label}</button>`;
  }

  window._openRowMenu = function(id, grp, status, btn) {
    _closeRowMenu();
    var menu = _getMenu();
    var grpArg = grp && grp !== 'null' ? `'${grp}'` : 'null';
    var statusToggle = status === 'pendente'
      ? _menuItem('✓', 'Marcar como pago',        'var(--green)',  `toggleStatusLanc('${id}','pago');_closeRowMenu()`)
      : _menuItem('↩', 'Estornar para pendente',  'var(--danger)', `toggleStatusLanc('${id}','pendente');_closeRowMenu()`);
    menu.innerHTML =
      statusToggle +
      '<div style="height:1px;background:var(--border);margin:3px 0"></div>' +
      _menuItem('✎', 'Editar',   'var(--accent2)', `editLancamento('${id}')`) +
      _menuItem('⧉', 'Copiar',   '#60a5fa',        `copiarLancamento('${id}')`) +
      '<div style="height:1px;background:var(--border);margin:3px 0"></div>' +
      _menuItem('✕', 'Excluir',  'var(--danger)',   `smartDelete('${id}',${grpArg},event)`);
    // Position
    var r = btn.getBoundingClientRect();
    var mw = 170, mh = 180;
    var top = r.bottom + 4;
    var left = r.left;
    if (top + mh > window.innerHeight) top = r.top - mh - 4;
    if (left + mw > window.innerWidth)  left = window.innerWidth - mw - 8;
    menu.style.top  = top  + 'px';
    menu.style.left = left + 'px';
    menu.style.display = 'block';
    // Close on outside click
    _outsideHandler = function(e) {
      if (!menu.contains(e.target) && e.target !== btn) _closeRowMenu();
    };
    setTimeout(function() { document.addEventListener('click', _outsideHandler); }, 0);
  };

  window._closeRowMenu = function() {
    if (_menuEl) _menuEl.style.display = 'none';
    if (_outsideHandler) {
      document.removeEventListener('click', _outsideHandler);
      _outsideHandler = null;
    }
  };
})();
// ─────────────────────────────────────────────────────────────────────────────

function duplicarDoModal() {
  // editId é a variável global do modal
  if (typeof editId === 'undefined' || editId === null) return;
  closeModal();
  setTimeout(() => copiarLancamento(editId), 100);
}

function copiarLancamento(id) {
  const data = loadData();
  const orig = data.find(l => String(l.id) === String(id));
  if (!orig) return;
  // Guarda o original para pré-preencher o modal SEM salvar ainda
  // O save só acontece quando o usuário clicar em "Salvar" no modal
  window._copiaOrigem = orig;
  // Abre modal como novo lançamento (editId = null)
  openModalComCopia(orig);
}

function openModalComCopia(orig) {
  // Abre modal de novo lançamento pré-preenchido com dados do original
  // Sem salvar nada ainda
  if (typeof openModal === 'function') {
    // Usa editId = null para criar novo
    openModal(null, orig);
  }
}

// Botão ✕ inteligente: abre modal se parcelado/fixo, deleta direto se avulso
// Modal de confirmação para exclusão em massa
function _showBulkDeleteConfirm(count, pagResumo, callback) {
  var modal = document.getElementById('bulkDeleteConfirmModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'bulkDeleteConfirmModal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.78);backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-top:2px solid var(--red);border-radius:14px;padding:24px;width:100%;max-width:420px;">' +
      '<h3 style="margin:0 0 12px;color:var(--red)">🗑 Confirmar Exclusão em Massa</h3>' +
      '<div id="bulkDeleteConfirmBody" style="font-size:0.82rem;color:var(--text2);margin-bottom:16px;line-height:1.6"></div>' +
      '<p style="font-size:0.78rem;color:var(--red);font-weight:700;margin:0 0 16px">⚠️ Esta ação NÃO pode ser desfeita.</p>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="bulkDeleteConfirmCancel" style="flex:1;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:0.85rem;cursor:pointer">Cancelar</button>' +
        '<button id="bulkDeleteConfirmOk" style="flex:2;padding:9px;border-radius:8px;border:none;background:var(--red);color:#fff;font-size:0.85rem;font-weight:700;cursor:pointer">✕ Confirmar Exclusão</button>' +
      '</div></div>';
    document.body.appendChild(modal);
  }
  var lines = pagResumo.split('\n').map(function(l){ return '<div>' + l.replace('  •', '•') + '</div>'; }).join('');
  document.getElementById('bulkDeleteConfirmBody').innerHTML =
    '<strong>Você está prestes a excluir ' + count + ' lançamento(s):</strong>' +
    '<div style="margin:8px 0;padding:8px;background:var(--surface2);border-radius:6px">' + lines + '</div>';
  modal.style.display = 'flex';
  document.getElementById('bulkDeleteConfirmOk').onclick = function() {
    modal.style.display = 'none';
    callback(true);
  };
  document.getElementById('bulkDeleteConfirmCancel').onclick = function() {
    modal.style.display = 'none';
    callback(false);
  };
}

// Extrai lógica de delete do banco para reuso
async function _bulkDeleteFromDB(ids) {
  try {
    const _token = await _getValidToken();
    const _uid = _currentUser.id;
    for (var _i = 0; _i < ids.length; _i += 100) {
      const _lote = ids.slice(_i, _i + 100);
      const _filtro = _lote.map(function(id) { return '"' + id + '"'; }).join(',');
      await fetch(SB_URL + '/rest/v1/mf_lancamentos?user_id=eq.' + _uid + '&id=in.(' + _filtro + ')', {
        method: 'DELETE',
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + _token, 'Prefer': 'return=minimal' }
      });
    }
  } catch(e) { console.warn('[bulkDelete] erro banco:', e.message); }
}

// Modal de confirmação simples (substitui confirm nativo)
// Retorna Promise<boolean>
function _showSimpleConfirm(title, msg, btnLabel, btnColor) {
  return new Promise(function(resolve) {
    var modal = document.getElementById('_simpleConfirmModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = '_simpleConfirmModal';
      modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10060;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:16px;';
      modal.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:380px;">' +
        '<h3 id="_scTitle" style="margin:0 0 12px;font-size:1rem;color:var(--text)"></h3>' +
        '<p id="_scMsg" style="font-size:0.85rem;color:var(--text2);margin:0 0 20px;white-space:pre-line"></p>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="_scCancel" style="flex:1;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:0.85rem;cursor:pointer">Cancelar</button>' +
          '<button id="_scOk" style="flex:2;padding:9px;border-radius:8px;border:none;color:#fff;font-size:0.85rem;font-weight:700;cursor:pointer"></button>' +
        '</div></div>';
      document.body.appendChild(modal);
    }
    document.getElementById('_scTitle').textContent = title;
    document.getElementById('_scMsg').textContent = msg;
    var okBtn = document.getElementById('_scOk');
    okBtn.textContent = btnLabel || 'Confirmar';
    okBtn.style.background = btnColor || 'var(--accent)';
    modal.style.zIndex = '10060'; // sempre acima dos overlays (conferência/split)
    modal.style.display = 'flex';
    okBtn.onclick = function() { modal.style.display = 'none'; resolve(true); };
    document.getElementById('_scCancel').onclick = function() { modal.style.display = 'none'; resolve(false); };
  });
}

function smartDelete(idOrBtn, groupId, e, recorrHint) {
  // Suporta dois modos:
  // 1) smartDelete(btn) — botão com data-sid/data-gid (aba Terceiros)
  // 2) smartDelete(id, groupId, event, recorrHint) — inline (aba Lançamentos)
  var id, gid;
  if (typeof idOrBtn === 'object' && idOrBtn.getAttribute) {
    id  = idOrBtn.getAttribute('data-sid');
    gid = idOrBtn.getAttribute('data-gid') || null;
    e   = groupId; // segundo arg é o evento neste caso
  } else {
    id  = idOrBtn;
    gid = groupId || null;
  }

  // Se gid não veio, busca no cache síncrono OU usa recorrHint passado pelo template
  if (!gid) {
    var _recorr = recorrHint || '';
    // Primeiro tenta cache
    var _allData = (typeof loadData === 'function') ? loadData() : [];
    var _cached = Array.isArray(_allData) ? _allData.find(function(l) { return String(l.id) === String(id); }) : null;
    if (_cached) {
      if (_cached.groupId) {
        gid = String(_cached.groupId);
      } else {
        _recorr = _cached.recorr || _cached.tipoLanc || _recorr;
      }
    }
    // Se ainda sem gid mas é parcelado/fixo, usa id como gid (fallback)
    if (!gid && (_recorr === 'parcelado' || _recorr === 'fixo')) {
      gid = String(id);
    }
  }

  if (gid) {
    deleteGroup(gid, id, e);
  } else {
    deleteLancamento(id);
  }
}

var _deletingLancIds = new Set();

async function deleteLancamento(id) {
  if (_deletingLancIds.has(String(id))) return;
  if (!await _showSimpleConfirm('🗑 Excluir', 'Excluir este lançamento?', 'Excluir', 'var(--red)')) return;
  _deletingLancIds.add(String(id));
  try {
    _addTombstone(id);
    await dbDeleteLancamento(id);
    await carregarApp();
  } catch(e) {
    console.error('[deleteLancamento]', e.message);
    alert('Erro ao excluir. Tente novamente.');
  } finally {
    _deletingLancIds.delete(String(id));
  }
}

function deleteGroup(groupId, itemId, e) {
  if (e) e.stopPropagation();
  const allData = loadData();
  const item = allData.find(function(l) { return String(l.id) === String(itemId); })
             || allData.find(function(l) { return String(l.groupId) === String(groupId); });
  const isFixo = item && (item.recorr === 'fixo' || item.tipoLanc === 'fixo');
  const isParcelado = item && (item.recorr === 'parcelado' || item.tipoLanc === 'parcelado');

  if (isFixo) {
    const fixoGroups = {};
    fixoGroups[String(groupId)] = String(item.id);
    openDeleteParcelasModal({}, fixoGroups).then(function(result) {
      if (!result) return;
      const r = result[String(groupId)];
      if (!r) return;
      const allNow = loadData();
      const groupItems = allNow.filter(function(l) { return String(l.groupId) === String(groupId); });
      let toDelete;
      if (r.mode === 'all') {
        toDelete = new Set(groupItems.map(function(l) { return String(l.id); }));
      } else if (r.mode === 'forward') {
        const selMes = item.mes, selAno = item.ano;
        toDelete = new Set(groupItems
          .filter(function(l) { return l.ano > selAno || (l.ano === selAno && l.mes >= selMes); })
          .map(function(l) { return String(l.id); }));
      } else {
        toDelete = new Set([String(item.id)]);
      }
      toDelete.forEach(function(tid) { _addTombstone(tid); });
      saveData(allNow.filter(function(l) { return !toDelete.has(String(l.id)); }));
      // Deleta do banco em lote
      (async function() {
        try {
          const _token = await _getValidToken();
          const _uid = _currentUser.id;
          const _ids = Array.from(toDelete);
          for (var _i = 0; _i < _ids.length; _i += 100) {
            const _lote = _ids.slice(_i, _i + 100);
            const _filtro = _lote.map(function(id) { return '"' + id + '"'; }).join(',');
            await fetch(SB_URL + '/rest/v1/mf_lancamentos?user_id=eq.' + _uid + '&id=in.(' + _filtro + ')', {
              method: 'DELETE',
              headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + _token, 'Prefer': 'return=minimal' }
            });
          }
        } catch(e) { console.warn('[deleteGroup] erro banco:', e.message); }
      })();
      carregarApp();
    });
  } else if (isParcelado) {
    const parcelGroups = {};
    parcelGroups[String(groupId)] = String(item.id);
    openDeleteParcelasModal(parcelGroups, {}).then(function(result) {
      if (!result) return;
      const r = result[String(groupId)];
      if (!r) return;
      const allNow = loadData();
      const groupItems2 = allNow.filter(function(l) { return String(l.groupId) === String(groupId); });
      const selMes = item.mes, selAno = item.ano;
      let toDelete2;
      if (r.mode === 'all') {
        toDelete2 = new Set(groupItems2.map(function(l) { return String(l.id); }));
      } else if (r.mode === 'forward') {
        toDelete2 = new Set(groupItems2.filter(function(l) { return l.ano > selAno || (l.ano === selAno && l.mes >= selMes); }).map(function(l) { return String(l.id); }));
      } else {
        toDelete2 = new Set([String(item.id)]);
      }
      toDelete2.forEach(function(tid) { _addTombstone(tid); });
      saveData(allNow.filter(function(l) { return !toDelete2.has(String(l.id)); }));
      (async function() {
        try {
          const _token = await _getValidToken();
          const _uid = _currentUser.id;
          const _ids = Array.from(toDelete2);
          for (var _i = 0; _i < _ids.length; _i += 100) {
            const _lote = _ids.slice(_i, _i + 100);
            const _filtro = _lote.map(function(id) { return '"' + id + '"'; }).join(',');
            await fetch(SB_URL + '/rest/v1/mf_lancamentos?user_id=eq.' + _uid + '&id=in.(' + _filtro + ')', {
              method: 'DELETE',
              headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + _token, 'Prefer': 'return=minimal' }
            });
          }
        } catch(e) { console.warn('[deleteGroup] erro banco:', e.message); }
      })();
      carregarApp();
    });
  } else {
    const groupItems = allData.filter(function(l) { return String(l.groupId) === String(groupId); });
    const count = groupItems.length;
    const isTransf = String(groupId).startsWith('transf_');
    const titulo = isTransf ? '↔ Excluir transferência' : '🗑 Excluir grupo';
    const msg    = isTransf
      ? 'Excluir esta transferência? Vão sair a saída do banco origem e a entrada do destino.'
      : 'Excluir TODOS os ' + count + ' lançamentos deste grupo?';
    // Usa _showSimpleConfirm em vez de confirm() nativo — confirm() pode travar no mobile
    _showSimpleConfirm(titulo, msg, 'Excluir', 'var(--red)').then(function(ok) {
      if (!ok) return;
      groupItems.forEach(function(l) { _addTombstone(String(l.id)); });
      const _remainingData = allData.filter(function(l) { return String(l.groupId) !== String(groupId); });
      saveData(_remainingData);
      // Deleta do banco em lote
      (async function() {
        try {
          const _token = await _getValidToken();
          const _uid = _currentUser.id;
          const _ids = groupItems.map(function(l) { return String(l.id); });
          for (var _i = 0; _i < _ids.length; _i += 100) {
            const _lote = _ids.slice(_i, _i + 100);
            const _filtro = _lote.map(function(id) { return '"' + id + '"'; }).join(',');
            await fetch(SB_URL + '/rest/v1/mf_lancamentos?user_id=eq.' + _uid + '&id=in.(' + _filtro + ')', {
              method: 'DELETE',
              headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + _token, 'Prefer': 'return=minimal' }
            });
          }
        } catch(e) { console.warn('[deleteGroup] erro banco:', e.message); }
      })();
      carregarApp();
    });
  }
}

function onRowCheck() {
  updateBulkBar();
  const all = document.querySelectorAll('.row-check');
  const chk = document.querySelectorAll('.row-check:checked');
  const cb  = document.getElementById('checkAll');
  if (!cb) return;
  cb.indeterminate = chk.length > 0 && chk.length < all.length;
  cb.checked = all.length > 0 && chk.length === all.length;
}

function toggleCheckAll(checked) {
  document.querySelectorAll('.row-check').forEach(cb => cb.checked = checked);
  updateBulkBar();
}

function getCheckedIds() {
  return Array.from(document.querySelectorAll('.row-check:checked')).map(cb => cb.dataset.id);
}

function updateBulkBar() {
  const ids = getCheckedIds();
  const bar = document.getElementById('bulkBar');
  if (!bar) return;
  // Populate category select
  const bCat = document.getElementById('bulkCategoria');
  if (bCat) {
    const prev = bCat.value;
    bCat.innerHTML = '<option value="">— Alterar categoria —</option>';
    loadCats().forEach(function(cat) {
      const o = document.createElement('option');
      o.value = cat.nome; o.textContent = cat.icone + ' ' + cat.nome;
      bCat.appendChild(o);
    });
    bCat.value = prev;
  }
  // Searchable single-selects da barra em massa (idempotente: build = refresh).
  // Constrói TODOS os wrappers ANTES de onBulkCatChange — ele repopula a
  // sub-categoria e depende do wrapper já existir para re-sincronizar.
  if (window.SSEL) { SSEL.build('bulkStatus'); SSEL.build('bulkCategoria'); SSEL.build('bulkSubCategoria'); SSEL.build('bulkBanco'); }
  onBulkCatChange();
  // bulkBanco updated via populateBancoSelects()
  if (ids.length > 0) {
    bar.style.display = 'flex';
    document.getElementById('bulkCount').textContent = ids.length + ' selecionado' + (ids.length > 1 ? 's' : '');
  } else {
    bar.style.display = 'none';
    const bs = document.getElementById('bulkStatus');
    if (bs) bs.value = '';
    if (bCat) bCat.value = '';
    const bSub = document.getElementById('bulkSubCategoria');
    if (bSub) { bSub.innerHTML = '<option value="">— Alterar sub-categoria —</option>'; bSub.value = ''; }
    const bBanco2 = document.getElementById('bulkBanco');
    if (bBanco2) bBanco2.value = '';
  }
}

function onBulkCatChange() {
  const bCat = document.getElementById('bulkCategoria');
  const bSub = document.getElementById('bulkSubCategoria');
  if (!bSub) return;
  const catNome = bCat ? bCat.value : '';
  const cats = loadCats();
  const cat = cats.find(function(c) { return c.nome === catNome; });
  bSub.innerHTML = '<option value="">— Alterar sub-categoria —</option>';
  const hasSubs = !!(cat && cat.subs && cat.subs.length);
  if (hasSubs) {
    cat.subs.forEach(function(s) {
      const sNome = typeof s === 'string' ? s : s.nome;
      const o = document.createElement('option');
      o.value = sNome; o.textContent = sNome;
      bSub.appendChild(o);
    });
  }
  // mostra o seletor de sub-cat quando não há categoria escolhida ou ela tem subs;
  // esconde quando a categoria escolhida não possui sub-categorias.
  const showSub = hasSubs || !catNome;
  // Sob o SSEL o <select> nativo fica oculto e quem aparece é o wrapper.
  const subWrap = document.getElementById('ssel-bulkSubCategoria');
  if (subWrap) {
    subWrap.style.display = showSub ? '' : 'none';
    if (window.SSEL) SSEL.refresh('bulkSubCategoria');
  } else {
    bSub.style.display = showSub ? '' : 'none';
  }
}

function bulkSelectAll() {
  document.querySelectorAll('.row-check').forEach(cb => cb.checked = true);
  const cb = document.getElementById('checkAll');
  if (cb) { cb.checked = true; cb.indeterminate = false; }
  updateBulkBar();
}

function bulkClear() {
  document.querySelectorAll('.row-check').forEach(cb => cb.checked = false);
  const cb = document.getElementById('checkAll');
  if (cb) { cb.checked = false; cb.indeterminate = false; }
  updateBulkBar();
}

function bulkApply() {
  const ids = getCheckedIds();
  if (!ids.length) return;
  const newStatus = document.getElementById('bulkStatus').value;
  const newCat    = document.getElementById('bulkCategoria').value;
  const newSub    = document.getElementById('bulkSubCategoria').value;
  const newBanco  = document.getElementById('bulkBanco')?.value || '';
  if (!newStatus && !newCat && !newSub && !newBanco) { alert('Selecione uma alteração (status, categoria, sub-categoria ou banco).'); return; }
  const changes = [];
  if (newStatus) changes.push('status → ' + (newStatus === 'pago' ? '✓ Pago' : '⏳ Pendente'));
  if (newCat)    changes.push('categoria → ' + newCat);
  if (newSub)    changes.push('sub-categoria → ' + newSub);
  if (newBanco)  { const b = loadBancos().find(x=>x.id===newBanco); changes.push('banco → ' + (b?(b.icone||'🏦')+' '+b.nome:newBanco)); }
  if (!confirm('Aplicar em ' + ids.length + ' lançamento(s):\n' + changes.join('\n') + '?')) return;

  // Persiste cada alteração via dbUpdateLancamento (UPDATE real no Supabase).
  // NÃO usar saveData(): ele só persiste inserts/deletes — alterações de campo
  // (status, categoria, banco) ficavam só no cache em memória e sumiam no reload.
  const idSet = new Set(ids.map(String));
  const patches = {}; // id -> patch aplicado
  _memCache.lancamentos = (_memCache.lancamentos || []).map(function(l) {
    if (!idSet.has(String(l.id))) return l;
    const patch = Object.assign({},
      newStatus ? { status: newStatus } : {},
      newCat    ? { categoria: newCat, subCategoria: newSub || l.subCategoria } : {},
      (!newCat && newSub) ? { subCategoria: newSub } : {},
      newBanco  ? { banco: newBanco } : {}
    );
    patches[String(l.id)] = patch;
    return Object.assign({}, l, patch);
  });
  Object.keys(patches).forEach(function(id) {
    dbUpdateLancamento(id, patches[id]).catch(function(e) {
      console.error('[bulkApply] falha ao persistir', id, e.message);
    });
  });
  bulkClear();
  safeRender(() => renderAll());
}

// ── Modal exclusão de parcelas (único para todos os grupos) ─────────────────
var _deleteParcelasResolve = null;

// FIX: fecha overlay de exclusão que possa ter ficado preso
function closeDeleteParcelasOverlay() {
  document.getElementById('deleteParcelasOverlay').classList.remove('open');
  if (window._deleteParcelasResolve) { window._deleteParcelasResolve(null); window._deleteParcelasResolve = null; }
}

function openDeleteParcelasModal(parcelGroups, fixoGroups) {
  // parcelGroups = { groupId: selectedId, ... }  (parcelado)
  // fixoGroups   = { groupId: selectedId, ... }  (fixo)
  return new Promise(function(resolve) {
    _deleteParcelasResolve = resolve;
    const allData = loadDataBanco();
    const allGroups = Object.assign({}, parcelGroups, fixoGroups);
    const groupIds = Object.keys(allGroups);

    const list = document.getElementById('deleteParcelasList');
    list.innerHTML = groupIds.map(function(gid) {
      const selectedId = allGroups[gid];
      const isFixo = !!fixoGroups[gid];
      const l = allData.find(function(x) { return String(x.id) === String(selectedId); });
      if (!l) return '';
      const groupItems = allData.filter(function(x) { return String(x.groupId) === String(gid); });
      const total = groupItems.length;
      // For fixo: count future (>= selected mes/ano) vs past
      const selMes = l.mes, selAno = l.ano;
      const futureCount = groupItems.filter(function(x) { return x.ano > selAno || (x.ano === selAno && x.mes >= selMes); }).length;
      const pastCount = total - futureCount;

      const venc = l.vencimento || formatDate(l.data);
      const baseName = (l.desc||'').replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
      const parcLabel = isFixo
        ? (l.mes + '/' + l.ano)
        : (l.parcAtual ? l.parcAtual + '/' + (l.parcTotal || l.totalParcelas || '?') : (() => { const pm = (l.desc||'').match(/\((\d+)\/(\d+)\)$/); return pm ? pm[1]+'/'+pm[2] : '?'; })());

      const radioName = 'delmode_' + gid;
      const defaultMode = 'forward';

      return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
          '<span style="font-size:0.85rem;font-weight:700;flex:1">' + baseName + '</span>' +
          '<span style="font-size:0.72rem;color:var(--muted);background:var(--surface);border:1px solid var(--border);padding:2px 7px;border-radius:5px">' +
            (isFixo ? '↻ Fixo' : '⊞ Parcelado') + ' · ' + parcLabel + ' · ' + venc +
          '</span>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px">' +
          '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 10px;border-radius:6px;background:var(--surface);border:1px solid var(--border)">' +
            '<input type="radio" class="del-grp-radio" name="' + radioName + '" data-gid="' + gid + '" data-mode="one" style="cursor:pointer;accent-color:#f09040;flex-shrink:0;">' +
            '<span style="font-size:0.8rem;">Excluir <strong style="color:#f09040">só este mês</strong> <span style="color:var(--text2);font-weight:400">(' + venc + ')</span></span>' +
          '</label>' +
          '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 10px;border-radius:6px;background:var(--surface);border:1px solid var(--border)">' +
            '<input type="radio" class="del-grp-radio" name="' + radioName + '" data-gid="' + gid + '" data-mode="forward" checked style="cursor:pointer;accent-color:#f05060;flex-shrink:0;">' +
            '<span style="font-size:0.8rem;">Excluir <strong style="color:#f05060">este mês em diante</strong> <span style="color:var(--text2);font-weight:400">(' + futureCount + ' ocorrências)</span></span>' +
          '</label>' +
          '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 10px;border-radius:6px;background:var(--surface);border:1px solid var(--border)">' +
            '<input type="radio" class="del-grp-radio" name="' + radioName + '" data-gid="' + gid + '" data-mode="all" style="cursor:pointer;accent-color:#f05060;flex-shrink:0;">' +
            '<span style="font-size:0.8rem;">Excluir <strong style="color:#f05060">todas</strong> <span style="color:var(--text2);font-weight:400">(' + total + ' ocorrências no total)</span></span>' +
          '</label>' +
        '</div>' +
      '</div>';
    }).join('');

    // Rebuild master selector with 3 options
    const masterWrap = document.getElementById('deleteParcelasMasterWrap');
    if (masterWrap) {
      masterWrap.innerHTML =
        '<div style="font-size:0.78rem;color:var(--text2);margin-bottom:6px">Aplicar a todos:</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button onclick="toggleAllDeleteParcelas(\'one\')" style="padding:4px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:#f09040;font-size:0.75rem;font-weight:700;cursor:pointer">✕ Só este mês</button>' +
          '<button onclick="toggleAllDeleteParcelas(\'forward\')" style="padding:4px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:#f05060;font-size:0.75rem;font-weight:700;cursor:pointer">✕✕ Este mês em diante</button>' +
          '<button onclick="toggleAllDeleteParcelas(\'all\')" style="padding:4px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:#f05060;font-size:0.75rem;font-weight:700;cursor:pointer">✕✕✕ Todas</button>' +
        '</div>';
    }
    const master = document.getElementById('deleteParcelasSelectAll');
    if (master) { master.checked = false; master.indeterminate = false; }
    document.getElementById('deleteParcelasOverlay').classList.add('open');
  });
}

function confirmDeleteParcelas() {
  const result = {};
  // One radio per group — get the checked one
  const groups = {};
  document.querySelectorAll('.del-grp-radio').forEach(function(r) {
    if (!groups[r.dataset.gid]) groups[r.dataset.gid] = r; // track first
    if (r.checked) groups[r.dataset.gid] = r;
  });
  Object.keys(groups).forEach(function(gid) {
    const r = groups[gid];
    result[gid] = { mode: r.dataset.mode };
  });
  document.getElementById('deleteParcelasOverlay').classList.remove('open');
  if (_deleteParcelasResolve) _deleteParcelasResolve(result);
}

function toggleAllDeleteParcelas(mode) {
  // mode: 'one' | 'forward' | 'all'
  const groups = {};
  document.querySelectorAll('.del-grp-radio').forEach(function(r) {
    if (!groups[r.dataset.gid]) groups[r.dataset.gid] = [];
    groups[r.dataset.gid].push(r);
  });
  Object.keys(groups).forEach(function(gid) {
    const radios = groups[gid];
    // Se o modo pedido não existe para este grupo, usa o mais próximo
    const hasModeRadio = radios.some(function(r) { return r.dataset.mode === mode; });
    const targetMode = hasModeRadio ? mode : (mode === 'all' ? 'forward' : 'one');
    radios.forEach(function(r) { r.checked = (r.dataset.mode === targetMode); });
  });
}

function syncDeleteParcelasAll() {
  // no-op for radio; master checkbox behavior handled by toggleAllDeleteParcelas
}

function bulkDelete() {
  const ids = getCheckedIds();
  if (!ids.length) return;

  const allData = loadData();
  const idsToDelete = new Set();
  const normalIds = [];
  const parcelGroups = {}; // groupId → selectedId  (parcelado)
  const fixoGroups   = {}; // groupId → selectedId  (fixo)

  ids.forEach(function(id) {
    const l = allData.find(function(x) { return String(x.id) === String(id); });
    if (!l) return;
    if (l.groupId && l.recorr === 'parcelado') {
      if (!parcelGroups[String(l.groupId)]) parcelGroups[String(l.groupId)] = String(l.id);
    } else if (l.groupId && l.recorr === 'fixo') {
      if (!fixoGroups[String(l.groupId)]) fixoGroups[String(l.groupId)] = String(l.id);
    } else {
      normalIds.push(String(l.id));
    }
  });

  normalIds.forEach(function(id) { idsToDelete.add(id); });

  const hasGroups = Object.keys(parcelGroups).length || Object.keys(fixoGroups).length;

  function applyAndFinish() {
    if (!idsToDelete.size) { bulkClear(); return; }
    // FIX: mostra resumo detalhado por pagamento/categoria antes de excluir
    const toDelArr = allData.filter(function(l) { return idsToDelete.has(String(l.id)); });
    const pagCount = {};
    toDelArr.forEach(function(l) {
      const k = l.pagamento || '(sem pagamento)';
      pagCount[k] = (pagCount[k] || 0) + 1;
    });
    const pagResumo = Object.entries(pagCount)
      .sort(function(a,b){ return b[1]-a[1]; })
      .map(function(e){ return '  • ' + e[0] + ': ' + e[1] + ' lançamento(s)'; })
      .join('\n');
    const msg = 'Você está prestes a excluir ' + idsToDelete.size + ' lançamento(s):\n\n'
      + 'Por pagamento/cartão:\n' + pagResumo
      + '\n\nEsta ação NÃO pode ser desfeita. Confirmar?';
    // Usa modal personalizado
    _showBulkDeleteConfirm(idsToDelete.size, pagResumo, function(ok) {
      if (!ok) { bulkClear(); document.getElementById('deleteParcelasOverlay').classList.remove('open'); return; }
      idsToDelete.forEach(function(id) { _addTombstone(id); });
      saveData(allData.filter(function(l) { return !idsToDelete.has(String(l.id)); }));
      _bulkDeleteFromDB(Array.from(idsToDelete));
      bulkClear();
      document.getElementById('deleteParcelasOverlay').classList.remove('open');
      safeRender(function(){ renderAll(); });
      setTimeout(function() { if(typeof renderTerceirosTab==='function') renderTerceirosTab(); }, 100);
    });
    return;
    idsToDelete.forEach(function(id) { _addTombstone(id); });
    saveData(allData.filter(function(l) { return !idsToDelete.has(String(l.id)); }));
    // Deleta diretamente do banco em lote (mais confiável que requisições individuais)
    (async function() {
      try {
        const _token = await _getValidToken();
        const _uid = _currentUser.id;
        const _ids = Array.from(idsToDelete);
        for (var _i = 0; _i < _ids.length; _i += 100) {
          const _lote = _ids.slice(_i, _i + 100);
          const _filtro = _lote.map(function(id) { return '"' + id + '"'; }).join(',');
          await fetch(SB_URL + '/rest/v1/mf_lancamentos?user_id=eq.' + _uid + '&id=in.(' + _filtro + ')', {
            method: 'DELETE',
            headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + _token, 'Prefer': 'return=minimal' }
          });
        }
      } catch(e) { console.warn('[bulkDelete] erro banco:', e.message); }
    })();
    bulkClear();
    document.getElementById('deleteParcelasOverlay').classList.remove('open');
    safeRender(() => renderAll());
  }

  // Sem grupos — vai direto para confirmação detalhada
  if (!hasGroups) {
    applyAndFinish();
    return;
  }

  // Abre modal com todos os grupos (parcelado + fixo)
  openDeleteParcelasModal(parcelGroups, fixoGroups).then(function(result) {
    if (!result) { bulkClear(); document.getElementById('deleteParcelasOverlay').classList.remove('open'); return; } // cancelado
    // FIX: captura filtro de pagamento ativo para não excluir itens de grupo de outros pagamentos
    const _pagFiltroAtivo = window.FSEL ? FSEL.getValues('filtroPagamento') : [];
    const _normPagFiltro = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const _pagNomesAtivos = _pagFiltroAtivo.filter(function(v){ return v !== ''; }).map(_normPagFiltro);

    Object.keys(result).forEach(function(gid) {
      const r = result[gid];
      if (!r) return;
      const mode = r.mode;
      const groupItems = allData.filter(function(l) { return String(l.groupId) === String(gid); });
      // FIX: se há filtro de pagamento ativo, restringe exclusão apenas aos itens que batem com o filtro
      const groupItemsFiltrados = _pagNomesAtivos.length
        ? groupItems.filter(function(l) { return _pagNomesAtivos.includes(_normPagFiltro(l.pagamento)); })
        : groupItems;

      if (mode === 'all') {
        // Delete every item in the group (respeitando filtro de pagamento)
        groupItemsFiltrados.forEach(function(l) { idsToDelete.add(String(l.id)); });
      } else if (mode === 'forward') {
        // Delete selected item and all future (same mes/ano or later), respeitando filtro de pagamento
        const selItem = allData.find(function(l) { return String(l.groupId) === String(gid) && fixoGroups[gid] === String(l.id); });
        const selMes = selItem ? selItem.mes : 0;
        const selAno = selItem ? selItem.ano : 0;
        groupItemsFiltrados.forEach(function(l) {
          if (l.ano > selAno || (l.ano === selAno && l.mes >= selMes)) {
            idsToDelete.add(String(l.id));
          }
        });
      } else {
        // 'one' — only the selected id
        const selId = fixoGroups[gid] || parcelGroups[gid];
        if (selId) idsToDelete.add(selId);
      }
    });
    applyAndFinish();
  });
}

function parseDateStr(s) {
  if (!s) return 0;
  var p = s.split('/');
  if (p.length === 3) return new Date(p[2], p[1]-1, p[0]).getTime();
  if (s.includes('-')) return new Date(s).getTime();
  return 0;
}

function setSort(col) {
  if (sortCol === col) { sortDir *= -1; }
  else { sortCol = col; sortDir = col === 'valor' ? -1 : 1; }
  updateSortHeaders();
  renderAllTable();
}

function updateSortHeaders() {
  document.querySelectorAll('#allTable').forEach(function(){});
  var ths = document.querySelectorAll('thead th.sortable');
  ths.forEach(function(th) {
    th.classList.remove('sort-asc','sort-desc');
    var col = (th.getAttribute('onclick') || '').replace("setSort('","").replace("')","");
    if (col === sortCol) th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
  });
}

function sortItems(items) {
  return items.slice().sort(function(a, b) {
    var av, bv;
    switch(sortCol) {
      case '_ts':        av = (a._ts || 0);                bv = (b._ts || 0);                break;
      case 'data':       av = parseDateStr(a.data);        bv = parseDateStr(b.data);        break;
      case 'vencimento': av = parseDateStr(a.vencimento);  bv = parseDateStr(b.vencimento);  break;
      case 'desc':       av = (a.desc||'').toLowerCase();  bv = (b.desc||'').toLowerCase();  break;
      case 'categoria':  av = (a.categoria||'').toLowerCase(); bv = (b.categoria||'').toLowerCase(); break;
      case 'subCategoria': av = (a.subCategoria||'').toLowerCase(); bv = (b.subCategoria||'').toLowerCase(); break;
      case 'pagamento':  av = (a.pagamento||'').toLowerCase(); bv = (b.pagamento||'').toLowerCase(); break;
      case 'tipo':       av = (a.tipo||'');                bv = (b.tipo||'');                break;
      case 'status':     av = (a.status||'');              bv = (b.status||'');              break;
      case 'valor':      av = a.valor;                     bv = b.valor;                     break;
      case 'parcAtual': {
        var aHasParc = !!a.parcAtual, bHasParc = !!b.parcAtual;
        if (!aHasParc && !bHasParc) return 0;
        if (!aHasParc) return 1;
        if (!bHasParc) return -1;
        av = a.parcAtual; bv = b.parcAtual; break;
      }
      default:           av = parseDateStr(a.vencimento);  bv = parseDateStr(b.vencimento);
    }
    if (av < bv) return -1 * sortDir;
    if (av > bv) return  1 * sortDir;
    return 0;
  });
}

function renderAllTable() {
  const all = getMonthData();
  const tipo      = window.FSEL ? FSEL.getValues('filtroTipo')          : [];
  const status    = window.FSEL ? FSEL.getValues('filtroStatus')        : [];
  const cat       = window.FSEL ? FSEL.getValues('filtroCategoria')     : [];
  const subCat    = window.FSEL ? FSEL.getValues('filtroSubCategoria')  : [];
  const semCat    = window.FSEL ? FSEL.getValues('filtroSemCat')        : [];
  const tipoLanc  = window.FSEL ? FSEL.getValues('filtroTipoLanc')      : [];
  const pagFiltro = window.FSEL ? FSEL.getValues('filtroPagamento')     : [];
  const tercFiltro= window.FSEL ? FSEL.getValues('filtroTerceiro')      : [];
  const bancoFiltro= window.FSEL ? FSEL.getValues('filtroBanco')        : [];
  // Set de bancos existentes — p/ o filtro "⚪ Sem banco" (sem banco OU banco apagado).
  const _bancosExist = new Set(loadBancos().map(b => b.id));
  const _filtroBuscaEl = document.getElementById('filtroBusca');
  const busca = _filtroBuscaEl ? _filtroBuscaEl.value.toLowerCase() : '';
  const _filtroValorEl = document.getElementById('filtroValor');
  const _filtroValorRaw = _filtroValorEl ? _filtroValorEl.value.trim() : '';

  // Popula filtro de terceiro dinamicamente
  const tercSel = document.getElementById('filtroTerceiro');
  if (tercSel) {
    const tercsAtivos = new Set(all.map(l=>l.terceiro).filter(Boolean));
    tercSel.innerHTML = '<option value="">— Todos os terceiros —</option>';
    [...tercsAtivos].sort().forEach(t => {
      const o = document.createElement('option'); o.value = t; o.textContent = t; tercSel.appendChild(o);
    });
    if (window.FSEL) {
      // Se a seleção atual tem valores que não existem mais nos dados do mês,
      // limpa o filtro para evitar que todos os registros sumam silenciosamente
      const selAtual = FSEL.getValues('filtroTerceiro');
      if (selAtual.length && !selAtual.every(v => tercsAtivos.has(v))) {
        FSEL.reset('filtroTerceiro');
      }
      _fselRebuild('filtroTerceiro');
    }
  }

  let filtered = all.filter(l => {
    if (tipo.length      && !tipo.includes(l.tipo)) return false;
    if (status.length    && !status.includes(l.status)) return false;
    if (cat.length) {
      // "__sem_cat__" casa lançamentos sem categoria → entram na lista e na soma.
      var _lcat = (l.categoria || '').trim();
      if (_lcat === '') { if (!cat.includes('__sem_cat__')) return false; }
      else if (!cat.includes(l.categoria)) return false;
    }
    if (subCat.length    && !subCat.includes(l.subCategoria)) return false;
    if (semCat.includes('sem_cat') && (l.categoria && l.categoria.trim() !== '')) return false;
    if (semCat.includes('sem_sub') && (l.subCategoria && l.subCategoria.trim() !== '' && l.subCategoria !== 'Não identificado')) return false;
    if (tipoLanc.length  && !tipoLanc.includes(l.tipoLanc || 'variavel')) return false;
    if (pagFiltro.length) {
      // FIX: normaliza comparação para evitar falhas por case/acento,
      // e trata '' como "sem pagamento" (não mistura com lançamentos de outros cartões)
      const _normPag = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
      const pagValido = l.pagamento && l.pagamento.trim() !== '';
      const pagNomesReais = pagFiltro.filter(function(v){ return v !== ''; });
      const pagNormsReais = pagNomesReais.map(_normPag);
      const pagIncluiVazio = pagFiltro.includes('');
      if (pagNomesReais.length && pagValido && !pagNormsReais.includes(_normPag(l.pagamento))) return false;
      if (pagNomesReais.length && !pagValido && !pagIncluiVazio) return false;
      if (!pagNomesReais.length && pagIncluiVazio && pagValido) return false;
    }
    if (tercFiltro.length && !tercFiltro.includes(l.terceiro || '')) return false;
    if (bancoFiltro.length) {
      var _lb = l.banco || '';
      var _orfao = (_lb === '' || !_bancosExist.has(_lb));
      if (_orfao) { if (!bancoFiltro.includes('__sem_banco__')) return false; }
      else if (!bancoFiltro.includes(_lb)) return false;
    }
    if (busca) {
      const haystack = [(l.desc||'').replace(/\s*\(\d+\/\d+\)\s*$/, ''), l.categoria, l.subCategoria, l.pagamento, l.terceiro].join(' ').toLowerCase();
      if (!haystack.includes(busca)) return false;
    }
    if (!_matchValor(l.valor, _filtroValorRaw)) return false;
    return true;
  });

  // Filtro rápido de status por botões (Todos/Pendente/Pago/Atrasado)
  filtered = window._applyStatusQuick(filtered, window._lancStatusQuick);

  // Renderiza os botões de status no container da aba Lançamentos
  const _lancBtns = document.getElementById('lancStatusBtns');
  if (_lancBtns) _lancBtns.innerHTML = window._renderStatusBtns(window._lancStatusQuick, '_setLancStatus');

  filtered = sortItems(filtered);
  updateSortHeaders();
  renderTable('allTable', filtered);

  const fR = filtered.filter(l => l.tipo === 'receita').reduce((s,l) => s+_valorExib(l), 0);
  const fD = filtered.filter(l => l.tipo === 'despesa').reduce((s,l) => s+_valorExib(l), 0);
  const _elFR = document.getElementById('filteredReceita'); if (_elFR) _elFR.textContent = fmt(fR);
  const _elFD = document.getElementById('filteredDespesa'); if (_elFD) _elFD.textContent = fmt(fD);
  const _elFT = document.getElementById('filteredTotal');   if (_elFT) { _elFT.textContent = fmt(fR - fD); _elFT.style.color = fR >= fD ? 'var(--green)' : 'var(--red)'; }
  // Atualiza cabeçalho
  var saldo = fR - fD;
  var qtd = filtered.length;
  var elQtd = document.getElementById('lancTotQtd');
  var elDesp = document.getElementById('lancTotDesp');
  var elRec  = document.getElementById('lancTotRec');
  var elSaldo = document.getElementById('lancTotSaldo');
  if (elQtd)   elQtd.textContent   = qtd + ' lançamento' + (qtd !== 1 ? 's' : '');
  if (elDesp)  elDesp.textContent  = fmt(fD);
  if (elRec)   elRec.textContent   = fmt(fR);
  if (elSaldo) { elSaldo.textContent = (saldo >= 0 ? '+' : '-') + fmt(Math.abs(saldo)); elSaldo.style.color = saldo >= 0 ? 'var(--green)' : 'var(--red)'; }

  // ── Cards de pendentes (independentes dos filtros de status/busca) ──────────
  // Mostra recebimentos e pagamentos ainda não quitados no período/banco atual.
  // Exclui categorias de terceiros para casar com os totais de A Pagar/A Receber.
  (function _renderLancPendentes() {
    var cont = document.getElementById('lancPendentesCards');
    if (!cont) return;
    var EXCL = ['Entrada Terceiro', 'Dividas de terceiros', 'Transferência'];
    var pend = all.filter(function(l) { return l.status !== 'pago' && EXCL.indexOf(l.categoria || '') < 0; });
    var recItens  = pend.filter(function(l) { return l.tipo === 'receita'; });
    var despItens = pend.filter(function(l) { return l.tipo === 'despesa'; });
    var recPend  = recItens.reduce(function(s, l) { return s + (l.valor || 0); }, 0);
    var despPend = despItens.reduce(function(s, l) { return s + (l.valor || 0); }, 0);
    var vencDesp = despItens.filter(function(l) { return window._isVencidoStatus(l); }).reduce(function(s, l) { return s + (l.valor || 0); }, 0);
    var quickPend = window._lancStatusQuick === 'pendente';
    function card(cor, icone, label, valor, qtd, sub) {
      return '<div class="card sm" style="border-top:3px solid ' + cor + ';cursor:pointer;' + (quickPend ? 'box-shadow:0 0 0 2px ' + cor + ';' : '') + '" onclick="_setLancStatus(\'pendente\')" title="Filtrar pendentes">'
        + '<div class="card-header"><span class="card-label" style="color:' + cor + '">' + icone + ' ' + label + '</span></div>'
        + '<div class="card-value" style="color:' + cor + '">' + valor + '</div>'
        + '<div class="card-footer"><span class="card-sub">' + qtd + (sub ? ' · ' + sub : '') + '</span></div></div>';
    }
    cont.innerHTML =
      card('var(--green)', '📥', 'Recebimentos pendentes', '+' + fmt(recPend), recItens.length + ' a receber', '') +
      card('var(--red)',   '📤', 'Pagamentos pendentes',   '-' + fmt(despPend), despItens.length + ' a pagar', vencDesp > 0 ? ('🔴 ' + fmt(vencDesp) + ' vencido') : '');
  })();

  // Mostra/esconde botão limpar filtros
  var hasFilter = (busca.length > 0) || tipo.length || status.length || cat.length || subCat.length || tipoLanc.length || pagFiltro.length || tercFiltro.length;
  var btnClr = document.getElementById('btnClearLancFiltros');
  if (btnClr) btnClr.style.display = hasFilter ? 'inline-block' : 'none';
}


function filterByStatus(status) {
  // Se já está filtrado por esse status, limpa; senão aplica
  var cur = window.FSEL ? FSEL.getValues('filtroStatus') : [];
  if (cur.length === 1 && cur[0] === status) {
    if (window.FSEL) FSEL.reset('filtroStatus');
  } else {
    var el = document.getElementById('filtroStatus');
    if (el) el.value = status;
    if (window.FSEL) { FSEL.reset('filtroStatus'); FSEL.setValues('filtroStatus', [status]); }
  }
  renderAll();
}

function formatDate(d) {
  if (!d) return '—';
  if (d.includes('/')) return d; // já é DD/MM/YYYY
  const [y, m, dd] = d.split('-');
  if (!dd) return d;
  return `${dd}/${m}/${y}`;
}

// DD/MM/YYYY → YYYY-MM-DD (para input type=date)
function vencToInputDate(venc) {
  if (!venc) return '';
  // Formato ISO do Supabase: YYYY-MM-DD → retorna direto
  if (/^\d{4}-\d{2}-\d{2}/.test(venc)) return venc.slice(0, 10);
  // Formato legado: DD/MM/YYYY → converte para YYYY-MM-DD
  const p = venc.split('/');
  if (p.length !== 3) return '';
  return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
}

// YYYY-MM-DD → DD/MM/YYYY
function inputDateToVenc(d) {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

// Avança vencimento DD/MM/YYYY por N meses
function addMonthsToVenc(venc, n) {
  if (!venc) return '';
  const p = venc.split('/');
  if (p.length !== 3) return venc;
  const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1 + n, parseInt(p[0]));
  return String(d.getDate()).padStart(2,'0') + '/' +
         String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}

// ═══════════════════════════════════════════════════
// INSIGHTS — bloco de decisão orientada a dados
// ═══════════════════════════════════════════════════
function _renderInsights(resultado, receita, despesa) {
  const block = document.getElementById('insightsBlock');
  if (!block) return;

  const insights = [];
  const fmt2 = v => fmt(Math.abs(v));

  // ── Dados de categorias para top causas ──
  const provData = window._memCache && window._memCache.provisoes ? window._memCache.provisoes : [];
  const allData  = (typeof getMonthData === 'function') ? getMonthData() : [];

  // Calcular gastos por categoria (despesas do mês)
  const byCat = {};
  allData.filter(l => l.tipo === 'despesa' && !['Entrada Terceiro','Dividas de terceiros'].includes(l.categoria))
    .forEach(l => { byCat[l.categoria] = (byCat[l.categoria]||0) + (l.valor||0); });

  // Calcular provisões por categoria
  const byProv = {};
  provData.filter(p => Number(p.mes)===currentMonth && Number(p.ano)===currentYear)
    .forEach(p => { byProv[p.categoria] = (byProv[p.categoria]||0) + (p.valor||0); });

  // Categorias com excesso (gasto > orçamento)
  const excessos = Object.entries(byCat)
    .map(([nome, gasto]) => {
      const prov = byProv[nome] || 0;
      const pct  = prov > 0 ? Math.round(gasto/prov*100) : 0;
      return { nome, gasto, prov, excesso: gasto - prov, pct };
    })
    .filter(c => c.prov > 0 && c.gasto > c.prov)
    .sort((a, b) => b.excesso - a.excesso);

  // Dias restantes no mês
  const hoje = new Date();
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0);
  const diasRestantes = Math.max(1, ultimoDia.getDate() - hoje.getDate());

  // ── INSIGHT 1: Resultado principal ──
  if (resultado < 0) {
    const topCausas = excessos.slice(0, 2).map(c => `${c.nome} (+${c.pct}%)`).join(', ');
    insights.push({
      tipo: 'danger',
      icon: '🔴',
      titulo: 'Mês vai fechar negativo',
      corpo: `-${fmt2(resultado)}`,
      meta: topCausas ? `Causas: ${topCausas}` : `Despesa supera receita em ${fmt(Math.abs(resultado))}`,
      cta: null
    });
  } else if (resultado > 0) {
    insights.push({
      tipo: 'ok',
      icon: '✅',
      titulo: 'Mês vai fechar positivo',
      corpo: `+${fmt2(resultado)}`,
      meta: `${fmt(resultado)} acima das despesas`,
      cta: null
    });
  } else {
    insights.push({
      tipo: 'warning',
      icon: '⚠️',
      titulo: 'Mês no limite',
      corpo: 'R$ 0,00',
      meta: 'Receita e despesa equilibradas',
      cta: null
    });
  }

  // ── INSIGHT 2: Maior excesso de categoria ──
  if (excessos.length > 0) {
    const top = excessos[0];
    insights.push({
      tipo: top.pct > 200 ? 'danger' : 'warning',
      icon: top.pct > 200 ? '🚨' : '⚠️',
      titulo: 'Maior excesso',
      corpo: top.nome,
      meta: `${top.pct}% do previsto · ${fmt(top.excesso)} acima`,
      cta: null
    });
  } else if (resultado >= 0) {
    insights.push({
      tipo: 'ok',
      icon: '💚',
      titulo: 'Sem excessos',
      corpo: 'Tudo dentro do previsto',
      meta: 'Todas categorias no orçamento',
      cta: null
    });
  }

  // ── INSIGHT 3: Ação recomendada ──
  if (resultado < 0) {
    const corteDiario = Math.abs(resultado) / diasRestantes;
    insights.push({
      tipo: 'warning',
      icon: '🎯',
      titulo: 'Ação recomendada',
      corpo: `Cortar ${fmt(corteDiario)}/dia`,
      meta: `${diasRestantes} dia${diasRestantes>1?'s':''} restantes para zerar`,
      cta: null
    });
  } else {
    const pct = receita > 0 ? Math.round((resultado/receita)*100) : 0;
    insights.push({
      tipo: 'ok',
      icon: '📈',
      titulo: 'Taxa de sobra',
      corpo: `${pct}% da receita`,
      meta: `${fmt(resultado)} sobrando`,
      cta: null
    });
  }

  // ── Renderizar ──
  block.innerHTML = insights.map(ins => `
    <div class="insight insight-${ins.tipo}">
      <div class="i-icon">${ins.icon}</div>
      <div class="i-content">
        <div class="i-title">${ins.titulo}</div>
        <div class="i-body">${ins.corpo}</div>
        ${ins.meta ? `<div class="i-meta">${ins.meta}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function renderCatChart(despesas) {
  const COLORS = ['#00FF88','#FF4560','#4090f0','#FF8C42','#c084fc','#f0c040','#40c0f0','#f06090','#a0f040','#60f0c0','#f0c090','#90c0f0','#f0a0c0','#4af0a0','#c0f080'];

  // PIE CHART — para conjuntos pequenos (≤6 itens), renderiza pizza em canvas
  function makePie(canvas, entries, colors) {
    const W = canvas.width = canvas.offsetWidth || 160;
    const H = canvas.height = W;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const total = entries.reduce((s, [,v]) => s + v, 0);
    if (!total) return;
    const cx = W / 2, cy = H / 2, r = Math.min(cx, cy) - 6;
    let startAngle = -Math.PI / 2;
    entries.forEach(([, val], i) => {
      const slice = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.shadowColor = colors[i % colors.length];
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Stroke between slices
      ctx.strokeStyle = '#080B0F';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      startAngle += slice;
    });
    // Donut hole
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = '#101520';
    ctx.fill();
  }

  function makeBars(elId, entries, accentColor) {
    const el = document.getElementById(elId);
    if (!el) return;
    const pos = entries.filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
    if (!pos.length) { el.innerHTML = '<div class="empty-state" style="padding:12px">Sem dados no período.</div>'; return; }
    const max = pos[0][1];
    const total = pos.reduce((s,[,v]) => s+v, 0);
    const usePie = pos.length <= 6;

    if (usePie) {
      // Layout: pizza à esquerda + legenda à direita
      const pieId = elId + '_pie';
      el.innerHTML = `<div style="display:flex;align-items:center;gap:16px;padding:8px 0">
        <canvas id="${pieId}" style="width:110px;height:110px;flex-shrink:0"></canvas>
        <div style="flex:1;display:flex;flex-direction:column;gap:5px">
          ${pos.map(([label, val], i) => {
            const color = accentColor || COLORS[i % COLORS.length];
            const pctTot = total > 0 ? (val/total*100).toFixed(0) : '0';
            return `<div style="display:flex;align-items:center;gap:8px">
              <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 4px ${color}88"></div>
              <div style="flex:1;font-size:0.65rem;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${label}">${label}</div>
              <div style="font-family:var(--font-mono);font-size:0.62rem;font-weight:700;color:var(--text);white-space:nowrap">${fmt(val)}</div>
              <div style="font-size:0.58rem;color:var(--muted);min-width:24px;text-align:right">${pctTot}%</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
      // Draw pie after DOM insert
      requestAnimationFrame(() => {
        const c = document.getElementById(pieId);
        if (c) makePie(c, pos, pos.map(([,], i) => accentColor || COLORS[i % COLORS.length]));
      });
    } else {
      // Barras horizontais finas — estilo premium
      el.innerHTML = pos.map(([label, val], i) => {
        const color = accentColor || COLORS[i % COLORS.length];
        const pct = (val / max * 100).toFixed(1);
        const pctTot = total > 0 ? (val / total * 100).toFixed(0) : '0';
        const _isOver = Number(pctTot) > 100;
        return `<div class="cat-bar-row${_isOver ? ' alerta' : ''}">
          <div class="cat-bar-label" title="${label}">${label}${_isOver ? ' <span style="color:#f87171;font-size:.55rem;font-weight:700">⚠ estourou</span>' : ''}</div>
          <div class="cat-bar-bg">
            <div class="cat-bar-fill" style="width:${Math.min(pct,100)}%;background:linear-gradient(90deg,${_isOver?'rgba(248,113,113,.8)':color+'cc'},${_isOver?'#f87171':color});box-shadow:0 0 6px ${_isOver?'rgba(248,113,113,.4)':color+'55'}"></div>
          </div>
          <div class="cat-bar-val" style="color:${_isOver?'#f87171':color}">${fmt(val)}</div>
          <div class="cat-bar-pct" style="color:${_isOver?'#f87171':'inherit'};font-weight:${_isOver?'700':'400'}">${pctTot}%</div>
        </div>`;
      }).join('');
    }
  }

  // — Categorias (todas, sem limite) —
  const byCat = {};
  despesas.forEach(l => { const v=_valorExib(l); if (v > 0) byCat[l.categoria] = (byCat[l.categoria]||0) + v; });
  makeBars('catBars', Object.entries(byCat));
  const catTotal = Object.values(byCat).reduce((s,v)=>s+v,0);
  const catTotalEl = document.getElementById('catChartTotal');
  if (catTotalEl) catTotalEl.textContent = 'Total: ' + fmt(catTotal);

  // — Sub-Categorias —
  const bySubCat = {};
  despesas.forEach(l => {
    const v = _valorExib(l);
    if (v > 0) {
      const key = l.subCategoria ? l.subCategoria : '(sem sub-cat)';
      bySubCat[key] = (bySubCat[key]||0) + v;
    }
  });
  makeBars('catBarsSubCat', Object.entries(bySubCat));

  // — Tipo de Pagamento: separa cartão de crédito vs outros —
  const pags = loadPagamentos();
  // normaliza para comparação sem acento/case
  const norm = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const cartaoNomes = new Set(pags.filter(p => p.cartao).map(p => norm(p.nome)));

  // Para cartões: usa l.mes/l.ano (mês da fatura), inclui terceiros pois é gasto real do cartão
  const _rngCart = window._rangeFilter || { ate: { mes: currentMonth, ano: currentYear } };
  const despesasMesCartao = loadDataBanco().filter(l => {
    if (l.tipo !== 'despesa') return false;
    const v = Number(l.ano)*100 + Number(l.mes);
    const de  = _rngCart.de.ano*100  + _rngCart.de.mes;
    const ate = _rngCart.ate.ano*100 + _rngCart.ate.mes;
    return v >= de && v <= ate;
  });

  const byCartao = {}, byOutros = {};
  despesasMesCartao.forEach(l => {
    const key = l.pagamento || '(não informado)';
    const v = _valorExib(l);
    if (cartaoNomes.has(norm(key))) {
      byCartao[key] = (byCartao[key]||0) + v;
    } else {
      byOutros[key] = (byOutros[key]||0) + v;
    }
  });

  makeBars('catBarsCartao', Object.entries(byCartao));
  const cartaoTot = Object.values(byCartao).reduce((s,v)=>s+v,0);
  const cartaoTotEl = document.getElementById('cartaoTotal');
  if (cartaoTotEl) cartaoTotEl.textContent = cartaoTot > 0 ? 'Total: ' + fmt(cartaoTot) : '';

  makeBars('catBarsPagamento', Object.entries(byOutros));
  const outrosTot = Object.values(byOutros).reduce((s,v)=>s+v,0);
  const outrosTotEl = document.getElementById('outrosPagTotal');
  if (outrosTotEl) outrosTotEl.textContent = outrosTot > 0 ? 'Total: ' + fmt(outrosTot) : '';

  // — Tipo de Lançamento —
  const byTipoLanc = {};
  despesas.forEach(l => {
    const v = _valorExib(l);
    if (v > 0) {
      const key = l.tipoLanc || 'variável';
      byTipoLanc[key] = (byTipoLanc[key]||0) + v;
    }
  });
  makeBars('catBarsTipoLanc', Object.entries(byTipoLanc));

  // — Receitas por Categoria —
  const allData = getMonthData();
  const receitas = allData.filter(l => l.tipo === 'receita' && l.categoria !== 'Transferência');
  const byRecCat = {};
  receitas.forEach(l => { const v=_valorExib(l); if (v > 0) byRecCat[l.categoria] = (byRecCat[l.categoria]||0) + v; });
  makeBars('catBarsReceitas', Object.entries(byRecCat));
  const recTot = Object.values(byRecCat).reduce((s,v)=>s+v,0);
  const recTotEl = document.getElementById('receitasTotal');
  if (recTotEl) recTotEl.textContent = recTot > 0 ? 'Total: ' + fmt(recTot) : '';
}

function _buildParc1Ids(data) {
  // Retorna Set com os IDs que são a parcela 1 de cada grupo parcelado.
  // REGRA: só inclui se a desc contiver explicitamente "(1/N)".
  // Se a parcela 1 não está no dataset (compra anterior ao período do backup),
  // o grupo é IGNORADO — não deve impactar a orçamento pois o gasto já ocorreu.
  var parc1Ids = new Set();
  var pat = /(\d+)\/(\d+)\)$/; // legado
  data.filter(function(l){ return l.tipo==='despesa' && l.tipoLanc==='parcelado'; }).forEach(function(l) {
    // usa campo parcAtual se disponível, senão extrai da desc (legado)
    var m = l.parcAtual ? [null, String(l.parcAtual), String(l.parcTotal||'?')] : pat.exec(l.desc||'');
    if (m && parseInt(m[1]) === 1) {
      parc1Ids.add(String(l.id));
    }
  });
  return parc1Ids;
}

// Para lançamentos FIXOS: só o primeiro mês do grupo deve contar na orçamento
function _buildFixo1Ids(data) {
  var gFixo = {};
  data.filter(function(l){ return l.tipo==='despesa' && l.tipoLanc==='fixo' && l.groupId; }).forEach(function(l) {
    var k = String(l.groupId);
    if (!gFixo[k] || l.ano < gFixo[k].ano || (l.ano===gFixo[k].ano && l.mes < gFixo[k].mes)) {
      gFixo[k] = { id: l.id, ano: l.ano, mes: l.mes };
    }
  });
  return new Set(Object.values(gFixo).map(function(g){ return String(g.id); }));
}

function calcProvisaoAcumulada() {
  const allProvsRaw = loadProvisoes();
  if (!allProvsRaw.length) return { grupos: [], totProv: 0, totGasto: 0 };

  const allProvs = allProvsRaw.filter(p => {
    // Provisões agora são SEMPRE por banco. Sem banco → não conta em nenhum
    // contexto (esperar migração rodar; ver _migrateProvisoesSemBanco).
    if (!p.banco) return false;
    const ctx = getBancoContexto();
    if (!ctx) return true; // sem filtro de banco → mostra todas
    if (ctx === 'consolidado') return getBancosConsolidadoIds().includes(p.banco);
    return p.banco === ctx;
  });
  if (!allProvs.length) return { grupos: [], totProv: 0, totGasto: 0 };

  const allData  = loadDataBanco();
  // Orçamento usa sempre o mês final do range como referência
  const _rng    = window._rangeFilter || { ate: { mes: currentMonth, ano: currentYear } };
  const mesFilt = _rng.ate.mes, anoFilt = _rng.ate.ano;

  // Gasto real por mes/cat para orçamento:
  //   Variável  → qualquer lançamento do mês
  //   Parcelado → apenas parcela 1 (desc termina em "(1/N)" ou é o 1º do groupId)
  //   Fixo      → cada entrada mensal gerada (recorrência do mês)
  const gastosPorMesCat = {};

  const primeiraParcelaIds = _buildParc1Ids(allData);
  const primeiraFixoIds    = _buildFixo1Ids(allData);

  allData.filter(l => l.tipo==='despesa' && l.valor>0).forEach(l => {
    if (l.tipoLanc === 'parcelado') {
      if (!primeiraParcelaIds.has(String(l.id))) return;
    }
    if (l.tipoLanc === 'fixo') {
      if (!primeiraFixoIds.has(String(l.id))) return;
    }
    const lm = l.mes, la = l.ano;
    if (!lm || !la) return;
    const k = la+'-'+String(lm).padStart(2,'0');
    if (!gastosPorMesCat[k]) gastosPorMesCat[k]={};
    // chave por categoria
    gastosPorMesCat[k][l.categoria] = (gastosPorMesCat[k][l.categoria]||0)+_valorExib(l);
    // chave por categoria|subCategoria (para provisões de subcat)
    if (l.subCategoria) {
      const ks = l.categoria + '|' + l.subCategoria;
      gastosPorMesCat[k][ks] = (gastosPorMesCat[k][ks]||0)+_valorExib(l);
    }
  });

  const grupoMap = {};
  allProvs.forEach(p => {
    if (!grupoMap[p.groupId]) grupoMap[p.groupId]={groupId:p.groupId,categoria:p.categoria,subCategoria:p.subCategoria||'',valor:p.valor,entradas:[]};
    grupoMap[p.groupId].entradas.push(p);
  });

  let totProvMes=0, totGastoMes=0, totProvAcum=0, totGastoAcum=0, totProvTotal=0;

  const grupos = Object.values(grupoMap).map(g => {
    // chave de gasto: usa categoria|subCategoria se tem subcat, senão só categoria
    const gastoKey = g.subCategoria ? g.categoria + '|' + g.subCategoria : g.categoria;
    const keyFilt = anoFilt+'-'+String(mesFilt).padStart(2,'0');

    const entMes = g.entradas.find(e => e.mes===mesFilt && e.ano===anoFilt);
    const provMes   = entMes ? entMes.valor : 0;
    const gastoMes  = (gastosPorMesCat[keyFilt]||{})[gastoKey]||0;
    const saldoMes  = provMes - gastoMes;

    const passadas = g.entradas.filter(e =>
      e.ano < anoFilt || (e.ano===anoFilt && e.mes<=mesFilt)
    );
    const provAcum  = passadas.reduce((s,e)=>s+e.valor,0);
    const gastoAcum = passadas.reduce((s,e)=>{
      const k=e.ano+'-'+String(e.mes).padStart(2,'0');
      return s+((gastosPorMesCat[k]||{})[gastoKey]||0);
    },0);
    const saldoAcum = provAcum - gastoAcum;

    const provTotal = g.entradas.reduce((s,e)=>s+e.valor,0);
    const pctTotal  = provTotal>0 ? Math.round(gastoAcum/provTotal*100) : 0;

    const futuras = g.entradas.filter(e=>e.ano>anoFilt||(e.ano===anoFilt&&e.mes>mesFilt))
      .sort((a,b)=>a.ano*12+a.mes-b.ano*12-b.mes);

    totProvMes   += provMes;   totGastoMes  += gastoMes;
    totProvAcum  += provAcum;  totGastoAcum += gastoAcum;
    totProvTotal += provTotal;

    return { ...g, gastoKey, provMes, gastoMes, saldoMes, provAcum, gastoAcum, saldoAcum, provTotal, pctTotal, futuras };
  });

  return { grupos, totProvMes, totGastoMes, totSaldoMes: totProvMes-totGastoMes,
           totProvAcum, totGastoAcum, totSaldoAcum: totProvAcum-totGastoAcum,
           totProvTotal };
}


function renderProvisao(despesas) {
  let grupos=[], totProvMes=0,totGastoMes=0,totSaldoMes=0,totProvAcum=0,totGastoAcum=0,totSaldoAcum=0;
  try {
    const r = calcProvisaoAcumulada();
    grupos=r.grupos; totProvMes=r.totProvMes; totGastoMes=r.totGastoMes; totSaldoMes=r.totSaldoMes;
    totProvAcum=r.totProvAcum; totGastoAcum=r.totGastoAcum; totSaldoAcum=r.totSaldoAcum;
  } catch(e) { console.warn(e); }

  // ── Card resumo topo ──────────────────────────────────────────────────
  const cards = document.getElementById('provCards');
  const _pct = totProvMes>0 ? Math.round(totGastoMes/totProvMes*100) : 0;
  const _sColor = totSaldoMes>=0?'#16a34a':'#dc2626';
  const _barColor = _pct>100?'#dc2626':_pct>75?'#f59e0b':'#16a34a';
  cards.innerHTML = `<div class="card sm" style="border-color:rgba(255,255,255,0.07);height:100%;box-sizing:border-box;padding:10px 14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="color:var(--text2);font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em">📦 Orçamento do Mês</span>
      <span style="font-size:0.65rem;font-weight:700;color:${_barColor};background:${_barColor}22;padding:2px 8px;border-radius:20px">${_pct}%</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px 8px;text-align:center">
        <div style="font-size:0.5rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Orçado</div>
        <div style="font-size:1rem;font-weight:700;font-family:'Space Mono',monospace;color:#94A3B8">${fmt(totProvMes)}</div>
      </div>
      <div style="background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.15);border-radius:8px;padding:10px 8px;text-align:center">
        <div style="font-size:0.5rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Gasto</div>
        <div style="font-size:1rem;font-weight:700;font-family:'Space Mono',monospace;color:#F87171">${fmt(totGastoMes)}</div>
      </div>
      <div style="background:${totSaldoMes>=0?'rgba(74,222,128,0.07)'  :'rgba(248,113,113,0.07)'};border:1px solid ${totSaldoMes>=0?'rgba(74,222,128,0.15)'  :'rgba(248,113,113,0.15)'};border-radius:8px;padding:10px 8px;text-align:center">
        <div style="font-size:0.5rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Disponível</div>
        <div style="font-size:1rem;font-weight:700;font-family:'Space Mono',monospace;color:${totSaldoMes>=0?'#4ADE80':'#F87171'}">${totSaldoMes>=0?'':'- '}${fmt(Math.abs(totSaldoMes))}</div>
      </div>
    </div>
    <div style="height:6px;background:rgba(255,255,255,0.05);border-radius:999px;overflow:hidden">
      <div style="height:6px;border-radius:999px;width:${Math.min(_pct,100)}%;background:linear-gradient(90deg,#22c55e,#facc15,#ef4444);transition:width 0.4s"></div>
    </div>
  </div>`;
  // Espelha no container da aba Orçamento
  const cardsTab = document.getElementById('provCardsTab');
  if (cardsTab) cardsTab.innerHTML = cards.innerHTML;

  // ── Helpers ───────────────────────────────────────────────────────────
  function rowBg(pct) {
    return 'transparent';
  }
  function pctBadge(pct) {
    let cls;
    const display = pct > 999 ? '999%+' : pct + '%';
    if (pct>100) {
      cls = 'background:rgba(248,113,113,0.15);color:#F87171;border:1px solid rgba(248,113,113,0.3)';
    } else if (pct>=75) {
      cls = 'background:rgba(250,204,21,0.15);color:#FACC15;border:1px solid rgba(250,204,21,0.3)';
    } else {
      cls = 'background:rgba(74,222,128,0.15);color:#4ADE80;border:1px solid rgba(74,222,128,0.3)';
    }
    return `<span style="${cls};padding:3px 10px;border-radius:6px;font-weight:700;font-size:0.8rem;font-family:'Inter','Segoe UI',system-ui,sans-serif">${display}</span>`;
  }
  function saldoTd(val, style='') {
    const c = val>=0?'#4ADE80':'#F87171';
    return `<td style="padding:8px 10px;border:1px solid var(--border);text-align:right;color:${c};font-weight:700;white-space:nowrap;font-family:'Space Mono',monospace;font-size:0.82rem;${style}">${val>=0?'':'-'}${fmt(Math.abs(val))}</td>`;
  }
  function numTd(val, style='') {
    return `<td style="padding:8px 10px;border:1px solid var(--border);text-align:right;white-space:nowrap;font-family:'Space Mono',monospace;font-size:0.78rem;${style}">${fmt(val)}</td>`;
  }
  const mNames=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // ── Tabela ────────────────────────────────────────────────────────────
  const tbody = document.getElementById('provTable');
  if (!grupos.length) {
    tbody.innerHTML='<tr><td colspan="9" class="empty-state">Nenhuma orçamento. Clique em + Categoria para começar.</td></tr>';
  } else {
    const acB = '';
    const ac2B = '';

    const filtroEl = document.getElementById('provFiltroCat');
    const filtroStr = filtroEl ? filtroEl.value.toLowerCase().trim() : '';
    const gruposFiltrados = filtroStr
      ? grupos.filter(g => g.categoria.toLowerCase().includes(filtroStr))
      : grupos;

    const isMobProv = window.matchMedia("(max-width:768px)").matches;
    const rows = gruposFiltrados.map(g => {
      const pctMes  = g.provMes>0  ? Math.round(g.gastoMes/g.provMes*100)   : (g.gastoMes>0?999:0);
      const pctAcum = g.provAcum>0 ? Math.round(g.gastoAcum/g.provAcum*100) : (g.gastoAcum>0?999:0);
      const pct = pctAcum;
      const bg = rowBg(Math.max(pctMes, pctAcum));
      const prox = g.futuras[0];
      const proxStr = prox ? mNames[prox.mes-1]+'/'+String(prox.ano).slice(2) : '—';
      const nMeses = g.entradas ? g.entradas.length : '?';
      const barColor = pct > 100 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#22c55e';
      const pctBarW  = Math.min(pct, 100);

      // ── MOBILE card ──
      if (isMobProv) {
        const drillId = (g.categoria+(g.subCategoria?'_'+g.subCategoria:'')).replace(/[\s|]/g,'_');
        const pctMesDisp = g.provMes>0 ? Math.round(g.gastoMes/g.provMes*100) : (g.gastoMes>0?999:0);
        const pctAcumDisp = pctAcum;
        const barColorMes = pctMesDisp>100?'#ef4444':pctMesDisp>75?'#f59e0b':'#22c55e';
        const saldoMesColor = g.saldoMes>=0?'#22c55e':'#ef4444';
        const saldoAcumColor = g.saldoAcum>=0?'#22c55e':'#ef4444';
        return `<div class="prov-mobile-card" style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${barColor};border-radius:10px;padding:12px 14px;margin-bottom:8px;">
          <!-- Header: nome + % acumulado -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <div style="flex:1;min-width:0;">
              <span style="font-weight:700;font-size:0.9rem;color:var(--text);cursor:pointer;display:block" onclick="verMovimentosProvisao('${g.categoria}','${g.subCategoria||''}')">${g.categoria}</span>
              ${g.subCategoria?`<span style="font-size:0.7rem;color:var(--text2)">› ${g.subCategoria}</span>`:''}
              <div style="font-size:0.65rem;color:var(--muted);margin-top:2px">${nMeses} mes${nMeses!==1?'es':''} · próx: ${proxStr}</div>
            </div>
            <span style="font-size:0.82rem;font-weight:700;color:${barColor};background:${barColor}18;border:1px solid ${barColor}33;padding:3px 10px;border-radius:6px;white-space:nowrap;margin-left:8px">${pct}%</span>
          </div>
          <!-- Barra de progresso acumulado -->
          <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:999px;margin-bottom:10px;">
            <div style="height:5px;border-radius:999px;width:${pctBarW}%;background:linear-gradient(90deg,#22c55e,#facc15,#ef4444);transition:width 0.4s"></div>
          </div>
          <!-- Grid dados: Mês e Acumulado -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
            <!-- Mês filtrado -->
            <div style="background:rgba(240,192,64,0.05);border:1px solid rgba(240,192,64,0.15);border-radius:7px;padding:8px 10px;">
              <div style="font-size:0.58rem;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px">📅 Mês Filtrado</div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                <span style="font-size:0.62rem;color:var(--muted)">Prov.</span>
                <span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:700;color:var(--text2)">${fmt(g.provMes)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                <span style="font-size:0.62rem;color:var(--muted)">Gasto</span>
                <span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:700;color:#ef4444">${fmt(g.gastoMes)}</span>
              </div>
              <div style="height:1px;background:var(--border);margin:4px 0;"></div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.62rem;color:var(--muted)">Disponível</span>
                <span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:800;color:${saldoMesColor}">${g.saldoMes>=0?'':'-'}${fmt(Math.abs(g.saldoMes))}</span>
              </div>
            </div>
            <!-- Acumulado -->
            <div class="prov-projecao-caixa" style="background:rgba(79,168,255,0.05);border:1px solid rgba(79,168,255,0.15);border-radius:7px;padding:8px 10px;">
              <div style="font-size:0.58rem;font-weight:700;color:var(--accent2);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px">📊 Projeção Caixa</div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                <span style="font-size:0.62rem;color:var(--muted)">Prov.</span>
                <span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:700;color:var(--accent2)">${fmt(g.provAcum)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                <span style="font-size:0.62rem;color:var(--muted)">Gasto</span>
                <span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:700;color:#ef4444">${fmt(g.gastoAcum)}</span>
              </div>
              <div style="height:1px;background:var(--border);margin:4px 0;"></div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.62rem;color:var(--muted)">Disponível</span>
                <span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:800;color:${saldoAcumColor}">${g.saldoAcum>=0?'':'-'}${fmt(Math.abs(g.saldoAcum))}</span>
              </div>
              ${g.saldoAcum<0?`<div style="margin-top:6px;padding:4px 8px;background:rgba(248,113,113,0.1);border-radius:5px;font-size:0.62rem;color:#F87171;font-weight:600;text-align:center">Estourou ${fmt(Math.abs(g.saldoAcum))}</div>`:''}
            </div>
          </div>
          <!-- Ações -->
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            <button onclick="verMovimentosProvisao('${g.categoria}','${g.subCategoria||''}')" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.40);color:var(--accent2);border-radius:6px;padding:5px 10px;font-size:0.73rem;font-weight:700;cursor:pointer;flex:1">📂 Movimentos</button>
            <button onclick="openProvModal('${g.groupId}')" style="background:rgba(79,168,255,0.10);border:1px solid rgba(79,168,255,0.30);color:#4fa8ff;border-radius:6px;padding:5px 10px;font-size:0.73rem;font-weight:700;cursor:pointer;">✎ Editar</button>
            <button onclick="deleteProv('${g.groupId}','forward')" title="Excluir a partir de hoje" style="background:rgba(240,192,64,0.08);border:1px solid rgba(240,192,64,0.25);color:var(--text2);border-radius:6px;padding:5px 8px;font-size:0.73rem;cursor:pointer;font-weight:700;">⏩</button>
            <button onclick="deleteProv('${g.groupId}','all')" style="background:rgba(240,80,96,0.12);border:1px solid rgba(240,80,96,0.3);color:var(--danger);border-radius:6px;padding:5px 8px;font-size:0.73rem;cursor:pointer;font-weight:700;">✕</button>
          </div>
        </div>
        <div id="drill_${drillId}" style="display:none;margin-bottom:8px;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
          <div id="drillFilters_${drillId}" style="padding:10px 14px 0;"></div>
          <div style="padding:0;max-height:320px;overflow-y:auto;overflow-x:auto;" id="drillContent_${drillId}"></div>
        </div>`;
      }

      return `<tr style="background:${bg}">
        <td style="padding:8px 12px;border:1px solid var(--border);">
          <div style="font-weight:700;cursor:pointer;color:var(--text)" onclick="verMovimentosProvisao('${g.categoria}','${g.subCategoria||''}')" title="Ver movimentos desta categoria">
            ${g.categoria} <span style="font-size:0.65rem;color:var(--muted);opacity:0.7">▼</span>
          </div>
          ${g.subCategoria ? `<div style="font-size:0.7rem;color:var(--text2);margin-top:1px">› ${g.subCategoria}</div>` : ''}
          <div style="font-size:0.68rem;color:var(--text2);margin-top:2px">${nMeses}m · próx: ${proxStr}</div>
        </td>
        ${numTd(g.provMes, acB)}
        ${numTd(g.gastoMes)}
        ${saldoTd(g.saldoMes)}
        <td style="padding:8px 10px;border:1px solid var(--border);text-align:center">
          ${pctBadge(pct)}
          ${pct>100?`<div style="font-size:0.62rem;color:#F87171;margin-top:3px;font-weight:600">+${fmt(g.gastoAcum-g.provAcum)}</div>`:''}
        </td>
        <td style="padding:4px 6px;border:1px solid var(--border);text-align:center;white-space:nowrap">
          <button onclick="verMovimentosProvisao('${g.categoria}','${g.subCategoria||''}')" title="Ver movimentação desta categoria" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.40);color:var(--accent2);border-radius:5px;padding:2px 8px;font-size:0.72rem;font-weight:700;cursor:pointer;margin-right:4px">+ mov.</button>
          <button class="del-btn" title="Editar" style="color:var(--text2);margin-right:3px" onclick="openProvModal('${g.groupId}')">✎</button>
          <button class="del-btn" title="Excluir a partir de hoje" style="color:var(--accent2)" onclick="deleteProv('${g.groupId}','forward')">⏩</button>
          <button class="del-btn" title="Excluir tudo" style="color:var(--red);margin-left:3px" onclick="deleteProv('${g.groupId}','all')">✕</button>
        </td>
      </tr>
      <tr id="drill_${(g.categoria+(g.subCategoria?'_'+g.subCategoria:'')).replace(/[\s|]/g,'_')}" style="display:none">
        <td colspan="6" style="padding:0;border:1px solid var(--border);background:var(--surface)">
          <div id="drillFilters_${(g.categoria+(g.subCategoria?'_'+g.subCategoria:'')).replace(/[\s|]/g,'_')}" style="padding:10px 16px 0;"></div>
          <div style="padding:0;max-height:320px;overflow-y:auto;overflow-x:auto;" id="drillContent_${(g.categoria+(g.subCategoria?'_'+g.subCategoria:'')).replace(/[\s|]/g,'_')}">
          </div>
        </td>
      </tr>`;
    }).join('');

    // Totais dos grupos filtrados
    const fProvMes  = gruposFiltrados.reduce((s,g)=>s+g.provMes,0);
    const fGastoMes = gruposFiltrados.reduce((s,g)=>s+g.gastoMes,0);
    const fSaldoMes = fProvMes - fGastoMes;
    const fProvAcum  = gruposFiltrados.reduce((s,g)=>s+g.provAcum,0);
    const fGastoAcum = gruposFiltrados.reduce((s,g)=>s+g.gastoAcum,0);
    const fSaldoAcum = fProvAcum - fGastoAcum;
    const pctTotAcum = fProvAcum>0 ? Math.round(fGastoAcum/fProvAcum*100) : 0;
    const totBg = rowBg(pctTotAcum);
    if (isMobProv) {
      // Mobile: show card container, hide table panel
      const provTable = tbody.closest('table');
      const _pPanel = document.getElementById('provTablePanel') || (provTable ? provTable.closest('.panel') : null);
      if (_pPanel) _pPanel.classList.add('ap-hidden-mobile');
      const provCardCont = document.getElementById('provCardContainer');
      if (provCardCont) {
        provCardCont.style.display = 'block';
        const pctTotMes = fProvMes>0 ? Math.round(fGastoMes/fProvMes*100) : 0;
        const totBarColor = pctTotAcum>100?'#ef4444':pctTotAcum>75?'#f59e0b':'#22c55e';
        const totBarW = Math.min(pctTotAcum,100);
        const totSaldoMesC = fSaldoMes>=0?'#22c55e':'#ef4444';
        const totSaldoAcumC = fSaldoAcum>=0?'#22c55e':'#ef4444';
        const totalCard = `<div style="background:var(--surface2);border:1px solid rgba(240,192,64,0.3);border-top:2px solid var(--accent);border-radius:10px;padding:12px 14px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:0.65rem;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:0.07em">📦 TOTAL${filtroStr?' (filtrado)':''}</span>
            <span style="font-size:0.82rem;font-weight:800;color:${totBarColor};background:${totBarColor}18;padding:3px 10px;border-radius:20px">${pctTotAcum}%</span>
          </div>
          <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:999px;margin-bottom:10px;">
            <div style="height:5px;border-radius:3px;width:${totBarW}%;background:${totBarColor};transition:width 0.4s"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <div style="background:rgba(240,192,64,0.05);border:1px solid rgba(240,192,64,0.15);border-radius:7px;padding:8px 10px;">
              <div style="font-size:0.58rem;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px">📅 Mês Filtrado</div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:0.62rem;color:var(--muted)">Prov.</span><span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:700;color:var(--text2)">${fmt(fProvMes)}</span></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:0.62rem;color:var(--muted)">Gasto</span><span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:700;color:#ef4444">${fmt(fGastoMes)}</span></div>
              <div style="height:1px;background:var(--border);margin:4px 0;"></div>
              <div style="display:flex;justify-content:space-between;"><span style="font-size:0.62rem;color:var(--muted)">Disponível</span><span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:800;color:${totSaldoMesC}">${fSaldoMes>=0?'':'-'}${fmt(Math.abs(fSaldoMes))}</span></div>
            </div>
            <div class="prov-projecao-caixa" style="background:rgba(79,168,255,0.05);border:1px solid rgba(79,168,255,0.15);border-radius:7px;padding:8px 10px;">
              <div style="font-size:0.58rem;font-weight:700;color:var(--accent2);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px">📊 Projeção Caixa</div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:0.62rem;color:var(--muted)">Prov.</span><span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:700;color:var(--accent2)">${fmt(fProvAcum)}</span></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:0.62rem;color:var(--muted)">Gasto</span><span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:700;color:#ef4444">${fmt(fGastoAcum)}</span></div>
              <div style="height:1px;background:var(--border);margin:4px 0;"></div>
              <div style="display:flex;justify-content:space-between;"><span style="font-size:0.62rem;color:var(--muted)">Disponível</span><span style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:800;color:${totSaldoAcumC}">${fSaldoAcum>=0?'':'-'}${fmt(Math.abs(fSaldoAcum))}</span></div>
            </div>
          </div>
        </div>`;
        provCardCont.innerHTML = rows + totalCard;
      }
      tbody.innerHTML = '';
    } else {
      // Desktop: restore
      const provTable = tbody.closest('table');
      const _pPanel2 = document.getElementById('provTablePanel') || (provTable ? provTable.closest('.panel') : null);
      if (_pPanel2) _pPanel2.classList.remove('ap-hidden-mobile');
      const provCardCont = document.getElementById('provCardContainer');
      if (provCardCont) provCardCont.style.display = 'none';
      if (provTable) provTable.querySelector('thead') && (provTable.querySelector('thead').style.display = '');
      tbody.innerHTML = rows + `<tr style="background:rgba(255,255,255,0.04);border-top:2px solid rgba(255,255,255,0.08);font-weight:800;font-size:0.88rem">
        <td style="padding:8px 12px;border:1px solid var(--border)">TOTAL${filtroStr?' (filtrado)':''}</td>
        ${numTd(fProvMes, acB)}
        ${numTd(fGastoMes)}
        ${saldoTd(fSaldoMes)}
        <td style="padding:8px 10px;border:1px solid var(--border);text-align:center">${pctBadge(pctTotAcum)}</td>
        <td style="border:1px solid var(--border)"></td>
      </tr>`;
    }
  }

  // ── Mini cards mês vigente ─────────────────────────────────────────────
  const el2 = document.getElementById('provResumo');
  if (!grupos.length) { el2.innerHTML=''; return; }
  const filtroEl2 = document.getElementById('provFiltroCat');
  const filtroStr2 = filtroEl2 ? filtroEl2.value.toLowerCase().trim() : '';
  const gruposCards = filtroStr2 ? grupos.filter(g => g.categoria.toLowerCase().includes(filtroStr2)) : grupos;
  el2.innerHTML = gruposCards.map(g => {
    const pct = g.provMes>0 ? Math.min(Math.round(g.gastoMes/g.provMes*100),100) : 0;
    const pctR = g.provMes>0 ? Math.round(g.gastoMes/g.provMes*100) : 0;
    const barC = pctR>100?'#F87171':pctR>75?'#FACC15':'#4ADE80';
    const subLabel = g.subCategoria ? `<div style="font-size:0.65rem;color:var(--text2);margin-top:1px">› ${g.subCategoria}</div>` : '';
    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;cursor:pointer" onclick="verMovimentosProvisao('${g.categoria}','${g.subCategoria||''}')">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
        <span style="font-weight:700;font-size:0.78rem">${g.categoria}</span>
        <span style="font-size:0.72rem;font-weight:800;color:${barC}">${pctR > 999 ? "999%+" : pctR + "%"}</span>
      </div>
      ${subLabel}
      <div style="height:5px;background:var(--border);border-radius:3px;margin-bottom:7px;margin-top:6px">
        <div style="height:5px;border-radius:999px;width:${pct}%;background:linear-gradient(90deg,#22c55e,#facc15,#ef4444);transition:width 0.4s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text2)">
        <span>${fmt(g.gastoMes)} gasto</span><span>${fmt(g.provMes)} prov.</span>
      </div>
    </div>`;
  }).join('');
}

function verMovimentosProvisao(cat, subCat) {
  subCat = subCat || '';
  const safeId = (cat + (subCat ? '_'+subCat : '')).replace(/[\s|]/g,'_');
  const row = document.getElementById('drill_' + safeId);
  const content = document.getElementById('drillContent_' + safeId);
  if (!row || !content) return;

  const isOpen = row.style.display !== 'none';
  document.querySelectorAll('[id^="drill_"]').forEach(r => { r.style.display = 'none'; });
  if (isOpen) return;

  const titulo = subCat ? `${cat} › ${subCat}` : cat;
  const catObj = loadCats().find(c => c.nome === cat);
  const subs = (catObj?.subs||[]).map(s => typeof s==='string'?s:s.nome);
  const subOpts = subs.map(s => `<option value="${s}"${s===subCat?' selected':''}>${s}</option>`).join('');

  // Filtros vão para drillFilters (fora do scroll), tabela fica em drillContent
  const filtersEl = document.getElementById('drillFilters_' + safeId);
  if (filtersEl) {
    filtersEl.innerHTML =
      `<div id="pmov-filters-${safeId}" data-cat="${cat.replace(/"/g,'&quot;')}" data-subcat="${(subCat||'').replace(/"/g,'&quot;')}"
        style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0 10px;border-bottom:1px solid var(--border)">
        <span style="font-weight:700;font-size:0.82rem;color:var(--accent2)">Movimentos — ${titulo}</span>
        <input type="text" id="pmov-busca-${safeId}" placeholder="🔍 Buscar..."
          oninput="_refilterProvMov('${safeId}')"
          style="flex:1;min-width:140px;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 10px;border-radius:7px;font-size:0.76rem">
        <select id="pmov-subcat-${safeId}" onchange="_refilterProvMov('${safeId}')"
          style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:7px;font-size:0.76rem">
          <option value="">Todas sub-cat.</option>${subOpts}
        </select>
        <select id="pmov-status-${safeId}" onchange="_refilterProvMov('${safeId}')"
          style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:7px;font-size:0.76rem">
          <option value="">Todos status</option>
          <option value="pendente">⏳ Pendente</option>
          <option value="pago">✓ Pago</option>
        </select>
        <select id="pmov-tipo-${safeId}" onchange="_refilterProvMov('${safeId}')"
          style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:7px;font-size:0.76rem">
          <option value="">Todos tipos</option>
          <option value="variavel">Variável</option>
          <option value="parcelado">Parcelado</option>
        </select>
        <span id="pmov-total-${safeId}" style="font-size:0.76rem;color:var(--red);font-weight:700;margin-left:auto"></span>
      </div>`;
  }
  content.innerHTML = `<div id="pmov-table-${safeId}"></div>`;

  row.style.display = '';
  _refilterProvMov(safeId);
}

function _refilterProvMov(safeId) {
  const el = document.getElementById('pmov-filters-'+safeId);
  if (!el) return;
  _renderProvMovTable(safeId, el.getAttribute('data-cat'), el.getAttribute('data-subcat')||'');
}

function _renderProvMovTable(safeId, cat, subCat) {
  const tableEl = document.getElementById('pmov-table-'+safeId);
  const totalEl = document.getElementById('pmov-total-'+safeId);
  if (!tableEl) return;

  const busca    = (document.getElementById('pmov-busca-'+safeId)?.value||'').toLowerCase();
  const filtSub  = document.getElementById('pmov-subcat-'+safeId)?.value||'';
  const filtSt   = document.getElementById('pmov-status-'+safeId)?.value||'';
  const filtTipo = document.getElementById('pmov-tipo-'+safeId)?.value||'';

  const allData = loadDataBanco();
  const movsDedup = allData.filter(l => {
    if (l.tipo !== 'despesa' || l.valor <= 0) return false;
    if (l.categoria !== cat) return false;
    if (subCat && (l.subCategoria||'') !== subCat) return false;
    if (!_inRange(l)) return false;
    if (l.tipoLanc === 'fixo') return false;
    if (l.tipoLanc === 'parcelado') {
      const parc = l.parcAtual || parseInt((l.desc||'').match(/\((\d+)\/\d+\)$/)?.[1]||'0');
      if (parc !== 1) return false;
    }
    if (filtSub  && (l.subCategoria||'') !== filtSub) return false;
    if (filtSt   && l.status !== filtSt) return false;
    if (filtTipo && (l.tipoLanc||'variavel') !== filtTipo) return false;
    if (busca    && !(l.desc||'').toLowerCase().includes(busca)) return false;
    return true;
  }).sort((a,b) => {
    const da = (a.data||''), db = (b.data||'');
    if (da !== db) return db.localeCompare(da);
    return (a.desc||'').localeCompare(b.desc||'');
  });

  if (totalEl) totalEl.textContent = movsDedup.length
    ? `Total: ${fmt(movsDedup.reduce((s,l)=>s+_valorExib(l),0))} · ${movsDedup.length} itens` : '';

  if (!movsDedup.length) {
    tableEl.innerHTML = '<div class="empty-state" style="padding:16px">Nenhum movimento encontrado.</div>';
    return;
  }

  const rows = movsDedup.map(function(l) {
    var parcela = '—';
    if (l.tipoLanc === 'parcelado') {
      var pm = l.parcAtual ? [null, l.parcAtual+'/'+l.parcTotal] : (l.desc||'').match(/\((\d+\/\d+)\)$/);
      if (pm) parcela = pm[1]; else if (l.totalParcelas) parcela = '?/'+l.totalParcelas;
    }
    var parcelaColor = parcela!=='—'?'var(--accent)':'var(--muted)';
    var descClean = (l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/, '');
    var parcBadge = l.parcAtual ? '<span style="background:rgba(240,144,64,0.85);color:#000;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-left:5px">'+l.parcAtual+'/'+l.parcTotal+'</span>' : '';
    var statusCls = l.status==='pago'?'receita':'pendente';
    var lid = String(l.id).replace(/'/g,"\\'");
    var catSubs = (loadCats().find(function(c){ return c.nome===l.categoria; })?.subs||[]).map(function(s){ return typeof s==='string'?s:s.nome; });
    return '<tr style="border-top:1px solid var(--border)" id="provmov-row-'+l.id+'">'
      +'<td style="padding:5px 8px;color:var(--text2);white-space:nowrap">'+String(l.mes).padStart(2,'0')+'/'+l.ano+'</td>'
      +'<td style="padding:5px 8px;font-weight:500">'+descClean+parcBadge+'</td>'
      +'<td style="padding:5px 8px;font-size:0.72rem;color:var(--muted)" id="provmov-cat-'+l.id+'">'+(l.categoria||'—')+(l.subCategoria?'<span style="color:var(--text2);margin-left:4px">› '+l.subCategoria+'</span>':'')+'</td>'
      +'<td style="padding:5px 8px;text-align:center;font-weight:700;color:'+parcelaColor+';font-family:Space Mono,monospace;font-size:0.75rem">'+parcela+'</td>'
      +'<td style="padding:5px 8px;color:var(--muted);font-size:0.72rem">'+(l.tipoLanc||'variável')+'</td>'
      +'<td style="padding:5px 8px;text-align:right;color:#dc2626;font-weight:600">'+fmt(_valorExib(l))+'</td>'
      +'<td style="padding:5px 8px"><span class="badge badge-'+statusCls+'">'+(l.status||'—')+'</span></td>'
      +'<td style="padding:5px 8px;text-align:center"><button onclick="_provMovEditCat(\''+lid+'\')" style="background:rgba(255,255,255,0.08);border:1px solid rgba(240,192,64,0.3);color:var(--text2);border-radius:5px;padding:2px 8px;font-size:0.68rem;cursor:pointer">✎</button></td>'
      +'</tr>'
      +'<tr id="provmov-edit-'+l.id+'" style="display:none;background:rgba(0,0,0,0.15)">'
      +'<td colspan="8" style="padding:8px 12px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      +'<span style="font-size:0.7rem;color:var(--muted)">Categoria:</span>'
      +'<select id="provmov-selcat-'+l.id+'" onchange="_provMovSubCatUpdate(\''+lid+'\')" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:6px;font-size:0.75rem">'
      +loadCats().map(function(c){ return '<option value="'+c.nome+'"'+(c.nome===l.categoria?' selected':'')+'>'+( c.icone||'')+' '+c.nome+'</option>'; }).join('')+'</select>'
      +'<span style="font-size:0.7rem;color:var(--muted)">Sub-cat:</span>'
      +'<select id="provmov-selsub-'+l.id+'" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:6px;font-size:0.75rem">'
      +'<option value="">— Nenhuma —</option>'
      +catSubs.map(function(s){ return '<option value="'+s+'"'+(s===l.subCategoria?' selected':'')+'>'+s+'</option>'; }).join('')+'</select>'
      +'<button onclick="_provMovSaveCat(\''+lid+'\')" style="background:var(--accent);color:#000;border:none;border-radius:6px;padding:4px 12px;font-size:0.75rem;font-weight:700;cursor:pointer">✓ Salvar</button>'
      +'<button onclick="document.getElementById(\'provmov-edit-'+l.id+'\').style.display=\'none\'" style="background:none;border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:4px 10px;font-size:0.75rem;cursor:pointer">✕</button>'
      +'</div></td></tr>';
  }).join('');

  const _thSt = 'padding:5px 8px;position:sticky;top:0;z-index:10;background:var(--surface2);color:var(--text2);text-align:left';
  tableEl.innerHTML = '<div class="table-scroll-wrap"><table style="width:100%;border-collapse:separate;border-spacing:0;font-size:0.78rem">'
    +'<thead><tr>'
    +'<th style="'+_thSt+'">Mês/Ano</th><th style="'+_thSt+'">Descrição</th>'
    +'<th style="'+_thSt+'">Categoria</th><th style="'+_thSt+';text-align:center">Parcela</th>'
    +'<th style="'+_thSt+'">Tipo</th><th style="'+_thSt+';text-align:right">Valor</th>'
    +'<th style="'+_thSt+'">Status</th><th style="'+_thSt+';text-align:center">✎</th>'
    +'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}


function _provMovEditCat(id) {
  // Toggle edit row
  const row = document.getElementById('provmov-edit-'+id);
  if (!row) return;
  const isOpen = row.style.display !== 'none';
  document.querySelectorAll('[id^="provmov-edit-"]').forEach(r => r.style.display = 'none');
  if (!isOpen) row.style.display = '';
}

function _provMovSubCatUpdate(id) {
  // Update sub-cat options when categoria changes
  const catSel = document.getElementById('provmov-selcat-'+id);
  const subSel = document.getElementById('provmov-selsub-'+id);
  if (!catSel || !subSel) return;
  const cat = loadCats().find(c => c.nome === catSel.value);
  const subs = (cat?.subs || []).map(s => typeof s === 'string' ? s : s.nome);
  subSel.innerHTML = '<option value="">— Nenhuma —</option>' + subs.map(s => `<option value="${s}">${s}</option>`).join('');
}

function _provMovSaveCat(id) {
  const catSel = document.getElementById('provmov-selcat-'+id);
  const subSel = document.getElementById('provmov-selsub-'+id);
  if (!catSel) return;
  const newCat = catSel.value;
  const newSub = subSel ? subSel.value : '';

  // Save to data
  const data = loadData();
  const idx = data.findIndex(x => String(x.id) === String(id));
  if (idx !== -1) {
    data[idx] = { ...data[idx], categoria: newCat, subCategoria: newSub };
    saveData(data);
  }

  // Hide edit row
  const editRow = document.getElementById('provmov-edit-'+id);
  if (editRow) editRow.style.display = 'none';

  // Check if this item still belongs to the current drill-down category
  // Find which drill-down is open
  const openDrill = document.querySelector('[id^="drill_"][style*="display: block"], [id^="drill_"]:not([style*="none"])');
  const drillCat = openDrill ? openDrill.id.replace('drill_','').replace(/_/g,' ') : null;

  const isSameCat = newCat === (data[idx]?.categoria || newCat);
  // Get original cat from the row before save
  const origCatMatch = document.getElementById('provmov-cat-'+id);

  // Update category cell
  if (origCatMatch) {
    origCatMatch.innerHTML = newCat + (newSub ? '<span style="color:var(--text2);margin-left:4px">› '+newSub+'</span>' : '');
  }

  // If category changed away from current drill-down, hide the row
  const mainRow = document.getElementById('provmov-row-'+id);
  if (mainRow) {
    // Find the open drill-down to get its category
    const openContent = mainRow.closest('[id^="drillContent_"]');
    if (openContent) {
      const drillId = openContent.id.replace('drillContent_','');
      // drillId format: "Categoria_SubCat" or "Categoria"
      const parts = drillId.split('_');
      const drillCatName = parts[0].replace(/_/g,' ');
      const drillSubName = parts.length > 1 ? parts.slice(1).join(' ') : '';
      const stillMatches = newCat.replace(/\s/g,'_') === drillCatName.replace(/\s/g,'_') &&
        (!drillSubName || newSub === drillSubName);
      if (!stillMatches) {
        // Fade and remove the row
        mainRow.style.opacity = '0.3';
        mainRow.style.transition = 'opacity 0.4s';
        setTimeout(() => {
          mainRow.style.display = 'none';
          if (editRow) editRow.style.display = 'none';
        }, 400);
      }
    }
  }

  // Silently update totals in background — preserve drill-down open state
  // Use requestIdleCallback to update numbers without closing the drill-down
  if (window.requestIdleCallback) {
    requestIdleCallback(() => {
      // Update only the orçamento summary numbers, not the table rows
      try {
        const r = calcProvisaoAcumulada();
        const cards = document.getElementById('provCards');
        const cardsTab = document.getElementById('provCardsTab');
        // Just trigger a light re-render of cards only, not the table
        if (typeof renderProvisaoCards === 'function') renderProvisaoCards();
      } catch(e) {}
    });
  }
}

function deleteProv(groupId, mode) {
  // mode: 'all' | 'forward' (from current month onwards)
  if (!confirm(mode === 'all'
    ? 'Excluir todas as entradas desta orçamento?'
    : 'Excluir esta orçamento a partir do mês atual?')) return;
  let provs = loadProvisoes();
  if (mode === 'all') {
    provs = provs.filter(p => p.groupId !== groupId);
  } else {
    // forward: remove entries from currentMonth/currentYear onwards
    provs = provs.filter(p => {
      if (p.groupId !== groupId) return true;
      return (p.ano < currentYear) || (p.ano === currentYear && p.mes < currentMonth);
    });
  }
  saveProvisoes(provs);
  safeRender(() => renderAll());
}

// Close modal on overlay click
// Close modal on overlay click — só fecha se o mousedown também foi no overlay (evita fechar ao arrastar texto)
(function() {
  var _mousedownInsideModal = false;
  var overlay = document.getElementById('modalOverlay');
  overlay.addEventListener('mousedown', function(e) {
    _mousedownInsideModal = e.target !== overlay;
  });
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay && !_mousedownInsideModal) closeModal();
    _mousedownInsideModal = false;
  });
})();
document.getElementById('provModalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeProvModal(); });
document.getElementById('saldoInicialOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeSaldoInicialModal(); });
document.getElementById('catModalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeCatModal(); });
document.getElementById('subCatModalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeSubCatModal(); });
document.getElementById('deleteParcelasOverlay').addEventListener('click', function(e) { if (e.target === e.currentTarget) { e.currentTarget.classList.remove('open'); if (_deleteParcelasResolve) { _deleteParcelasResolve(null); _deleteParcelasResolve = null; } } });
document.getElementById('importModalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeImportModal(); });


// ═══════════════════════════════════════════════════════
//  IMPORTAÇÃO DE FATURA XLS + SUGESTÃO DE CATEGORIA
// ═══════════════════════════════════════════════════════

var importParsedRows = [];
var _pendingSugestao = null;
var _pendingSubSugestao = null;

// ── Persistência de mapeamentos aprendidos ──
function loadCatMap()  { try { return JSON.parse(_lsGet('fos_catmap', '{}')); } catch { return {}; } }
function saveCatMap(m) { try { _lsSet('fos_catmap', JSON.stringify(m)); } catch {} }
function loadSubMap()  { try { return JSON.parse(_lsGet('fos_submap', '{}')); } catch { return {}; } }
function saveSubMap(m) { try { _lsSet('fos_submap', JSON.stringify(m)); } catch {} }

function normDesc(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 *]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Regras por palavra-chave: categoria (usa c.nome como value) ──
const CAT_RULES = [
  { kw: ['shopee','mercadolivre','amazon','aliexpress','shein','casas bahia','americanas','casasbahiacom'], cat: 'Gastos Variaveis' },
  { kw: ['uber','99app','99 ride','cabify','ifood','rappi','ze delivery','dl*99'], cat: 'Gastos Variaveis' },
  { kw: ['spotify','netflix','disney','apple','globoplay','hbo','prime','dm*spotify','applecombill','ebn*sony','sonyplay','hbl*hbl'], cat: 'Gastos Variaveis' },
  { kw: ['restaurante','pizza','mcdonalds','mc donalds','burger','padaria','sushi','lanche','trilha','amore mio','maraton','ar foods','lb casa','d avo'], cat: 'Gastos Variaveis' },
  { kw: ['supermercado','hortifruti','sacolao','carrefour','atacadao','assai','nagumo','mp *hortifrutiw','zhanpeiyang','supermercadonovo'], cat: 'Supermercado' },
  { kw: ['mercado'], cat: 'Supermercado' },
  { kw: ['drogaria','farmacia','drogasil','panvel','drogariasp','droga leste','drogaria_sp'], cat: 'Saude' },
  { kw: ['academia','gym','crossfit','pilates','sportclub','gavioes','dsvc sports','sua academia'], cat: 'Academia/Esportes' },
  { kw: ['porto seguro cia'], cat: 'Carro' },
  { kw: ['loovi','panoramaauto','divauto','dsvc','rochachaveirose','centro automotivo','areatec'], cat: 'Carro' },
  { kw: ['ipva','pgconta ipva','multa tran','pgconta multa','pgz*despachan'], cat: 'Carro' },
  { kw: ['posto','gasolina','combustivel','etanol','diesel','black horse','formula'], cat: 'Combustível' },
  { kw: ['pedagio','sem parar','veloe','pg *sb epr'], cat: 'Carro' },
  { kw: ['estacionamento','951 park','beneton'], cat: 'Carro' },
  { kw: ['seguro','unimed','amil','hapvida'], cat: 'Saude' },
  { kw: ['escola','faculdade','curso','udemy','alura'], cat: 'Educação' },
  { kw: ['enel','cpfl','flexpag*enelsp','flexpag*enel'], cat: 'Moradia' },
  { kw: ['tim','vivo','claro','conta vivo','conta tim','telecom'], cat: 'Moradia' },
  { kw: ['juros','iof','encargos','tarifa'], cat: 'Tarifas Bancárias' },
  { kw: ['salario','holerite'], cat: 'Salario' },
  { kw: ['suplemento','whey','creatina'], cat: 'Suplementos' },
  { kw: ['loovi'], cat: 'Carro' },
  { kw: ['estilo estilo','la belly','perfumaria'], cat: 'Supermercado' },
];

// ── Regras por palavra-chave: sub-categoria (usa s.nome) ──
const SUB_RULES = {
  'Gastos Variaveis': [
    { kw: ['uber','99app','99 ride','cabify','dl*99'], sub: 'Uber / Frete' },
    { kw: ['shopee','mercadolivre','amazon','aliexpress','shein','casasbahiacom'], sub: 'Roupas' },
    { kw: ['ifood','rappi','ze delivery','mcdonalds','burger','restaurante','pizza','lanche','trilha','amore mio','maraton','ar foods','lb casa','barraca','d avo'], sub: 'Alimentação' },
    { kw: ['spotify','netflix','disney','hbo','prime','apple','globoplay','sonyplay','ebn*sony','applecombill','dm*spotify'], sub: 'Game e Jogos' },
    { kw: ['hbl*hbl','milhas','latam','passagem'], sub: 'Passagem aerea' },
    { kw: ['estacionamento','951 park','beneton'], sub: 'Estacionamento' },
    { kw: ['pedagio','pg *sb epr'], sub: 'Pedágios' },
    { kw: ['drogaria','farmacia','drogasil','droga leste'], sub: 'Farmácia' },
    { kw: ['pix '], sub: 'Pix Diversos' },
    { kw: ['loovi'], sub: 'Uber / Frete' },
  ],
  'Supermercado': [
    { kw: ['hortifruti','mp *hortifrutiw','fruta','sacolao'], sub: 'Feira' },
    { kw: ['padaria','paes','lb casa de paes','bom sabor'], sub: 'Padaria' },
    { kw: ['carnes','acougue','mlr comercio','barraca do jose','carnes e aves'], sub: 'Açougue' },
    { kw: ['perfumaria','sofie','gloss','la belly','estilo estilo'], sub: 'Perfumaria' },
    { kw: ['supermercado','nagumo','zhanpeiyang','supermercadonovo'], sub: 'Mercado' },
    { kw: ['carrefour','pg*carrefour'], sub: 'Mercado' },
  ],
  'Saude': [
    { kw: ['drogaria','farmacia','drogasil','droga'], sub: 'Remédio' },
    { kw: ['consulta','medic','clinica'], sub: 'Consulta Medica' },
    { kw: ['unimed','amil','hapvida','convenio'], sub: 'Convenio' },
    { kw: ['vacina'], sub: 'Vacina' },
    { kw: ['seguro','porto seguro'], sub: 'Convenio' },
  ],
  'Carro': [
    { kw: ['porto seguro cia'], sub: 'Seguro' },
    { kw: ['ipva','pgconta ipva'], sub: 'Documento' },
    { kw: ['multa','pgconta multa','pgz*despachan'], sub: 'Documento' },
    { kw: ['mecanica','oficina','divauto','conc','panoramaauto','piem','areatec','centro automotivo','rochachaveirose'], sub: 'Mecanica' },
    { kw: ['loovi'], sub: 'Acessorios Carro' },
    { kw: ['pedagio','pg *sb epr','sem parar'], sub: 'Documento' },
    { kw: ['estacionamento','951 park','beneton','pg *pare'], sub: 'Acessorios Carro' },
  ],
  'Combustível': [
    { kw: ['posto','gasolina','etanol','diesel','black horse','formula'], sub: 'Combustível' },
  ],
  'Moradia': [
    { kw: ['enel','cpfl','flexpag*enelsp'], sub: 'Concessionárias' },
    { kw: ['tim','vivo','claro','conta vivo','conta tim'], sub: 'Telefonia' },
    { kw: ['spotify','netflix','disney','apple','applecombill'], sub: "Streaming / App's" },
  ],
  'Educação': [
    { kw: ['curso','udemy','alura','faculdade'], sub: 'Curso' },
  ],
  'Academia/Esportes': [
    { kw: ['academia','gym','gavioes','sportclub','dsvc','sua academia'], sub: 'Academia/Esportes' },
  ],
};

function suggestCat(desc) {
  if (!desc) return null;
  const n = normDesc(desc);
  // 1. Learned exact
  const m = loadCatMap();
  if (m[n]) return m[n];
  // 2. Prefix learned
  for (var k in m) {
    if (n.startsWith(k) || (k.length >= 8 && n.slice(0,8) === k.slice(0,8))) return m[k];
  }
  // 3. Keyword rules
  for (var i = 0; i < CAT_RULES.length; i++) {
    var rule = CAT_RULES[i];
    for (var j = 0; j < rule.kw.length; j++) {
      if (n.indexOf(rule.kw[j]) !== -1) return rule.cat;
    }
  }
  return null;
}

function suggestSub(desc, catNome) {
  if (!desc || !catNome) return null;
  var n = normDesc(desc);
  // 1. Learned exact
  var m = loadSubMap();
  if (m[n] && m[n].cat === catNome) return m[n].sub;
  // 2. Prefix learned
  for (var k in m) {
    if (m[k].cat === catNome && (n.startsWith(k) || (k.length >= 8 && n.slice(0,8) === k.slice(0,8)))) return m[k].sub;
  }
  // 3. Keyword rules
  var rules = SUB_RULES[catNome] || [];
  for (var i = 0; i < rules.length; i++) {
    for (var j = 0; j < rules[i].kw.length; j++) {
      if (n.indexOf(rules[i].kw[j]) !== -1) return rules[i].sub;
    }
  }
  return null;
}

function learnCat(desc, catNome) {
  if (!desc || !catNome) return;
  var m = loadCatMap();
  var k = normDesc(desc);
  m[k] = catNome;
  if (k.length > 6) m[k.slice(0,12)] = catNome;
  saveCatMap(m);
}

function learnSub(desc, catNome, subNome) {
  if (!desc || !catNome || !subNome) return;
  var m = loadSubMap();
  var k = normDesc(desc);
  m[k] = { cat: catNome, sub: subNome };
  if (k.length > 6) m[k.slice(0,12)] = { cat: catNome, sub: subNome };
  saveSubMap(m);
}

function learnFromAll() {
  try {
    var lans = loadDataBanco();
    var catMap = loadCatMap();
    var subMap = loadSubMap();
    lans.forEach(function(l) {
      if (!l.categoria || !l.desc) return;
      var clean = l.desc.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
      var k = normDesc(clean);
      catMap[k] = l.categoria;
      if (k.length > 6) catMap[k.slice(0,12)] = l.categoria;
      if (l.subCategoria) {
        subMap[k] = { cat: l.categoria, sub: l.subCategoria };
        if (k.length > 6) subMap[k.slice(0,12)] = { cat: l.categoria, sub: l.subCategoria };
      }
    });
    saveCatMap(catMap);
    saveSubMap(subMap);
  } catch(e) {}
}

// ── Match xlsx category name to app category name (fuzzy, case-insensitive) ──
function normCatKey(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
}

// Static aliases: xlsx name → app name
var CAT_ALIASES = {
  'casa': 'Moradia',
  'casa2': 'Moradia 2',
  'casadois': 'Moradia 2',
  'moradia2': 'Moradia 2',
  'estorno': 'Estorno Receita',
  'estornoreceita': 'Estorno Receita',
};

function matchCatName(xlsxName) {
  if (!xlsxName) return '';
  var cats = loadCats();
  var xk = normCatKey(xlsxName);
  // 0. Static alias map
  if (CAT_ALIASES[xk]) {
    var alias = CAT_ALIASES[xk];
    for (var i = 0; i < cats.length; i++) { if (cats[i].nome === alias) return alias; }
  }
  // 1. Exact match (case-insensitive, accent-insensitive)
  for (var i = 0; i < cats.length; i++) {
    if (normCatKey(cats[i].nome) === xk) return cats[i].nome;
  }
  // 2. Partial match — xlsx name contains app name or vice versa
  for (var i = 0; i < cats.length; i++) {
    var ck = normCatKey(cats[i].nome);
    if (xk.indexOf(ck) !== -1 || ck.indexOf(xk) !== -1) return cats[i].nome;
  }
  return ''; // not found — leave blank
}

function matchSubName(catNome, xlsxSub) {
  if (!xlsxSub) return '';
  var cats = loadCats();
  var cat = null;
  for (var i = 0; i < cats.length; i++) { if (cats[i].nome === catNome) { cat = cats[i]; break; } }
  if (!cat || !cat.subs || !cat.subs.length) return '';
  var xk = normCatKey(xlsxSub);
  var subs = cat.subs.map(function(s){ return typeof s === 'string' ? s : s.nome; });
  // Exact
  for (var i = 0; i < subs.length; i++) { if (normCatKey(subs[i]) === xk) return subs[i]; }
  // Partial
  for (var i = 0; i < subs.length; i++) {
    var sk = normCatKey(subs[i]);
    if (xk.indexOf(sk) !== -1 || sk.indexOf(xk) !== -1) return subs[i];
  }
  return ''; // sub not found — leave blank rather than invalid value
}


function buildCatOpts(selectedNome, tipoFiltro) {
  var cats = loadCats().filter(function(c) {
    if (!tipoFiltro || tipoFiltro === 'despesa') return c.tipo === 'despesa' || c.tipo === 'ambos';
    if (tipoFiltro === 'receita') return c.tipo === 'receita' || c.tipo === 'ambos';
    return true;
  });
  cats.sort(function(a,b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  var html = '<option value="">— Sem categoria —</option>';
  cats.forEach(function(c) {
    html += '<option value="' + c.nome + '"' + (c.nome === selectedNome ? ' selected' : '') + '>' + (c.icone ? c.icone + ' ' : '') + c.nome + '</option>';
  });
  return html;
}

function buildSubOpts(catNome, selectedSub) {
  var cats = loadCats();
  var cat = null;
  for (var i = 0; i < cats.length; i++) { if (cats[i].nome === catNome) { cat = cats[i]; break; } }
  var html = '<option value="">— Nenhuma —</option>';
  if (cat && cat.subs && cat.subs.length) {
    var subs = cat.subs.map(function(s) { return typeof s === 'string' ? s : s.nome; });
    subs.sort(function(a,b) { return a.localeCompare(b, 'pt-BR'); });
    subs.forEach(function(sNome) {
      html += '<option value="' + sNome + '"' + (sNome === selectedSub ? ' selected' : '') + '>' + sNome + '</option>';
    });
  }
  return html;
}

// Called when user changes category select in import table row
function onImportTipoChange(sel) {
  var idx = sel.dataset.idx;
  var v = sel.value;
  var nInput = document.querySelector('.import-nmeses[data-idx="' + idx + '"]');
  if (nInput) nInput.style.display = (v === 'fixo') ? 'block' : 'none';
}

function onImportCatChange(catSel) {
  var idx = parseInt(catSel.dataset.idx);
  var catNome = catSel.value;
  var subSel = document.querySelector('.import-sub-sel[data-idx="' + idx + '"]');
  if (!subSel) return;
  var r = importParsedRows[idx];
  var sugSub = r ? suggestSub(r.desc, catNome) : null;
  subSel.innerHTML = buildSubOpts(catNome, sugSub || '');
  var subBtn = document.querySelector('.import-sub-btn[data-idx="' + idx + '"]');
  if (subBtn) {
    var newVal = subSel.value;
    subBtn.textContent = newVal || '— Nenhuma —';
    subBtn.dataset.sub = newVal;
    subBtn.dataset.userSubSet = ''; // categoria mudou → sub precisa ser re-selecionada pelo usuário
  }

  // Auto-preenche outras linhas com mesma descrição que ainda não têm categoria
  if (catNome && r && r.desc) {
    var descRef = (r.desc || '').toLowerCase().trim();
    importParsedRows.forEach(function(other) {
      if (other._origIdx === idx) return;
      if ((other.desc || '').toLowerCase().trim() !== descRef) return;
      var otherCatSel = document.querySelector('.import-cat-sel[data-idx="' + other._origIdx + '"]');
      if (otherCatSel && !otherCatSel.value) {
        otherCatSel.value = catNome;
        var otherCatBtn = document.querySelector('.import-cat-btn[data-idx="' + other._origIdx + '"]');
        if (otherCatBtn) { otherCatBtn.textContent = catNome; otherCatBtn.dataset.cat = catNome; }
        var otherSubSel = document.querySelector('.import-sub-sel[data-idx="' + other._origIdx + '"]');
        var otherSug = suggestSub(other.desc, catNome);
        if (otherSubSel) {
          otherSubSel.innerHTML = buildSubOpts(catNome, otherSug || '');
          var otherSubBtn = document.querySelector('.import-sub-btn[data-idx="' + other._origIdx + '"]');
          if (otherSubBtn) { otherSubBtn.textContent = otherSug || '— Nenhuma —'; otherSubBtn.dataset.sub = otherSug || ''; }
        }
        other.categoria = catNome;
        if (otherSug) other.subCategoria = otherSug;
      } else if (!otherCatSel) {
        if (!other.categoria) {
          other.categoria = catNome;
          var s = suggestSub(other.desc, catNome);
          if (s && !other.subCategoria) other.subCategoria = s;
        }
      }
    });
  }
}

function onImportSubChange(subSel) {
  var idx = parseInt(subSel.dataset.idx);
  var subNome = subSel.value;
  var r = importParsedRows[idx];
  if (!r || !r.desc) return;
  var catSel = document.querySelector('.import-cat-sel[data-idx="' + idx + '"]');
  var catNome = catSel ? catSel.value : (r.categoria || '');
  if (!catNome || !subNome) return;

  var descRef = (r.desc || '').toLowerCase().trim();
  importParsedRows.forEach(function(other) {
    if (other._origIdx === idx) return;
    if ((other.desc || '').toLowerCase().trim() !== descRef) return;
    var otherCatSel = document.querySelector('.import-cat-sel[data-idx="' + other._origIdx + '"]');
    var otherCat = otherCatSel ? otherCatSel.value : (other.categoria || '');
    if (otherCat !== catNome) return;
    var otherSubSel = document.querySelector('.import-sub-sel[data-idx="' + other._origIdx + '"]');
    if (otherSubSel && !otherSubSel.value) {
      otherSubSel.value = subNome;
      var otherSubBtn = document.querySelector('.import-sub-btn[data-idx="' + other._origIdx + '"]');
      if (otherSubBtn) { otherSubBtn.textContent = subNome; otherSubBtn.dataset.sub = subNome; }
      other.subCategoria = subNome;
    } else if (!otherSubSel && !other.subCategoria) {
      other.subCategoria = subNome;
    }
  });
}

// ── Modal open/close ──
function openImportModal() {
  window._importMode = 'auto';
  try {
    learnFromAll();
    var sel = document.getElementById('importDefaultCat');
    var cats = loadCats().filter(function(c) { return c.tipo !== 'receita'; });
    sel.innerHTML = '<option value="">— Sem categoria —</option>' +
      cats.map(function(c) { return '<option value="' + c.nome + '">' + c.icone + ' ' + c.nome + '</option>'; }).join('');
  } catch(e) { console.warn(e); }
  // Inicializa FSELs dos filtros assim que o modal abre (antes do upload)
  if (window.FSEL) {
    FSEL.build('fsel-impFiltroPgto', 'impFiltroPgto', [{value:'',text:'Todos pagamentos'}], function(){ applyImportFilters(); });
    FSEL.build('fsel-impFiltroTipoLanc', 'impFiltroTipoLanc', [{value:'',text:'Todos os tipos'},{value:'variavel',text:'Variavel'},{value:'parcelado',text:'Parcelado'},{value:'fixo',text:'Fixo'}], function(){ applyImportFilters(); });
    FSEL.build('fsel-impFiltroCat', 'impFiltroCat', [{value:'',text:'Todas categorias'}], function(){ _rebuildImportSubFSEL(); applyImportFilters(); });
    FSEL.build('fsel-impFiltroSub', 'impFiltroSub', [{value:'',text:'Todas sub-cats'}], function(){ applyImportFilters(); });
    FSEL.build('fsel-impFiltroSituacao', 'impFiltroSituacao', [{value:'',text:'Todos'},{value:'novo',text:'Apenas novos'},{value:'dup',text:'Apenas duplicados'}], function(){ applyImportFilters(); });
  }
  document.getElementById('importModalOverlay').classList.add('open');
}

// Importa direto o .xlsx cru exportado pelo app Itaú (Black/Personnalité), sem o modelo.
function openImportItauRaw() {
  window._importMode = 'itau';
  var inp = document.getElementById('importFileInput');
  if (inp) { inp.value = ''; inp.click(); }
}

// Define o vencimento em massa nas linhas do preview de importação.
// all=false → só preenche as linhas SEM vencimento; all=true → sobrescreve todas.
function applyBulkVenc(all) {
  var inp = document.getElementById('bulkVencInput');
  var iso = inp ? inp.value : '';
  if (!iso) { alert('Escolha uma data de vencimento primeiro.'); return; }
  var br = iso.split('-').reverse().join('/');
  var n = 0;
  document.querySelectorAll('.import-venc').forEach(function(el) {
    if (all || !el.value) {
      el.value = iso;
      el.dataset.brval = br;
      // limpa destaque de erro deixado por confirmImport
      el.style.borderColor = 'var(--border)';
      el.style.background = 'var(--surface)';
      el.style.color = 'var(--accent2)';
      el.placeholder = '';
      n++;
    }
  });
  var banner = document.getElementById('importVencBanner');
  if (banner) banner.style.display = 'none';
  if (typeof updateImportTotals === 'function') { try { updateImportTotals(); } catch (e) {} }
}

// Define o pagamento em massa nas linhas do preview de importação.
function applyBulkPgto(all) {
  var sel = document.getElementById('bulkPgtoSelect');
  var val = sel ? sel.value : '';
  if (!val) { alert('Escolha um pagamento primeiro.'); return; }
  var n = 0;
  document.querySelectorAll('.import-pgto').forEach(function(s) {
    if (all || !s.value) {
      var has = Array.prototype.some.call(s.options, function(o) { return o.value === val; });
      if (!has) { var o = document.createElement('option'); o.value = val; o.textContent = val; s.appendChild(o); }
      s.value = val;
      n++;
    }
  });
}

function closeImportModal() {
  document.getElementById('importModalOverlay').classList.remove('open');
  importParsedRows = [];
  document.getElementById('importPreview').style.display = 'none';
  // Limpa filtros ao fechar
  var _fi = ['impFiltroDesc'];
  _fi.forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  if (window.FSEL) {
    ['impFiltroPgto','impFiltroTipoLanc','impFiltroCat','impFiltroSub','impFiltroSituacao'].forEach(function(id){
      FSEL.reset(id);
      var opts = FSEL._optsMap ? FSEL._optsMap[id] : null;
      var inp = document.getElementById('fsi-' + id);
      if (inp && opts && opts[0]) inp.value = opts[0].text;
    });
  }
  var fc = document.getElementById('impFiltroCount'); if(fc) fc.textContent='';
  document.getElementById('btnDoImport').style.display = 'none';
  try { document.getElementById('importFileInput').value = ''; } catch(e) {}
}

function handleImportDrop(e) {
  e.preventDefault();
  document.getElementById('importDropZone').style.borderColor = 'var(--border)';
  window._importMode = 'auto';
  var file = e.dataTransfer.files[0];
  if (file) handleImportFile(file);
}

function handleImportFile(file) {
  if (!file) return;
  if (typeof window !== 'undefined') { window._itauVencimentoBr = ''; window._itauDiag = null; }
  var reader = new FileReader();
  // XLSX = ZIP (magic bytes PK), XLS = OLE2 (magic D0 CF)
  reader.onload = function(e) {
    var buf = e.target.result;
    var magic = new Uint8Array(buf, 0, 4);
    if (magic[0] === 0x50 && magic[1] === 0x4B) {
      // XLSX (ZIP)
      parseXLSX(buf);
    } else {
      parseXLSBinary(buf);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── Native ZIP reader (no external libs) ──────────────────────────────────────
function readZipEntries(buffer) {
  var data = new Uint8Array(buffer);
  var len = data.length;
  var eocd = -1;
  for (var i = len - 22; i >= 0; i--) {
    if (data[i]===0x50&&data[i+1]===0x4B&&data[i+2]===0x05&&data[i+3]===0x06){eocd=i;break;}
  }
  if (eocd < 0) return null;
  var cdOffset = data[eocd+16]|(data[eocd+17]<<8)|(data[eocd+18]<<16)|(data[eocd+19]<<24);
  var cdSize   = data[eocd+12]|(data[eocd+13]<<8)|(data[eocd+14]<<16)|(data[eocd+15]<<24);
  var entries = {};
  var pos = cdOffset;
  while (pos < cdOffset + cdSize && pos < len) {
    if (!(data[pos]===0x50&&data[pos+1]===0x4B&&data[pos+2]===0x01&&data[pos+3]===0x02)) break;
    var compMethod  = data[pos+10]|(data[pos+11]<<8);
    var compSize    = data[pos+20]|(data[pos+21]<<8)|(data[pos+22]<<16)|(data[pos+23]<<24);
    var uncompSize  = data[pos+24]|(data[pos+25]<<8)|(data[pos+26]<<16)|(data[pos+27]<<24);
    var fnLen       = data[pos+28]|(data[pos+29]<<8);
    var extraLen    = data[pos+30]|(data[pos+31]<<8);
    var commentLen  = data[pos+32]|(data[pos+33]<<8);
    var localOffset = data[pos+42]|(data[pos+43]<<8)|(data[pos+44]<<16)|(data[pos+45]<<24);
    var fnBytes = data.slice(pos+46, pos+46+fnLen);
    var fname = '';
    for (var fi=0;fi<fnBytes.length;fi++) fname += String.fromCharCode(fnBytes[fi]);
    entries[fname] = {method:compMethod, compSize:compSize, uncompSize:uncompSize, localOffset:localOffset};
    pos += 46 + fnLen + extraLen + commentLen;
  }
  return entries;
}


// ── Tiny pure-JS inflate (DEFLATE/raw) ───────────────────────────────────────
// Based on Pako's inflate core — handles all XLSX deflate streams
function jsInflateRaw(data) {
  // Use browser native if available (Chrome/Edge/Firefox)
  // Safari fallback uses this pure-JS implementation
  var out = [];
  var i = 0, b, len = data.length;

  // Fixed Huffman length/distance tables (RFC 1951)
  function buildTree(lens, maxBits) {
    var bl_count = new Array(maxBits + 1).fill(0);
    for (var n = 0; n < lens.length; n++) if (lens[n]) bl_count[lens[n]]++;
    var next_code = [0, 0];
    for (var bits = 1; bits <= maxBits; bits++)
      next_code[bits + 1] = (next_code[bits] + bl_count[bits]) << 1;
    var codes = new Array(lens.length);
    for (var n = 0; n < lens.length; n++) {
      if (lens[n]) { codes[n] = next_code[lens[n]]++; }
    }
    return { lens: lens, codes: codes, maxBits: maxBits };
  }

  // Bit reader
  var bits = 0, bitbuf = 0;
  function readBit() {
    if (!bits) { bitbuf = data[i++] || 0; bits = 8; }
    var b = bitbuf & 1; bitbuf >>= 1; bits--; return b;
  }
  function readBits(n) {
    var v = 0;
    for (var j = 0; j < n; j++) v |= readBit() << j;
    return v;
  }
  function readCode(tree) {
    var code = 0, len = 0;
    while (len <= tree.maxBits) {
      code = (code << 1) | readBit(); len++;
      for (var n = 0; n < tree.lens.length; n++)
        if (tree.lens[n] === len && tree.codes[n] === code) return n;
    }
    return -1;
  }

  // Fixed Huffman trees (RFC 1951 section 3.2.6)
  var fixedLitLens = [];
  for (var n = 0; n <= 287; n++)
    fixedLitLens[n] = n<=143?8:n<=255?9:n<=279?7:8;
  var fixedDistLens = new Array(32).fill(5);
  var fixedLit  = buildTree(fixedLitLens, 15);
  var fixedDist = buildTree(fixedDistLens, 15);

  // Length/distance extra bits tables
  var lenBase  = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  var lenExtra = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  var distBase  = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  var distExtra = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

  function inflate_block(litTree, distTree) {
    while (true) {
      var sym = readCode(litTree);
      if (sym < 0) throw new Error('inflate: bad symbol');
      if (sym < 256) { out.push(sym); }
      else if (sym === 256) { break; }
      else {
        var li = sym - 257;
        var length = lenBase[li] + readBits(lenExtra[li]);
        var dc = readCode(distTree);
        var dist = distBase[dc] + readBits(distExtra[dc]);
        var pos = out.length - dist;
        for (var k = 0; k < length; k++) out.push(out[pos + k]);
      }
    }
  }

  var bfinal = 0;
  while (!bfinal) {
    bfinal = readBit();
    var btype = readBits(2);
    if (btype === 0) {
      // Stored
      bits = 0; bitbuf = 0;
      var llen = data[i] | (data[i+1] << 8); i += 4;
      for (var k = 0; k < llen; k++) out.push(data[i++]);
    } else if (btype === 1) {
      inflate_block(fixedLit, fixedDist);
    } else if (btype === 2) {
      // Dynamic Huffman
      var hlit  = readBits(5) + 257;
      var hdist = readBits(5) + 1;
      var hclen = readBits(4) + 4;
      var clOrder = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
      var clLens = new Array(19).fill(0);
      for (var k = 0; k < hclen; k++) clLens[clOrder[k]] = readBits(3);
      var clTree = buildTree(clLens, 7);
      var dynLens = [];
      while (dynLens.length < hlit + hdist) {
        var sym2 = readCode(clTree);
        if (sym2 < 16) { dynLens.push(sym2); }
        else if (sym2 === 16) { var rep = readBits(2)+3; for(var k=0;k<rep;k++) dynLens.push(dynLens[dynLens.length-1]||0); }
        else if (sym2 === 17) { var rep = readBits(3)+3; for(var k=0;k<rep;k++) dynLens.push(0); }
        else { var rep = readBits(7)+11; for(var k=0;k<rep;k++) dynLens.push(0); }
      }
      var dynLit  = buildTree(dynLens.slice(0, hlit), 15);
      var dynDist = buildTree(dynLens.slice(hlit), 15);
      inflate_block(dynLit, dynDist);
    }
  }
  return new Uint8Array(out);
}

function extractZipEntry(buffer, entry) {
  var data = new Uint8Array(buffer);
  var o = entry.localOffset;
  var fnLen    = data[o+26]|(data[o+27]<<8);
  var extraLen = data[o+28]|(data[o+29]<<8);
  var dataStart = o + 30 + fnLen + extraLen;
  var compressed = data.slice(dataStart, dataStart + entry.compSize);
  if (entry.method === 0) {
    return Promise.resolve(compressed);
  }
  // Try native DecompressionStream (Chrome/Edge/Firefox — supports 'raw')
  // Safari has DecompressionStream but NOT 'raw' format, so test it first
  var nativeOk = false;
  if (typeof DecompressionStream !== 'undefined') {
    try { new DecompressionStream('raw'); nativeOk = true; } catch(e) { nativeOk = false; }
  }
  if (nativeOk) {
    try {
      var stream = new Response(compressed).body.pipeThrough(new DecompressionStream('raw'));
      return new Response(stream).arrayBuffer().then(function(ab) { return new Uint8Array(ab); });
    } catch(e) { /* fall through */ }
  }
  // Pure-JS inflate fallback (Safari and others)
  try {
    return Promise.resolve(jsInflateRaw(compressed));
  } catch(e) {
    return Promise.reject(new Error('Inflate error: ' + e.message));
  }
}
function zipEntryToText(buffer, entries, name) {
  if (!entries[name]) return Promise.resolve('');
  return extractZipEntry(buffer, entries[name]).then(function(arr) {
    try { return new TextDecoder('utf-8').decode(arr); }
    catch(e) { var s=''; for(var i=0;i<arr.length;i++) s+=String.fromCharCode(arr[i]); return s; }
  });
}

function parseXLSX(buffer) {
  var entries = readZipEntries(buffer);
  if (!entries) { alert('Nao foi possivel ler o arquivo XLSX (ZIP invalido).'); return; }

  Promise.all([
    zipEntryToText(buffer, entries, 'xl/workbook.xml'),
    zipEntryToText(buffer, entries, 'xl/_rels/workbook.xml.rels')
  ]).then(function(res) {
    var wbXml = res[0], relsXml = res[1];

    // Build rId -> target file map from .rels
    var ridToFile = {};
    var relRe = /<Relationship\b[^>]*>/g, rm;
    while ((rm = relRe.exec(relsXml)) !== null) {
      var tag = rm[0];
      var rid    = (tag.match(/Id="([^"]*)"/)     || [])[1] || '';
      var target = (tag.match(/Target="([^"]*)"/) || [])[1] || '';
      if (target.indexOf('worksheet') !== -1) ridToFile[rid] = 'xl/' + target;
    }

    // Find preferred sheet (Fatura first, else first non-hidden sheet)
    var wsName = 'xl/worksheets/sheet1.xml';
    if (wbXml) {
      var found = [];
      var re = /<sheet\b[^>]*>/g, m;
      while ((m = re.exec(wbXml)) !== null) {
        var tag = m[0];
        var nm  = (tag.match(/name="([^"]*)"/)  || [])[1] || '';
        var rid = (tag.match(/r:id="([^"]*)"/)  || [])[1] || '';
        var st  = (tag.match(/state="([^"]*)"/) || [])[1] || '';
        if (st !== 'hidden') found.push({ name: nm, rid: rid });
      }
      var fav = found.find(function(s){ return s.name.toLowerCase() === 'importador'; }) ||
                found.find(function(s){ return s.name.toLowerCase() === 'fatura'; }) ||
                found[0];
      if (fav && ridToFile[fav.rid]) wsName = ridToFile[fav.rid];
    }

    if (!entries[wsName]) {
      var keys = Object.keys(entries);
      for (var ki=0; ki<keys.length; ki++) {
        if (/xl\/worksheets\/sheet\d+\.xml/.test(keys[ki])) { wsName = keys[ki]; break; }
      }
    }

    Promise.all([
      zipEntryToText(buffer, entries, 'xl/sharedStrings.xml'),
      zipEntryToText(buffer, entries, wsName)
    ]).then(function(r2) {
      if (!r2[1]) { alert('Nao foi possivel ler a aba da planilha.'); return; }
      processXLSXData(r2[0], r2[1]);
    });
  }).catch(function(err) { alert('Erro ao ler XLSX: ' + err.message + '\n\nUse Chrome ou Edge atualizados.'); });
}

function processXLSXData(sstXml, wsXml) {
  if (!wsXml) { alert('Nao foi possivel ler a planilha XLSX.'); return; }

  // ── Shared strings ──────────────────────────────────────
  var sst = [];
  var siRe = /<si>([\s\S]*?)<\/si>/g, siM;
  while ((siM = siRe.exec(sstXml)) !== null) {
    sst.push(siM[1].replace(/<[^>]+>/g,'')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
      .replace(/&#(\d+);/g, function(_,n){ return String.fromCharCode(parseInt(n)); }));
  }

  // ── Col letter → 0-based index ───────────────────────────
  function colIdx(letters) {
    var r = 0;
    for (var i = 0; i < letters.length; i++) r = r * 26 + (letters.charCodeAt(i) - 64);
    return r - 1;
  }

  // ── Excel serial date → DD/MM/YYYY ───────────────────────
  function excelDate(serial) {
    if (!serial || isNaN(serial)) return '';
    var d = new Date(Math.round((serial - 25569) * 86400000));
    return String(d.getUTCDate()).padStart(2,'0') + '/' +
           String(d.getUTCMonth()+1).padStart(2,'0') + '/' +
           d.getUTCFullYear();
  }

  // ── Parse rows ────────────────────────────────────────────
  function decodeXml(s) {
    return String(s)
      .replace(/&#(\d+);/g, function(_,n){ return String.fromCharCode(parseInt(n)); })
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
  }

  var parsedRows = [];
  // Split into rows first
  var rowRe = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g, rowM;
  while ((rowM = rowRe.exec(wsXml)) !== null) {
    var rNum = parseInt(rowM[1]) - 1; // 0-based
    var rBody = rowM[2];
    var rowCells = {};

    // Match cells — both self-closing and with content
    // Use a two-pass: first get full cell tags
    var cRe = /<c\b([^>]*\/)>|<c\b([^>]*)>([\s\S]*?)<\/c>/g, cM;
    while ((cM = cRe.exec(rBody)) !== null) {
      var cAttrs = cM[1] || cM[2] || '';  // group1=self-closing attrs, group2=open-tag attrs
      var cellBody = cM[3] || '';           // group3=cell body content

      // Extract col reference
      var refM = cAttrs.match(/\br="([A-Z]+)\d+"/);
      if (!refM) continue;
      var ci = colIdx(refM[1]);

      var val = '';
      var isInline = cAttrs.indexOf('t="inlineStr"') !== -1;
      var isShared = cAttrs.indexOf('t="s"') !== -1;

      if (isInline) {
        var tM = cellBody.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        val = tM ? decodeXml(tM[1]) : '';
      } else if (isShared) {
        var vM = cellBody.match(/<v>([\s\S]*?)<\/v>/);
        val = vM && sst[parseInt(vM[1])] !== undefined ? sst[parseInt(vM[1])] : '';
      } else {
        var vM2 = cellBody.match(/<v>([\s\S]*?)<\/v>/);
        val = vM2 ? parseFloat(vM2[1]) : '';
      }
      rowCells[ci] = val;
    }
    parsedRows.push({ r: rNum, cells: rowCells });
  }

  // ── Find header row + map columns by name ─────────────────
  var headerRowIdx = -1;
  var colMap = { date:0, desc:1, parc:2, amt:3, cat:4, sub:5, terc:6, venc:7, pago:8, pgto:9, tipoLanc:10, nmeses:11, tipo:12 }; // defaults match planilha modelo

  // ── Layout CRU exportado pelo app Itaú (Black/Personnalité) ──────────
  // Cabeçalho: Data | Lançamento | Parcelamento | Valor | … | Nome — a Data NÃO fica na col A
  // (há metadados de nome/agência/conta/total acima) e a coluna de descrição é "Lançamento".
  var itauRaw = false;
  var itauVencBr = ''; // vencimento da fatura (DD/MM/YYYY), extraído do topo do arquivo
  var itauFaturaTotal = null; // total declarado da fatura (topo do arquivo)
  var itauEstornoSum = 0, itauEstornoN = 0; // estornos/créditos (negativos) não importados
  var _forceItau = (typeof window !== 'undefined' && window._importMode === 'itau');
  (function detectItau() {
    var normH = function(x) { return String(x == null ? '' : x).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
    for (var pi = 0; pi < parsedRows.length; pi++) {
      var pr = parsedRows[pi], cells = pr.cells;
      var iData = -1, iLanc = -1, iValor = -1, iParc = -1;
      Object.keys(cells).forEach(function(ci) {
        var h = normH(cells[ci]);
        if (h === 'data') iData = parseInt(ci);
        else if (h === 'lancamento') iLanc = parseInt(ci);
        else if (h === 'valor') iValor = parseInt(ci);
        else if (h === 'parcelamento') iParc = parseInt(ci);
      });
      if (iData >= 0 && iLanc >= 0 && iValor >= 0) {
        itauRaw = true;
        headerRowIdx = pr.r;
        colMap.date = iData; colMap.desc = iLanc; colMap.amt = iValor;
        colMap.parc = iParc >= 0 ? iParc : (iData + 2);
        // Colunas inexistentes no layout cru → desabilita (lidas em branco)
        colMap.cat = -1; colMap.sub = -1; colMap.venc = -1; colMap.pago = -1;
        colMap.pgto = -1; colMap.tipoLanc = -1; colMap.nmeses = -1; colMap.tipo = -1; colMap.terc = -1;
        break;
      }
    }
    if (!itauRaw) return;
    // Lê um valor de metadado do topo: acha o label (ex: "Vencimento", "Valor")
    // ACIMA do header e pega a célula na MESMA coluna, na linha logo abaixo do label.
    function metaValue(label) {
      var col = -1, row = -1;
      for (var pj = 0; pj < parsedRows.length; pj++) {
        var pr2 = parsedRows[pj];
        if (pr2.r >= headerRowIdx) break;
        var ks = Object.keys(pr2.cells);
        for (var ki = 0; ki < ks.length; ki++) {
          if (normH(pr2.cells[ks[ki]]) === label) { col = parseInt(ks[ki]); row = pr2.r; break; }
        }
        if (col >= 0) break;
      }
      if (col < 0) return null;
      for (var pk = 0; pk < parsedRows.length; pk++) {
        var pr3 = parsedRows[pk];
        if (pr3.r <= row || pr3.r >= headerRowIdx) continue;
        if (pr3.cells[col] !== undefined && pr3.cells[col] !== '') return pr3.cells[col];
      }
      return null;
    }
    // Vencimento da fatura (serial Excel ou string DD/MM/YYYY)
    var vv = metaValue('vencimento');
    if (typeof vv === 'number') itauVencBr = excelDate(vv);
    else if (typeof vv === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(vv.trim())) itauVencBr = vv.trim();
    // Total declarado da fatura (label "Valor" no bloco de metadados, acima do header)
    var tv = metaValue('valor');
    if (typeof tv === 'number') itauFaturaTotal = Math.abs(tv);
    else if (typeof tv === 'string') { var n = parseFloat(String(tv).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')); if (!isNaN(n)) itauFaturaTotal = Math.abs(n); }
  })();
  if (typeof window !== 'undefined') window._itauVencimentoBr = itauVencBr;
  if (_forceItau && !itauRaw) {
    alert('Não reconheci o layout da fatura Itaú neste arquivo.\nUse o .xlsx exportado pelo app (Fatura Fechada), sem editar o cabeçalho.');
    return;
  }

  if (!itauRaw) parsedRows.forEach(function(pr) {
    var a = String(pr.cells[0] || '').trim().toLowerCase();
    var b = String(pr.cells[1] || '').trim().toLowerCase();
    if (a === 'data' && b.indexOf('descri') !== -1) {
      if (headerRowIdx === -1 || pr.r < headerRowIdx) {
        headerRowIdx = pr.r;
        // Map each column by header text
        var hdr = pr.cells;
        Object.keys(hdr).forEach(function(ci) {
          // Normaliza: minúsculo, remove acentos, remove caracteres não-alfa
          var hRaw = String(hdr[ci] || '').trim();
          var h = hRaw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
          if (h === 'data') colMap.date = parseInt(ci);
          else if (h.indexOf('descri') !== -1) colMap.desc = parseInt(ci);
          else if (h.indexOf('parcela') !== -1 && h.indexOf('tipo') === -1) colMap.parc = parseInt(ci);
          else if (h.indexOf('valor') !== -1) colMap.amt = parseInt(ci);
          else if (h.indexOf('categoria') !== -1 && h.indexOf('sub') === -1) colMap.cat = parseInt(ci);
          else if (h.indexOf('sub') !== -1 && h.indexOf('categoria') !== -1) colMap.sub = parseInt(ci);
          else if (h.indexOf('vencimento') !== -1) colMap.venc = parseInt(ci);
          else if (h.indexOf('pagamento') !== -1) colMap.pgto = parseInt(ci);
          else if (h === 'pago' || (h.indexOf('pago') !== -1 && h.indexOf('pagamento') === -1)) colMap.pago = parseInt(ci);
          else if (h.indexOf('terceiro') !== -1) colMap.terc = parseInt(ci);
          else if (h.indexOf('tipo') !== -1 && (h.indexOf('lan') !== -1)) colMap.tipoLanc = parseInt(ci);
          else if (h.indexOf('tipo') !== -1 && h.indexOf('lan') === -1) colMap.tipo = parseInt(ci);
          else if (h.indexOf('n meses') !== -1 || h.indexOf('n  meses') !== -1 || h.indexOf('meses') !== -1) colMap.nmeses = parseInt(ci);
        });
      }
    }
  });
  if (headerRowIdx === -1) headerRowIdx = 1;

  // DEBUG — loga o colMap e os headers lidos
  console.log('[Import] colMap:', JSON.stringify(colMap));
  if (headerRowIdx >= 0) {
    parsedRows.forEach(function(pr) {
      if (pr.r === headerRowIdx) {
        console.log('[Import] Header row cells:', JSON.stringify(pr.cells));
      }
    });
  }



  // ── Build import rows ─────────────────────────────────────
  var rows = [];
  parsedRows.forEach(function(pr) {
    if (pr.r <= headerRowIdx) return;

    var c = pr.cells;
    var dateRaw = c[colMap.date], descVal = String(c[colMap.desc] || '').trim();
    var parcRaw = c[colMap.parc], amtVal  = c[colMap.amt];
    var catVal  = String(c[colMap.cat]  || '').trim();
    var subVal  = String(c[colMap.sub]  || '').trim();
    var vencRaw = c[colMap.venc];
    var pagoVal = String(c[colMap.pago] || '').trim().toLowerCase();
    var pgtoVal = String(c[colMap.pgto] || '').trim();
    var tipoLancRaw = colMap.tipoLanc !== undefined ? String(c[colMap.tipoLanc] || '').trim() : '';
    var nMesesRaw = colMap.nmeses !== undefined ? parseInt(c[colMap.nmeses]) || 0 : 0;
    var tipoXlsx = colMap.tipo !== undefined ? String(c[colMap.tipo] || '').trim().toLowerCase() : '';
    var tercXlsx = colMap.terc !== undefined ? String(c[colMap.terc] || '').trim() : '';
    // Normalize tipoLanc
    var tipoLancLower = tipoLancRaw.toLowerCase();
    var tipoLancNorm = tipoLancLower.indexOf('parc') !== -1 ? 'parcelado'
                     : tipoLancLower.indexOf('fix') !== -1 ? 'fixo'
                     : tipoLancLower.indexOf('var') !== -1 ? 'variavel' : '';
    // Se tipoLanc tem valor mas não é um tipo reconhecido (ex: "Black Itau"),
    // e a coluna Pagamento está vazia → usa como pagamento
    if (tipoLancRaw && !tipoLancNorm && !pgtoVal) {
      pgtoVal = tipoLancRaw;
      tipoLancNorm = ''; // mantém tipo vazio (variavel por padrão)
    }

    if (!descVal) return;
    if (/^(data|lançamento|descrição|💡)/i.test(descVal)) return;

    // If amt is empty/invalid but parcRaw is a number, the columns may have merged — use parcRaw as amount
    if ((amtVal === undefined || amtVal === null || amtVal === '' || isNaN(parseFloat(amtVal))) &&
         parcRaw !== undefined && parcRaw !== null && parcRaw !== '' && !isNaN(parseFloat(parcRaw)) &&
         colMap.parc !== colMap.amt) {
      amtVal = parcRaw;
      parcRaw = '';
    }

    if (amtVal === undefined || amtVal === null || isNaN(parseFloat(amtVal))) return;
    if (Math.abs(parseFloat(amtVal)) === 0) return;

    // Date string
    var dateStr = typeof dateRaw === 'string' ? dateRaw : (typeof dateRaw === 'number' ? excelDate(dateRaw) : '');

    // Vencimento string
    var vencStr = typeof vencRaw === 'string' ? vencRaw : (typeof vencRaw === 'number' ? excelDate(vencRaw) : '');
    // Itaú: usa o vencimento da própria fatura (topo do arquivo) como padrão de todas as linhas
    if (itauRaw && itauVencBr) vencStr = itauVencBr;

    // Parcela
    var parcAtual = null, parcTotal = null, cleanDesc = descVal;
    if (itauRaw && parcRaw && /parcela/i.test(String(parcRaw))) {
      // Itaú: coluna Parcelamento = "Parcela 1 de 2"
      var pmi = String(parcRaw).match(/(\d+)\s*de\s*(\d+)/i);
      if (pmi) { parcAtual = parseInt(pmi[1]); parcTotal = parseInt(pmi[2]); }
    } else if (parcRaw && /\d+\/\d+/.test(String(parcRaw))) {
      var pm = String(parcRaw).match(/(\d+)\/(\d+)/);
      if (pm) { parcAtual = parseInt(pm[1]); parcTotal = parseInt(pm[2]); }
    } else {
      var pm2 = descVal.match(/(\d{2})\/(\d{2})\s*$/);
      if (pm2) { parcAtual = parseInt(pm2[1]); parcTotal = parseInt(pm2[2]); cleanDesc = descVal.slice(0, pm2.index).trim(); }
    }

    var isPago = (pagoVal === 'sim' || pagoVal === 's' || pagoVal === '1' || pagoVal === 'true');

    // Match xlsx category/sub names to app names (fuzzy)
    var matchedCat = matchCatName(catVal);
    var matchedSub = matchSubName(matchedCat, subVal);

    var rawAmt = parseFloat(amtVal);
    if (itauRaw) {
      // Na fatura Itaú a COMPRA vem positiva (despesa). Estornos/créditos vêm negativos
      // e ENTRAM como crédito (despesa negativa) → deduzem do total do card.
      // Só o "Pagamento Efetuado" (quitação da fatura anterior) fica de fora.
      if (/pagamento efetuado/i.test(descVal)) return;
      if (rawAmt < 0) { itauEstornoSum += -rawAmt; itauEstornoN++; }
      if (!pgtoVal) pgtoVal = 'Black Itau';
    }
    // Infer tipo from sign if not explicitly set in column
    var tipoFromSign = itauRaw ? 'despesa' : (rawAmt < 0 ? 'despesa' : 'receita');
    var inferredTipo = tipoXlsx.indexOf('rec') !== -1 ? 'receita'
                     : tipoXlsx.indexOf('des') !== -1 ? 'despesa'
                     : tipoFromSign;

    rows.push({
      date: dateStr, desc: cleanDesc, descRaw: descVal,
      value: Math.abs(rawAmt),
      originalSign: rawAmt < 0 ? -1 : 1,
      parcAtual: parcAtual, parcTotal: parcTotal,
      xlsxCat: matchedCat, xlsxSub: matchedSub,
      xlsxVenc: vencStr, xlsxPago: isPago,
      xlsxPgto: pgtoVal,
      xlsxTipoLanc: tipoLancNorm,
      xlsxNMeses: nMesesRaw,
      xlsxTipo: inferredTipo,
      xlsxTerc: tercXlsx
    });
  });

  if (!rows.length) { alert('Nenhum lançamento encontrado no arquivo.'); return; }
  rows.forEach(function(r, i) { r._origIdx = i; });
  importParsedRows = rows;
  // Diagnóstico da fatura Itaú (conferência total declarado × compras × selecionados)
  if (typeof window !== 'undefined') {
    window._itauDiag = itauRaw ? {
      declarado: itauFaturaTotal,
      // Líquido (compras − estornos): estornos entram como crédito (despesa negativa)
      comprasSum: rows.reduce(function(s, r) { return s + (r.originalSign < 0 ? -(r.value || 0) : (r.value || 0)); }, 0),
      comprasN: rows.length,
      estornoSum: itauEstornoSum,
      estornoN: itauEstornoN
    } : null;
  }
  // Renderiza preview diretamente (IA de categorização disponível via botão)
  renderImportPreview(rows);
  // Itaú: pré-carrega o campo "Vencimento em massa" com o vencimento da fatura,
  // pronto pra alterar a importação inteira num clique.
  if (itauRaw && itauVencBr) {
    var _bv = document.getElementById('bulkVencInput');
    if (_bv && /^\d{2}\/\d{2}\/\d{4}$/.test(itauVencBr)) _bv.value = itauVencBr.split('/').reverse().join('-');
  }
  // Injeta botões de IA após renderizar
  if (typeof iaInjetarBotaoImport === 'function') {
    setTimeout(iaInjetarBotaoImport, 100);
  }

}


function parseXLSBinary(buffer) {
  var data = new Uint8Array(buffer);
  var sst = [];
  var pos = 512;

  while (pos < data.length - 4) {
    var rt = data[pos] | (data[pos+1] << 8);
    var rl = data[pos+2] | (data[pos+3] << 8);
    if (rl > 16384) { pos++; continue; }
    if (rt === 0x00FC) {
      var p2 = pos + 4;
      var unique = data[p2+4] | (data[p2+5] << 8) | (data[p2+6] << 16) | (data[p2+7] << 24);
      p2 += 8;
      for (var i = 0; i < unique && p2 < data.length; i++) {
        var cch = data[p2] | (data[p2+1] << 8);
        var flags = data[p2+2]; p2 += 3;
        var s = '';
        if (flags & 1) {
          for (var j = 0; j < cch && p2+1 < data.length; j++) { s += String.fromCharCode(data[p2] | (data[p2+1] << 8)); p2 += 2; }
        } else {
          for (var j2 = 0; j2 < cch && p2 < data.length; j2++) { s += String.fromCharCode(data[p2++]); }
        }
        sst.push(s);
      }
    }
    pos += 4 + rl;
  }

  var cells = {};
  pos = 512;
  while (pos < data.length - 4) {
    var rt2 = data[pos] | (data[pos+1] << 8);
    var rl2 = data[pos+2] | (data[pos+3] << 8);
    if (rl2 > 16384) { pos++; continue; }
    if (rt2 === 0x00FD && rl2 >= 10) {
      var row = data[pos+4] | (data[pos+5] << 8);
      var col = data[pos+6] | (data[pos+7] << 8);
      var idx2 = data[pos+10] | (data[pos+11] << 8) | (data[pos+12] << 16) | (data[pos+13] << 24);
      if (idx2 < sst.length) cells[row + ',' + col] = sst[idx2];
    } else if (rt2 === 0x027E && rl2 >= 10) {
      var row2 = data[pos+4] | (data[pos+5] << 8);
      var col2 = data[pos+6] | (data[pos+7] << 8);
      var rk = data[pos+10] | (data[pos+11] << 8) | (data[pos+12] << 16) | (data[pos+13] << 24);
      var val = (rk & 2) ? (rk >> 2) : (function(rk2){ var b = new ArrayBuffer(8); var v = new DataView(b); v.setUint32(0,0,true); v.setUint32(4,rk2&0xFFFFFFFC,true); return v.getFloat64(0,true); })(rk);
      if (rk & 1) val /= 100;
      cells[row2 + ',' + col2] = Math.round(val * 100) / 100;
    } else if (rt2 === 0x0203 && rl2 >= 14) {
      var row3 = data[pos+4] | (data[pos+5] << 8);
      var col3 = data[pos+6] | (data[pos+7] << 8);
      var b2 = new ArrayBuffer(8); var v2 = new DataView(b2);
      for (var k2 = 0; k2 < 8; k2++) v2.setUint8(k2, data[pos+12+k2]);
      cells[row3 + ',' + col3] = Math.round(v2.getFloat64(0,true) * 100) / 100;
    }
    pos += 4 + rl2;
  }

  var keys = Object.keys(cells).map(function(k3) { return parseInt(k3.split(',')[0]); });
  var maxRow = keys.length ? Math.max.apply(null, keys) : 0;
  // Detect if file has categoria/sub columns (col 4 and 5)
  // Check header row or first data row for known header strings
  var hasXlsxCols = false;
  for (var rCheck = 0; rCheck <= 3; rCheck++) {
    var v = String(cells[rCheck + ',4'] || '').toLowerCase();
    if (v.indexOf('categ') !== -1 || v.indexOf('sub') !== -1) { hasXlsxCols = true; break; }
  }
  // Also detect by having non-empty string in col 4 on data rows (categoria name)
  if (!hasXlsxCols) {
    for (var rCheck2 = 1; rCheck2 <= Math.min(10, maxRow); rCheck2++) {
      var cv = cells[rCheck2 + ',4'];
      if (cv && typeof cv === 'string' && cv.trim().length > 2) { hasXlsxCols = true; break; }
    }
  }

  var rows = [];
  for (var r3 = 1; r3 <= maxRow; r3++) {
    var dateVal = cells[r3 + ',0'] || '';
    var descVal = cells[r3 + ',1'] || '';
    var amtVal  = cells[r3 + ',3'];
    if (!descVal || typeof descVal !== 'string' || !descVal.trim()) continue;
    // Skip header/instruction rows
    if (/^(lançamento|data|descrição|descrição|💡)/i.test(descVal.trim())) continue;
    if (descVal === 'lançamento' || descVal === 'data') continue;
    if (amtVal === undefined || amtVal === null) continue;
    var m2 = descVal.match(/(\d{2})\/(\d{2})\s*$/);
    var parcAtual = null, parcTotal = null, cleanDesc = descVal.trim();
    if (m2) { parcAtual = parseInt(m2[1]); parcTotal = parseInt(m2[2]); cleanDesc = descVal.slice(0, m2.index).trim(); }
    if ((parseFloat(amtVal) || 0) === 0 && cleanDesc.indexOf('???') !== -1) continue;
    // Read categoria/sub/vencimento/pago from XLSX columns if present
    // Detecta colunas dinamicamente pelo header (linha 0 ou 1)
    var _bColMap = { cat:4, sub:5, terc:6, venc:7, pago:8, pgto:9, tipoLanc:10, nmeses:11, tipo:12 };
    // Tenta ler header das primeiras 2 linhas
    for (var _hr = 0; _hr <= 1; _hr++) {
      var _h0 = String(cells[_hr + ',0'] || '').toLowerCase();
      if (_h0 === 'data' || _h0.indexOf('data') === 0) {
        for (var _hc = 0; _hc <= 13; _hc++) {
          var _hv = String(cells[_hr + ',' + _hc] || '').toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
          if (_hv.indexOf('categoria') !== -1 && _hv.indexOf('sub') === -1) _bColMap.cat = _hc;
          else if (_hv.indexOf('sub') !== -1 && _hv.indexOf('categoria') !== -1) _bColMap.sub = _hc;
          else if (_hv.indexOf('terceiro') !== -1) _bColMap.terc = _hc;
          else if (_hv.indexOf('vencimento') !== -1) _bColMap.venc = _hc;
          else if (_hv.indexOf('pagamento') !== -1) _bColMap.pgto = _hc;
          else if (_hv === 'pago' || (_hv.indexOf('pago') !== -1 && _hv.indexOf('pagamento') === -1)) _bColMap.pago = _hc;
          else if (_hv.indexOf('tipo') !== -1 && _hv.indexOf('lan') !== -1) _bColMap.tipoLanc = _hc;
          else if (_hv.indexOf('tipo') !== -1 && _hv.indexOf('lan') === -1) _bColMap.tipo = _hc;
          else if (_hv.indexOf('meses') !== -1) _bColMap.nmeses = _hc;
        }
        break;
      }
    }
    var xlsxCat  = hasXlsxCols ? (String(cells[r3 + ',' + _bColMap.cat]  || '')).trim() : '';
    var xlsxSub  = hasXlsxCols ? (String(cells[r3 + ',' + _bColMap.sub]  || '')).trim() : '';
    var xlsxTerc = (String(cells[r3 + ',' + _bColMap.terc] || '')).trim();
    var xlsxVenc = (String(cells[r3 + ',' + _bColMap.venc] || '')).trim();
    var xlsxPago = (String(cells[r3 + ',' + _bColMap.pago] || '')).trim().toLowerCase();
    var xlsxPgtoRaw = (String(cells[r3 + ',' + _bColMap.pgto] || '')).trim();
    var xlsxTipoLancRaw = (String(cells[r3 + ',' + _bColMap.tipoLanc] || '')).trim();
    var xlsxTipoRaw = (String(cells[r3 + ',' + _bColMap.tipo] || '')).trim().toLowerCase();
    // Se Pagamento vazio mas TipoLanç tem nome de pagamento → usa como pgto
    var xlsxTipoLancLower = xlsxTipoLancRaw.toLowerCase();
    var xlsxTipoLancNorm = xlsxTipoLancLower.indexOf('parc') !== -1 ? 'parcelado'
                         : xlsxTipoLancLower.indexOf('fix') !== -1 ? 'fixo'
                         : xlsxTipoLancLower.indexOf('var') !== -1 ? 'variavel' : '';
    if (xlsxTipoLancRaw && !xlsxTipoLancNorm && !xlsxPgtoRaw) {
      xlsxPgtoRaw = xlsxTipoLancRaw;
      xlsxTipoLancNorm = '';
    }
    var isPago = (xlsxPago === 'sim' || xlsxPago === 's' || xlsxPago === '1' || xlsxPago === 'true');
    var inferredTipo = xlsxTipoRaw.indexOf('rec') !== -1 ? 'receita' : xlsxTipoRaw.indexOf('des') !== -1 ? 'despesa' : 'despesa';
    rows.push({
      date: String(dateVal), desc: cleanDesc, descRaw: descVal,
      value: parseFloat(amtVal) || 0, parcAtual: parcAtual, parcTotal: parcTotal,
      originalSign: parseFloat(amtVal) < 0 ? -1 : 1,
      xlsxCat: xlsxCat, xlsxSub: xlsxSub,
      xlsxVenc: xlsxVenc, xlsxPago: isPago,
      xlsxPgto: xlsxPgtoRaw, xlsxTipoLanc: xlsxTipoLancNorm,
      xlsxTerc: xlsxTerc, xlsxTipo: inferredTipo
    });
  }

  rows.forEach(function(r, i) { r._origIdx = i; });
  importParsedRows = rows;
  // Renderiza preview diretamente (IA de categorização disponível via botão)
  renderImportPreview(rows);
  // Injeta botões de IA após renderizar
  if (typeof iaInjetarBotaoImport === 'function') {
    setTimeout(iaInjetarBotaoImport, 100);
  }
}

function parcBadgeHtml(l) {
  if (!l || !l.parcAtual) return '';
  return '<span style="background:rgba(240,144,64,0.85);color:#000;padding:1px 7px;border-radius:4px;font-size:0.72rem;font-weight:700;white-space:nowrap">'
    + l.parcAtual + '/' + l.parcTotal + '</span>';
}

function fmtBR(v) {
  return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseImportDate(s) {
  if (!s) return new Date();
  var p = s.split('/');
  if (p.length === 3) return new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
  return new Date();
}

function toggleImportAll(checked) {
  document.querySelectorAll('.import-check').forEach(function(cb) { cb.checked = checked; });
  updateImportTotals();
}


var _importSortCol = 'date', _importSortAsc = true;

// ── Filtros do preview de importação ────────────────────────────────────────

function _buildImportFSEL() {
  if (!window.FSEL) return;

  // ── Pagamento ──
  var pgtos = [];
  pgtos.push({ value: '', text: 'Todos pagamentos' });
  var pgtoSet = new Set();
  importParsedRows.forEach(function(r) { if (r.xlsxPgto) pgtoSet.add(r.xlsxPgto); });
  if (typeof loadPagamentos === 'function') {
    loadPagamentos().forEach(function(p) { if (p && p.nome) pgtoSet.add(p.nome); });
  }
  Array.from(pgtoSet).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); }).forEach(function(p) {
    pgtos.push({ value: p, text: p });
  });
  FSEL.build('fsel-impFiltroPgto', 'impFiltroPgto', pgtos, function() { applyImportFilters(); });

  // ── Tipo lançamento ──
  var tipoOpts = [
    { value: '', text: 'Todos os tipos' },
    { value: 'variavel', text: 'Variável' },
    { value: 'parcelado', text: 'Parcelado' },
    { value: 'fixo', text: 'Fixo' }
  ];
  FSEL.build('fsel-impFiltroTipoLanc', 'impFiltroTipoLanc', tipoOpts, function() { applyImportFilters(); });

  // ── Categoria — todas as cadastradas + as da importação ──
  var cats = [];
  cats.push({ value: '', text: 'Todas categorias' });
  cats.push({ value: '__sem_cat__', text: '— Sem categoria —' });
  var catSet = new Set();
  if (typeof loadCats === 'function') {
    loadCats().forEach(function(c) { if (c && c.nome) catSet.add(c.nome); });
  }
  importParsedRows.forEach(function(r) {
    var c = r.categoria || r.xlsxCat; if (c) catSet.add(c);
  });
  Array.from(catSet).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); }).forEach(function(c) {
    cats.push({ value: c, text: c });
  });
  FSEL.build('fsel-impFiltroCat', 'impFiltroCat', cats, function() {
    _rebuildImportSubFSEL();
    applyImportFilters();
  });

  // ── Sub-categoria ──
  _rebuildImportSubFSEL();

  // ── Situação ──
  var situacOpts = [
    { value: '', text: 'Todos' },
    { value: 'novo', text: 'Apenas novos' },
    { value: 'dup', text: 'Apenas duplicados' }
  ];
  FSEL.build('fsel-impFiltroSituacao', 'impFiltroSituacao', situacOpts, function() { applyImportFilters(); });
}

function _rebuildImportSubFSEL() {
  if (!window.FSEL) return;
  var catVals = FSEL.getValues('impFiltroCat');
  var catFiltro = (catVals && catVals.length === 1 && catVals[0] !== '') ? catVals[0] : '';

  var subs = [];
  subs.push({ value: '', text: 'Todas sub-cats' });
  var subSet = new Set();

  if (typeof loadCats === 'function') {
    loadCats().forEach(function(cat) {
      if (catFiltro && cat.nome !== catFiltro) return;
      if (cat.subs && cat.subs.length) {
        cat.subs.forEach(function(s) {
          var nome = (typeof s === 'string') ? s : s.nome;
          if (nome) subSet.add(nome);
        });
      }
    });
  }
  importParsedRows.forEach(function(r) {
    var c = r.categoria || r.xlsxCat;
    var s = r.subCategoria || r.xlsxSub;
    if (s && (!catFiltro || c === catFiltro)) subSet.add(s);
  });

  Array.from(subSet).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); }).forEach(function(s) {
    subs.push({ value: s, text: s });
  });

  if (document.getElementById('fsel-impFiltroSub')) {
    FSEL.build('fsel-impFiltroSub', 'impFiltroSub', subs, function() { applyImportFilters(); });
  }
}

// Compat: mantido para não quebrar chamadas antigas
function _populateImportFilterSelects() { _buildImportFSEL(); }
function _updateImportSubFiltro() { _rebuildImportSubFSEL(); }
function _filterImportSubOpts() {}
function _filterImportPgtoOpts() {}
function _filterImportCatOpts() {}

function applyImportFilters() {
  var desc   = (document.getElementById('impFiltroDesc')?.value || '').toLowerCase().trim();

  // Lê valores dos FSEL
  var _fv = function(id) {
    if (window.FSEL) {
      var v = FSEL.getValues(id);
      // [] ou [''] = todos; ['__nenhum__'] = nenhum (não filtra nada)
      if (!v || v.length === 0) return [];
      if (v[0] === '__nenhum__') return ['__nenhum__'];
      return v.filter(function(x){ return x !== ''; });
    }
    return [];
  };

  var pgtos   = _fv('impFiltroPgto');
  var tiposL  = _fv('impFiltroTipoLanc');
  var cats    = _fv('impFiltroCat');
  var subs    = _fv('impFiltroSub');
  var situacs = _fv('impFiltroSituacao');

  var filtered = importParsedRows.filter(function(r) {
    if (desc && !(r.desc || r.descRaw || '').toLowerCase().includes(desc)) return false;

    if (pgtos.length) {
      if (pgtos[0] === '__nenhum__') return false;
      var _n = function(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); };
      if (!pgtos.some(function(p){ return _n(r.xlsxPgto) === _n(p); })) return false;
    }
    if (tiposL.length) {
      if (tiposL[0] === '__nenhum__') return false;
      var tl = r.xlsxTipoLanc || (r.parcAtual ? 'parcelado' : 'variavel');
      if (!tiposL.includes(tl)) return false;
    }
    if (cats.length) {
      if (cats[0] === '__nenhum__') return false;
      var rCat = r.categoria || r.xlsxCat || '';
      var wantSemCat = cats.includes('__sem_cat__');
      var otherCats = cats.filter(function(c){ return c !== '__sem_cat__'; });
      if (wantSemCat && !rCat) return true;
      if (otherCats.length && otherCats.includes(rCat)) return true;
      if (wantSemCat && !otherCats.length && rCat) return false;
      if (!wantSemCat && !otherCats.includes(rCat)) return false;
    }
    if (subs.length) {
      if (subs[0] === '__nenhum__') return false;
      var rSub = r.subCategoria || r.xlsxSub || '';
      if (!subs.includes(rSub)) return false;
    }
    if (situacs.length) {
      if (situacs[0] === '__nenhum__') return false;
      var sit = situacs[0];
      if (sit === 'dup' && !r._existingMatch) return false;
      if (sit === 'novo' && r._existingMatch) return false;
    }
    return true;
  });

  var hasFilter = desc || pgtos.length || tiposL.length || cats.length || subs.length || situacs.length;
  var countEl = document.getElementById('impFiltroCount');
  if (countEl) countEl.textContent = hasFilter ? (filtered.length + ' de ' + importParsedRows.length + ' exibidos') : '';

  _saveImportCurrentValues();
  renderImportPreview(filtered);
}

function clearImportFilters() {
  var descEl = document.getElementById('impFiltroDesc');
  if (descEl) descEl.value = '';
  // Reseta todos os FSEL e atualiza label visual
  if (window.FSEL) {
    ['impFiltroPgto','impFiltroTipoLanc','impFiltroCat','impFiltroSub','impFiltroSituacao'].forEach(function(id) {
      FSEL.reset(id);
      var opts = FSEL._optsMap ? FSEL._optsMap[id] : null;
      var inp = document.getElementById('fsi-' + id);
      if (inp && opts && opts[0]) inp.value = opts[0].text;
    });
  }
  var countEl = document.getElementById('impFiltroCount');
  if (countEl) countEl.textContent = '';
  _saveImportCurrentValues();
  renderImportPreview(importParsedRows);
}


function switchImportTab(tab) {
  ['dups','new','naoid'].forEach(function(t) {
    var sec = document.getElementById('imp-section-' + t);
    var btn = document.getElementById('imp-tab-btn-' + t);
    if (sec) sec.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      btn.style.borderBottomColor = t === tab ? 'var(--accent)' : 'transparent';
      btn.style.color = t === tab ? 'var(--text)' : 'var(--text2)';
    }
  });
}

var _importCatPickerTarget = null;
function _openImportCatPicker(btn) {
  var picker = document.getElementById('importCatPicker');
  if (!picker) return;
  var rect = btn.getBoundingClientRect();
  var spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow >= 280) {
    picker.style.top = (rect.bottom + 4) + 'px';
    picker.style.bottom = 'auto';
  } else {
    picker.style.top = 'auto';
    picker.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
  }
  picker.style.left = Math.min(rect.left, window.innerWidth - 310) + 'px';
  picker.style.display = 'block';
  _importCatPickerTarget = btn;
  var srch = document.getElementById('importCatSearch');
  if (srch) { srch.value = ''; srch.focus(); }
  _buildImportCatList('');
}
function _buildImportCatList(q) {
  var cats = loadCats().slice().sort(function(a,b){ return a.nome.localeCompare(b.nome,'pt-BR'); });
  var list = document.getElementById('importCatList');
  if (!list) return;
  var lo = (q||'').toLowerCase();
  var itemStyle = 'padding:7px 13px;font-size:0.78rem;color:var(--text2);cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px';
  var html = '<div onclick="_selectImportCat(this)" data-val="" style="' + itemStyle + '">— Sem categoria —</div>';
  cats.forEach(function(c) {
    if (lo && c.nome.toLowerCase().indexOf(lo) === -1) return;
    html += '<div onclick="_selectImportCat(this)" data-val="' + c.nome.replace(/"/g,'&quot;') + '" style="' + itemStyle + '">'
      + (c.icone ? '<span>' + c.icone + '</span>' : '') + '<span>' + c.nome + '</span></div>';
  });
  list.innerHTML = html;
}
function _filterImportCatList() {
  var srch = document.getElementById('importCatSearch');
  _buildImportCatList(srch ? srch.value : '');
}
function _updateImportTabCounts() {
  var newCount  = document.querySelectorAll('#importTableNew tr').length;
  var naoidCount = document.querySelectorAll('#importTableNaoId tr').length;
  var badgeNew   = document.getElementById('imp-tab-badge-new');
  var badgeNaoid = document.getElementById('imp-tab-badge-naoid');
  if (badgeNew)   badgeNew.textContent = newCount;
  if (badgeNaoid) { badgeNaoid.textContent = naoidCount; badgeNaoid.style.display = naoidCount > 0 ? '' : 'none'; }
  var newCountEl   = document.getElementById('imp-new-count');
  var naoidCountEl = document.getElementById('imp-naoid-count');
  if (newCountEl)   newCountEl.textContent   = newCount   + ' lançamento' + (newCount   !== 1 ? 's' : '');
  if (naoidCountEl) naoidCountEl.textContent = naoidCount + ' lançamento' + (naoidCount !== 1 ? 's' : '') + ' sem categoria identificada';
}
function _moveImportRowToNew(idx) {
  var chk = document.querySelector('.import-check[data-idx="' + idx + '"]');
  if (!chk) return;
  var tr = chk.closest('tr');
  if (!tr) return;
  var naoidTbody = document.getElementById('importTableNaoId');
  if (!naoidTbody || !naoidTbody.contains(tr)) return;
  var newTbody = document.getElementById('importTableNew');
  if (newTbody) { newTbody.appendChild(tr); _updateImportTabCounts(); }
}
function _checkAndMigrateToNew(idx) {
  var catBtn = document.querySelector('.import-cat-btn[data-idx="' + idx + '"]');
  var subBtn = document.querySelector('.import-sub-btn[data-idx="' + idx + '"]');
  if (!catBtn || !subBtn) return;
  // Migra SOMENTE se o usuário explicitamente preencheu os dois campos
  if ((catBtn.dataset.cat || '') && subBtn.dataset.userSubSet === '1') _moveImportRowToNew(idx);
}

function _selectImportCat(item) {
  var val = item.getAttribute('data-val') || '';
  var btn = _importCatPickerTarget;
  if (!btn) return;
  var idx = btn.dataset.idx;
  var allCats = loadCats();
  var cat = allCats.find(function(c){ return c.nome === val; });
  btn.textContent = val ? ((cat && cat.icone ? cat.icone + ' ' : '') + val) : '— Sem categoria —';
  btn.dataset.cat = val;
  var sel = document.querySelector('.import-cat-sel[data-idx="' + idx + '"]');
  if (sel) { sel.value = val; onImportCatChange(sel); }
  document.getElementById('importCatPicker').style.display = 'none';
  _importCatPickerTarget = null;
  // Sync para importParsedRows (sem migrar — aguarda sub ser preenchida pelo usuário)
  if (idx !== '__bulk__') {
    var r = importParsedRows[parseInt(idx)];
    if (r) r.xlsxCat = val;
  }
}
document.addEventListener('click', function(e) {
  var picker = document.getElementById('importCatPicker');
  if (!picker || picker.style.display === 'none') return;
  if (!picker.contains(e.target) && (!_importCatPickerTarget || !_importCatPickerTarget.contains(e.target))) {
    picker.style.display = 'none';
    _importCatPickerTarget = null;
  }
});

var _importSubPickerTarget = null;
function _openImportSubPicker(btn) {
  var picker = document.getElementById('importSubPicker');
  if (!picker) return;
  var rect = btn.getBoundingClientRect();
  var spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < 260) {
    picker.style.top = (rect.top - 260 + window.scrollY) + 'px';
  } else {
    picker.style.top = (rect.bottom + window.scrollY + 2) + 'px';
  }
  picker.style.left = Math.min(rect.left, window.innerWidth - 290) + 'px';
  picker.style.display = 'block';
  _importSubPickerTarget = btn;
  var srch = document.getElementById('importSubSearch');
  if (srch) { srch.value = ''; srch.focus(); }
  var idx = btn.dataset.idx;
  var catNome = '';
  if (idx === '__bulk__') {
    var bulkCatBtn = document.getElementById('imp-bulk-cat-btn');
    catNome = bulkCatBtn ? (bulkCatBtn.dataset.cat || '') : '';
  } else {
    var catSel = document.querySelector('.import-cat-sel[data-idx="' + idx + '"]');
    catNome = catSel ? catSel.value : '';
  }
  _buildImportSubList('', catNome);
}
function _buildImportSubList(q, catNome) {
  var list = document.getElementById('importSubList');
  if (!list) return;
  var cats = loadCats();
  var cat = null;
  for (var i = 0; i < cats.length; i++) { if (cats[i].nome === catNome) { cat = cats[i]; break; } }
  var subs = cat && cat.subs && cat.subs.length ? cat.subs.map(function(s) { return typeof s === 'string' ? s : s.nome; }).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); }) : [];
  var lo = (q||'').toLowerCase();
  var itemStyle = 'padding:7px 13px;font-size:0.78rem;color:var(--text2);cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px';
  var html = '<div onclick="_selectImportSub(this)" data-val="" style="' + itemStyle + '">— Nenhuma —</div>';
  subs.forEach(function(sNome) {
    if (lo && sNome.toLowerCase().indexOf(lo) === -1) return;
    html += '<div onclick="_selectImportSub(this)" data-val="' + sNome.replace(/"/g,'&quot;') + '" style="' + itemStyle + '"><span>' + sNome + '</span></div>';
  });
  if (!subs.length && !q) html += '<div style="' + itemStyle + ';color:var(--muted)">Selecione uma categoria primeiro</div>';
  list.innerHTML = html;
}
function _filterImportSubList() {
  var srch = document.getElementById('importSubSearch');
  var btn = _importSubPickerTarget;
  var idx = btn ? btn.dataset.idx : null;
  var catNome = '';
  if (idx === '__bulk__') {
    var bulkCatBtn = document.getElementById('imp-bulk-cat-btn');
    catNome = bulkCatBtn ? (bulkCatBtn.dataset.cat || '') : '';
  } else {
    var catSel = idx ? document.querySelector('.import-cat-sel[data-idx="' + idx + '"]') : null;
    catNome = catSel ? catSel.value : '';
  }
  _buildImportSubList(srch ? srch.value : '', catNome);
}
function _selectImportSub(item) {
  var val = item.getAttribute('data-val') || '';
  var btn = _importSubPickerTarget;
  if (!btn) return;
  btn.textContent = val || '— Nenhuma —';
  btn.dataset.sub = val;
  btn.dataset.userSubSet = val ? '1' : ''; // marca seleção explícita do usuário
  var idx = btn.dataset.idx;
  var sel = document.querySelector('.import-sub-sel[data-idx="' + idx + '"]');
  if (sel) { sel.value = val; }
  document.getElementById('importSubPicker').style.display = 'none';
  _importSubPickerTarget = null;
  // Verifica migração ao preencher sub
  if (idx !== '__bulk__') _checkAndMigrateToNew(idx);
}
document.addEventListener('click', function(e) {
  var picker = document.getElementById('importSubPicker');
  if (!picker || picker.style.display === 'none') return;
  if (!picker.contains(e.target) && (!_importSubPickerTarget || !_importSubPickerTarget.contains(e.target))) {
    picker.style.display = 'none';
    _importSubPickerTarget = null;
  }
});

function applyImportBulkCat() {
  var bulkCatBtn = document.getElementById('imp-bulk-cat-btn');
  var bulkSubBtn = document.getElementById('imp-bulk-sub-btn');
  var catVal = bulkCatBtn ? (bulkCatBtn.dataset.cat || '') : '';
  var subVal = bulkSubBtn ? (bulkSubBtn.dataset.sub || '') : '';
  if (!catVal && !subVal) {
    var info = document.getElementById('imp-bulk-info');
    if (info) info.textContent = 'Selecione categoria ou sub-categoria antes.';
    return;
  }
  var checked = document.querySelectorAll('.import-check:checked');
  var count = 0;
  checked.forEach(function(cb) {
    var idx = cb.dataset.idx;
    if (catVal) {
      var catBtn = document.querySelector('.import-cat-btn[data-idx="' + idx + '"]');
      var catSel = document.querySelector('.import-cat-sel[data-idx="' + idx + '"]');
      if (catBtn && catSel) {
        var allCats = loadCats();
        var catObj = allCats.find(function(c){ return c.nome === catVal; });
        catBtn.textContent = (catObj && catObj.icone ? catObj.icone + ' ' : '') + catVal;
        catBtn.dataset.cat = catVal;
        catSel.value = catVal;
        onImportCatChange(catSel);
        var r = importParsedRows[parseInt(idx)];
        if (r) r.xlsxCat = catVal;
      }
    }
    if (subVal) {
      var subBtn = document.querySelector('.import-sub-btn[data-idx="' + idx + '"]');
      var subSel = document.querySelector('.import-sub-sel[data-idx="' + idx + '"]');
      if (subBtn && subSel) {
        subSel.value = subVal;
        if (!subSel.value) {
          var svl = subVal.toLowerCase();
          for (var si = 0; si < subSel.options.length; si++) {
            if (subSel.options[si].value.toLowerCase() === svl) { subSel.value = subSel.options[si].value; break; }
          }
        }
        subBtn.textContent = subSel.value || subVal;
        subBtn.dataset.sub = subSel.value || subVal;
        subBtn.dataset.userSubSet = (subSel.value || subVal) ? '1' : ''; // seleção explícita via bulk
      }
    }
    // Migra só quando ambos foram explicitamente passados no bulk
    if (catVal && subVal) _checkAndMigrateToNew(idx);
    count++;
  });
  var info = document.getElementById('imp-bulk-info');
  if (info) info.textContent = count + ' linha' + (count !== 1 ? 's' : '') + ' atualizad' + (count !== 1 ? 'as' : 'a') + '.';
}
function _clearBulkImportCat() {
  var catBtn = document.getElementById('imp-bulk-cat-btn');
  var subBtn = document.getElementById('imp-bulk-sub-btn');
  if (catBtn) { catBtn.textContent = '— Categoria —'; catBtn.dataset.cat = ''; }
  if (subBtn) { subBtn.textContent = '— Sub-cat —'; subBtn.dataset.sub = ''; }
  var info = document.getElementById('imp-bulk-info');
  if (info) info.textContent = '';
}

function importToggleDups(checked) {
  document.querySelectorAll('#importTableDups .import-check').forEach(function(cb) { cb.checked = checked; });
  updateImportTotals();
}
function importToggleNew(checked) {
  document.querySelectorAll('#importTableNew .import-check').forEach(function(cb) { cb.checked = checked; });
  updateImportTotals();
}
function importToggleVisible(checked) {
  // Marca/desmarca apenas as linhas VISÍVEIS (respeitando filtros ativos)
  document.querySelectorAll('#importTableDups tr, #importTableNew tr').forEach(function(tr) {
    if (tr.style.display === 'none') return; // filtrado, pula
    var cb = tr.querySelector('.import-check');
    if (cb) cb.checked = checked;
  });
  updateImportTotals();
}
function importToggleDupSection() {
  var wrap = document.getElementById('imp-dup-body-wrap');
  var btn  = document.getElementById('imp-dup-toggle');
  if (!wrap || !btn) return;
  var hidden = wrap.style.display === 'none';
  wrap.style.display = hidden ? '' : 'none';
  btn.textContent = hidden ? '▲ Ocultar' : '▼ Mostrar';
}

function _saveImportCurrentValues() {
  document.querySelectorAll('.import-cat-sel').forEach(function(sel) {
    var r = importParsedRows[parseInt(sel.dataset.idx)];
    if (r) r.categoria = sel.value;
  });
  document.querySelectorAll('.import-sub-sel').forEach(function(sel) {
    var r = importParsedRows[parseInt(sel.dataset.idx)];
    if (r) r.subCategoria = sel.value;
  });
  document.querySelectorAll('.import-venc').forEach(function(inp) {
    var r = importParsedRows[parseInt(inp.dataset.idx)];
    if (!r) return;
    var v = inp.value.trim();
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) { var p = v.split('-'); v = p[2]+'/'+p[1]+'/'+p[0]; }
    r.xlsxVenc = v;
  });
  document.querySelectorAll('.import-pago').forEach(function(cb) {
    var r = importParsedRows[parseInt(cb.dataset.idx)];
    if (r) r.xlsxPago = cb.checked;
  });
  document.querySelectorAll('.import-pgto').forEach(function(sel) {
    var r = importParsedRows[parseInt(sel.dataset.idx)];
    if (r) r.xlsxPgto = sel.value;
  });
  document.querySelectorAll('.import-tipo-lanc').forEach(function(sel) {
    var r = importParsedRows[parseInt(sel.dataset.idx)];
    if (r) r.xlsxTipoLanc = sel.value;
  });
  document.querySelectorAll('.import-nmeses').forEach(function(inp) {
    var r = importParsedRows[parseInt(inp.dataset.idx)];
    if (r && inp.value) r.xlsxNMeses = parseInt(inp.value) || r.xlsxNMeses;
  });
  document.querySelectorAll('.import-check').forEach(function(cb) {
    var r = importParsedRows[parseInt(cb.dataset.idx)];
    if (r) r._userChecked = cb.checked;
  });
  document.querySelectorAll('.import-terc-sel').forEach(function(sel) {
    var r = importParsedRows[parseInt(sel.dataset.idx)];
    if (r) r.xlsxTerc = sel.value;
  });
}

function sortImport(col) {
  if (_importSortCol === col) {
    _importSortAsc = !_importSortAsc;
  } else {
    _importSortCol = col;
    _importSortAsc = true;
  }
  // Update header icons in all three tables
  var cols = ['date','desc','pgto','tipo','parc','valor','cat','sub','terc','venc','pago'];
  ['dup','new','naoid'].forEach(function(tbl) {
    cols.forEach(function(c) {
      var el = document.getElementById('imp-si-' + c + '-' + tbl);
      if (!el) return;
      if (c === _importSortCol) {
        el.textContent = _importSortAsc ? '↑' : '↓';
        el.style.color = '#f0c040';
      } else {
        el.textContent = '⇅';
        el.style.color = '';
      }
    });
  });
  // Sort importParsedRows
  var sorted = importParsedRows.slice().sort(function(a, b) {
    var va, vb;
    if (col === 'date')  { var _pa=(a.date||'').split('/'); var _pb=(b.date||'').split('/'); va=_pa.length===3?_pa[2]+_pa[1]+_pa[0]:(a.date||''); vb=_pb.length===3?_pb[2]+_pb[1]+_pb[0]:(b.date||''); }
    else if (col === 'desc')  { va = (a.desc || a.descRaw || '').toLowerCase(); vb = (b.desc || b.descRaw || '').toLowerCase(); }
    else if (col === 'pgto')  { va = (a.xlsxPgto || '').toLowerCase(); vb = (b.xlsxPgto || '').toLowerCase(); }
    else if (col === 'tipo')  { va = (a.xlsxTipoLanc || '').toLowerCase(); vb = (b.xlsxTipoLanc || '').toLowerCase(); }
    else if (col === 'parc')  { va = a.parcAtual || 0; vb = b.parcAtual || 0; }
    else if (col === 'valor') { va = a.value || 0; vb = b.value || 0; }
    else if (col === 'cat')   { va = (a.xlsxCat || '').toLowerCase(); vb = (b.xlsxCat || '').toLowerCase(); }
    else if (col === 'sub')   { va = (a.xlsxSub || '').toLowerCase(); vb = (b.xlsxSub || '').toLowerCase(); }
    else if (col === 'terc')  { va = (a.xlsxTerc || '').toLowerCase(); vb = (b.xlsxTerc || '').toLowerCase(); }
    else if (col === 'venc')  { va = a.xlsxVenc || ''; vb = b.xlsxVenc || ''; }
    else if (col === 'pago')  { va = a.xlsxPago ? 1 : 0; vb = b.xlsxPago ? 1 : 0; }
    if (va < vb) return _importSortAsc ? -1 : 1;
    if (va > vb) return _importSortAsc ? 1 : -1;
    return 0;
  });
  _saveImportCurrentValues();
  renderImportPreview(sorted);
}

function renderImportPreview(rows) {
  if (!rows.length) { alert('Nenhum lançamento encontrado no arquivo.'); return; }

  // ── Detecção de duplicatas ──────────────────────────────────────────────────
  // loadData() é async — lê direto do cache síncrono para evitar receber Promise
  var _allExist = (typeof _memCache !== 'undefined' && _memCache.lancamentos) ? _memCache.lancamentos : [];

  var _norm = function(s) {
    return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[\ufffd?]+/g,'')   // remove ileg\u00edveis (? e \ufffd) que variam entre fatura e plataforma
      .replace(/\s+/g,' ').trim();
  };
  // Remove prefixos de banco e ruído típico de fatura (PG*, NF*, PIX*, UBER*, etc)
  var _stripBankNoise = function(s) {
    return _norm(s)
      .replace(/^(pg|pag|pix|mp|nf|ebn|ifd|ifood|pgto|uber|99|dd|deb|cred|tef|ted|doc)\s*[\*\-\.\s]/,'')
      .replace(/\s*\*\s*[a-z0-9]{1,8}$/,'')   // sufixo tipo *TRIP, *BR, *123
      .replace(/\s+/g,' ').trim();
  };
  // Remove número de parcela da descrição: "07/12", "(1/7)"
  var _stripParc = function(s) {
    return _stripBankNoise(s)
      .replace(/\s*\(\d{1,3}\/\d{1,3}\)\s*/g,' ')
      .replace(/\d{1,3}\/\d{1,3}/g,' ')
      .replace(/\s+/g,' ').trim();
  };
  // Normaliza data para YYYY-MM-DD (loadData já retorna nesse formato)
  var _normD = function(d) {
    if (!d) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { var p=d.split('/'); return p[2]+'-'+p[1]+'-'+p[0]; }
    return '';
  };

  // ── Índices do banco (ARRAYS, p/ pareamento 1:1 que CONSOME cada entrada) ──
  // Cada lançamento da plataforma só pode casar com UMA linha da fatura. Sem isso,
  // os matchers frouxos casavam várias linhas no mesmo lançamento → contagem/total
  // não fechavam (parecia "tudo duplicado" mesmo faltando importar).
  var _byData = {}, _byParc = {}, _byVal = {}, _byFixed = {};
  var _byValParcDate = {}, _byValDate = {}, _byValParc = {}, _bySplitFull = {};
  var _grpParcDate = {};
  var _add = function(map, k, l) { (map[k] = map[k] || []).push(l); };
  // Período (YYYYMM) PELO VENCIMENTO da fatura — o pareamento é escopado por venc:
  // uma compra de junho só casa com lançamento de venc junho (recorrentes de maio
  // NÃO contam como duplicata da de junho). Regra: SEMPRE o vencimento.
  var _ym = function(s) { s = String(s || ''); var a = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (a) return a[3] + a[2]; var b = s.match(/^(\d{4})-(\d{2})/); if (b) return b[1] + b[2]; return ''; };
  var _vpLanc = function(l) { return _ym(l.vencimento) || ((l.mes && l.ano) ? (String(l.ano) + String(l.mes).padStart(2, '0')) : '') || _ym(l.data); };
  var _vpRow  = function(r) { return _ym(r.xlsxVenc) || _ym(r.date); };
  _allExist.forEach(function(l) {
    var vp = _vpLanc(l);
    var dn = _stripParc(l.desc);
    var v  = Math.round(Math.abs(_valorExib(l)||0)*100);
    var t  = l.tipo || 'despesa';
    var dt = _normD(l.data);
    var base = vp+'|'+t+'|'+dn+'|'+v;
    if (dt) _add(_byData, base+'|'+dt, l);
    if (l.parcAtual) _add(_byParc, base+'|'+l.parcAtual, l);
    _add(_byVal, base, l);
    if (l.tipoLanc === 'fixo' || l.recorr === 'fixo') _add(_byFixed, base, l);
    if (dt) _add(_byValDate, vp+'|'+t+'|'+v+'|'+dt, l);
    var pt = l.parcTotal || l.totalParcelas;
    if (pt && pt > 1) {
      if (dt) _add(_byValParcDate, vp+'|'+t+'|'+v+'|'+pt+'|'+dt, l);
      _add(_byValParc, vp+'|'+t+'|'+v+'|'+pt, l);
    }
    if (l._splitFull) {
      var fc = Math.round(Math.abs(l._splitFull)*100);
      if (dt) _add(_bySplitFull, vp+'|'+t+'|'+fc+'|'+dt, l);
      if (pt && pt > 1) { if (dt) _add(_bySplitFull, vp+'|'+t+'|'+fc+'|'+pt+'|'+dt, l); _add(_bySplitFull, vp+'|'+t+'|'+fc+'|'+pt, l); }
    }
    if (pt && pt > 1 && dt) { var gk = vp+'|'+t+'|'+pt+'|'+dt; (_grpParcDate[gk] = _grpParcDate[gk] || []).push({ l: l, c: v }); }
  });

  var _consumed = (typeof Set !== 'undefined') ? new Set() : null;
  var _isUsed = function(l) { return _consumed ? _consumed.has(l) : !!l.__dupUsed; };
  var _use    = function(l) { if (_consumed) _consumed.add(l); else l.__dupUsed = true; };
  var _take = function(arr) {
    if (!arr) return null;
    for (var i = 0; i < arr.length; i++) if (!_isUsed(arr[i])) { _use(arr[i]); return arr[i]; }
    return null;
  };
  // Split por soma: subconjunto das partes (mesmo venc+data+parcelas) que soma o valor cheio
  var _splitSumMatch = function(vp, t, vCents, pt, dt) {
    if (!(pt > 1) || !dt) return null;
    var grp = _grpParcDate[vp+'|'+t+'|'+pt+'|'+dt];
    if (!grp) return null;
    var arr = grp.filter(function(x){ return !_isUsed(x.l); });
    if (arr.length < 2) return null;
    var n = Math.min(arr.length, 14);
    for (var mask = 1; mask < (1 << n); mask++) {
      var s = 0, bits = 0, picks = [];
      for (var j = 0; j < n; j++) if (mask & (1 << j)) { s += arr[j].c; bits++; picks.push(arr[j].l); }
      if (bits >= 2 && s === vCents) { picks.forEach(_use); return picks; }
    }
    return null;
  };

  var _keys = function(r) {
    var vp = _vpRow(r);
    var dn = _stripParc(r.desc || r.descRaw);
    var v  = Math.round((r.value||0)*100);
    var t  = r.xlsxTipo || 'despesa';
    var dt = _normD(r.date);
    var isParc = !!(r.parcAtual || (r.parcTotal && r.parcTotal > 1));
    return { vp: vp, dn: dn, v: v, t: t, dt: dt, isParc: isParc, pt: r.parcTotal || 0, parcAtual: r.parcAtual, base: vp+'|'+t+'|'+dn+'|'+v };
  };
  // Candidatos por camada (mais forte → mais frouxo). null = camada não se aplica.
  var _tierArr = function(r, tier) {
    var k = _keys(r);
    switch (tier) {
      case 1: return k.isParc ? (k.parcAtual ? _byParc[k.base+'|'+k.parcAtual] : null) : (k.dt ? _byData[k.base+'|'+k.dt] : null);
      case 2: return (k.isParc && k.dt) ? _byData[k.base+'|'+k.dt] : null;
      case 3:
        if (k.isParc) return _byVal[k.base];
        if (_byVal[k.base]) { var dl = k.dn.toLowerCase(); if (dl.length > 4 && !/^(saque|transferencia|pix|deposito|ted|doc|pagamento|debito|credito|estorno)$/.test(dl)) return _byVal[k.base]; }
        return null;
      case 4: return (k.isParc && k.pt > 1 && k.dt) ? _byValParcDate[k.vp+'|'+k.t+'|'+k.v+'|'+k.pt+'|'+k.dt] : null;
      case 5: return (k.isParc && k.dt) ? _byValDate[k.vp+'|'+k.t+'|'+k.v+'|'+k.dt] : null;
      case 6: return (k.isParc && k.pt > 1) ? _byValParc[k.vp+'|'+k.t+'|'+k.v+'|'+k.pt] : null;
      case 7:
        if (!k.isParc) return null;
        return (k.pt > 1 && k.dt && _bySplitFull[k.vp+'|'+k.t+'|'+k.v+'|'+k.pt+'|'+k.dt]) || (k.dt && _bySplitFull[k.vp+'|'+k.t+'|'+k.v+'|'+k.dt]) || null;
    }
    return null;
  };

  var _ids = function(arr) { return arr.map(function(l) { return String(l.id); }).filter(function(x) { return x !== 'undefined'; }); };
  // Passe fixo (NÃO consome — fixo recorrente casa todo mês)
  rows.forEach(function(r) { var k = _keys(r); var fx = _byFixed[k.base]; if (fx && fx.length) { r._existingMatch = fx[0]; r._matchIds = _ids([fx[0]]); } else { r._existingMatch = undefined; } });
  // Passes 1..7 consumindo, exato → frouxo (tier across all rows antes do próximo)
  for (var _tier = 1; _tier <= 7; _tier++) {
    rows.forEach(function(r) { if (r._existingMatch) return; var m = _take(_tierArr(r, _tier)); if (m) { r._existingMatch = m; r._matchIds = _ids([m]); } });
  }
  // Camada final: split por soma das partes (consome e registra TODAS as partes)
  rows.forEach(function(r) { if (r._existingMatch) return; var k = _keys(r); var picks = _splitSumMatch(k.vp, k.t, k.v, k.pt, k.dt); if (picks) { r._existingMatch = picks[0]; r._matchIds = _ids(picks); } });
  rows.forEach(function(r) { if (!r._existingMatch) { r._existingMatch = null; r._matchIds = []; } });

  var _dups    = rows.filter(function(r) { return r._existingMatch; });
  var _nonDups = rows.filter(function(r) { return !r._existingMatch; });
  rows = _dups.concat(_nonDups);
  // Popula selects de filtro após ter os dados parseados
  _populateImportFilterSelects();

  // Conta quantas duplicatas foram encontradas para mostrar aviso
  var _dupCount = _dups.length;
  // dup warning handled by imp-section-dups

  var parcelados = rows.filter(function(r) { return r.parcAtual !== null && r.parcTotal > 1; });
  var futureCount = 0;
  parcelados.forEach(function(r) { if (r.parcAtual !== null) futureCount += (r.parcTotal - r.parcAtual); });

  document.getElementById('importCountAll').textContent = rows.length;
  document.getElementById('importCountParc').textContent = parcelados.length + ' parcelados';
  document.getElementById('importCountNew').textContent = futureCount;

  var today = new Date();
  var htmlDup = '';
  var htmlNew = '';
  var htmlNaoId = '';

  // Helper: build a row's HTML — used for both tables
  function _buildImportRow(r, i) {
    var isParc = r.parcAtual !== null && r.parcTotal > 1;
    var remaining = isParc ? (r.parcTotal - r.parcAtual) : 0;
    var futureLabel = '—';
    if (remaining > 0) {
      var d = r.date ? parseImportDate(r.date) : today;
      var lm = new Date(d.getFullYear(), d.getMonth() + remaining, 1);
      futureLabel = String(lm.getMonth()+1).padStart(2,'0') + '/' + lm.getFullYear();
    }
    var parcBadge = isParc
      ? '<span style="background:var(--accent);color:#000;padding:1px 6px;border-radius:4px;font-size:0.72rem;font-weight:700">' + r.parcAtual + '/' + r.parcTotal + '</span>'
      : '<span style="color:var(--text2)">—</span>';
    var futureBadge = remaining > 0
      ? '<span style="color:var(--accent2);font-size:0.75rem">+' + remaining + ' até ' + futureLabel + '</span>'
      : '<span style="color:var(--muted);font-size:0.75rem">única</span>';

    var sugCat = r.categoria || r.xlsxCat || suggestCat(r.desc);
    var sugSub = r.subCategoria || r.xlsxSub || suggestSub(r.desc, sugCat || '');
    var catIcon = (r.categoria && r._iaCateg) ? ' ✨' : r.xlsxCat ? ' 📋' : (sugCat ? ' 💡' : '');
    var subIcon = (r.subCategoria && r._iaCateg) ? ' ✨' : r.xlsxSub ? ' 📋' : (sugSub ? ' 💡' : '');
    var selStyle = 'background:var(--surface);border:1px solid var(--border);color:var(--text);padding:3px 5px;border-radius:4px;font-size:0.73rem;width:100%';

    var _dup = r._existingMatch || null;
    var _isDup = _dup !== null;
    var _isDupIA = !_isDup && r._iaDupSemantic === true;

    var trStyle = 'border-bottom:1px solid var(--border)';
    if (_isDupIA) trStyle += ';background:rgba(251,191,36,0.04)';
    var _isChecked = (r._userChecked !== undefined) ? r._userChecked : !_isDup;
    var row = '<tr style="' + trStyle + '" data-dup="' + (_isDup?'1':'0') + '" data-dup-ia="' + (_isDupIA?'1':'0') + '">';
    row += '<td style="padding:5px 4px;text-align:center;border-right:1px solid var(--border)">'
      + '<input type="checkbox" class="import-check" data-idx="' + i + '"' + (_isChecked ? ' checked' : '') + ' onchange="updateImportTotals()">'
      + '</td>';
    row += '<td style="padding:5px 6px;white-space:nowrap;color:var(--text2);font-size:0.78rem;border-right:1px solid var(--border)">' + r.date + '</td>';
    row += '<td style="padding:5px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.78rem;border-right:1px solid var(--border)" title="' + r.desc + '">' + (r.desc || r.descRaw) + '</td>';

    var _pagsUser = loadPagamentos().map(function(p) { return p.nome || p.name || ''; }).filter(Boolean);
    var _pgtoBase = ['Boleto','Débito','Depósito','Pix','Crédito','Transferência','TED','DOC'];
    var _pgtoMerged = _pagsUser.slice();
    _pgtoBase.forEach(function(b) {
      if (!_pgtoMerged.some(function(u) { return u.toLowerCase() === b.toLowerCase(); })) _pgtoMerged.push(b);
    });
    var pgtoOpts   = [''].concat(_pgtoMerged);
    var pgtoLabels = ['— Tipo —'].concat(_pgtoMerged);
    var xlsxPgto = (r.xlsxPgto || '').trim();
    var normStr = function(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); };
    var matchedPgto = '';
    if (xlsxPgto) {
      var xlsxNorm = normStr(xlsxPgto);
      for (var pi = 1; pi < pgtoOpts.length; pi++) {
        if (normStr(pgtoOpts[pi]) === xlsxNorm) { matchedPgto = pgtoOpts[pi]; break; }
      }
      if (!matchedPgto) { pgtoOpts.push(xlsxPgto); pgtoLabels.push(xlsxPgto); matchedPgto = xlsxPgto; }
    }
    var pgtoSelectHtml = pgtoOpts.map(function(v, idx2) {
      var sel = (v !== '' && v === matchedPgto) ? ' selected' : '';
      return '<option value="' + v + '"' + sel + '>' + pgtoLabels[idx2] + '</option>';
    }).join('');
    row += '<td style="padding:4px 5px;border-right:1px solid var(--border)"><select class="import-pgto" data-idx="' + i + '" data-pgto="' + matchedPgto.replace(/"/g,"&quot;") + '" style="' + selStyle + 'min-width:110px">' + pgtoSelectHtml + '</select></td>';

    var tipoLancVal = r.xlsxTipoLanc || (isParc ? 'parcelado' : 'variavel');
    var nMesesVal = r.xlsxNMeses || 12;
    var tipoLancHtml = ['variavel','parcelado','fixo'].map(function(v) {
      var labels = {variavel:'Variável', parcelado:'Parcelado', fixo:'Fixo'};
      return '<option value="' + v + '"' + (v === tipoLancVal ? ' selected' : '') + '>' + labels[v] + '</option>';
    }).join('');
    var showN = (tipoLancVal === 'fixo' && !isParc) ? '' : 'display:none;';
    row += '<td style="padding:4px 5px;border-right:1px solid var(--border)">'
      + '<select class="import-tipo-lanc" data-idx="' + i + '" onchange="onImportTipoChange(this)" style="' + selStyle + 'min-width:70px">' + tipoLancHtml + '</select>'
      + '<input type="number" class="import-nmeses" data-idx="' + i + '" value="' + nMesesVal + '" min="2" max="120" style="' + showN + 'margin-top:3px;background:var(--surface);border:1px solid var(--border);color:var(--accent2);padding:2px 4px;border-radius:4px;font-size:0.72rem;width:52px;text-align:center">'
      + '</td>';
    row += '<td style="padding:5px 6px;text-align:center;border-right:1px solid var(--border)">' + parcBadge + '</td>';
    var isEstorno = r.originalSign < 0 && r.xlsxTipo !== 'receita';
    var tipoColor = r.xlsxTipo === 'receita' ? 'var(--green)' : isEstorno ? 'var(--green)' : 'var(--red)';
    var tipoSign  = r.xlsxTipo === 'receita' ? '+' : isEstorno ? '+' : '-';
    row += '<td style="padding:5px 6px;text-align:right;font-family:monospace;font-size:0.78rem;white-space:nowrap;border-right:1px solid var(--border)"><span style="color:' + tipoColor + '">' + tipoSign + fmtBR(r.value) + '</span></td>';
    row += '<td style="padding:4px 5px;border-right:1px solid var(--border)"><div style="display:flex;align-items:center;gap:3px"><span class="import-cat-btn" data-idx="' + i + '" data-cat="' + (sugCat||'').replace(/"/g,'&quot;') + '" onclick="_openImportCatPicker(this)" style="display:inline-block;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:3px 7px;border-radius:4px;font-size:0.73rem;cursor:pointer;min-width:100px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">— Sem categoria —</span><select class="import-cat-sel" data-idx="' + i + '" data-cat="' + (sugCat||'').replace(/"/g,'&quot;') + '" onchange="onImportCatChange(this)" style="display:none"></select><span style="font-size:0.7rem;flex-shrink:0">' + catIcon + '</span></div></td>';
    row += '<td style="padding:4px 5px;border-right:1px solid var(--border)"><div style="display:flex;align-items:center;gap:3px"><span class="import-sub-btn" data-idx="' + i + '" data-sub="' + (sugSub||'').replace(/"/g,'&quot;') + '" onclick="_openImportSubPicker(this)" style="display:inline-block;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:3px 7px;border-radius:4px;font-size:0.73rem;cursor:pointer;min-width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">— Nenhuma —</span><select class="import-sub-sel" data-idx="' + i + '" data-sub="' + (sugSub||'').replace(/"/g,'&quot;') + '" onchange="onImportSubChange(this)" style="display:none"></select><span style="font-size:0.7rem;flex-shrink:0">' + subIcon + '</span></div></td>';
    row += '<td style="padding:4px 5px;border-right:1px solid var(--border)">'
      + '<div style="display:flex;align-items:center;gap:4px">'
      + '<select class="import-terc-sel" data-idx="' + i + '" style="' + selStyle + 'min-width:96px"></select>'
      + '<button type="button" onclick="openSplit(' + i + ')" title="Desmembrar: parte do valor para um terceiro (cria conta a receber)" style="background:rgba(240,192,64,0.12);border:1px solid rgba(240,192,64,0.4);color:var(--accent);border-radius:5px;padding:2px 6px;font-size:0.8rem;cursor:pointer;line-height:1">✂️</button>'
      + '</div>'
      + '<span id="split-badge-' + i + '">' + _splitBadgeHtml(r) + '</span>'
      + '</td>';
    var vencVal = r.xlsxVenc || '';
    // Converte DD/MM/AAAA para AAAA-MM-DD para o input type=date
    var vencIso = '';
    if (vencVal && /^\d{2}\/\d{2}\/\d{4}$/.test(vencVal)) {
      var vp = vencVal.split('/'); vencIso = vp[2] + '-' + vp[1] + '-' + vp[0];
    }
    row += '<td style="padding:4px 5px;border-right:1px solid var(--border)"><input type="date" class="import-venc" data-idx="' + i + '" value="' + vencIso + '" onchange="this.dataset.brval=(this.value?this.value.split(\'-\').reverse().join(\'/\'): \'\')" style="background:var(--surface);border:1px solid var(--border);color:var(--accent2);padding:2px 4px;border-radius:4px;font-size:0.73rem;width:120px"></td>';
    var pagoChecked = r.xlsxPago ? ' checked' : '';
    row += '<td style="padding:4px 5px;text-align:center;border-right:1px solid var(--border)"><input type="checkbox" class="import-pago" data-idx="' + i + '"' + pagoChecked + ' style="width:16px;height:16px;cursor:pointer;accent-color:var(--text2)"></td>';
    row += '<td style="padding:5px 6px;text-align:center;white-space:nowrap">' + futureBadge + '</td>';
    row += '</tr>';

    // Linha "⚠ IA" abaixo de duplicata semântica detectada pela IA
    if (_isDupIA && r._iaDupMotivo) {
      row += '<tr style="border-bottom:1px solid rgba(251,191,36,0.25);background:rgba(251,191,36,0.05);">'
        + '<td style="padding:4px;text-align:center;border-right:1px solid var(--border)"><span style="font-size:0.6rem;color:#fbbf24;font-weight:700">✨ IA</span></td>'
        + '<td colspan="12" style="padding:4px 8px;font-size:0.72rem;color:#fbbf24;border-right:1px solid var(--border)">'
        + '⚠ Possível duplicata: ' + (r._iaDupMotivo || '') + ' — <strong>verifique antes de importar</strong>'
        + '</td>'
        + '</tr>';
    }

    // Linha "✓ JÁ" abaixo da duplicata
    if (_isDup && r._existingMatch) {
      var ex = r._existingMatch;
      var exFmt = function(v) { return 'R$ ' + (v||0).toFixed(2).replace('.',','); };
      var exDate = ex.data ? (typeof ex.data === 'string' && ex.data.indexOf('-') !== -1
        ? ex.data.split('-').reverse().join('/') : ex.data) : (ex.mes + '/' + ex.ano);
      row += '<tr style="border-bottom:1px solid rgba(239,68,68,0.25);background:rgba(239,68,68,0.04);">'
        + '<td style="padding:4px;text-align:center;border-right:1px solid var(--border)"><span style="font-size:0.6rem;color:#ef4444;font-weight:700">✓ JÁ</span></td>'
        + '<td style="padding:4px 6px;font-size:0.72rem;color:#ef4444;border-right:1px solid var(--border);white-space:nowrap">' + exDate + '</td>'
        + '<td style="padding:4px 6px;font-size:0.72rem;color:#ef4444;border-right:1px solid var(--border);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (ex.desc||'') + (ex.parcAtual?'<span style="background:rgba(240,144,64,0.7);color:#000;padding:0 4px;border-radius:3px;font-size:0.65rem;margin-left:4px">'+ex.parcAtual+'/'+ex.parcTotal+'</span>':'') + '</td>'
        + '<td style="padding:4px 6px;font-size:0.72rem;color:var(--muted);border-right:1px solid var(--border)">' + (ex.pagamento||'—') + '</td>'
        + '<td style="padding:4px 6px;font-size:0.72rem;color:var(--muted);border-right:1px solid var(--border)">' + (ex.tipoLanc||'variavel') + '</td>'
        + '<td style="padding:4px 6px;font-size:0.72rem;color:var(--muted);text-align:center;border-right:1px solid var(--border)">' + (ex.parcAtual ? ex.parcAtual+'/'+ex.parcTotal : '—') + '</td>'
        + '<td style="padding:4px 6px;font-size:0.72rem;color:#ef4444;text-align:right;font-family:monospace;border-right:1px solid var(--border)">-' + exFmt(ex.valor) + '</td>'
        + '<td style="padding:4px 6px;font-size:0.72rem;color:var(--muted);border-right:1px solid var(--border)">' + (ex.categoria||'—') + '</td>'
        + '<td style="padding:4px 6px;font-size:0.72rem;color:var(--muted);border-right:1px solid var(--border)">' + (ex.subCategoria||'—') + '</td>'
        + '<td style="padding:4px 6px;font-size:0.72rem;color:var(--muted);border-right:1px solid var(--border)">' + (ex.terceiro||'—') + '</td>'
        + '<td style="padding:4px 6px;font-size:0.72rem;color:var(--muted);text-align:center;border-right:1px solid var(--border)">' + (ex.vencimento||'—') + '</td>'
        + '<td style="padding:4px 6px;font-size:0.72rem;text-align:center;border-right:1px solid var(--border)"><span style="color:' + (ex.status==='pago'?'#4af0a0':'#f59e0b') + '">' + (ex.status||'—') + '</span></td>'
        + '<td style="padding:4px 6px"></td>'
        + '</tr>';
    }
    return row;
  }

  rows.forEach(function(r, i) {
    var rowHtml = _buildImportRow(r, (r._origIdx !== undefined ? r._origIdx : i));
    if (r._existingMatch) {
      htmlDup += rowHtml;
    } else if (!(r.categoria || r.xlsxCat || suggestCat(r.desc))) {
      htmlNaoId += rowHtml;
    } else {
      htmlNew += rowHtml;
    }
  });

  // Seção Duplicados
  var dupCount = _dups.length;
  var dupIaCount = rows.filter(function(r) { return r._iaDupSemantic; }).length;
  var dupCountEl = document.getElementById('imp-dup-count');
  var dupMsg = '';
  if (dupCount > 0) dupMsg += dupCount + ' duplicata' + (dupCount !== 1 ? 's' : '') + ' exata' + (dupCount !== 1 ? 's' : '') + ' (desmarcadas)';
  if (dupIaCount > 0) dupMsg += (dupMsg ? ' · ' : '') + dupIaCount + ' possível' + (dupIaCount !== 1 ? 'is' : '') + ' duplicata' + (dupIaCount !== 1 ? 's' : '') + ' ✨IA (verifique)';
  if (dupCountEl) dupCountEl.textContent = dupMsg || '—';
  document.getElementById('importTableDups').innerHTML = htmlDup;

  // Seção Novos
  var newCount = rows.filter(function(r) { return !r._existingMatch && (r.categoria || r.xlsxCat || suggestCat(r.desc)); }).length;
  var newCountEl = document.getElementById('imp-new-count');
  if (newCountEl) newCountEl.textContent = newCount + ' lançamento' + (newCount !== 1 ? 's' : '');
  document.getElementById('importTableNew').innerHTML = htmlNew;

  // Seção Não identificados
  var naoIdCount = rows.filter(function(r) { return !r._existingMatch && !(r.categoria || r.xlsxCat || suggestCat(r.desc)); }).length;
  var naoIdCountEl = document.getElementById('imp-naoid-count');
  if (naoIdCountEl) naoIdCountEl.textContent = naoIdCount + ' lançamento' + (naoIdCount !== 1 ? 's' : '') + ' sem categoria identificada';
  var naoIdTable = document.getElementById('importTableNaoId');
  if (naoIdTable) naoIdTable.innerHTML = htmlNaoId;

  // Abas: mostrar barra e atualizar badges
  var tabBar = document.getElementById('imp-tab-bar');
  if (tabBar) tabBar.style.display = 'flex';
  var bulkBar = document.getElementById('imp-bulk-bar');
  if (bulkBar) bulkBar.style.display = 'flex';
  var badgeNew = document.getElementById('imp-tab-badge-new');
  var badgeDups = document.getElementById('imp-tab-badge-dups');
  var badgeNaoid = document.getElementById('imp-tab-badge-naoid');
  if (badgeNew) badgeNew.textContent = newCount;
  if (badgeDups) badgeDups.textContent = dupCount + dupIaCount;
  if (badgeNaoid) badgeNaoid.textContent = naoIdCount;
  // Ocultar badges zero
  if (badgeDups) badgeDups.style.display = (dupCount + dupIaCount) > 0 ? '' : 'none';
  if (badgeNaoid) badgeNaoid.style.display = naoIdCount > 0 ? '' : 'none';
  // Ativar aba: começa em "novos", mas se só tiver dups vai para dups
  var defaultTab = newCount > 0 ? 'new' : (dupCount > 0 ? 'dups' : 'naoid');
  switchImportTab(defaultTab);

  // Force-apply values via JS (innerHTML selected attribute is unreliable)
  document.querySelectorAll('.import-pgto').forEach(function(sel) {
    var v = sel.getAttribute('data-pgto') || '';
    if (v) sel.value = v;
  });
  // Populate cat/sub selects via JS (avoids emoji/quote corruption in HTML strings)
  var allCats = loadCats();
  var allCatsSorted = allCats.slice().sort(function(a,b){ return a.nome.localeCompare(b.nome,'pt-BR'); });

  document.querySelectorAll('.import-cat-sel').forEach(function(sel) {
    var sugCatV = sel.getAttribute('data-cat') || '';
    // Populate options (select oculto — usado para persistência)
    sel.innerHTML = '';
    var blankOpt = document.createElement('option');
    blankOpt.value = ''; blankOpt.textContent = '— Sem categoria —';
    sel.appendChild(blankOpt);
    allCatsSorted.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.nome;
      opt.textContent = (c.icone ? c.icone + ' ' : '') + c.nome;
      sel.appendChild(opt);
    });
    // Apply value
    if (sugCatV) {
      sel.value = sugCatV;
      if (!sel.value) {
        var vl = sugCatV.toLowerCase();
        for (var oi = 0; oi < sel.options.length; oi++) {
          if (sel.options[oi].value.toLowerCase() === vl) { sel.value = sel.options[oi].value; break; }
        }
      }
    }
    // Sync button label with selected value
    var idx = sel.dataset.idx;
    var catBtn = document.querySelector('.import-cat-btn[data-idx="' + idx + '"]');
    if (catBtn) {
      var catVal = sel.value;
      if (catVal) {
        var catObj = allCats.find(function(c){ return c.nome === catVal; });
        catBtn.textContent = (catObj && catObj.icone ? catObj.icone + ' ' : '') + catVal;
      } else {
        catBtn.textContent = '— Sem categoria —';
      }
    }
    // Now populate subs based on chosen cat
    var idx = sel.dataset.idx;
    var subSel = document.querySelector('.import-sub-sel[data-idx="' + idx + '"]');
    if (subSel) {
      var catNome = sel.value;
      var sugSubV = subSel.getAttribute('data-sub') || '';
      subSel.innerHTML = '';
      var blankSub = document.createElement('option');
      blankSub.value = ''; blankSub.textContent = '— Nenhuma —';
      subSel.appendChild(blankSub);
      if (catNome) {
        var cat = null;
        for (var ci = 0; ci < allCats.length; ci++) { if (allCats[ci].nome === catNome) { cat = allCats[ci]; break; } }
        if (cat && cat.subs && cat.subs.length) {
          var subs = cat.subs.map(function(s){ return typeof s === 'string' ? s : s.nome; });
          subs.sort(function(a,b){ return a.localeCompare(b,'pt-BR'); });
          subs.forEach(function(sNome) {
            var sOpt = document.createElement('option');
            sOpt.value = sNome; sOpt.textContent = sNome;
            subSel.appendChild(sOpt);
          });
        }
      }
      if (sugSubV) {
        subSel.value = sugSubV;
        if (!subSel.value) {
          var svl = sugSubV.toLowerCase();
          for (var si = 0; si < subSel.options.length; si++) {
            if (subSel.options[si].value.toLowerCase() === svl) { subSel.value = subSel.options[si].value; break; }
          }
        }
      }
      // Sync sub button label
      var subBtn = document.querySelector('.import-sub-btn[data-idx="' + idx + '"]');
      if (subBtn) {
        var subVal = subSel.value;
        subBtn.textContent = subVal || '— Nenhuma —';
        subBtn.dataset.sub = subVal;
      }
    }
  });
  // Sub selects without a cat: still need blank option
  document.querySelectorAll('.import-sub-sel').forEach(function(sel) {
    if (sel.options.length === 0) {
      var b = document.createElement('option'); b.value = ''; b.textContent = '— Nenhuma —';
      sel.appendChild(b);
    }
  });

  // Populate Terceiro selects
  var allTercs = loadTerceiros().slice().sort(function(a,b){ return a.nome.localeCompare(b.nome,'pt-BR'); });
  // FIX: normaliza nome para match sem acento/case
  var _normTerc = function(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); };
  var tercNormMap = {};
  allTercs.forEach(function(t){ tercNormMap[_normTerc(t.nome)] = t.nome; });

  document.querySelectorAll('.import-terc-sel').forEach(function(sel) {
    var idx = parseInt(sel.dataset.idx);
    var r = importParsedRows[idx];
    sel.innerHTML = '';
    var blank = document.createElement('option'); blank.value = ''; blank.textContent = '— Nenhum —';
    sel.appendChild(blank);
    allTercs.forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t.nome;
      opt.textContent = '👤 ' + t.nome;
      sel.appendChild(opt);
    });
    // FIX: pre-select usando match normalizado (ignora diferença de acento/case)
    // Prioridade: xlsxTerc (planilha) > terceiro (recuperado de deletados)
    var _tercSrc = (r && r.xlsxTerc) ? r.xlsxTerc : (r && r.terceiro ? r.terceiro : '');
    if (_tercSrc) {
      var matchedNome = tercNormMap[_normTerc(_tercSrc)];
      if (matchedNome) {
        sel.value = matchedNome;
      } else {
        // Nome não cadastrado — mantém como texto na primeira opção para o usuário ver
        var opt = document.createElement('option');
        opt.value = _tercSrc;
        opt.textContent = '⚠️ ' + _tercSrc + ' (não cadastrado)';
        opt.style.color = '#f59e0b';
        sel.insertBefore(opt, sel.options[1]);
        sel.value = _tercSrc;
      }
    }
  });

  document.getElementById('importPreview').style.display = 'block';
  document.getElementById('btnDoImport').style.display = 'inline-block';

  // Auto-suggest most common pgto in bulk selector
  var pgtoCount = {};
  document.querySelectorAll('.import-pgto').forEach(function(sel) {
    if (sel.value) pgtoCount[sel.value] = (pgtoCount[sel.value] || 0) + 1;
  });
  var topPgto = Object.keys(pgtoCount).sort(function(a,b){ return pgtoCount[b]-pgtoCount[a]; })[0] || '';
  if (topPgto) document.getElementById('bulkPgtoSelect').value = topPgto;

  updateImportTotals();
}

function updateImportTotals() {
  var defaultTipo = document.getElementById('importDefaultTipo') ? document.getElementById('importDefaultTipo').value || 'despesa' : 'despesa';
  var totalDesp = 0, totalRec = 0, qtd = 0, futuros = 0;
  document.querySelectorAll('.import-check').forEach(function(cb) {
    if (!cb.checked) return;
    var idx = parseInt(cb.dataset.idx);
    var r = importParsedRows[idx];
    if (!r) return;
    qtd++;
    // Use xlsxTipo if set, otherwise fallback to defaultTipo select
    var tipo = r.xlsxTipo || defaultTipo;
    // Preserve original sign: negative value = credit/estorno, reduces the total
    var signedValue = r.originalSign < 0 ? -r.value : r.value;
    if (tipo === 'receita') totalRec += r.value;
    else totalDesp += signedValue;
    // Count future generated lancamentos (info only)
    var tipoLancSel = document.querySelector('.import-tipo-lanc[data-idx="' + idx + '"]');
    var tipoLancV = tipoLancSel ? tipoLancSel.value : (r.xlsxTipoLanc || 'variavel');
    var isParc = r.parcAtual !== null && r.parcTotal > 1;
    var isFixo = tipoLancV === 'fixo' && !isParc;
    if (isParc) futuros += (r.parcTotal - r.parcAtual);
    if (isFixo) {
      var nInp = document.querySelector('.import-nmeses[data-idx="' + idx + '"]');
      var n = nInp ? (parseInt(nInp.value) || 12) : (r.xlsxNMeses || 12);
      futuros += n - 1;
    }
  });
  var saldo = totalRec - totalDesp;
  document.getElementById('importTotQtd').textContent = qtd;
  document.getElementById('importTotDesp').textContent = '-' + fmtBR(totalDesp);
  document.getElementById('importTotRec').textContent = totalRec > 0 ? '+' + fmtBR(totalRec) : fmtBR(0);
  var sEl = document.getElementById('importTotSaldo');
  sEl.textContent = (saldo >= 0 ? '+' : '-') + fmtBR(Math.abs(saldo));
  sEl.style.color = saldo >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('importTotFuturos').textContent = futuros > 0 ? '+' + futuros + ' futuros' : '—';
  _renderItauDiag(totalDesp, qtd);
}

// Total REAL na plataforma para o cartão Black Itaú, com o MESMO critério do card
// (cartoes-config.js): despesa, agrupado por l.mes/l.ano, excluindo espelho e
// "Entrada Terceiro". Mês/ano vem do "Vencimento em massa" (ou do venc da fatura).
function _platTotalItau() {
  var m = null, a = null;
  var bv = document.getElementById('bulkVencInput');
  if (bv && /^\d{4}-\d{2}-\d{2}$/.test(bv.value)) { var p = bv.value.split('-'); a = parseInt(p[0]); m = parseInt(p[1]); }
  else if (window._itauVencimentoBr && /^\d{2}\/\d{2}\/\d{4}$/.test(window._itauVencimentoBr)) { var q = window._itauVencimentoBr.split('/'); m = parseInt(q[1]); a = parseInt(q[2]); }
  var all = (typeof _memCache !== 'undefined' && _memCache && _memCache.lancamentos) ? _memCache.lancamentos : [];
  var np = function(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
  var per = function(l) {
    var vc = l.vencimento || '';
    var x = String(vc).match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (x) return { m: parseInt(x[2]), a: parseInt(x[3]) };
    var y = String(vc).match(/^(\d{4})-(\d{2})-(\d{2})/);   if (y) return { m: parseInt(y[2]), a: parseInt(y[1]) };
    return { m: Number(l.mes), a: Number(l.ano) };
  };
  var tot = 0, n = 0;
  all.forEach(function(l) {
    if (np(l.pagamento).indexOf('black ita') === -1) return;
    if (l.tipo && l.tipo !== 'despesa') return;
    if (l._espelhoDe) return;
    if (l.categoria === 'Entrada Terceiro') return;
    if (m) { var pr = per(l); if (pr.m !== m || pr.a !== a) return; }
    tot += parseFloat(l.valor) || 0; n++;
  });
  return { tot: Math.abs(tot), n: n, m: m, a: a };
}

// Diagnóstico: compras da fatura × o que JÁ está na plataforma (total real do
// cartão, batendo com o card) × novos a importar. Não confunde com a seleção.
function _renderItauDiag(selSum, selCount) {
  var el = document.getElementById('importDiagPanel');
  if (!el) return;
  var d = (typeof window !== 'undefined') ? window._itauDiag : null;
  if (!d) { el.style.display = 'none'; return; }
  var f = fmtBR;
  var rows = importParsedRows || [];
  var _sv = function(r) { return r.originalSign < 0 ? -(r.value || 0) : (r.value || 0); };
  var novos = rows.filter(function(r) { return !r._existingMatch; });
  var novosTot = novos.reduce(function(s, r) { return s + _sv(r); }, 0);
  var jaN = rows.length - novos.length;
  var plat = _platTotalItau();
  var mmaa = plat.m ? String(plat.m).padStart(2, '0') + '/' + plat.a : '';
  var novosNaoMarcados = 0, novosNaoMarcadosTot = 0;
  novos.forEach(function(r) {
    var cb = document.querySelector('.import-check[data-idx="' + r._origIdx + '"]');
    if (cb && !cb.checked) { novosNaoMarcados++; novosNaoMarcadosTot += r.value || 0; }
  });
  var L = [];
  L.push('<div style="font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:0.72rem;margin-bottom:6px;color:var(--text)">🔎 Conferência da fatura Itaú</div>');
  L.push('<div style="display:flex;flex-wrap:wrap;gap:14px;color:var(--text2)">');
  L.push('<span>Compras na fatura: <strong>' + f(d.comprasSum) + '</strong> (' + d.comprasN + ')</span>');
  L.push('<span>No cartão na plataforma' + (mmaa ? ' (' + mmaa + ')' : '') + ': <strong style="color:var(--green)">' + f(plat.tot) + '</strong> (' + plat.n + ')</span>');
  L.push('<span>Novos a importar: <strong style="color:' + (novos.length ? 'var(--accent)' : 'var(--green)') + '">' + f(novosTot) + '</strong> (' + novos.length + ')</span>');
  if (d.estornoN > 0) L.push('<span>Estornos (crédito, deduzem): <strong style="color:var(--green)">-' + f(d.estornoSum) + '</strong> (' + d.estornoN + ')</span>');
  L.push('</div>');
  if (!novos.length) {
    L.push('<div style="margin-top:6px;font-weight:700;color:var(--green)">✅ Nada novo: as ' + d.comprasN + ' compras desta fatura já estão lançadas (' + jaN + ' duplicados).</div>');
    el.style.borderColor = 'rgba(74,240,160,0.4)'; el.style.background = 'rgba(74,240,160,0.07)';
  } else if (novosNaoMarcados > 0) {
    L.push('<div style="margin-top:6px;font-weight:700;color:var(--accent)">' + novos.length + ' novo(s) a importar (R$ ' + f(novosTot) + '). ⚠️ ' + novosNaoMarcados + ' DESMARCADO(s) (R$ ' + f(novosNaoMarcadosTot) + ') — veja a aba ✚ Novos.</div>');
    el.style.borderColor = 'rgba(240,192,64,0.45)'; el.style.background = 'rgba(240,192,64,0.08)';
  } else {
    L.push('<div style="margin-top:6px;font-weight:700;color:var(--green)">✅ ' + novos.length + ' novo(s) marcado(s) p/ importar (R$ ' + f(novosTot) + '). ' + jaN + ' duplicados já estão na plataforma.</div>');
    el.style.borderColor = 'rgba(74,240,160,0.4)'; el.style.background = 'rgba(74,240,160,0.07)';
  }
  // Por que o "no cartão" difere das compras da fatura
  var difFP = d.comprasSum - plat.tot;
  if (Math.abs(difFP) > 0.01) {
    L.push('<div style="margin-top:4px;color:var(--muted);font-size:0.74rem">Compras da fatura (' + f(d.comprasSum) + ') × cartão na plataforma (' + f(plat.tot) + ') diferem em ' + f(Math.abs(difFP)) + ': estornos/créditos não lançados (−' + f(d.estornoSum) + ') + compras que o corte (dia 8) jogou para outro mês. Detalhe em 🔍 Conferir × plataforma.</div>');
  }
  el.innerHTML = L.join('');
  el.style.display = 'block';
}

function closeReconcile() {
  var ov = document.getElementById('reconcileOverlay');
  if (ov) ov.style.display = 'none';
}

function _toggleAllExtras(checked) {
  document.querySelectorAll('.reconcile-extra-chk').forEach(function(c) { c.checked = checked; });
}

// Move para "Black Itau" os lançamentos que casaram com a fatura mas estavam com
// outro pagamento (por isso não entravam no card). Mantém categoria/terceiro/valor.
async function _moverParaBlackItau() {
  var ids = (window._reconcileFixPgtoIds || []).filter(function(x) { return x != null && x !== ''; });
  if (!ids.length) { alert('Nenhum lançamento para corrigir.'); return; }
  var msg = 'Fazer ' + ids.length + ' lançamento(s) entrarem no card do Black Itaú?\n\n• pagamento → "Black Itau"\n• categoria "Entrada Terceiro" → "Dividas de terceiros" (passa a contar no card)\n\nMantém valor, terceiro e vencimento.';
  var ok = (typeof _showSimpleConfirm === 'function') ? await _showSimpleConfirm('🏦 Fazer entrar no card', msg, 'Corrigir ' + ids.length, 'var(--accent2)') : confirm(msg);
  if (!ok) return;
  var set = {}; ids.forEach(function(id) { set[String(id)] = true; });
  var patchOf = function(l) {
    var p = { pagamento: 'Black Itau' };
    if (l.categoria === 'Entrada Terceiro') { p.categoria = 'Dividas de terceiros'; if (l.subCategoria === 'Entrada Terceiro') p.subCategoria = ''; }
    return p;
  };
  var patches = {};
  if (typeof _memCache !== 'undefined' && _memCache && _memCache.lancamentos) {
    _memCache.lancamentos = _memCache.lancamentos.map(function(l) {
      if (l.id != null && set[String(l.id)]) { var p = patchOf(l); patches[String(l.id)] = p; return Object.assign({}, l, p); }
      return l;
    });
  }
  ids.forEach(function(id) { if (typeof dbUpdateLancamento === 'function') dbUpdateLancamento(id, patches[String(id)] || { pagamento: 'Black Itau' }).catch(function(e) { console.warn('[moverBlackItau]', e && e.message); }); });
  if (typeof renderAll === 'function') { try { renderAll(); } catch (e) {} }
  if (typeof renderCartoesTab === 'function') { try { renderCartoesTab(); } catch (e) {} }
  alert('🏦 ' + ids.length + ' lançamento(s) corrigido(s) para entrar no card. Reconferindo…');
  conferirFaturaPlataforma();
}

// Exclui da plataforma os "extras" marcados (lançamentos do cartão sem par na fatura).
async function _excluirExtrasItau() {
  var ids = [];
  document.querySelectorAll('.reconcile-extra-chk:checked').forEach(function(c) {
    var id = c.dataset.id;
    if (id !== undefined && id !== '') ids.push(id);
  });
  if (!ids.length) { alert('Marque ao menos um lançamento para excluir.'); return; }
  var msg = 'Excluir DEFINITIVAMENTE ' + ids.length + ' lançamento(s) "extra" do cartão (sem correspondência nesta fatura)?\n\nRemove da plataforma — não dá para desfazer.';
  var ok = (typeof _showSimpleConfirm === 'function')
    ? await _showSimpleConfirm('🗑 Excluir extras', msg, 'Excluir ' + ids.length, 'var(--red)')
    : confirm(msg);
  if (!ok) return;
  var idsSet = {};
  ids.forEach(function(id) { idsSet[String(id)] = true; });
  ids.forEach(function(id) { if (typeof _addTombstone === 'function') _addTombstone(id); });
  if (typeof _memCache !== 'undefined' && _memCache && _memCache.lancamentos) {
    _memCache.lancamentos = _memCache.lancamentos.filter(function(l) { return !idsSet[String(l.id)]; });
  }
  ids.forEach(function(id) { if (typeof dbDeleteLancamento === 'function') dbDeleteLancamento(id).catch(function(e) { console.warn('[excluirExtras]', e && e.message); }); });
  if (typeof renderAll === 'function') { try { renderAll(); } catch (e) {} }
  if (typeof renderCartoesTab === 'function') { try { renderCartoesTab(); } catch (e) {} }
  alert('🗑 ' + ids.length + ' extra(s) excluído(s). Reconferindo…');
  conferirFaturaPlataforma(); // recomputa o relatório com a base já limpa
}

// ── Desmembrar lançamento: parte do valor vai para um terceiro ───────────────
// Modelo padrão do app: a parte do terceiro vira despesa "Dividas de terceiros"
// (no cartão) + espelho "Entrada Terceiro" (conta a receber, pendente).
var _splitIdx = -1;
var _splitMode = 'valor'; // 'valor' | 'pct'
function _splitBadgeHtml(r) {
  if (!r || !r._split || !(r._split.value > 0)) return '';
  var pctTxt = r._split.pct ? ' (' + r._split.pct + '%)' : '';
  return '<div style="font-size:0.66rem;color:var(--accent);margin-top:3px;white-space:nowrap;font-weight:700">✂️ ' + fmtBR(r._split.value) + pctTxt + ' → ' + (r._split.terceiro || '?') + '</div>';
}
// Valor do terceiro a partir do input, conforme o modo (R$ direto ou % do total).
function _splitTercVal() {
  var r = importParsedRows[_splitIdx]; if (!r) return 0;
  var raw = parseFloat(document.getElementById('splitValor').value) || 0;
  if (_splitMode === 'pct') return Math.round(r.value * raw) / 100;
  return Math.round(raw * 100) / 100;
}
function _splitSetMode(m) {
  _splitMode = m;
  var bV = document.getElementById('splitModeValor'), bP = document.getElementById('splitModePct');
  var lbl = document.getElementById('splitValorLabel'), inp = document.getElementById('splitValor');
  var on = 'background:var(--accent2);color:#000;', off = 'background:transparent;color:var(--text2);';
  if (bV) bV.style.cssText = 'border:none;padding:3px 12px;font-size:0.78rem;font-weight:700;cursor:pointer;' + (m === 'valor' ? on : off);
  if (bP) bP.style.cssText = 'border:none;border-left:1px solid var(--border);padding:3px 12px;font-size:0.78rem;font-weight:700;cursor:pointer;' + (m === 'pct' ? on : off);
  if (m === 'pct') { lbl.textContent = 'Percentual do terceiro (%)'; inp.setAttribute('max', '100'); inp.placeholder = 'ex: 50'; }
  else { lbl.textContent = 'Valor do terceiro (R$)'; inp.removeAttribute('max'); inp.placeholder = ''; }
  _splitUpdateInfo();
}
function openSplit(idx) {
  _splitIdx = idx;
  var r = importParsedRows[idx];
  if (!r) return;
  document.getElementById('splitInfo').innerHTML = '<strong>' + (r.desc || r.descRaw || '') + '</strong><br>Valor total: <strong>' + fmtBR(r.value) + '</strong>';
  var sel = document.getElementById('splitTerceiro');
  var tercs = (typeof loadTerceiros === 'function') ? (loadTerceiros() || []) : [];
  sel.innerHTML = '<option value="">— selecione —</option>' + tercs.slice().sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || '', 'pt-BR'); }).map(function(t) { return '<option value="' + (t.nome || '').replace(/"/g, '&quot;') + '">' + (t.nome || '') + '</option>'; }).join('');
  if (r._split && r._split.pct) {
    document.getElementById('splitValor').value = r._split.pct;
    _splitSetMode('pct');
  } else {
    document.getElementById('splitValor').value = (r._split && r._split.value) ? r._split.value : '';
    _splitSetMode('valor');
  }
  if (r._split && r._split.terceiro) sel.value = r._split.terceiro;
  document.getElementById('splitRemoveBtn').style.display = r._split ? '' : 'none';
  _splitUpdateInfo();
  document.getElementById('splitOverlay').style.display = 'flex';
}
function _splitUpdateInfo() {
  var r = importParsedRows[_splitIdx]; if (!r) return;
  var tval = _splitTercVal();
  var pctTxt = (_splitMode === 'pct') ? ' (' + (parseFloat(document.getElementById('splitValor').value) || 0) + '%)' : '';
  var pv = document.getElementById('splitPreview');
  if (tval <= 0) { pv.innerHTML = '<span style="color:var(--muted)">Informe quanto desse lançamento é do terceiro (' + (_splitMode === 'pct' ? '%' : 'R$') + ').</span>'; return; }
  if (tval >= r.value) { pv.innerHTML = '<span style="color:#ef4444">A parte do terceiro deve ser menor que ' + fmtBR(r.value) + '.</span>'; return; }
  var me = Math.round((r.value - tval) * 100) / 100;
  pv.innerHTML = 'Sua parte (despesa): <strong>' + fmtBR(me) + '</strong><br>Parte do terceiro (Dívida de terceiros → a receber): <strong style="color:var(--accent)">' + fmtBR(tval) + pctTxt + '</strong>';
}
function confirmSplit() {
  var r = importParsedRows[_splitIdx]; if (!r) return;
  var tval = _splitTercVal();
  var terc = document.getElementById('splitTerceiro').value;
  if (tval <= 0 || tval >= r.value) { alert('A parte do terceiro deve ficar entre 0,01 e ' + fmtBR(r.value) + '.'); return; }
  if (!terc) { alert('Selecione o terceiro.'); return; }
  var pct = (_splitMode === 'pct') ? (parseFloat(document.getElementById('splitValor').value) || 0) : null;
  r._split = { value: tval, terceiro: terc, pct: pct };
  var b = document.getElementById('split-badge-' + _splitIdx); if (b) b.innerHTML = _splitBadgeHtml(r);
  closeSplit();
}
function removeSplit() {
  var r = importParsedRows[_splitIdx]; if (r) delete r._split;
  var b = document.getElementById('split-badge-' + _splitIdx); if (b) b.innerHTML = '';
  closeSplit();
}
function closeSplit() { var ov = document.getElementById('splitOverlay'); if (ov) ov.style.display = 'none'; }

// Conferência: cruza a fatura carregada (compras) com os lançamentos já na
// plataforma (Black Itaú, mesmo mês de vencimento) e mostra a diferença dos 2 lados.
function conferirFaturaPlataforma() {
  if (!importParsedRows || !importParsedRows.length) { alert('Carregue a fatura primeiro (Importar Black Itaú).'); return; }
  var f = fmtBR;
  // Mês/ano alvo: do campo "Vencimento em massa" (ISO) ou do vencimento da fatura
  var alvoMes = null, alvoAno = null, alvoLabel = '';
  var bv = document.getElementById('bulkVencInput');
  if (bv && bv.value && /^\d{4}-\d{2}-\d{2}$/.test(bv.value)) { var p = bv.value.split('-'); alvoAno = parseInt(p[0]); alvoMes = parseInt(p[1]); }
  else if (window._itauVencimentoBr && /^\d{2}\/\d{2}\/\d{4}$/.test(window._itauVencimentoBr)) { var q = window._itauVencimentoBr.split('/'); alvoMes = parseInt(q[1]); alvoAno = parseInt(q[2]); }
  if (alvoMes) alvoLabel = String(alvoMes).padStart(2, '0') + '/' + alvoAno;

  // Lançamentos da plataforma — SEMPRE pelo VENCIMENTO da fatura (o que importa é a
  // que fatura o lançamento pertence, não o mês de competência): pagamento Black Itaú,
  // tipo despesa, vencimento no mês/ano alvo, excluindo espelhos e "Entrada Terceiro".
  var all = (typeof _memCache !== 'undefined' && _memCache && _memCache.lancamentos) ? _memCache.lancamentos : [];
  var npg = function(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
  // Período (mês/ano) de um lançamento PELO VENCIMENTO (fallback p/ mes/ano se sem venc)
  var _periodo = function(l) {
    var vc = l.vencimento || '';
    var m1 = String(vc).match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m1) return { m: parseInt(m1[2]), a: parseInt(m1[3]) };
    var m2 = String(vc).match(/^(\d{4})-(\d{2})-(\d{2})/);   if (m2) return { m: parseInt(m2[2]), a: parseInt(m2[1]) };
    return { m: Number(l.mes), a: Number(l.ano) };
  };
  var plat = all.filter(function(l) {
    if (npg(l.pagamento).indexOf('black ita') === -1) return false;
    if (l.tipo && l.tipo !== 'despesa') return false;
    if (l._espelhoDe) return false;
    if (l.categoria === 'Entrada Terceiro') return false;
    if (!alvoMes) return true;
    var pr = _periodo(l);
    return pr.m === alvoMes && pr.a === alvoAno;
  });

  // Consistência TOTAL com a aba "Novos/Duplicados": usa o MESMO resultado do dedup
  // da pré-visualização (r._existingMatch), que compara contra a base inteira e é
  // ciente de parcela. Evita divergência entre as duas telas.
  var temDedup = importParsedRows.some(function(r) { return r.hasOwnProperty('_existingMatch'); });
  var faltando = importParsedRows.filter(function(r) { return !r._existingMatch; }); // = "Novos"
  var matchedIds = {};
  importParsedRows.forEach(function(r) { (r._matchIds || []).forEach(function(id) { matchedIds[id] = true; }); });
  var soPlat = plat.filter(function(l) { return !matchedIds[String(l.id)]; }); // Black Itaú deste venc sem par na fatura

  // Compras da fatura cujo lançamento na plataforma está em OUTRO mês (não no card-alvo).
  // É a causa de o card ficar menor que a fatura mesmo com "faltando 0".
  var emOutro = [];
  importParsedRows.forEach(function(r) {
    var m = r._existingMatch;
    if (!m || !alvoMes) return;
    var pr = _periodo(m);
    if (pr.m !== alvoMes || pr.a !== alvoAno) emOutro.push({ r: r, m: m, pr: pr });
  });

  // Resíduo REAL: a compra da fatura casou com um lançamento existente, mas esse
  // lançamento NÃO está no card de junho (foi lançado com OUTRO pagamento — ex: Pix —,
  // ou como Entrada Terceiro, ou venc/mês diferente). O dedup casa por valor mas ignora
  // o pagamento, por isso "faltando 0" mas o card menor. Acionável: mover p/ Black Itaú.
  var _byId = {};
  all.forEach(function(l) { if (l.id != null) _byId[String(l.id)] = l; });
  var platIdSet = {};
  plat.forEach(function(l) { if (l.id != null) platIdSet[String(l.id)] = true; });
  var foraDoCard = [];
  importParsedRows.forEach(function(r) {
    var m = r._existingMatch;
    if (!m) return;
    var ids = (r._matchIds && r._matchIds.length) ? r._matchIds : (m.id != null ? [String(m.id)] : []);
    var checados = ids.length ? ids.map(function(id) { return _byId[id]; }) : [m];
    checados.forEach(function(l) {
      if (!l || (l.id != null && platIdSet[String(l.id)])) return; // já está no card → ok
      var ehBlack = npg(l.pagamento).indexOf('black ita') !== -1;
      var motivo = !ehBlack ? 'pagamento: ' + (l.pagamento || '—')
        : (l.categoria === 'Entrada Terceiro' ? 'Entrada Terceiro'
        : (l._espelhoDe ? 'espelho' : 'venc/mês diferente'));
      foraDoCard.push({ r: r, l: l, motivo: motivo, fixPgto: !ehBlack });
    });
  });
  var foraDoCardTot = foraDoCard.reduce(function(s, x) { return s + Math.abs(parseFloat(x.l.valor) || 0); }, 0);
  // Corrigíveis = despesas que dá pra fazer entrar no card (pagamento e/ou categoria).
  var fixaveis = foraDoCard.filter(function(x) { return x.l.id != null && (x.l.tipo === 'despesa' || x.l.tipo == null); });
  window._reconcileFixPgtoIds = fixaveis.map(function(x) { return String(x.l.id); });

  var _sv = function(r) { return r.originalSign < 0 ? -(r.value || 0) : (r.value || 0); }; // valor com sinal (estorno negativo)
  var faturaTot = importParsedRows.reduce(function(s, r) { return s + _sv(r); }, 0);
  var faltandoTot = faltando.reduce(function(s, r) { return s + _sv(r); }, 0);
  var emOutroTot = emOutro.reduce(function(s, x) { return s + x.r.value; }, 0);
  var platTot = plat.reduce(function(s, l) { return s + (parseFloat(l.valor) || 0); }, 0); // total REAL na plataforma (= card)
  var platAbs = Math.abs(platTot);
  var soPlatTot = soPlat.reduce(function(s, l) { return s + Math.abs(parseFloat(l.valor) || 0); }, 0);
  var matchedPlatTot = Math.max(0, platAbs - soPlatTot); // compras DESTA fatura que estão no card (lado plataforma)
  var residual = faturaTot - faltandoTot - emOutroTot - matchedPlatTot; // diferença de valor (lançamentos antigos)
  var d = window._itauDiag || {};

  var H = [];
  H.push('<div style="display:flex;flex-wrap:wrap;gap:14px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;margin-bottom:12px">');
  H.push('<span>Compras na fatura: <strong>' + f(faturaTot) + '</strong> (' + importParsedRows.length + ')</span>');
  H.push('<span>Faltando lançar: <strong style="color:' + (faltando.length ? '#ef4444' : 'var(--green)') + '">' + f(faltandoTot) + '</strong> (' + faltando.length + ')</span>');
  H.push('<span>Card de ' + (alvoLabel || '—') + ' (plataforma): <strong>' + f(platAbs) + '</strong> (' + plat.length + ')</span>');
  H.push('<span>Extras no card (fora da fatura): <strong style="color:var(--accent)">' + f(soPlatTot) + '</strong> (' + soPlat.length + ')</span>');
  H.push('</div>');
  if (!faltando.length) {
    H.push('<div style="font-weight:700;color:var(--green);margin-bottom:6px">✅ Fatura completa: todas as ' + importParsedRows.length + ' compras já estão lançadas (nada a importar).</div>');
  }
  // Reconciliação do card (fecha a conta de forma consistente)
  var conta = [];
  conta.push('<strong>Composição do card de ' + (alvoLabel || '—') + ' (' + f(platAbs) + '):</strong>');
  conta.push('• R$ ' + f(matchedPlatTot) + ' = compras DESTA fatura já lançadas neste mês.');
  if (soPlat.length) conta.push('• R$ ' + f(soPlatTot) + ' = <strong>extras</strong> (' + soPlat.length + ') que NÃO são desta fatura (lançamentos antigos/duplicados/manuais — lista abaixo).');
  if (emOutro.length) conta.push('• R$ ' + f(emOutroTot) + ' das compras estão lançadas com vencimento em OUTRO mês (lista abaixo).');
  if (foraDoCard.length) conta.push('• R$ ' + f(foraDoCardTot) + ' = compras lançadas, mas FORA do card (pagamento diferente de Black Itaú, ou Entrada Terceiro) — lista abaixo, com botão pra corrigir.');
  H.push('<div style="color:var(--text2);font-size:0.78rem;margin-bottom:8px;padding:8px 12px;background:rgba(251,146,60,0.06);border:1px solid rgba(251,146,60,0.25);border-radius:8px">' + conta.join('<br>') + '</div>');
  if (d && d.estornoN > 0) H.push('<div style="color:var(--muted);font-size:0.74rem;margin-bottom:10px">Inclui ' + d.estornoN + ' estorno(s)/crédito(s) lançados como negativo (−' + f(d.estornoSum) + '), que deduzem do total. Por isso a fatura líquida (' + f(faturaTot) + ') bate com o valor declarado/a pagar.</div>');

  function tabela(titulo, cor, itens, getData, getDesc, getVal, tot) {
    var s = '<div style="margin-bottom:14px">';
    s += '<div style="font-weight:700;color:' + cor + ';margin-bottom:6px">' + titulo + ' (' + itens.length + ') — ' + f(tot) + '</div>';
    if (!itens.length) { s += '<div style="color:var(--muted);font-size:0.78rem">— nenhum —</div></div>'; return s; }
    s += '<div style="max-height:30vh;overflow:auto;border:1px solid var(--border);border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:0.76rem">';
    s += '<thead><tr style="position:sticky;top:0;background:var(--surface2)"><th style="text-align:left;padding:5px 8px">Data</th><th style="text-align:left;padding:5px 8px">Descrição</th><th style="text-align:right;padding:5px 8px">Valor</th></tr></thead><tbody>';
    itens.forEach(function(it) {
      s += '<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px;white-space:nowrap;color:var(--text2)">' + (getData(it) || '') + '</td><td style="padding:4px 8px">' + (getDesc(it) || '') + '</td><td style="padding:4px 8px;text-align:right">' + f(Math.abs(getVal(it))) + '</td></tr>';
    });
    s += '</tbody></table></div></div>';
    return s;
  }

  if (!faltando.length && !soPlat.length && !emOutro.length && !foraDoCard.length) {
    H.push('<div style="font-weight:700;color:var(--green);padding:8px 0">✅ Tudo confere: todas as compras da fatura estão no card de ' + (alvoLabel || '—') + ', e não há lançamentos a mais.</div>');
  } else {
    if (foraDoCard.length) {
      var fixN = (window._reconcileFixPgtoIds || []).length;
      var dv = '<div style="margin-bottom:14px">';
      dv += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">';
      dv += '<span style="font-weight:700;color:#fbbf24">🟣 Lançadas, mas FORA do card de Black Itaú (' + foraDoCard.length + ') — ' + f(foraDoCardTot) + '</span>';
      if (fixN) dv += '<button onclick="_moverParaBlackItau()" style="background:rgba(96,165,250,0.12);border:1px solid rgba(96,165,250,0.45);color:#60a5fa;border-radius:7px;padding:5px 12px;font-size:0.76rem;font-weight:700;cursor:pointer">🏦 Fazer ' + fixN + ' entrar no card</button>';
      dv += '</div>';
      dv += '<div style="color:var(--muted);font-size:0.72rem;margin-bottom:6px">Estas compras existem, mas estão <strong>fora do card</strong>: pagamento ≠ Black Itaú, ou categoria <strong>Entrada Terceiro</strong> (que é só o a-receber, não conta como gasto do cartão). O botão corrige: pagamento → Black Itaú e, nas "Entrada Terceiro", categoria → <strong>Dívida de terceiros</strong> (que conta no card e mantém o terceiro). Mantém valor, terceiro e vencimento.</div>';
      dv += '<div style="max-height:30vh;overflow:auto;border:1px solid var(--border);border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:0.76rem">';
      dv += '<thead><tr style="position:sticky;top:0;background:var(--surface2)"><th style="text-align:left;padding:5px 8px">Data</th><th style="text-align:left;padding:5px 8px">Descrição</th><th style="text-align:left;padding:5px 8px">Motivo</th><th style="text-align:right;padding:5px 8px">Valor</th></tr></thead><tbody>';
      foraDoCard.forEach(function(x) {
        dv += '<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px;white-space:nowrap;color:var(--text2)">' + (x.l.data || x.l.vencimento || x.r.date || '') + '</td><td style="padding:4px 8px">' + (x.l.desc || x.r.desc || '') + '</td><td style="padding:4px 8px;color:' + (x.fixPgto ? '#60a5fa' : 'var(--muted)') + '">' + x.motivo + '</td><td style="padding:4px 8px;text-align:right">' + f(Math.abs(parseFloat(x.l.valor) || 0)) + '</td></tr>';
      });
      dv += '</tbody></table></div></div>';
      H.push(dv);
    }
    if (faltando.length) H.push(tabela('🔴 Na fatura, FALTANDO na plataforma', '#ef4444', faltando, function(r){return r.date;}, function(r){return r.desc;}, function(r){return r.value;}, faltandoTot));
    if (emOutro.length) H.push(tabela('🟠 Na fatura, mas com VENCIMENTO em outro mês (não entra no card de ' + (alvoLabel || '—') + ')', '#fb923c', emOutro, function(x){return x.r.date + ' → venc ' + (x.pr.m ? String(x.pr.m).padStart(2,'0') + '/' + x.pr.a : '?');}, function(x){return x.r.desc;}, function(x){return x.r.value;}, emOutroTot));
    // Extras: tabela com checkbox + botão de exclusão (limpar lixo de importações antigas)
    var ex = '<div style="margin-bottom:14px">';
    ex += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">';
    ex += '<span style="font-weight:700;color:var(--accent)">🟡 Na plataforma, SEM corresponder na fatura (' + soPlat.length + ') — ' + f(soPlatTot) + '</span>';
    if (soPlat.length) ex += '<button onclick="_excluirExtrasItau()" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.45);color:#ef4444;border-radius:7px;padding:5px 12px;font-size:0.76rem;font-weight:700;cursor:pointer">🗑 Excluir marcados</button>';
    ex += '</div>';
    if (!soPlat.length) { ex += '<div style="color:var(--muted);font-size:0.78rem">— nenhum —</div></div>'; H.push(ex); }
    else {
      ex += '<div style="color:var(--muted);font-size:0.72rem;margin-bottom:6px">Marque os que são lixo (importação antiga/duplicada) e clique excluir. <strong>Desmarque o que quiser manter.</strong> Exclusão definitiva.</div>';
      ex += '<div style="max-height:34vh;overflow:auto;border:1px solid var(--border);border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:0.76rem">';
      ex += '<thead><tr style="position:sticky;top:0;background:var(--surface2)"><th style="padding:5px 8px"><input type="checkbox" checked onchange="_toggleAllExtras(this.checked)"></th><th style="text-align:left;padding:5px 8px">Data</th><th style="text-align:left;padding:5px 8px">Descrição</th><th style="text-align:right;padding:5px 8px">Valor</th></tr></thead><tbody>';
      soPlat.forEach(function(l) {
        var idAttr = String(l.id != null ? l.id : '').replace(/"/g, '&quot;');
        ex += '<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px;text-align:center"><input type="checkbox" class="reconcile-extra-chk" data-id="' + idAttr + '" checked></td><td style="padding:4px 8px;white-space:nowrap;color:var(--text2)">' + (l.data || l.vencimento || '') + '</td><td style="padding:4px 8px">' + (l.desc || '') + '</td><td style="padding:4px 8px;text-align:right">' + f(Math.abs(parseFloat(l.valor) || 0)) + '</td></tr>';
      });
      ex += '</tbody></table></div></div>';
      H.push(ex);
    }
  }
  if (!temDedup) H.push('<div style="color:#ef4444;font-size:0.74rem;margin-top:8px">⚠️ Detecção de duplicados ainda não rodou — feche e reabra o preview da fatura antes de conferir.</div>');
  if (!alvoMes) H.push('<div style="color:var(--muted);font-size:0.74rem;margin-top:8px">⚠️ Sem mês de vencimento definido — a lista "sem corresponder" considera TODOS os lançamentos Black Itaú. Defina o "Vencimento em massa" para filtrar por 06/2026.</div>');
  if (!all.length) H.push('<div style="color:#ef4444;font-size:0.74rem;margin-top:8px">⚠️ Não encontrei lançamentos carregados em memória. Abra a tela de Lançamentos do mês antes de conferir.</div>');

  document.getElementById('reconcileBody').innerHTML = H.join('');
  document.getElementById('reconcileOverlay').style.display = 'flex';
}

function confirmImport() {
  // Usa a mesma lógica do updateImportTotals para garantir valores idênticos ao cabeçalho
  var defTipo = document.getElementById('importDefaultTipo') ? document.getElementById('importDefaultTipo').value || 'despesa' : 'despesa';
  var totalSel = 0, totalDup = 0, totalDesp = 0, totalRec = 0, futuros = 0;
  document.querySelectorAll('.import-check').forEach(function(cb) {
    if (!cb.checked) return;
    totalSel++;
    var isDup = cb.closest('tr') && cb.closest('tr').dataset.dup === '1';
    if (isDup) totalDup++;
    var idx = parseInt(cb.dataset.idx);
    var r = importParsedRows[idx];
    if (!r) return;
    var tipo = r.xlsxTipo || defTipo;
    var signedValue = r.originalSign < 0 ? -r.value : r.value;
    if (tipo === 'receita') totalRec += r.value;
    else totalDesp += signedValue;
    // Futuros (informativo)
    var isParc = r.parcAtual !== null && r.parcTotal > 1;
    var tipoLancSel = document.querySelector('.import-tipo-lanc[data-idx="' + idx + '"]');
    var tipoLancV = tipoLancSel ? tipoLancSel.value : (r.xlsxTipoLanc || 'variavel');
    var isFixo = tipoLancV === 'fixo' && !isParc;
    if (isParc) futuros += (r.parcTotal - r.parcAtual);
    if (isFixo) { var nInp = document.querySelector('.import-nmeses[data-idx="'+idx+'"]'); futuros += (nInp ? (parseInt(nInp.value)||12) : 12) - 1; }
  });
  if (!totalSel) { alert('Selecione ao menos um lan\u00e7amento.'); return; }

  // Valida vencimento — obrigatório para todos os selecionados
  var semVencimento = [];
  document.querySelectorAll('.import-check:checked').forEach(function(cb) {
    var idx = parseInt(cb.dataset.idx);
    var vencInp = document.querySelector('.import-venc[data-idx="' + idx + '"]');
    var venc = vencInp ? vencInp.value.trim() : '';
    if (!venc) {
      semVencimento.push({ idx: idx, inp: vencInp });
    }
  });
  if (semVencimento.length > 0) {
    // Destaca campos sem vencimento em vermelho
    semVencimento.forEach(function(item) {
      if (item.inp) {
        item.inp.style.borderColor = '#ef4444';
        item.inp.style.background = 'rgba(239,68,68,0.08)';
        item.inp.style.color = '#ef4444';
        item.inp.placeholder = 'OBRIGATÓRIO';
      }
    });
    // Scroll até o primeiro campo sem vencimento
    if (semVencimento[0].inp) {
      semVencimento[0].inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function() { semVencimento[0].inp.focus(); }, 400);
    }
    // Mostra banner de erro no topo do modal
    var banner = document.getElementById('importVencBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'importVencBanner';
      banner.style.cssText = 'background:#7f1d1d;border:1px solid #ef4444;color:#fca5a5;padding:10px 16px;border-radius:8px;font-size:0.82rem;font-weight:700;margin-bottom:12px;text-align:center;';
      var preview = document.getElementById('importPreview');
      if (preview) preview.insertBefore(banner, preview.firstChild);
    }
    banner.textContent = '⚠️ ' + semVencimento.length + ' lançamento(s) sem VENCIMENTO — preencha os campos em vermelho antes de importar';
    banner.style.display = 'block';
    setTimeout(function() { if(banner) banner.style.display = 'none'; }, 8000);
    return;
  }
  // Esconde banner se existir
  var banner = document.getElementById('importVencBanner');
  if (banner) banner.style.display = 'none';
  var fmt = function(v){ return 'R$ '+v.toFixed(2).replace('.',',').replace(/(\d)(?=(\d{3})+(?!\d))/g,'$1.'); };
  var msg = '\u2705 '+totalSel+' lan\u00e7amento(s) selecionado(s)\n'
    +'\u2B07 Despesas: -'+fmt(totalDesp)+'\n'
    +'\u2B06 Receitas: +'+fmt(totalRec);
  if (futuros > 0) msg += '\n\uD83D\uDCC5 Parcelas futuras: +'+futuros+' geradas automaticamente';
  if (totalDup > 0) msg += '\n\n\u26A0 '+totalDup+' duplicata(s) marcada(s) \u2014 j\u00e1 existem no sistema!';
  msg += '\n\nConfirmar importa\u00e7\u00e3o?';
  if (confirm(msg)) doImport();
}

function doImport() {
  try { _doImportInner(); } catch(e) { alert('Erro ao importar: ' + e.message + '\n' + e.stack); }
}
function _doImportInner() {
  var checked = [];
  document.querySelectorAll('.import-check:checked').forEach(function(cb) { checked.push(parseInt(cb.dataset.idx)); });
  if (!checked.length) { alert('Selecione ao menos um lançamento.'); return; }


  var catByIdx = {}, subByIdx = {}, vencByIdx = {}, pagoByIdx = {}, pgtoByIdx = {}, tercByIdx = {};
  document.querySelectorAll('.import-cat-sel').forEach(function(sel) { catByIdx[parseInt(sel.dataset.idx)] = sel.value; });
  document.querySelectorAll('.import-sub-sel').forEach(function(sel) { subByIdx[parseInt(sel.dataset.idx)] = sel.value; });
  document.querySelectorAll('.import-venc').forEach(function(inp) {
    var v = inp.value.trim();
    // Converte YYYY-MM-DD (date input) para DD/MM/YYYY (formato interno)
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      var p = v.split('-'); v = p[2] + '/' + p[1] + '/' + p[0];
    }
    vencByIdx[parseInt(inp.dataset.idx)] = v;
  });
  document.querySelectorAll('.import-pago').forEach(function(cb) { pagoByIdx[parseInt(cb.dataset.idx)] = cb.checked; });
  document.querySelectorAll('.import-pgto').forEach(function(sel) { pgtoByIdx[parseInt(sel.dataset.idx)] = sel.value; });
  document.querySelectorAll('.import-terc-sel').forEach(function(sel) { tercByIdx[parseInt(sel.dataset.idx)] = sel.value; });
  var tipoLancByIdx = {};
  document.querySelectorAll('.import-tipo-lanc').forEach(function(sel) { tipoLancByIdx[parseInt(sel.dataset.idx)] = sel.value; });
  var nMesesByIdx = {};
  document.querySelectorAll('.import-nmeses').forEach(function(inp) { nMesesByIdx[parseInt(inp.dataset.idx)] = parseInt(inp.value) || 0; });

  var defaultStatus = document.getElementById('importDefaultStatus') ? document.getElementById('importDefaultStatus').value : 'pendente';
  var futureStatus  = document.getElementById('importFutureStatus') ? document.getElementById('importFutureStatus').value : 'pendente';
  var defaultTipo   = document.getElementById('importDefaultTipo') ? (document.getElementById('importDefaultTipo').value || 'despesa') : 'despesa';
  var lancamentos   = loadData();
  var added = 0;
  var firstMes = 0, firstAno = 0;
  var tercDespesas = []; // partes de terceiro (Dividas de terceiros) p/ gerar espelhos

  // Empurra um lançamento; se a linha foi desmembrada, divide em "minha parte" +
  // "parte do terceiro" (Dividas de terceiros, que vira conta a receber via espelho).
  function _pushSplit(obj, rr) {
    if (!rr._split || !(rr._split.value > 0) || !rr._split.terceiro) { lancamentos.push(obj); added++; return; }
    var full = Math.abs(obj.valor);
    var tval = Math.round(rr._split.value * 100) / 100;
    if (tval >= full) { lancamentos.push(obj); added++; return; } // proteção
    var sign = obj.valor < 0 ? -1 : 1;
    obj._splitFull = full; // valor cheio original (p/ dedup reconhecer no reimport)
    obj.valor = sign * (Math.round((full - tval) * 100) / 100); // minha parte
    lancamentos.push(obj); added++;
    var t = Object.assign({}, obj, {
      id: obj.id + '_t',
      valor: sign * tval,
      categoria: 'Dividas de terceiros',
      subCategoria: '',
      terceiro: rr._split.terceiro,
      groupId: obj.groupId ? obj.groupId + '_t' : undefined
    });
    lancamentos.push(t); added++;
    tercDespesas.push(t);
  }

  checked.forEach(function(idx) {
    var r = importParsedRows[idx];
    if (!r) return;
    var chosenCat  = catByIdx[idx] || '';
    var chosenSub  = subByIdx[idx] || '';
    var chosenVenc = vencByIdx[idx] || '';
    var chosenPago = pagoByIdx[idx] || false;
    var chosenPgto = pgtoByIdx[idx] || '';
    var chosenTerc = tercByIdx[idx] || '';
    if (chosenTerc) {
      var _tNorm = function(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); };
      var _tercsNow = loadTerceiros();
      var _jaExiste = _tercsNow.some(function(t){ return _tNorm(t.nome) === _tNorm(chosenTerc); });
      if (!_jaExiste) {
        _tercsNow.push({ id: 'terc_imp_' + Date.now() + '_' + Math.random().toString(36).slice(2,5), nome: chosenTerc, tipo: 'ambos', obs: '' });
        saveTerceiros(_tercsNow);
      }
    }
    var chosenTipoLanc = tipoLancByIdx[idx] || (r.xlsxTipoLanc || 'variavel');
    var chosenTipo = r.xlsxTipo || defaultTipo;
    var statusAtual = chosenPago ? 'pago' : defaultStatus;
    if (chosenCat) learnCat(r.desc, chosenCat);
    if (chosenCat && chosenSub) learnSub(r.desc, chosenCat, chosenSub);
    var date = parseImportDate(r.date);
    var mes, ano;
    if (chosenVenc) {
      var vp = chosenVenc.split('/');
      if (vp.length === 3 && parseInt(vp[1]) >= 1) { mes = parseInt(vp[1]); ano = parseInt(vp[2]); }
    }
    if (!mes) { mes = date.getMonth() + 1; ano = date.getFullYear(); }
    var baseId = 'imp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    var isParc = r.parcAtual !== null && r.parcTotal > 1;
    var nMeses = nMesesByIdx[idx] || r.xlsxNMeses || 12;
    var isFixo = chosenTipoLanc === 'fixo' && !isParc;
    var remaining = isParc ? (r.parcTotal - r.parcAtual) : (isFixo ? nMeses - 1 : 0);
    var recorrType = isParc ? 'parcelado' : (isFixo ? 'fixo' : undefined);
    var needsGroup = isParc || isFixo;
    var savedValor = r.originalSign < 0 ? -r.value : r.value;
    var bancoAtualImport = getBancoAtivo() || '';
    var p0 = {
      id: baseId + '_0', tipo: chosenTipo, data: r.date, valor: savedValor,
      desc: r.desc, categoria: chosenCat, subCategoria: chosenSub,
      status: statusAtual, pagamento: chosenPgto, tipoLanc: chosenTipoLanc,
      vencimento: chosenVenc, mes: mes, ano: ano,
      groupId: needsGroup ? baseId : undefined, recorr: recorrType, origem: 'importado',
      banco: bancoAtualImport
    };
    if (isParc) { p0.parcAtual = r.parcAtual; p0.parcTotal = r.parcTotal; }
    if (chosenTerc) p0.terceiro = chosenTerc;
    if (!firstMes) { firstMes = mes; firstAno = ano; }
    _pushSplit(p0, r);
    for (var i = 1; i <= remaining; i++) {
      // Parcelas futuras: a data fica igual à da 1ª parcela importada.
      // Apenas mes/ano (usados para agrupamento) avançam mês a mês.
      var fMes = ((date.getMonth() + i) % 12) + 1;
      var fAno = date.getFullYear() + Math.floor((date.getMonth() + i) / 12);
      var fVenc = chosenVenc ? addMonthsToVenc(chosenVenc, i) : '';
      if (fVenc) { var fvp = fVenc.split('/'); if (fvp.length === 3) { fMes = parseInt(fvp[1]); fAno = parseInt(fvp[2]); } }
      var fLanc = {
        id: baseId + '_' + i, tipo: chosenTipo,
        data: r.date,  // mantém a data original da 1ª parcela
        valor: savedValor, desc: r.desc,
        categoria: chosenCat, subCategoria: chosenSub, status: futureStatus,
        pagamento: chosenPgto, tipoLanc: chosenTipoLanc,
        vencimento: fVenc, mes: fMes, ano: fAno,
        groupId: baseId, recorr: recorrType, origem: 'importado',
        banco: bancoAtualImport
      };
      if (isParc) { fLanc.parcAtual = r.parcAtual + i; fLanc.parcTotal = r.parcTotal; }
      if (chosenTerc) fLanc.terceiro = chosenTerc;
      _pushSplit(fLanc, r);
    }
  });

  // Gera os espelhos "Entrada Terceiro" (conta a receber) das partes de terceiro
  if (tercDespesas.length && typeof _criarEspelhosTerceiros === 'function') {
    var _esp = _criarEspelhosTerceiros(tercDespesas);
    for (var _ei = 0; _ei < _esp.length; _ei++) { lancamentos.push(_esp[_ei]); added++; }
  }

  saveData(lancamentos);
  closeImportModal();

  // Navega para o mês dos lançamentos importados
  if (firstMes && firstAno) {
    currentMonth = firstMes;
    currentYear  = firstAno;
    window._rangeFilter = { de: { mes: firstMes, ano: firstAno }, ate: { mes: firstMes, ano: firstAno } };
    ['filterMonthDe','filterMonthAte'].forEach(function(id){ var el = document.getElementById(id); if (el) el.value = firstMes; });
    ['filterYearDe','filterYearAte'].forEach(function(id){ var el = document.getElementById(id); if (el) el.value = firstAno; });
  }

  // Garante que o usuário está na aba Lançamentos e re-renderiza
  var _lancBtn = document.querySelector('.nav-tab[onclick*="lancamentos"]');
  if (_lancBtn) { showTab('lancamentos', _lancBtn); }
  else { renderAll(); }

  alert('\u2705 Importa\u00e7\u00e3o conclu\u00edda!\n' + added + ' lan\u00e7amentos adicionados.');
  setTimeout(function() { if (typeof sbSave === 'function') sbSave(); }, 800);
}

// ── Sugestão no modal Novo Lançamento ──
var _onDescInputTimer = null;
function onDescInput() {
  var desc = document.getElementById('fDesc').value;
  var box = document.getElementById('catSugestao');
  if (!desc || desc.length < 3) { box.style.display = 'none'; return; }
  if (document.getElementById('fCategoria').value) { box.style.display = 'none'; return; }

  // 1. Tenta sugestão local (rápida, sem rede)
  var catNome = suggestCat(desc);
  if (catNome) {
    var subNome = suggestSub(desc, catNome);
    _pendingSugestao = catNome;
    _pendingSubSugestao = subNome;
    var cats = loadCats();
    var cat = cats.find(function(c) { return c.nome === catNome; });
    if (cat) {
      var label = cat.icone + ' ' + cat.nome;
      if (subNome) label += ' › ' + subNome;
      document.getElementById('catSugestaoNome').textContent = label;
      document.getElementById('catSugestaoConf').textContent = '';
      box.style.display = 'flex';
    }
  }

  // 2. Chama IA com debounce de 800ms (sempre — ela traz sub-cat e é mais precisa)
  clearTimeout(_onDescInputTimer);
  _onDescInputTimer = setTimeout(function() {
    if (document.getElementById('fCategoria').value) return; // já selecionou
    if (typeof iaSugerirCategoria === 'function') iaSugerirCategoria(desc);
  }, 800);
}



function aplicarSugestao() {
  // Prioriza sugestão da IA se disponível
  var cat = (typeof _ia_pendingCat !== 'undefined' && _ia_pendingCat) ? _ia_pendingCat : _pendingSugestao;
  var sub = (typeof _ia_pendingSub !== 'undefined' && _ia_pendingSub) ? _ia_pendingSub : _pendingSubSugestao;
  if (!cat) return;

  var fCat = document.getElementById('fCategoria');

  // Garante que o select está populado com as categorias do tipo atual
  if (typeof _filterCatsByTipo === 'function') _filterCatsByTipo(tipoAtual);

  // Busca o option pelo value exato
  var optExiste = Array.from(fCat.options).some(function(o) { return o.value === cat; });

  if (optExiste) {
    fCat.value = cat;
    onCatChange(); // popula subcategorias
  }

  // Aplica subcategoria após o DOM atualizar
  if (sub) {
    setTimeout(function() {
      var fSub = document.getElementById('fSubCategoria');
      if (!fSub) return;
      var subOpt = Array.from(fSub.options).some(function(o) { return o.value === sub; });
      if (subOpt) fSub.value = sub;
    }, 100);
  }

  document.getElementById('catSugestao').style.display = 'none';
  _pendingSugestao = null;
  _pendingSubSugestao = null;
  if (typeof _ia_pendingCat !== 'undefined') { _ia_pendingCat = null; _ia_pendingSub = null; }
}