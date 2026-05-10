// ======== BULK TERCEIRO END ========

// ======== VENCIMENTOS ========
function _vencSetFiltro(v) {
  // Toggle: se já está ativo, limpa; senão aplica
  const cur = window._vencFiltroSit || '';
  window._vencFiltroSit = (cur === v) ? '' : v;
  renderVencimentosTab();
  // Scroll suave até a tabela
  setTimeout(() => {
    const panel = document.querySelector('#tab-vencimentos .panel');
    if (panel) panel.scrollIntoView({behavior:'smooth', block:'start'});
  }, 80);
}
function limparFiltrosVenc() {
  window._vencFiltroSit = '';
  window._vencSort = { col: null, dir: 1 };
  if (window.FSEL) {
    ['vencFiltroTipo','vencFiltroCat','vencFiltroSubCat','vencFiltroPag','vencFiltroTerc','vencFiltroBanco'].forEach(id => FSEL.reset(id));
  }
  const b = document.getElementById('vencFiltroBusca');
  if (b) b.value = '';
  renderVencimentosTab();
}

function setVencSort(col) {
  if (!window._vencSort) window._vencSort = { col: null, dir: 1 };
  const vs = window._vencSort;
  if (vs.col === col) { vs.dir *= -1; }
  else { vs.col = col; vs.dir = 1; }
  renderVencimentosTab();
}

