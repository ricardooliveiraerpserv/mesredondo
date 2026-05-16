// ======== MONTH ========
function _buildYearOptions(selId, selectedYear) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const cur = new Date().getFullYear();
  sel.innerHTML = '';
  for (let y = cur - 3; y <= cur + 3; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === selectedYear) o.selected = true;
    sel.appendChild(o);
  }
}


function updatePeriodoLabel() {
  const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const rng = window._rangeFilter || { de: { mes: currentMonth, ano: currentYear }, ate: { mes: currentMonth, ano: currentYear } };
  const el = document.getElementById('periodoLabel');
  const elM = document.getElementById('periodoLabelMobile');
  if (!el) return;
  const isSingle = (rng.de.mes === rng.ate.mes && rng.de.ano === rng.ate.ano);
  if (isSingle) {
    el.textContent = MESES_FULL[rng.de.mes - 1] + ' / ' + rng.de.ano;
    if (elM) elM.textContent = MESES_SHORT[rng.de.mes - 1] + ' / ' + rng.de.ano;
  } else {
    el.textContent = MESES_FULL[rng.de.mes - 1] + ' ' + rng.de.ano + '  →  ' + MESES_FULL[rng.ate.mes - 1] + ' ' + rng.ate.ano;
    if (elM) elM.textContent = MESES_SHORT[rng.de.mes - 1] + ' ' + rng.de.ano + ' → ' + MESES_SHORT[rng.ate.mes - 1] + ' ' + rng.ate.ano;
  }
  el.style.color = '#f0c040';
  el.style.fontSize = '1.35rem';
  el.style.textShadow = '0 0 16px rgba(240,192,64,0.5)';
}
function applyRangeFilter() {
  const mDe  = parseInt(document.getElementById('filterMonthDe')?.value  || currentMonth);
  const yDe  = parseInt(document.getElementById('filterYearDe')?.value   || currentYear);
  const mAte = parseInt(document.getElementById('filterMonthAte')?.value || currentMonth);
  const yAte = parseInt(document.getElementById('filterYearAte')?.value  || currentYear);
  const deVal  = yDe  * 100 + mDe;
  const ateVal = yAte * 100 + mAte;
  if (deVal > ateVal) {
    document.getElementById('filterMonthAte').value = mDe;
    document.getElementById('filterYearAte').value  = yDe;
    window._rangeFilter = { de: { mes: mDe, ano: yDe }, ate: { mes: mDe, ano: yDe } };
  } else {
    window._rangeFilter = { de: { mes: mDe, ano: yDe }, ate: { mes: mAte, ano: yAte } };
  }
  ['vencFiltroCat','vencFiltroPag','filtroTerceiro'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) { while (sel.options.length > 1) sel.remove(1); }
  });
  renderAll();
  renderTerceirosTab();
  renderParceladosTab();
  renderVencimentosTab();
  renderCartoesTab();
}

function navMonth(d) {
  // Pega o mês DE como base e move o range inteiro colapsando para mês único
  const mDe = parseInt(document.getElementById('filterMonthDe')?.value || currentMonth);
  const yDe = parseInt(document.getElementById('filterYearDe')?.value  || currentYear);
  let m = mDe + d, y = yDe;
  if (m > 12) { m = 1;  y++; }
  if (m < 1)  { m = 12; y--; }
  currentMonth = m; currentYear = y;
  _lsSet('nav_mes', m); _lsSet('nav_ano', y);
  // Iguala DE e ATÉ ao novo mês
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  s('filterMonthDe', m); s('filterYearDe',  y);
  s('filterMonthAte', m); s('filterYearAte', y);
  window._rangeFilter = { de: { mes: m, ano: y }, ate: { mes: m, ano: y } };
  ['vencFiltroCat','vencFiltroPag','filtroTerceiro'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) { while (sel.options.length > 1) sel.remove(1); }
  });
  renderAll(); renderTerceirosTab(); renderParceladosTab(); renderVencimentosTab(); renderCartoesTab();
  updatePeriodoLabel();
}

