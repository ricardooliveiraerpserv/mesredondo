// ======== TERCEIROS ========
var CAT_TERC_SET = (typeof CAT_TERC_SET !== 'undefined') ? CAT_TERC_SET : new Set(['Entrada Terceiro','Dividas de terceiros']);

function loadTerceiros() {
  const s = _lsGet('financeos_terceiros');
  if (!s) {
    const DEFAULT_TERCEIROS = [
      { id:'terc_1', nome:'Familiar', tipo:'devedor', obs:'' },
      { id:'terc_2', nome:'Amigo',    tipo:'devedor', obs:'' },
    ];
    saveTerceiros(DEFAULT_TERCEIROS);
    return DEFAULT_TERCEIROS;
  }
  return JSON.parse(s);
}
function saveTerceiros(d) { _lsSet('financeos_terceiros', JSON.stringify(d)); localStorage.setItem('sb_last_save', Date.now().toString()); _markLocalDirty(); _sbAutoSync(); }

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

  // Modal lançamento
  const fTerc = document.getElementById('fTerceiro');
  if (fTerc) { const c = fTerc.value; fTerc.innerHTML = opts; fTerc.value = c; }

  // Filtro aba terceiros é populado dinamicamente em renderTerceirosTab (pelos lançamentos reais)
}