function renderVencimentosTab() {
  // Situação: lido de variável direta (cards clicáveis) ou FSEL
  const _sitVar = window._vencFiltroSit || '';
  const _fselSit = window.FSEL ? FSEL.getValues('vencFiltroTipo') : [];
  const tipoF   = _sitVar ? [_sitVar] : _fselSit;
  const receDespF = window.FSEL ? FSEL.getValues('vencFiltroReceDesp') : [];
  const catF    = window.FSEL ? FSEL.getValues('vencFiltroCat')     : [];
  const subCatF = window.FSEL ? FSEL.getValues('vencFiltroSubCat')  : [];
  const pagF    = window.FSEL ? FSEL.getValues('vencFiltroPag')     : [];
  const tercF   = window.FSEL ? FSEL.getValues('vencFiltroTerc')    : [];
  const bancF   = window.FSEL ? FSEL.getValues('vencFiltroBanco')   : [];
  const busca   = (document.getElementById('vencFiltroBusca')?.value || '').toLowerCase();
  const _vfvRaw = (document.getElementById('vencFiltroValor')?.value || '').trim();
  const filtroValor = _vfvRaw && typeof parseBRL === 'function' ? parseBRL(_vfvRaw) : NaN;

  // Mostrar/ocultar botão de limpar filtros
  const _temFiltro = tipoF.length || catF.length || subCatF.length || pagF.length || tercF.length || bancF.length || busca || receDespF.length;
  const _btnLimpar = document.getElementById('btnVencLimpar');
  if (_btnLimpar) _btnLimpar.style.display = _temFiltro ? 'inline-block' : 'none';

  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  const ddHoje  = String(hoje.getDate()).padStart(2,'0');
  const mmHoje  = String(hoje.getMonth()+1).padStart(2,'0');
  const aaaHoje = hoje.getFullYear();

  const em7d   = new Date(hoje); em7d.setDate(em7d.getDate()+7);
  const fimMes = new Date(aaaHoje, hoje.getMonth()+1, 0);

  const parseDMY = s => {
    if (!s) return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d,m,y]=s.split('/'); return new Date(+y,+m-1,+d); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s))   { const [y,m,d]=s.split('-'); return new Date(+y,+m-1,+d); }
    return null;
  };

  const allData = getMonthData().filter(l => l.status === 'pendente' || l.status === 'agendado');

  // Populate filters once
  const catSel = document.getElementById('vencFiltroCat');
  if (catSel) {
    catSel.innerHTML = '<option value="">— Todas as categorias —</option>';
    [...new Set(allData.map(l=>l.categoria).filter(Boolean))].sort()
      .forEach(c => { const o=document.createElement('option');o.value=c;o.textContent=c;catSel.appendChild(o); });
    if(window.FSEL) _fselRebuild('vencFiltroCat');
  }
  const pagSel = document.getElementById('vencFiltroPag');
  if (pagSel) {
    pagSel.innerHTML = '<option value="">— Todos os pagamentos —</option>';
    [...new Set(allData.map(l=>l.pagamento).filter(Boolean))].sort()
      .forEach(p => { const o=document.createElement('option');o.value=p;o.textContent=p;pagSel.appendChild(o); });
    if(window.FSEL) _fselRebuild('vencFiltroPag');
  }
  const subCatSel = document.getElementById('vencFiltroSubCat');
  if (subCatSel) {
    subCatSel.innerHTML = '<option value="">— Todas as sub-cat. —</option>';
    [...new Set(allData.map(l=>l.subCategoria).filter(Boolean))].sort()
      .forEach(s => { const o=document.createElement('option');o.value=s;o.textContent=s;subCatSel.appendChild(o); });
    if(window.FSEL) _fselRebuild('vencFiltroSubCat');
  }
  const tercSel = document.getElementById('vencFiltroTerc');
  if (tercSel) {
    tercSel.innerHTML = '<option value="">— Todos os terceiros —</option>';
    [...new Set(allData.map(l=>l.terceiro).filter(Boolean))].sort()
      .forEach(t => { const o=document.createElement('option');o.value=t;o.textContent=t;tercSel.appendChild(o); });
    if(window.FSEL) _fselRebuild('vencFiltroTerc');
  }
  const bancSel = document.getElementById('vencFiltroBanco');
  if (bancSel) {
    bancSel.innerHTML = '<option value="">— Todos os bancos —</option>';
    loadBancos().forEach(b => { const o=document.createElement('option');o.value=b.id;o.textContent=(b.icone||'🏦')+' '+b.nome;bancSel.appendChild(o); });
    if(window.FSEL) _fselRebuild('vencFiltroBanco');
  }
  if(window.FSEL) _fselRebuild('vencFiltroReceDesp');

  // Referência: mês selecionado na UI
  const isMesAtual = (currentMonth === hoje.getMonth()+1 && currentYear === aaaHoje);

  // Classifica por urgência — só faz sentido no mês atual; fora dele tudo é 'mes'
  const classificar = l => {
    const vd = parseDMY(l.vencimento);
    if (!vd) return 'mes'; // sem vencimento: inclui como "do mês"
    vd.setHours(0,0,0,0);
    if (!isMesAtual) return 'mes'; // mês passado ou futuro: sem urgência relativa
    if (vd < hoje)                       return 'atrasado';
    if (vd.getTime() === hoje.getTime()) return 'hoje';
    if (vd <= em7d)                      return 'proximos';
    return 'mes';
  };

  // Todos os pendentes do mês selecionado com vencimento
  const items = allData
    .map(l => ({ ...l, _sit: classificar(l), _vd: parseDMY(l.vencimento) }));

  // Aplica filtros (tipoF filtra por situação; cat/pag/busca filtram os itens)
  const filtered = items.filter(l => {
    if (tipoF.length && !tipoF.includes(l._sit)) return false;
    if (receDespF.length) {
      const isRec = l.valor > 0 || l.tipo === 'receita' || (l.categoria||'').toLowerCase().includes('entrada') || (l.categoria||'').toLowerCase().includes('receita');
      if (receDespF.includes('receita') && !isRec) return false;
      if (receDespF.includes('despesa') && isRec) return false;
    }
    if (catF.length  && !catF.includes(l.categoria)) return false;
    if (subCatF.length && !subCatF.includes(l.subCategoria||'')) return false;
    if (pagF.length  && !pagF.includes(l.pagamento)) return false;
    if (tercF.length && !tercF.includes(l.terceiro||'')) return false;
    if (bancF.length && !bancF.includes(l.banco||'')) return false;
    if (busca && !(l.desc||'').toLowerCase().includes(busca) &&
                 !(l.categoria||'').toLowerCase().includes(busca) &&
                 !(l.pagamento||'').toLowerCase().includes(busca)) return false;
    if (!isNaN(filtroValor) && filtroValor > 0 && Math.abs((Number(l.valor)||0) - filtroValor) > 0.005) return false;
    return true;
  });

  // ── Cards — só mostram contagens relevantes no mês atual ──
  const atrasados = isMesAtual ? items.filter(l=>l._sit==='atrasado') : [];
  const venHoje   = isMesAtual ? items.filter(l=>l._sit==='hoje')     : [];
  const prox7     = isMesAtual ? items.filter(l=>l._sit==='proximos') : [];
  const restMes   = isMesAtual ? items.filter(l=>l._sit==='mes')      : items;
  const vlAtras   = atrasados.reduce((s,l)=>s+(l.tipo==='despesa'?_valorExib(l):-_valorExib(l)),0);
  const vlHoje    = venHoje.reduce((s,l)=>s+(l.tipo==='despesa'?_valorExib(l):-_valorExib(l)),0);
  const vlProx    = prox7.reduce((s,l)=>s+_valorExib(l),0);
  const vlMes     = restMes.reduce((s,l)=>s+(l.tipo==='despesa'?_valorExib(l):-_valorExib(l)),0);

  const cardsEl = document.getElementById('vencCards');
  if (cardsEl) {
    cardsEl.innerHTML = [
      { icon:'🔴', sit:'atrasado', label:'ATRASADOS',      val:atrasados.length, sub:fmt(Math.abs(vlAtras)), cor:'#ef4444', bg:'rgba(239,68,68,0.08)',   borda:'rgba(239,68,68,0.4)'  },
      { icon:'🟡', sit:'hoje',     label:'VENCEM HOJE',     val:venHoje.length,   sub:fmt(Math.abs(vlHoje)),  cor:'#f59e0b', bg:'rgba(245,158,11,0.08)',  borda:'rgba(245,158,11,0.4)' },
      { icon:'🔵', sit:'proximos', label:'PRÓXIMOS 7 DIAS', val:prox7.length,     sub:fmt(vlProx),            cor:'#60a5fa', bg:'rgba(96,165,250,0.08)',  borda:'rgba(96,165,250,0.4)' },
      { icon:'📅', sit:'mes',      label:'RESTANTE DO MÊS', val:restMes.length,   sub:fmt(vlMes),             cor:'#a78bfa', bg:'rgba(167,139,250,0.08)', borda:'rgba(167,139,250,0.4)'},
    ].map(c => {
      const ativo = tipoF.includes(c.sit);
      return `<div onclick="_vencSetFiltro('${c.sit}')"
        style="background:${ativo?c.bg.replace('0.08','0.18'):c.bg};border:2px solid ${ativo?c.cor:c.borda};border-top:3px solid ${c.cor};border-radius:8px;padding:12px 14px;cursor:pointer;transition:all .15s;transform:${ativo?'scale(1.02)':'scale(1)'};box-shadow:${ativo?'0 0 12px '+c.cor+'44':''}"
        onmouseover="this.style.borderColor='${c.cor}';this.style.transform='scale(1.02)'"
        onmouseout="this.style.borderColor='${ativo?c.cor:c.borda}';this.style.transform='${ativo?'scale(1.02)':'scale(1)'}'"
        title="Clique para filtrar: ${c.label}">
        <div style="font-size:0.6rem;color:${c.cor};letter-spacing:.05em;margin-bottom:4px;font-weight:700">${c.icon} ${c.label}${ativo?' ✓':''}</div>
        <div style="font-family:'Space Mono',monospace;font-size:1.3rem;font-weight:700;color:${c.cor}">${c.val}</div>
        <div style="font-size:0.7rem;color:var(--muted);margin-top:3px">${c.sub}</div>
      </div>`;
    }).join('');
  }

  // ── Bloco de ação rápida ──
  _vencRenderActionBar(atrasados, venHoje, prox7, vlAtras, vlHoje, vlProx, isMesAtual);

  // ── Header da tabela ──
  const total   = filtered.length;
  const vlTotal = filtered.reduce((s,l) => s + (l.tipo==='despesa' ? _valorExib(l) : -_valorExib(l)), 0);
  const resumoEl  = document.getElementById('vencResumo');
  const tituloEl  = document.getElementById('vencTabelaTitulo');
  const infoEl    = document.getElementById('vencTabelaInfo');
  const SIT_LABEL = { atrasado:'🔴 Atrasados', hoje:'🟡 Vencem Hoje', proximos:'🔵 Próximos 7 Dias', mes:'📅 Restante do Mês', futuro:'🔮 Futuros' };
  if (resumoEl) resumoEl.textContent = `${total} item${total!==1?'s':''} · ${fmt(Math.abs(vlTotal))}`;
  if (tituloEl) tituloEl.textContent = tipoF.length===1 ? (SIT_LABEL[tipoF[0]]||'⚠️ Vencimentos por Mês') : '⚠️ Vencimentos por Mês';
  if (infoEl)   infoEl.textContent   = `${ddHoje}/${mmHoje}/${aaaHoje} · ${total} item${total!==1?'s':''} · ${fmt(Math.abs(vlTotal))}`;

  // ── Tabela única agrupada por mês ──
  const tbody = document.getElementById('vencTableBody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state" style="padding:24px">✅ Nenhum vencimento encontrado para os filtros selecionados.</td></tr>';
    return;
  }

  // Update sort icons
  const vs = window._vencSort || { col: null, dir: 1 };
  document.querySelectorAll('#tab-vencimentos thead th.sortable').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    const c = (th.getAttribute('onclick')||'').replace("setVencSort('","").replace("')","");
    if (c === vs.col) th.classList.add(vs.dir===1?'sort-asc':'sort-desc');
  });

  const SIT_ORDER = { atrasado: 0, hoje: 1, proximos: 2, mes: 3 };
  const diasDiff = vd => Math.round((vd - hoje) / 86400000);

  // Sort items
  const sortItems = (list) => {
    if (!vs.col) {
      // Default: group by month, within month by vencimento date
      return list.slice().sort((a,b) => {
        const da = a._vd ? a._vd.getTime() : 0;
        const db = b._vd ? b._vd.getTime() : 0;
        return da - db;
      });
    }
    return list.slice().sort((a,b) => {
      let av, bv;
      const bancos = loadBancos();
      switch(vs.col) {
        case 'sit':         av=SIT_ORDER[a._sit]||99; bv=SIT_ORDER[b._sit]||99; break;
        case 'vencimento':  av=a._vd?a._vd.getTime():0; bv=b._vd?b._vd.getTime():0; break;
        case 'desc':        av=(a.desc||'').toLowerCase(); bv=(b.desc||'').toLowerCase(); break;
        case 'categoria':   av=a.categoria||''; bv=b.categoria||''; break;
        case 'subCategoria':av=a.subCategoria||''; bv=b.subCategoria||''; break;
        case 'pagamento':   av=a.pagamento||''; bv=b.pagamento||''; break;
        case 'terceiro':    av=a.terceiro||''; bv=b.terceiro||''; break;
        case 'banco':       av=(bancos.find(x=>x.id===a.banco)?.nome||''); bv=(bancos.find(x=>x.id===b.banco)?.nome||''); break;
        case 'tipo':        av=a.tipo||''; bv=b.tipo||''; break;
        case 'valor':       av=a.valor; bv=b.valor; break;
        default:            av=0; bv=0;
      }
      if (av < bv) return -1 * vs.dir;
      if (av > bv) return  1 * vs.dir;
      return 0;
    });
  };

  let html = '';

  if (vs.col) {
    // ── Flat sorted list ──
    sortItems(filtered).forEach(l => {
      html += _vencRow(l, diasDiff);
    });
  } else {
    // ── Grouped by month (default) ──
    const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const mesHojeKey = `${aaaHoje}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    const porMes = {};
    filtered.forEach(l => {
      if (!l._vd) return;
      const key = `${l._vd.getFullYear()}-${String(l._vd.getMonth()+1).padStart(2,'0')}`;
      if (!porMes[key]) porMes[key] = { items:[], vlTotal:0, ano:l._vd.getFullYear(), mes:l._vd.getMonth()+1 };
      porMes[key].items.push(l);
      porMes[key].vlTotal += (l.tipo==='despesa' ? _valorExib(l) : -_valorExib(l));
    });

    Object.keys(porMes).sort().forEach(key => {
      const grupo   = porMes[key];
      const isPast  = key < mesHojeKey;
      const isCurr  = key === mesHojeKey;
      const corMes  = isPast ? '#ef4444' : isCurr ? '#f59e0b' : '#60a5fa';
      const bgMes   = isPast ? 'rgba(239,68,68,0.04)' : isCurr ? 'rgba(245,158,11,0.04)' : 'rgba(96,165,250,0.04)';
      const emoji   = isPast ? '🔴' : isCurr ? '🟡' : '🔵';
      const nomeMes = MESES_FULL[grupo.mes-1] + ' / ' + grupo.ano;
      html += `<tr style="background:${bgMes};border-top:2px solid ${corMes}33">
        <td colspan="10" style="padding:8px 14px">
          <span style="font-size:0.72rem;font-weight:700;color:${corMes};letter-spacing:.05em">${emoji} ${nomeMes.toUpperCase()}</span>
          <span style="font-size:0.68rem;color:var(--muted);margin-left:12px">${grupo.items.length} item${grupo.items.length!==1?'s':''}</span>
        </td>
        <td style="padding:8px 18px;background:${bgMes};text-align:right;font-family:'DM Mono','Space Mono',monospace;font-size:0.88rem;font-weight:800;color:${corMes};white-space:nowrap;min-width:160px">
          -${fmt(Math.abs(grupo.vlTotal))}
        </td>
      </tr>`;
      sortItems(grupo.items).forEach(l => {
        html += _vencRow(l, diasDiff);
      });
    });
  }
  // On mobile: use a card container div instead of the table
  const isMobVenc = window.matchMedia("(max-width:768px)").matches;
  if (isMobVenc) {
    const table = tbody.closest('table');
    const _vPanel = table ? table.closest('.panel') : null;
    if (_vPanel) _vPanel.classList.add('ap-hidden-mobile');
    const cardCont = document.getElementById('vencCardContainer');
    if (cardCont) { cardCont.style.display = 'block'; cardCont.innerHTML = html; }
  } else {
    const table = tbody.closest('table');
    const _vPanel2 = table ? table.closest('.panel') : null;
    if (_vPanel2) _vPanel2.classList.remove('ap-hidden-mobile');
    const cardCont = document.getElementById('vencCardContainer');
    if (cardCont) cardCont.style.display = 'none';
    tbody.innerHTML = html;
  }
}

function _vencRow(l, diasDiff) {
  const isMob = window.matchMedia("(max-width:768px)").matches;
  const sit   = l._sit;
  const diff  = l._vd ? diasDiff(l._vd) : null;
  const isRec = l.tipo === 'receita';
  const sinal = isRec ? '+' : '-';
  const vlCor = isRec ? 'var(--green)' : (sit==='atrasado' ? '#ef4444' : 'var(--red)');
  const sid   = String(l.id).replace(/'/g,"\\'");
  const bancoObj = loadBancos().find(x=>x.id===l.banco);

  // ── Situação badge ──
  let sitBadge;
  const isAgendado = l.status === 'agendado';
  if (isAgendado) {
    const dataLabel = l.dataAgendamento ? `para ${l.dataAgendamento.substring(0,5)}` : '';
    sitBadge = `<span class="venc-badge venc-badge--agendado">📆 Agendado ${dataLabel}</span>`;
  } else if (sit === 'atrasado') {
    const d = diff !== null ? Math.abs(diff) : 0;
    sitBadge = `<span class="venc-badge venc-badge--atrasado">🔴 ${d===0?'Atrasado':d===1?'Atrasado 1 dia':'Atrasado '+d+' dias'}</span>`;
  } else if (sit === 'hoje') {
    sitBadge = `<span class="venc-badge venc-badge--hoje">🟡 Hoje</span>`;
  } else if (sit === 'proximos') {
    sitBadge = diff===1 ? `<span class="venc-badge venc-badge--amanha">🟠 Amanhã</span>` : `<span class="venc-badge venc-badge--proximos">⏳ Em ${diff} dias</span>`;
  } else {
    sitBadge = `<span class="venc-badge venc-badge--mes">📅 Agendado</span>`;
  }

  // ── Botão ação ──
  const _acaoLabel = isRec ? 'Receber' : 'Pagar';
  let ctaBtn;
  if (l.status === 'agendado') {
    ctaBtn = `<button onclick="toggleStatusLanc('${sid}','pago')" class="venc-btn-pagar venc-btn-pagar--agendado">✓ ${isRec?'Receber agora':'Pagar agora'}</button>
      <button onclick="_vencCancelarAgendamento('${sid}')" class="venc-btn-cancelar-ag">✕ Cancelar</button>`;
  } else if (l.status === 'pendente') {
    const btnClass = sit==='atrasado'?'venc-btn-pagar venc-btn-pagar--urgente':sit==='hoje'?'venc-btn-pagar venc-btn-pagar--hoje':'venc-btn-pagar';
    ctaBtn = `<button onclick="toggleStatusLanc('${sid}','pago')" class="${btnClass}">✓ ${_acaoLabel}</button>
      <button onclick="_vencAgendar('${sid}')" class="venc-btn-agendar">📆</button>`;
  } else {
    ctaBtn = `<button onclick="toggleStatusLanc('${sid}','pendente')" class="venc-btn-estornar">↩</button>`;
  }

  const vencStr = (function(){
    const v = l.vencimento;
    if (!v) return '—';
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10).split('-').reverse().join('/');
    return v;
  })();

  // ── MOBILE: card ──
  if (isMob) {
    let rowBorderLeft;
    if (isAgendado)         rowBorderLeft = 'rgba(251,146,60,0.7)';
    else if (sit==='atrasado') rowBorderLeft = '#ef4444';
    else if (sit==='hoje')     rowBorderLeft = '#f59e0b';
    else if (sit==='proximos') rowBorderLeft = '#60a5fa';
    else                        rowBorderLeft = 'var(--border)';

    return `<div data-id="${sid}" style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${rowBorderLeft};border-radius:10px;padding:12px 14px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="display:flex;flex-direction:column;gap:3px;">
          <span style="font-family:'Space Mono',monospace;font-size:0.72rem;color:var(--text2)">${vencStr}</span>
          ${sitBadge}
        </div>
        <span style="font-family:'Space Mono',monospace;font-size:1rem;font-weight:700;color:${vlCor}">${sinal}${fmt(_valorExib(l))}</span>
      </div>
      <div style="font-weight:700;font-size:0.9rem;margin-bottom:6px;">${(l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,'')}${l.parcAtual?`<span style="background:rgba(240,144,64,0.85);color:#000;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-left:6px">${l.parcAtual}/${l.parcTotal}</span>`:''}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
        <span style="font-size:0.75rem;color:var(--text2)">${l.categoria||'—'}${l.subCategoria?' › '+l.subCategoria:''}</span>
        ${l.pagamento?`<span style="background:var(--surface2);border:1px solid var(--border);padding:2px 8px;border-radius:10px;font-size:0.7rem;color:var(--text2)">${l.pagamento}</span>`:''}
        ${bancoObj?`<span style="background:${bancoObj.cor}18;border:1px solid ${bancoObj.cor}44;color:${bancoObj.cor};padding:2px 8px;border-radius:10px;font-size:0.7rem">${bancoObj.icone||'🏦'} ${bancoObj.nome}</span>`:''}
        ${l.terceiro?`<span style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;padding:2px 8px;border-radius:10px;font-size:0.7rem">👤 ${l.terceiro}</span>`:''}
        ${l.recorr&&l.recorr!=='unico'?`<span class="badge ${l.recorr==='fixo'?'badge-fixo':'badge-parcelado'}">${l.recorr==='fixo'?'↻ Fixo':'⊞ Parcelado'}</span>`:''}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
        <span class="badge badge-${l.status}">${l.status==='pago'?'✓ Pago':'⏳ Pendente'}</span>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          ${ctaBtn}
          <button onclick="editLancamento('${sid}')" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.30);color:var(--accent2);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✎ Editar</button>
          <button onclick="deleteLancamento('${sid}')" style="background:rgba(240,80,96,0.12);border:1px solid rgba(240,80,96,0.3);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✕</button>
        </div>
      </div>
    </div>`;
  }

  // ── DESKTOP: continua com lógica de table row original abaixo ──
  // (sit, diff, isRec, sinal, vlCor, sid, bancoObj, isAgendado, sitBadge, ctaBtn, vencStr já declarados acima)

  // ── Fundo + borda lateral por urgência ──────────────
  let rowBg, rowBorderLeft;
  if      (isAgendado)         { rowBg = 'rgba(251,146,60,0.04)';  rowBorderLeft = '3px solid rgba(251,146,60,0.55)'; }
  else if (sit === 'atrasado') { rowBg = 'rgba(239,68,68,0.06)';   rowBorderLeft = '3px solid rgba(239,68,68,0.7)';  }
  else if (sit === 'hoje')     { rowBg = 'rgba(245,158,11,0.05)';  rowBorderLeft = '3px solid rgba(245,158,11,0.6)'; }
  else if (sit === 'proximos') { rowBg = '';                        rowBorderLeft = '3px solid rgba(96,165,250,0.3)'; }
  else                         { rowBg = '';                        rowBorderLeft = '3px solid transparent';          }

  // ── Hover colorido por urgência — contraste específico por estado
  const hoverBg = sit === 'atrasado' ? 'rgba(239,68,68,0.10)'
                : sit === 'hoje'     ? 'rgba(245,158,11,0.09)'
                : sit === 'proximos' ? 'rgba(96,165,250,0.07)'
                :                      'rgba(255,255,255,0.03)';

  // Futuro: recua levemente — sem urgência
  const rowOpacity = isAgendado ? '0.60' : sit === 'mes' ? '0.68' : '1';

  // Valor: atrasado recebe peso extra
  const valorWeight = sit === 'atrasado' ? '800' : '700';

  return `<tr class="venc-row venc-row--${sit}${isAgendado ? ' venc-row--agendado' : ''}"
    style="border-bottom:1px solid rgba(255,255,255,0.04);background:${rowBg};border-left:${rowBorderLeft};opacity:${rowOpacity};transition:background 0.14s ease,opacity 0.14s ease"
    onmouseover="this.style.background='${hoverBg}';this.style.opacity='1'" onmouseout="this.style.background='${rowBg}';this.style.opacity='${rowOpacity}'">

    <td class="venc-td-sit">
      ${sitBadge}
    </td>

    <td class="venc-td-data" style="color:${sit==='atrasado'?'#ef4444':sit==='hoje'?'#f59e0b':'var(--text2)'}">
      ${(function(){
        const v = l.vencimento;
        if (!v) return '—';
        if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10).split('-').reverse().join('/');
        return v;
      })()}
    </td>

    <td class="venc-td-desc">
      <div class="venc-desc-nome">${(l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,'')}${l.parcAtual?`<span class="venc-parcela-badge">${l.parcAtual}/${l.parcTotal}</span>`:''}</div>
      ${l.recorr&&l.recorr!=='unico'?`<div class="venc-desc-meta">${l.recorr==='fixo'?'🔁 Fixo':'🔢 Parcelado'}</div>`:''}
    </td>

    <td class="venc-td-meta">${l.categoria||'—'}</td>
    <td class="venc-td-meta venc-td-sub">${l.subCategoria||'—'}</td>

    <td class="venc-td-meta" style="color:var(--accent);font-weight:600">${l.pagamento||'—'}</td>

    <td class="venc-td-meta">
      ${l.terceiro?`<span class="venc-terceiro-badge">👤 ${l.terceiro}</span>`:'—'}
    </td>

    <td class="venc-td-meta">
      ${bancoObj?`<span style="color:${bancoObj.cor}">${bancoObj.icone||'🏦'} ${bancoObj.nome}</span>`:'—'}
    </td>

    <td style="padding:8px 10px;text-align:center">
      <span class="badge badge-${isRec?'receita':'despesa'}">${isRec?'↑ Receita':'↓ Despesa'}</span>
    </td>

    <td class="venc-td-valor" style="color:${vlCor};font-weight:${valorWeight}">
      ${sinal}${fmt(_valorExib(l))}
    </td>

    <td class="venc-td-acao">
      <div class="venc-acao-wrap">
        ${ctaBtn}
        <div class="venc-acao-secundaria">
          <button class="del-btn" onclick="editLancamento('${sid}')" title="Editar" style="color:var(--accent)">✎</button>
          <button class="del-btn" onclick="deleteLancamento('${sid}')" title="Excluir">✕</button>
        </div>
      </div>
    </td>
  </tr>`;
}
// ======== VENCIMENTOS END ========

// ── Bloco de ação rápida — vencimentos ───────────────────────────────────────
function _vencRenderActionBar(atrasados, venHoje, prox7, vlAtras, vlHoje, vlProx, isMesAtual) {
  const bar = document.getElementById('vencActionBar');
  if (!bar) return;

  const temAtrasado = isMesAtual && atrasados.length > 0;
  const temHoje     = isMesAtual && venHoje.length   > 0;

  // Amanhã = prox7 com diff === 1, excluindo já agendados
  const amanha = isMesAtual ? prox7.filter(l => {
    const hoje2 = new Date(); hoje2.setHours(0,0,0,0);
    return l._vd && Math.round((l._vd - hoje2) / 86400000) === 1 && l.status === 'pendente';
  }) : [];
  const temAmanha = amanha.length > 0;
  const vlAmanha  = amanha.reduce((s,l) => s + _valorExib(l), 0);

  // Hierarquia: atrasado > hoje > amanhã > nada
  if (!temAtrasado && !temHoje && !temAmanha) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  // ── Modo agendamento: só amanhã disponível ────────────
  if (!temAtrasado && !temHoje && temAmanha) {
    const n = amanha.length;
    bar.innerHTML = `
      <div class="venc-action-strip venc-action-strip--amanha">
        <div class="venc-priority-info">
          <div class="venc-priority-header">
            <span>🟠</span>
            <span class="venc-priority-label">Vencem amanhã</span>
          </div>
          <div class="venc-priority-desc">${n} conta${n!==1?'s':''} vencem amanhã</div>
          <div class="venc-priority-ctx"><strong>${fmt(vlAmanha)}</strong> a vencer</div>
        </div>
        <button class="venc-action-cta venc-action-cta--amanha"
          onclick="_vencAgendarGrupo()"
          title="Marcar como agendado para amanhã">
          📆 Agendar pagamento
        </button>
      </div>`;
    bar.style.display = 'block';
    return;
  }

  // ── Seleciona o grupo de maior urgência ──────────────
  const grupo = temAtrasado ? atrasados : venHoje;
  const sit   = temAtrasado ? 'atrasado' : 'hoje';

  // ── Score de prioridade calibrado ────────────────────
  // dias*15 pesa urgência temporal; log(valor)*20 escala valor sem deixar
  // itens baratos dominarem apenas por tempo
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const scored = grupo
    .filter(l => l.status === 'pendente' && l.tipo === 'despesa')
    .map(l => {
      const vd = l._vd || null;
      const diasAtraso = (vd && vd < hoje) ? Math.round((hoje - vd) / 86400000) : 0;
      const score = (diasAtraso * 15) + Math.log((_valorExib(l) || 0) + 1) * 20;
      return { ...l, _score: score, _diasAtraso: diasAtraso };
    })
    .sort((a, b) => b._score - a._score);

  if (!scored.length) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  // ── Item de maior prioridade ─────────────────────────
  const top     = scored[0];
  const topId   = String(top.id);
  const topDesc = (top.desc || '—').replace(/\s*\(\d+\/\d+\)\s*$/, '').substring(0, 36);
  const topVl   = _valorExib(top) || 0;
  const topDias = top._diasAtraso || 0;

  // ── Segundo item: maior valor (diferente do top) ─────
  const byValor = scored.slice().sort((a, b) => _valorExib(b) - _valorExib(a));
  const second  = byValor.find(l => String(l.id) !== topId);

  // Textos por situação
  const n          = scored.length;
  const vlTotal    = scored.reduce((s, l) => s + _valorExib(l), 0);
  const stripClass = sit === 'atrasado' ? 'venc-action-strip--atrasado' : 'venc-action-strip--hoje';
  const ctaClass   = sit === 'atrasado' ? 'venc-action-cta--atrasado'  : 'venc-action-cta--hoje';
  const emoji      = sit === 'atrasado' ? '🔴' : '🟡';

  // Contexto geral: "3 em atraso · R$ 4.200 total"
  const ctxLabel = sit === 'atrasado'
    ? `${n} em atraso · <strong>${fmt(vlTotal)}</strong> total`
    : `${n} vencem hoje · <strong>${fmt(vlTotal)}</strong> total`;

  // Info do item crítico: "5 dias em atraso — R$ 2.800"
  const diasInfo = topDias > 0
    ? `${topDias} dia${topDias!==1?'s':''} em atraso — <strong>${fmt(topVl)}</strong>`
    : `Vence hoje — <strong>${fmt(topVl)}</strong>`;

  // Dica do segundo item (maior valor)
  const secondHint = second
    ? `<div class="venc-priority-second">
        💡 Maior valor: <strong>${(second.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,'').substring(0,28)}</strong>
        — ${fmt(second.valor)}
       </div>`
    : '';

  bar.innerHTML = `
    <div class="venc-action-strip ${stripClass}">

      <div class="venc-priority-info">
        <div class="venc-priority-header">
          <span>${emoji}</span>
          <span class="venc-priority-label">Mais crítico agora</span>
        </div>
        <div class="venc-priority-desc" title="${top.desc || ''}">${topDesc}</div>
        <div class="venc-priority-ctx">${diasInfo}</div>
        ${secondHint}
      </div>

      <button class="venc-action-cta ${ctaClass}"
        onclick="_vencPagarPrioridade('${topId}', '${sit}')"
        title="Pagar o item de maior prioridade">
        ✓ Pagar prioridade — ${fmt(topVl)}
      </button>

    </div>`;
  bar.style.display = 'block';
}

// Paga o item de maior prioridade e re-renderiza (mantém _vencPagarGrupo intocado)
function _vencPagarPrioridade(id, sit) {
  const top = loadData().find(l => String(l.id) === id);
  if (!top) return;

  const desc = (top.desc || 'este item').replace(/\s*\(\d+\/\d+\)\s*$/, '');
  if (!confirm(`Marcar "${desc}" como pago?`)) return;

  // Usa a mesma camada de persistência de toggleStatusLanc
  const updated = loadData().map(l =>
    String(l.id) === id ? { ...l, status: 'pago' } : l
  );
  saveData(updated);
  safeRender(() => renderAll());
  renderVencimentosTab();
}

// Paga em lote todos os lançamentos de uma situação (mantido para compatibilidade)
function _vencPagarGrupo(sit) {
  const label = sit === 'atrasado' ? 'itens em atraso' : 'vencimentos de hoje';
  if (!confirm(`Marcar todos os ${label} como pagos?`)) return;

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const em7d = new Date(hoje); em7d.setDate(em7d.getDate()+7);

  const parseDMY = s => {
    if (!s) return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const[d,m,y]=s.split('/'); return new Date(+y,+m-1,+d); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s))   { const[y,m,d]=s.split('-'); return new Date(+y,+m-1,+d); }
    return null;
  };

  const all = loadData().map(l => {
    const vd = parseDMY(l.vencimento);
    if (vd) vd.setHours(0,0,0,0);
    let _sit;
    if (!vd)                               _sit = 'mes';
    else if (vd < hoje)                    _sit = 'atrasado';
    else if (vd.getTime()===hoje.getTime())_sit = 'hoje';
    else if (vd <= em7d)                   _sit = 'proximos';
    else                                   _sit = 'mes';
    return { ...l, _sit };
  });

  const ids = all
    .filter(l => l._sit === sit && l.status === 'pendente' && l.tipo === 'despesa')
    .map(l => String(l.id));

  if (!ids.length) { alert('Nenhum item pendente encontrado.'); return; }

  const updated = loadData().map(l =>
    ids.includes(String(l.id)) ? { ...l, status: 'pago' } : l
  );
  saveData(updated);
  safeRender(() => renderAll());
  renderVencimentosTab();
}

// ── Agendar grupo amanhã ──────────────────────────────────────────────────────
function _vencAgendarGrupo() {
  const hoje = new Date(); hoje.setHours(0,0,0,0);

  const parseDMY = s => {
    if (!s) return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const[d,m,y]=s.split('/'); return new Date(+y,+m-1,+d); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s))   { const[y,m,d]=s.split('-'); return new Date(+y,+m-1,+d); }
    return null;
  };

  // Encontra todos os pendentes que vencem amanhã
  const ids = loadData()
    .filter(l => {
      if (l.status !== 'pendente' || l.tipo !== 'despesa') return false;
      const vd = parseDMY(l.vencimento);
      if (!vd) return false;
      vd.setHours(0,0,0,0);
      return Math.round((vd - hoje) / 86400000) === 1;
    })
    .map(l => String(l.id));

  if (!ids.length) { alert('Nenhum item com vencimento amanhã.'); return; }

  const n = ids.length;
  if (!confirm(`Agendar ${n} item${n!==1?'s':''} para pagamento amanhã?`)) return;

  const agendadoEm = new Date().toISOString();
  // Calcular a data de amanhã em DD/MM/YYYY para armazenar
  const amG = new Date(hoje); amG.setDate(amG.getDate() + 1);
  const padG = n => String(n).padStart(2,'0');
  const dataAgendamento = `${padG(amG.getDate())}/${padG(amG.getMonth()+1)}/${amG.getFullYear()}`;

  const updated = loadData().map(l =>
    ids.includes(String(l.id))
      ? { ...l, status: 'agendado', dataAgendamento, _agendadoEm: agendadoEm }
      : l
  );
  saveData(updated);
  safeRender(() => renderAll());
  renderVencimentosTab();
}

// Agendar um único item (usado por botão individual futuro)
// ── Modal de Agendamento ─────────────────────────────────────────────────────
// Estado global mínimo: só o ID do lançamento sendo agendado
let _agId = null;

// Abre o modal, pré-preenchendo data com o vencimento do item (ou amanhã)
// Aceita dataDefault em YYYY-MM-DD ou DD/MM/YYYY
function abrirModalAgendamento(id, dataDefault) {
  _agId = String(id);

  // Converte DD/MM/YYYY → YYYY-MM-DD para o input[type=date]
  let iso = '';
  if (dataDefault) {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataDefault)) {
      const [d, m, y] = dataDefault.split('/');
      iso = `${y}-${m}-${d}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dataDefault)) {
      iso = dataDefault;
    }
  }
  // Fallback: amanhã
  if (!iso) {
    const t = new Date(); t.setDate(t.getDate() + 1);
    const pad = n => String(n).padStart(2,'0');
    iso = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`;
  }

  // Popula o campo de descrição do lançamento
  const item = loadData().find(l => String(l.id) === _agId);
  const desc = item ? (item.desc || '—').replace(/\s*\(\d+\/\d+\)\s*$/, '').substring(0, 40) : '—';
  document.getElementById('modalAgDesc').textContent = desc;

  const input = document.getElementById('modalAgData');
  input.value = iso;
  input.classList.remove('error');
  document.getElementById('modalAgError').textContent = '';

  // Destacar o botão de atalho correspondente ao valor inicial
  _agSyncQuickButtons(iso);

  // Restaurar botão confirmar
  const btn = document.getElementById('btnAgConfirmar');
  btn.textContent = '✓ Confirmar';
  btn.disabled = false;

  document.getElementById('modalAg').style.display = 'flex';
  setTimeout(() => input.focus(), 80);
}

function _agFechar() {
  _agId = null;
  document.getElementById('modalAg').style.display = 'none';
}

function _agConfirmar() {
  const input  = document.getElementById('modalAgData');
  const errEl  = document.getElementById('modalAgError');
  const btn    = document.getElementById('btnAgConfirmar');
  const raw    = input.value; // YYYY-MM-DD

  // ── Validação 1: campo obrigatório ──
  if (!raw) {
    input.classList.add('error');
    errEl.textContent = 'Selecione uma data.';
    input.focus();
    return;
  }

  // ── Validação 2: não pode ser no passado ──
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const [vy, vm, vd] = raw.split('-').map(Number);
  const escolhida = new Date(vy, vm - 1, vd);
  if (escolhida < hoje) {
    input.classList.add('error');
    errEl.textContent = 'Não é possível agendar uma data passada.';
    input.focus();
    return;
  }

  // ── Feedback visual: desabilitar botão durante gravação ──
  btn.textContent = 'Agendando…';
  btn.disabled = true;

  const pad = n => String(n).padStart(2,'0');
  const dataAgendamento = `${pad(vd)}/${pad(vm)}/${vy}`; // DD/MM/YYYY para exibição

  const updated = loadData().map(l =>
    String(l.id) === _agId
      ? { ...l, status: 'agendado', dataAgendamento, _agendadoEm: new Date().toISOString() }
      : l
  );
  _memCache.lancamentos = updated;
  dbUpdateLancamento(_agId, { status: 'agendado', dataAgendamento }).catch(e => console.error('[agConfirmar]', e.message));
  _agFechar();
  safeRender(() => renderAll());
  renderVencimentosTab();
}

// ── Helpers de atalho ─────────────────────────────────────
function _agSetDias(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  const pad = x => String(x).padStart(2,'0');
  const iso = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const input = document.getElementById('modalAgData');
  input.value = iso;
  input.classList.remove('error');
  document.getElementById('modalAgError').textContent = '';
  _agSyncQuickButtons(iso);
}

function _agClearError() {
  const input = document.getElementById('modalAgData');
  input.classList.remove('error');
  document.getElementById('modalAgError').textContent = '';
  _agSyncQuickButtons(input.value);
}

// Destaca o botão de atalho ativo, se a data coincidir
function _agSyncQuickButtons(iso) {
  const btns = document.querySelectorAll('.modal-ag-quick button');
  btns.forEach((btn, i) => {
    const dias = [0, 1, 3, 7][i];
    const d = new Date(); d.setDate(d.getDate() + dias);
    const pad = n => String(n).padStart(2,'0');
    const ref = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    btn.classList.toggle('active', iso === ref);
  });
}

// Fecha com Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('modalAg').style.display !== 'none') {
    _agFechar();
  }
});

// Agendar item individual — agora abre modal em vez de prompt()
function _vencAgendar(id) {
  const modal = document.getElementById('modalAg');
  if (!modal) { alert('Modal de agendamento não encontrado.'); return; }
  const item = loadData().find(l => String(l.id) === String(id));
  const dataDefault = item ? (item.vencimento || null) : null;
  abrirModalAgendamento(id, dataDefault);
}

// Cancela agendamento — devolve para pendente
function _vencCancelarAgendamento(id) {
  const updated = loadData().map(l =>
    String(l.id) === id
      ? { ...l, status: 'pendente', dataAgendamento: null, _agendadoEm: null }
      : l
  );
  _memCache.lancamentos = updated;
  dbUpdateLancamento(id, { status: 'pendente', dataAgendamento: null }).catch(e => console.error('[cancelarAgendamento]', e.message));
  safeRender(() => renderAll());
  renderVencimentosTab();
}