function changeMonth(d) {
  // Mantido por compatibilidade com outras abas
  currentMonth += d;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1)  { currentMonth = 12; currentYear--; }
  window._rangeFilter = { de: { mes: currentMonth, ano: currentYear }, ate: { mes: currentMonth, ano: currentYear } };
  _lsSet('nav_mes', currentMonth); _lsSet('nav_ano', currentYear);
  // Atualiza selects
  const sm = v => id => { const s=document.getElementById(id); if(s) s.value=v; };
  sm(currentMonth)('filterMonthDe'); sm(currentMonth)('filterMonthAte');
  sm(currentYear)('filterYearDe');   sm(currentYear)('filterYearAte');
  ['vencFiltroCat','vencFiltroPag','filtroTerceiro'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) { while (sel.options.length > 1) sel.remove(1); }
  });
  renderAll();
  renderTerceirosTab();
  renderParceladosTab();
  renderVencimentosTab();
  renderCartoesTab();
}

// Inicializa range filter — restaura mês/ano salvos no localStorage (navMonth/
// changeMonth gravam ali). Cai pra mês atual se for primeiro acesso, salvou
// inválido ou está fora de um intervalo razoável (evita ficar preso em 2099).
(function initRangeFilter() {
  const today = new Date();
  let savedMes = parseInt((typeof _lsGet === 'function' ? _lsGet('nav_mes') : localStorage.getItem('nav_mes')) || '', 10);
  let savedAno = parseInt((typeof _lsGet === 'function' ? _lsGet('nav_ano') : localStorage.getItem('nav_ano')) || '', 10);
  const _yNow = today.getFullYear();
  const _validMes = Number.isFinite(savedMes) && savedMes >= 1 && savedMes <= 12;
  const _validAno = Number.isFinite(savedAno) && savedAno >= 2000 && savedAno <= _yNow + 10;
  currentMonth = _validMes ? savedMes : (today.getMonth() + 1);
  currentYear  = _validAno ? savedAno : _yNow;
  window._rangeFilter = { de: { mes: currentMonth, ano: currentYear }, ate: { mes: currentMonth, ano: currentYear } };
  document.addEventListener('DOMContentLoaded', function() {
    // Mede altura do header para o sticky offset
    function setHeaderHeight() {
      const h = document.querySelector('header');
      if (h) document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
    }
    setHeaderHeight();
    window.addEventListener('resize', setHeaderHeight);
    _buildYearOptions('filterYearDe',  currentYear);
    _buildYearOptions('filterYearAte', currentYear);
    const s = (id, v) => { const el=document.getElementById(id); if(el) el.value=v; };
    s('filterMonthDe', currentMonth); s('filterMonthAte', currentMonth);
    updatePeriodoLabel();
    // Preenche versão de deploy no card e no rodapé logo ao carregar
    try { _fillDeployVersionLabel(); } catch(e){}

    // Mostra banner de instalação PWA no mobile Safari (não quando já instalado)
    try {
      var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      var isStandalone = window.navigator.standalone === true;
      var dismissed = localStorage.getItem('pwa-banner-dismissed');
      var banner = document.getElementById('pwa-install-banner');
      if (banner && isIos && !isStandalone && !dismissed) {
        banner.style.display = 'block';
        // Empurra o rodapé para cima do banner
        var footer = document.getElementById('app-footer');
        if (footer) footer.style.bottom = '80px';
      }
    } catch(e) {}
  });
})();

function goToToday() {
  const today = new Date();
  currentMonth = today.getMonth() + 1;
  currentYear  = today.getFullYear();
  window._rangeFilter = { de: { mes: currentMonth, ano: currentYear }, ate: { mes: currentMonth, ano: currentYear } };
  const s = (id, v) => { const el=document.getElementById(id); if(el) el.value=v; };
  s('filterMonthDe', currentMonth); s('filterYearDe',  currentYear);
  s('filterMonthAte', currentMonth); s('filterYearAte', currentYear);
  updatePeriodoLabel();
  renderAll();
}