function openTerceiroModal() {
  document.getElementById('terceiroEditId').value = '';
  document.getElementById('terceiroNome').value = '';
  document.getElementById('terceiroTipo').value = 'ambos';
  document.getElementById('terceiroObs').value = '';
  document.getElementById('terceiroModalTitle').textContent = 'Novo Terceiro';
  // FIX: usa classList.open para z-index correto (sobrepõe outros overlays)
  document.getElementById('terceiroModalOverlay').classList.add('open');
}
function editTerceiroModal(id) {
  const t = loadTerceiros().find(x => x.id === id);
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
function saveTerceiroModal() {
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
  saveTerceiros(loadTerceiros().filter(x => x.id !== id));
  renderTerceiroList();
  populateTerceiroSelects();
}

// Show/hide fTerceiro field based on category
function onCatChangeTerceiro() {
  const cat = document.getElementById('fCategoria').value;
  const row = document.getElementById('fTerceiroRow');
  const alerta = document.getElementById('alertaTerceiroCat');
  const alertaTexto = document.getElementById('alertaTerceiroTexto');

  const isTercCat = _CATS_TERCEIRO.has(cat) || CAT_TERC_SET.has(cat);
  if (row) row.style.display = isTercCat ? 'block' : 'none';

  if (alerta) {
    if (isTercCat) {
      // Texto personalizado por categoria
      let msg = '';
      if (cat === 'Entrada Terceiro') {
        msg = `<strong style="color:#4ade80">Entrada de terceiro</strong>: registra um valor que alguém te deve ou te pagou. <strong style="color:var(--text)">Não entra no saldo bancário nem na provisão</strong> — é um controle paralelo, visível na aba Terceiros.`;
      } else if (cat === 'Dividas de terceiros' || cat === 'Divida de terceiros') {
        msg = `<strong style="color:#f87171">Dívida de terceiro</strong>: registra um valor que você emprestou ou que alguém te deve (saída). <strong style="color:var(--text)">Não deduz do saldo bancário nem da provisão</strong> — é um controle paralelo, visível na aba Terceiros.`;
      } else {
        msg = `Esta categoria é de <strong style="color:#f59e0b">controle de terceiros</strong> e <strong style="color:var(--text)">não afeta o saldo bancário nem a provisão</strong>. Use-a para registrar empréstimos e dívidas entre pessoas.`;
      }
      if (alertaTexto) alertaTexto.innerHTML = msg;
      alerta.style.display = 'block';
    } else {
      alerta.style.display = 'none';
    }
  }
}

// ── Aba Terceiros ──────────────────────────────────────────────────────────
// Sort state for terceiros table
var tercSortCol = 'data', tercSortDir = -1;
function setTercSort(col) {
  if (tercSortCol === col) tercSortDir *= -1;
  else { tercSortCol = col; tercSortDir = col === 'valor' ? -1 : 1; }
  // update header classes
  document.querySelectorAll('#terceirosTable').forEach(()=>{});
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
  const _tfvRaw  = (document.getElementById('filtroTerceiroValor')?.value || '').trim();
  const filtroValor = _tfvRaw && typeof parseBRL === 'function' ? parseBRL(_tfvRaw) : NaN;

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
    if (!isNaN(filtroValor) && filtroValor > 0 && Math.abs((Number(l.valor)||0) - filtroValor) > 0.005) return false;
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
                    // formato DD/MM/YYYY
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
        <div class="cat-bar-label" style="min-width:120px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${label}">${label}</div>
        <div class="cat-bar-bg" style="flex:1"><div class="cat-bar-fill" style="width:${pct}%;background:${c}"></div></div>
        <div class="cat-bar-val">${fmt(val)}</div>
        <div class="cat-bar-pct">${pctT}%</div>
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

  tbody.innerHTML = sorted.map(l => {
    const sid = String(l.id).replace(/'/g,"\\'");
    const gid = l.groupId ? String(l.groupId).replace(/'/g,"\\'") : '';
    const isRec = l.tipo==='receita';
    const catLabel = l.categoria || '—';
    return `<tr>
      <td style="padding:8px 6px;text-align:center"><input type="checkbox" class="terc-check" data-id="${l.id}" onchange="tercUpdateBulkBar()" style="cursor:pointer;accent-color:var(--accent)"></td>
      <td style="font-family:'Space Mono',monospace;font-size:0.75rem;color:var(--text2)">${l.vencimento||formatDate(l.data)}</td>
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
          ? `<button class="del-btn" onclick="toggleStatusLanc('${sid}','pago')" title="Marcar como pago" style="color:var(--green);background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:5px;padding:2px 8px;font-size:0.72rem;font-weight:700;margin-right:3px">✓ Pagar</button>`
          : `<button class="del-btn" onclick="toggleStatusLanc('${sid}','pendente')" title="Estornar para pendente" style="color:var(--danger);background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:5px;padding:2px 8px;font-size:0.72rem;font-weight:700;margin-right:3px">↩</button>`}
        <button class="del-btn" onclick="editLancamento('${sid}')" style="color:var(--accent2)">✎</button>
        <button class="del-btn" onclick="smartDelete('${sid}','${gid}',event)" title="Excluir" style="color:var(--danger)">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function exportarExcelTerceiros() {
  if (typeof XLSX === 'undefined') { alert('Biblioteca Excel não carregada.'); return; }
  const nomeF   = window.FSEL ? FSEL.getValues('filtroTerceiroNome')   : [];
  const tipoF   = window.FSEL ? FSEL.getValues('filtroTerceiroTipo')   : [];
  const statusF = window.FSEL ? FSEL.getValues('filtroTerceiroStatus') : [];
  const descF   = (document.getElementById('filtroTerceiroDesc')?.value || '').toLowerCase();
  let filtered = loadDataBanco().filter(l => {
    if (!CAT_TERC_SET.has(l.categoria)) return false;
    if (!_inRange(l)) return false;
    if (nomeF.length   && !nomeF.includes(l.terceiro||'')) return false;
    if (tipoF.length && !tipoF.includes('')) {
      const wantEnt = tipoF.includes('entrada');
      const wantDiv = tipoF.includes('divida');
      if (wantEnt && !wantDiv && l.categoria !== 'Entrada Terceiro') return false;
      if (wantDiv && !wantEnt && l.categoria !== 'Dividas de terceiros') return false;
    }
    if (statusF.length && !statusF.includes(l.status)) return false;
    if (descF && !((l.desc||'')+(l.terceiro||'')).toLowerCase().includes(descF)) return false;
    return true;
  });
  if (!filtered.length) { alert('Nenhum lançamento para exportar.'); return; }
  const fmtDate = d => d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : (d||'');
  const rows = filtered.map(l => ({
    'Data': fmtDate(l.data), 'Vencimento': l.vencimento||'',
    'Terceiro': l.terceiro||'', 'Descrição': (l.desc||'').replace(/\s*\(\d+\/\d+\)\s*$/,''), 'Parcela': l.parcAtual ? l.parcAtual+'/'+l.parcTotal : '',
    'Categoria': l.categoria||'', 'Tipo': l.tipo==='receita'?'Entrada':'Dívida',
    'Status': l.status||'', 'Pagamento': l.pagamento||'',
    'Valor (R$)': l.tipo==='receita' ? _valorExib(l) : -_valorExib(l),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:12},{wch:12},{wch:20},{wch:38},{wch:22},{wch:10},{wch:10},{wch:18},{wch:14}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Terceiros');
  XLSX.writeFile(wb, `MeuFinanceiro_Terceiros.xlsx`);
}

// ======== BULK TERCEIRO (inline na tabela) ========
function tercUpdateBulkBar() {
  const checked = document.querySelectorAll('.terc-check:checked');
  const all     = document.querySelectorAll('.terc-check');
  const bar     = document.getElementById('tercBulkBar');
  const countEl = document.getElementById('tercBulkCount');
  const chkAll  = document.getElementById('tercCheckAll');

  if (bar)     bar.style.display    = checked.length > 0 ? 'flex' : 'none';
  if (countEl) countEl.textContent  = checked.length + ' selecionado' + (checked.length !== 1 ? 's' : '');
  if (chkAll) {
    chkAll.indeterminate = checked.length > 0 && checked.length < all.length;
    chkAll.checked       = all.length > 0 && checked.length === all.length;
  }

  // Populate terceiro select
  const sel = document.getElementById('tercBulkTerceiroSelect');
  if (sel) {
    loadTerceiros().forEach(t => {
      const o = document.createElement('option');
      o.value = t.nome; o.textContent = '👤 ' + t.nome;
      sel.appendChild(o);
    });
  }
}

function tercToggleAll(checked) {
  document.querySelectorAll('.terc-check').forEach(cb => cb.checked = checked);
  tercUpdateBulkBar();
}

function tercSelectAll() {
  document.querySelectorAll('.terc-check').forEach(cb => cb.checked = true);
  const ca = document.getElementById('tercCheckAll');
  if (ca) { ca.checked = true; ca.indeterminate = false; }
  tercUpdateBulkBar();
}

function tercBulkClearSel() {
  document.querySelectorAll('.terc-check').forEach(cb => cb.checked = false);
  const ca = document.getElementById('tercCheckAll');
  if (ca) { ca.checked = false; ca.indeterminate = false; }
  tercUpdateBulkBar();
}

function applyTercBulk() {
  const terceiro = document.getElementById('tercBulkTerceiroSelect')?.value;
  if (!terceiro) { alert('Selecione um terceiro para aplicar.'); return; }
  const ids = new Set([...document.querySelectorAll('.terc-check:checked')].map(c => c.dataset.id));
  if (!ids.size) { alert('Selecione pelo menos um lançamento.'); return; }
  const data = loadDataBanco();
  let count = 0;
  data.forEach(l => { if (ids.has(String(l.id))) { l.terceiro = terceiro; count++; } });
  saveData(data);
  tercBulkClearSel();
  renderTerceirosTab();
  safeRender(() => renderAll());
}

function clearTercBulk() {
  const ids = new Set([...document.querySelectorAll('.terc-check:checked')].map(c => c.dataset.id));
  if (!ids.size) { alert('Selecione pelo menos um lançamento.'); return; }
  if (!confirm(`Limpar o terceiro de ${ids.size} lançamento(s)?`)) return;
  const data = loadDataBanco();
  data.forEach(l => { if (ids.has(String(l.id))) { delete l.terceiro; } });
  saveData(data);
  tercBulkClearSel();
  renderTerceirosTab();
  safeRender(() => renderAll());
}

// ── Filtro por Card de Terceiro ──────────────────────────
window._tercCardFilter = null; // { nome, tipo }

function _tercCardClick(nome) {
  if (window._tercCardFilter && window._tercCardFilter.nome === nome) {
    window._tercCardFilter = null; // toggle off
  } else {
    window._tercCardFilter = { nome, tipo: 'todos' };
  }
  renderTerceirosTab();
}

function _tercCardTipo(nome, tipo) {
  window._tercCardFilter = { nome, tipo };
  renderTerceirosTab();
}