// ======== TABS ========
function updateCardSections(tab) {
  document.querySelectorAll('[data-tabs]').forEach(function(sec) {
    const tabs = sec.getAttribute('data-tabs').split(',');
    sec.style.display = tabs.includes(tab) ? '' : 'none';
  });
  const stickyTop = document.getElementById('stickyTopBar');
  if (stickyTop) stickyTop.style.display = (tab === 'dashboard' || tab === 'lancamentos') ? '' : 'none';

  // Sticky bancoContextoBar: apenas mobile (desktop usa o select do header)
  const stickyBancoWrapper = document.getElementById('bancoContextoBarStickyWrapper');
  if (stickyBancoWrapper) {
    const stickyTabs = ['dashboard','lancamentos','provisao','terceiros','parcelados','vencimentos','cartoes'];
    const isMobile = window.innerWidth <= 768;
    stickyBancoWrapper.style.display = (stickyTabs.includes(tab) && isMobile) ? '' : 'none';
  }
  _applyMobileLayout();
}

function _applyMobileLayout() {
  const mob = window.innerWidth <= 768;

  // Projeção de Caixa + Provisão + Terceiros — todos na mesma linha
  const projecaoRow = document.getElementById('projecaoRow');
  if (projecaoRow) projecaoRow.style.gridTemplateColumns = mob ? '1fr' : '1.8fr 1.4fr 1.4fr';

  // Provisão + Terceiros — provisão full width + terceiros 3 col no mobile
  const provRow = document.getElementById('provisaoTerceirosRow');
  if (provRow) {
    provRow.style.gridTemplateColumns = mob ? '1fr 1fr 1fr' : '2fr 1fr 1fr 1fr';
    const provCard = provRow.querySelector(':scope > div:first-child');
    if (provCard) provCard.style.gridColumn = mob ? '1 / -1' : '';
  }

  // Bancos: grid 2 colunas no mobile, flex row no desktop
  const bancosRow = document.getElementById('bancosCardsRow');
  const bancoInner = document.getElementById('bancoContextoInner');
  const divisor = document.getElementById('bancoCtxDivisor');
  const voltarBtn = document.getElementById('bancoCtxVoltarBtn');
  const consolidarBtn = document.getElementById('bancoCtxConsoliBtn');

  if (bancosRow) {
    if (mob) {
      // Mobile: scroll horizontal de chips numa única linha
      bancosRow.style.display = 'flex';
      bancosRow.style.flexDirection = 'row';
      bancosRow.style.gridTemplateColumns = '';
      bancosRow.style.gap = '6px';
      bancosRow.style.flex = '1';
      bancosRow.style.width = '100%';
      bancosRow.style.overflowX = 'auto';
      bancosRow.style.overflowY = 'visible';
      bancosRow.style.webkitOverflowScrolling = 'touch';
      bancosRow.style.scrollbarWidth = 'none';
      bancosRow.style.paddingBottom = '2px';
    } else {
      bancosRow.style.display = 'flex';
      bancosRow.style.flexDirection = '';
      bancosRow.style.gridTemplateColumns = '';
      bancosRow.style.gap = '8px';
      bancosRow.style.flex = '1';
      bancosRow.style.width = '';
      bancosRow.style.overflowX = '';
      bancosRow.style.overflowY = '';
      bancosRow.style.paddingBottom = '';
    }
  }

  if (bancoInner) {
    if (mob) {
      // Mobile: duas linhas — legenda+botão em cima, chips embaixo
      bancoInner.style.flexWrap = 'wrap';
      bancoInner.style.alignItems = 'center';
      bancoInner.style.padding = '6px 10px 8px 10px';
      bancoInner.style.gap = '0';
      bancoInner.style.overflow = 'hidden';
    } else {
      bancoInner.style.flexWrap = 'nowrap';
      bancoInner.style.alignItems = 'center';
      bancoInner.style.padding = '8px 10px';
      bancoInner.style.gap = '';
      bancoInner.style.overflow = '';
    }
  }

  if (divisor) divisor.style.display = mob ? 'none' : 'block';
  if (voltarBtn && voltarBtn.getAttribute('data-visible') !== 'false') {
    voltarBtn.style.display = mob ? 'none' : (voltarBtn.getAttribute('data-show') === 'true' ? 'block' : 'none');
  }

  if (consolidarBtn) {
    if (mob) {
      // Mobile: aparece na linha de cima, lado direito
      consolidarBtn.style.display = 'inline-flex';
      consolidarBtn.style.marginLeft = 'auto';
      consolidarBtn.style.padding = '3px 10px';
      consolidarBtn.style.fontSize = '0.65rem';
    } else {
      consolidarBtn.style.display = '';
      consolidarBtn.style.marginLeft = '';
      consolidarBtn.style.padding = '5px 12px';
      consolidarBtn.style.fontSize = '0.7rem';
    }
  }

  // Mobile: bancosCardsRow ocupa linha inteira abaixo da legenda
  if (bancosRow && mob) {
    bancosRow.style.flexBasis = '100%';
    bancosRow.style.marginTop = '6px';
    bancosRow.style.paddingTop = '6px';
    bancosRow.style.borderTop = '1px solid var(--border)';
  } else if (bancosRow) {
    bancosRow.style.flexBasis = '';
    bancosRow.style.marginTop = '';
    bancosRow.style.paddingTop = '';
    bancosRow.style.borderTop = '';
  }
}

// Aplica no resize também


// ── Atualiza max-height dos table-scroll-wrap dinamicamente ──────────────
function _updateTableWrapHeight() {
  var wrappers = document.querySelectorAll('.table-scroll-wrap');
  if (!wrappers.length) return;
  // Calcula altura dos elementos fixos acima
  var fixed = 0;
  [
    document.querySelector('header'),
    document.getElementById('globalStickyShell'),
  ].forEach(function(el) {
    if (el && getComputedStyle(el).display !== 'none') fixed += el.offsetHeight;
  });
  // Altura mínima de 300px, máxima de viewport - fixo - 60px de margem
  var maxH = Math.max(300, window.innerHeight - fixed - 60);
  wrappers.forEach(function(w) { w.style.maxHeight = maxH + 'px'; });
}
window.addEventListener('resize', _updateTableWrapHeight);
setTimeout(_updateTableWrapHeight, 200);

window.addEventListener('resize', _applyMobileLayout);

// Abas que exibem o FAB no mobile
var _FAB_TABS = ['lancamentos', 'areceber', 'apagar'];

function _updateFabVisibility(tab) {
  var fab = document.getElementById('mobile-fab');
  if (!fab) return;
  // Usa classe CSS — style.display não funciona contra o !important do CSS mobile
  var show = window.matchMedia('(max-width:768px)').matches && _FAB_TABS.indexOf(tab) >= 0;
  fab.classList.toggle('fab-hidden', !show);
}

function showTab(tab, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  btn.classList.add('active');
  _lsSet('nav_tab', tab);
  _updateFabVisibility(tab);
  updateCardSections(tab);
  renderAll();
  if (tab === 'terceiros')  renderTerceirosTab();
  if (tab === 'parcelados') renderParceladosTab();
  if (tab === 'vencimentos') renderVencimentosTab();
  if (tab === 'cartoes')    renderCartoesTab();
  if (tab === 'areceber')   renderAReceberTab();
  if (tab === 'apagar')     renderAPagarTab();
  if (tab === 'config') { renderConfigTab(); renderCatTab(); renderTerceiroList(); renderPagList(); renderBancoList(); populateBancoSelects(); }
}