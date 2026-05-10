// ======== PARCELADOS ========
window._parcSort = { col: null, dir: 1 };
window._parcMesSort = { col: null, dir: 1 };
function parcSortBy(col) {
  const ps = window._parcSort;
  if (ps.col === col) ps.dir *= -1;
  else { ps.col = col; ps.dir = 1; }
  renderParceladosTab();
}
function parcMesSortBy(col) {
  const ms = window._parcMesSort;
  if (ms.col === col) ms.dir *= -1;
  else { ms.col = col; ms.dir = 1; }
  renderParceladosTab();
}
function _parcSortIcon(col) {
  const ps = window._parcSort;
  if (ps.col !== col) return '<span style="opacity:0.25;font-size:0.6rem"> ⇅</span>';
  return ps.dir === 1
    ? '<span style="color:#a78bfa;font-size:0.65rem"> ▲</span>'
    : '<span style="color:#a78bfa;font-size:0.65rem"> ▼</span>';
}
function renderParceladosTab() {
  const tipoF   = window.FSEL ? FSEL.getValues('parcFiltroTipo')   : [];
  const statusF = window.FSEL ? FSEL.getValues('parcFiltroStatus') : [];
  const catF    = window.FSEL ? FSEL.getValues('parcFiltroCat')    : [];
  const pagF    = window.FSEL ? FSEL.getValues('parcFiltroPag')    : [];
  const subCatF = window.FSEL ? FSEL.getValues('parcFiltroSubCat') : [];
  const tercF   = window.FSEL ? FSEL.getValues('parcFiltroTerc')   : [];
  const bancF   = window.FSEL ? FSEL.getValues('parcFiltroBanco')  : [];
  const busca   = (document.getElementById('parcFiltroBusca')?.value || '').toLowerCase();
  const _pfvRaw = (document.getElementById('parcFiltroValor')?.value || '').trim();
  const filtroValor = _pfvRaw && typeof parseBRL === 'function' ? parseBRL(_pfvRaw) : NaN;

  const allData = loadDataBanco();
  const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const hoje = new Date();
  const mesHoje = hoje.getMonth()+1, anoHoje = hoje.getFullYear();
  const nomeMesFiltro = MONTHS_SHORT[currentMonth-1] + '/' + currentYear;

  // Populate filters (once)
  const catSel = document.getElementById('parcFiltroCat');
  if (catSel) {
    catSel.innerHTML = '<option value="">— Todas as categorias —</option>';
    [...new Set(allData.filter(l=>l.recorr&&l.recorr!=='unico').map(l=>l.categoria).filter(Boolean))].sort()
      .forEach(c => { const o=document.createElement('option');o.value=c;o.textContent=c;catSel.appendChild(o); });
    if(window.FSEL) _fselRebuild('parcFiltroCat');
  }
  const pagSel = document.getElementById('parcFiltroPag');
  if (pagSel) {
    pagSel.innerHTML = '<option value="">— Todos os pagamentos —</option>';
    [...new Set(allData.filter(l=>l.recorr&&l.recorr!=='unico').map(l=>l.pagamento).filter(Boolean))].sort()
      .forEach(p => { const o=document.createElement('option');o.value=p;o.textContent=p;pagSel.appendChild(o); });
    if(window.FSEL) _fselRebuild('parcFiltroPag');
  }
  const subCatSel2 = document.getElementById('parcFiltroSubCat');
  if (subCatSel2) {
    subCatSel2.innerHTML = '<option value="">— Todas as sub-cat. —</option>';
    [...new Set(allData.filter(l=>l.recorr&&l.recorr!=='unico').map(l=>l.subCategoria).filter(Boolean))].sort()
      .forEach(s => { const o=document.createElement('option');o.value=s;o.textContent=s;subCatSel2.appendChild(o); });
    if(window.FSEL) _fselRebuild('parcFiltroSubCat');
  }
  const tercSel2 = document.getElementById('parcFiltroTerc');
  if (tercSel2) {
    tercSel2.innerHTML = '<option value="">— Todos os terceiros —</option>';
    [...new Set(allData.filter(l=>l.recorr&&l.recorr!=='unico').map(l=>l.terceiro).filter(Boolean))].sort()
      .forEach(t => { const o=document.createElement('option');o.value=t;o.textContent=t;tercSel2.appendChild(o); });
    if(window.FSEL) _fselRebuild('parcFiltroTerc');
  }
  const bancSel2 = document.getElementById('parcFiltroBanco');
  if (bancSel2) {
    bancSel2.innerHTML = '<option value="">— Todos os bancos —</option>';
    loadBancos().forEach(b => { const o=document.createElement('option');o.value=b.id;o.textContent=(b.icone||'🏦')+' '+b.nome;bancSel2.appendChild(o); });
    if(window.FSEL) _fselRebuild('parcFiltroBanco');
  }

  // Group by groupId — somente parcelados (sem fixos)
  const groups = {};
  allData.filter(l => l.recorr==='parcelado').forEach(l => {
    const g = String(l.groupId || l.id);
    if (!groups[g]) groups[g] = { parcelas:[], recorr:l.recorr };
    groups[g].parcelas.push(l);
  });

  // Build summaries
  const summaries = Object.entries(groups).map(([gid, g]) => {
    const parts = g.parcelas.sort((a,b) => (a.ano*100+a.mes)-(b.ano*100+b.mes));
    const first = parts[0], last = parts[parts.length-1];

    // totalReal: usa campo totalParcelas ou parcTotal
    const totalReal = first.totalParcelas
      ? parseInt(first.totalParcelas)
      : (first.parcTotal || parts.length);

    // Número da primeira parcela registrada no sistema (usa campo parcAtual)
    const firstParc = first.parcAtual || 1;
    const paidBefore = firstParc - 1;

    const descClean = (first.desc||'').replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();

    const pagasNoSistema = parts.filter(p=>p.status==='pago').length;
    const pagas   = pagasNoSistema + paidBefore;
    const restam  = Math.max(0, totalReal - pagas);
    const pendList = parts.filter(p=>p.status==='pendente').sort((a,b)=>(a.ano*100+a.mes)-(b.ano*100+b.mes));

    const vlParcela  = first.valor;
    const vlTotal    = vlParcela * totalReal;
    const vlPago     = vlParcela * pagas;
    const vlRestante = vlParcela * restam;
    const pctPago    = totalReal > 0 ? Math.round(pagas/totalReal*100) : 100;

    const proxPend     = pendList[0];
    const proxLabel    = proxPend ? MONTHS_SHORT[(proxPend.mes||1)-1]+'/'+proxPend.ano : '—';
    const proxAtrasada = proxPend && (proxPend.ano < anoHoje || (proxPend.ano===anoHoje && proxPend.mes < mesHoje));
    const isQuitado    = restam === 0;

    // ── Dados do mês filtrado ──
    const parcelaMes = parts.find(p => p.mes===currentMonth && p.ano===currentYear);
    const noMes      = !!parcelaMes;
    const statusMes  = parcelaMes?.status || null;
    // Parcela número no mês filtrado
    let numParcelaMes = null;
    if (parcelaMes) {
      // usa campo parcAtual se disponível, senão calcula por índice
      numParcelaMes = parcelaMes.parcAtual || (firstParc + parts.indexOf(parcelaMes));
    }
    const vencMes    = parcelaMes?.vencimento || null;

    return {
      gid, descClean, recorr: g.recorr,
      categoria: first.categoria||'', subCategoria: first.subCategoria||'',
      pagamento: first.pagamento||'', terceiro: first.terceiro||'',
      banco: first.banco||'', tipo: first.tipo||'despesa',
      total: totalReal, pagas, restam,
      vlParcela, vlTotal, vlPago, vlRestante, pctPago,
      proxLabel, proxAtrasada, isQuitado,
      periodoInicio: MONTHS_SHORT[(first.mes||1)-1]+'/'+first.ano,
      periodoFim:    MONTHS_SHORT[(last.mes||1)-1]+'/'+last.ano,
      // mês filtrado
      noMes, statusMes, numParcelaMes, vencMes,
      vlMes: parcelaMes ? parcelaMes.valor : 0,
      idMes: parcelaMes ? String(parcelaMes.id) : null,
    };
  });

  // Apply filters — exclui "Dividas de terceiros"
  let filtered = summaries.filter(s => {
    if (s.categoria === 'Dividas de terceiros') return false;
    if (tipoF.length  && !tipoF.includes(s.recorr)) return false;
    if (statusF.includes('ativo')   &&  s.isQuitado) return false;
    if (statusF.includes('quitado') && !s.isQuitado) return false;
    if (catF.length    && !catF.includes(s.categoria))    return false;
    if (subCatF.length && !subCatF.includes(s.subCategoria||'')) return false;
    if (pagF.length    && !pagF.includes(s.pagamento))    return false;
    if (tercF.length   && !tercF.includes(s.terceiro||'')) return false;
    if (bancF.length   && !bancF.includes(s.banco||''))   return false;
    if (busca && !s.descClean.toLowerCase().includes(busca)) return false;
    // filtro valor exato: compara com vlParcela (valor de cada parcela) ou vlTotal
    if (!isNaN(filtroValor) && filtroValor > 0) {
      const matchParcela = Math.abs((Number(s.vlParcela)||0) - filtroValor) <= 0.005;
      const matchTotal   = Math.abs((Number(s.vlTotal)||0)   - filtroValor) <= 0.005;
      if (!matchParcela && !matchTotal) return false;
    }
    return true;
  });

  // Sort dinâmico
  const _ps = window._parcSort || { col: null, dir: 1 };
  if (_ps.col) {
    filtered.sort((a,b) => {
      let va, vb;
      switch(_ps.col) {
        case 'desc':      va=a.descClean;  vb=b.descClean;  break;
        case 'categoria': va=a.categoria;  vb=b.categoria;  break;
        case 'pagamento': va=a.pagamento;  vb=b.pagamento;  break;
        case 'pagas':     va=a.pagas;      vb=b.pagas;      break;
        case 'restam':    va=a.restam;     vb=b.restam;     break;
        case 'vlParcela': va=a.vlParcela;  vb=b.vlParcela;  break;
        case 'vlPago':    va=a.vlPago;     vb=b.vlPago;     break;
        case 'vlRestante':va=a.vlRestante; vb=b.vlRestante; break;
        case 'vlTotal':   va=a.vlTotal;    vb=b.vlTotal;    break;
        case 'prox':      va=a.proxLabel;  vb=b.proxLabel;  break;
        case 'pct':       va=a.pctPago;    vb=b.pctPago;    break;
        default:          va=0; vb=0;
      }
      if (typeof va === 'string') return _ps.dir * va.localeCompare(vb,'pt-BR');
      return _ps.dir * (va - vb);
    });
  } else {
    // default: com parcela no mês primeiro, depois ativos, depois quitados
    filtered.sort((a,b) => {
      if (a.noMes !== b.noMes) return a.noMes ? -1 : 1;
      if (a.isQuitado !== b.isQuitado) return a.isQuitado ? 1 : -1;
      return a.proxLabel.localeCompare(b.proxLabel);
    });
  }

  // ── Totais para os cards (somente despesas) ──
  const filteredDesp = filtered.filter(s => s.tipo !== 'receita');
  const ativos   = filteredDesp.filter(s=>!s.isQuitado).length;
  const quitados = filteredDesp.filter(s=> s.isQuitado).length;
  const totalRestante = filteredDesp.reduce((s,g)=>s+g.vlRestante,0);

  const noMesList     = filteredDesp.filter(s=>s.noMes);
  const pendentesMes  = noMesList.filter(s=>s.statusMes==='pendente');
  const pagosMes      = noMesList.filter(s=>s.statusMes==='pago');
  const vlPendMes     = pendentesMes.reduce((s,g)=>s+g.vlMes,0);
  const vlPagoMes     = pagosMes.reduce((s,g)=>s+g.vlMes,0);
  const vlTotalMes    = noMesList.reduce((s,g)=>s+g.vlMes,0);
  // Parcelamentos cuja parcela do mês é a última (quitam no mês)
  const gruposQuitandoMes = noMesList.filter(g => g.restam <= 1);
  const vlQuitacaoMes  = gruposQuitandoMes.reduce((s,g)=>s+g.vlMes,0);
  const qtdQuitacaoMes = gruposQuitandoMes.length;

  // ── Cards de resumo ──
  const cardsEl = document.getElementById('parcCards');
  if (cardsEl) {
    cardsEl.innerHTML = `
      <div style="background:var(--surface);border:1px solid rgba(255,255,255,0.07);border-top:3px solid #60a5fa;border-radius:8px;padding:12px 14px">
        <div style="font-size:0.6rem;color:var(--muted);letter-spacing:.05em;margin-bottom:4px">GRUPOS ATIVOS</div>
        <div style="font-family:'Space Mono',monospace;font-size:1.1rem;font-weight:700;color:#60a5fa">${ativos}</div>
        <div style="font-size:0.62rem;color:var(--muted);margin-top:3px">${quitados} quitados</div>
      </div>
      <div style="background:var(--surface);border:1px solid rgba(255,255,255,0.07);border-top:3px solid #a78bfa;border-radius:8px;padding:12px 14px">
        <div style="font-size:0.6rem;color:var(--muted);letter-spacing:.05em;margin-bottom:4px">PARCELAS EM ${nomeMesFiltro.toUpperCase()}</div>
        <div style="font-family:'Space Mono',monospace;font-size:1.1rem;font-weight:700;color:#a78bfa">${noMesList.length}</div>
        <div style="font-size:0.62rem;color:var(--muted);margin-top:3px">${fmt(vlTotalMes)} no mês</div>
      </div>
      <div style="background:var(--surface);border:1px solid rgba(255,255,255,0.07);border-top:3px solid #f59e0b;border-radius:8px;padding:12px 14px">
        <div style="font-size:0.6rem;color:var(--muted);letter-spacing:.05em;margin-bottom:4px">PENDENTE EM ${nomeMesFiltro.toUpperCase()}</div>
        <div style="font-family:'Space Mono',monospace;font-size:1.1rem;font-weight:700;color:#f59e0b">${fmt(vlPendMes)}</div>
        <div style="font-size:0.62rem;color:var(--muted);margin-top:3px">${pendentesMes.length} parcelas pendentes</div>
      </div>
      <div style="background:var(--surface);border:1px solid rgba(255,255,255,0.07);border-top:3px solid #22c55e;border-radius:8px;padding:12px 14px">
        <div style="font-size:0.6rem;color:var(--muted);letter-spacing:.05em;margin-bottom:4px">PAGO EM ${nomeMesFiltro.toUpperCase()}</div>
        <div style="font-family:'Space Mono',monospace;font-size:1.1rem;font-weight:700;color:#22c55e">${fmt(vlPagoMes)}</div>
        <div style="font-size:0.62rem;color:var(--muted);margin-top:3px">${pagosMes.length} parcelas pagas</div>
      </div>
      <div style="background:var(--surface);border:1px solid rgba(255,255,255,0.07);border-top:3px solid #ef4444;border-radius:8px;padding:12px 14px">
        <div style="font-size:0.6rem;color:var(--muted);letter-spacing:.05em;margin-bottom:4px">SALDO DEVEDOR TOTAL</div>
        <div style="font-family:'Space Mono',monospace;font-size:1.1rem;font-weight:700;color:#ef4444">${fmt(totalRestante)}</div>
        <div style="font-size:0.62rem;color:var(--muted);margin-top:3px">todas as parcelas restantes</div>
      </div>
      <div style="background:var(--surface);border:1px solid rgba(255,255,255,0.07);border-top:3px solid #f43f5e;border-radius:8px;padding:12px 14px">
        <div style="font-size:0.6rem;color:var(--muted);letter-spacing:.05em;margin-bottom:4px">QUITANDO EM ${nomeMesFiltro.toUpperCase()}</div>
        <div style="font-family:'Space Mono',monospace;font-size:1.1rem;font-weight:700;color:#f43f5e">${fmt(vlQuitacaoMes)}</div>
        <div style="font-size:0.62rem;color:var(--muted);margin-top:3px">${qtdQuitacaoMes} parcel. com última parcela no mês</div>
      </div>`;
  }

  // (tabela de grupos removida)

  // ── Painel: Parcelas do mês filtrado ──
  const mesListaEl = document.getElementById('parcMesLista');
  const mesTitleEl = document.getElementById('parcMesPanelTitle');
  const mesTotaisEl = document.getElementById('parcMesTotais');
  if (mesListaEl) {
    if (mesTitleEl) mesTitleEl.textContent = `📅 Parcelas de ${nomeMesFiltro}`;

    // Sort do painel do mês
    const _ms = window._parcMesSort || { col: null, dir: 1 };
    const mesSort = (list) => {
      if (!_ms.col) return list.slice().sort((a,b) => a.descClean.localeCompare(b.descClean,'pt-BR'));
      return list.slice().sort((a,b) => {
        let va, vb;
        switch(_ms.col) {
          case 'desc':      va=a.descClean;  vb=b.descClean;  break;
          case 'categoria': va=a.categoria;  vb=b.categoria;  break;
          case 'subcat':    va=a.subCategoria||''; vb=b.subCategoria||''; break;
          case 'pagamento': va=a.pagamento;  vb=b.pagamento;  break;
          case 'terceiro':  va=a.terceiro||''; vb=b.terceiro||''; break;
          case 'banco':     va=a.banco||'';  vb=b.banco||'';  break;
          case 'parcela':   va=a.numParcelaMes||0; vb=b.numParcelaMes||0; break;
          case 'restam':    va=a.restam;     vb=b.restam;     break;
          case 'valor':     va=a.vlMes;      vb=b.vlMes;      break;
          default:          va=0; vb=0;
        }
        if (typeof va === 'string') return _ms.dir * va.localeCompare(vb,'pt-BR');
        return _ms.dir * (va - vb);
      });
    };
    const msSortIcon = (col) => _ms.col !== col
      ? '<span style="opacity:0.25;font-size:0.55rem"> ⇅</span>'
      : _ms.dir === 1 ? '<span style="color:#f59e0b;font-size:0.6rem"> ▲</span>' : '<span style="color:#f59e0b;font-size:0.6rem"> ▼</span>';

    const pendMes   = mesSort(noMesList.filter(s => s.statusMes === 'pendente'));
    const pagosMesL = mesSort(noMesList.filter(s => s.statusMes === 'pago'));
    const vlPend = pendMes.reduce((s,x)=>s+x.vlMes,0);
    const vlPago = pagosMesL.reduce((s,x)=>s+x.vlMes,0);
    if (mesTotaisEl) {
      mesTotaisEl.innerHTML = pendMes.length
        ? `<span style="color:#f59e0b">⏳ ${fmt(vlPend)} pendente</span>&nbsp;&nbsp;<span style="color:#22c55e">✓ ${fmt(vlPago)} pago</span>`
        : noMesList.length
          ? `<span style="color:#22c55e">✓ Tudo pago — ${fmt(vlPago)}</span>`
          : `<span style="color:var(--muted)">Nenhuma parcela neste mês</span>`;
    }
    if (!noMesList.length) {
      mesListaEl.innerHTML = `<div class="empty-state" style="padding:14px">Nenhuma parcela vence em ${nomeMesFiltro}.</div>`;
    } else {
      const thStyle = (col, align) => `style="padding:7px 12px;font-size:0.6rem;color:var(--muted);font-weight:600;white-space:nowrap;cursor:pointer;user-select:none;text-align:${align||'left'};position:sticky;top:0;z-index:10;background:var(--surface2)" onclick="parcMesSortBy('${col}')"`;
      const headerRow = `<tr style="background:var(--surface2)">
        <th ${thStyle('desc','left')}>DESCRIÇÃO${msSortIcon('desc')}</th>
        <th ${thStyle('categoria','left')}>CATEGORIA${msSortIcon('categoria')}</th>
        <th ${thStyle('subcat','left')}>SUB-CAT.${msSortIcon('subcat')}</th>
        <th ${thStyle('pagamento','left')}>PAGAMENTO${msSortIcon('pagamento')}</th>
        <th ${thStyle('terceiro','left')}>TERCEIRO${msSortIcon('terceiro')}</th>
        <th ${thStyle('banco','left')}>BANCO${msSortIcon('banco')}</th>
        <th ${thStyle('parcela','center')}>PARCELA${msSortIcon('parcela')}</th>
        <th ${thStyle('restam','center')}>RESTAM${msSortIcon('restam')}</th>
        <th ${thStyle('valor','right')}>VALOR${msSortIcon('valor')}</th>
        <th style="padding:7px 12px;font-size:0.6rem;color:var(--muted);font-weight:600;white-space:nowrap;text-align:center;position:sticky;top:0;z-index:10;background:var(--surface2)">AÇÃO</th>
      </tr>`;

      const renderGrupoMes = (list, titulo, corTitulo, icone) => {
        if (!list.length) return '';
        const total = list.reduce((s,x)=>s+x.vlMes,0);
        const rows = list.map(s => {
          const parcNum = s.numParcelaMes ? `${s.numParcelaMes}/${s.total}` : '—';
          const restamStr = s.restam > 1
            ? `<span style="color:#f59e0b">${s.restam} restam</span>`
            : s.restam === 1 ? `<span style="color:#22c55e">última!</span>`
            : `<span style="color:#22c55e">quitado</span>`;
          const vencStr = s.vencMes ? `<span style="color:var(--muted);font-size:0.65rem"> · venc. ${s.vencMes}</span>` : '';
          const sid2 = s.idMes || null;
          const acaoBtns = sid2
            ? (s.statusMes==='pendente'
                ? '<button class="del-btn" onclick="toggleStatusLanc(\''+sid2+'\',\'pago\')" title="Pagar" style="color:var(--green);margin-right:2px">✓</button>'
                : '<button class="del-btn" onclick="toggleStatusLanc(\''+sid2+'\',\'pendente\')" title="Estornar" style="color:var(--danger);margin-right:2px">↩</button>')
              + '<button class="del-btn" onclick="editLancamento(\''+sid2+'\')" title="Editar" style="color:var(--accent2);margin-right:2px">✎</button>'
              + '<button class="del-btn" onclick="deleteLancamento(\''+sid2+'\')" title="Excluir" style="color:var(--danger)">✕</button>'
            : '—';
          return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
            <td style="padding:8px 12px;font-size:0.8rem;font-weight:600;color:var(--text);white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis">${s.descClean}${vencStr}</td>
            <td style="padding:8px 12px;font-size:0.7rem;color:var(--text2);white-space:nowrap">${s.categoria||'—'}</td>
            <td style="padding:8px 12px;font-size:0.68rem;color:var(--muted);white-space:nowrap">${s.subCategoria||'—'}</td>
            <td style="padding:8px 12px;font-size:0.7rem;color:var(--accent2);white-space:nowrap;font-weight:600">${s.pagamento||'—'}</td>
            <td style="padding:8px 12px;font-size:0.68rem;white-space:nowrap">${s.terceiro?`<span style="background:rgba(245,158,11,0.1);color:#f59e0b;padding:1px 6px;border-radius:4px;font-size:0.65rem">👤 ${s.terceiro}</span>`:'—'}</td>
            <td style="padding:8px 12px;font-size:0.68rem;white-space:nowrap">${(()=>{ const b=loadBancos().find(x=>x.id===s.banco); return b?`<span style="color:${b.cor};font-size:0.68rem">${b.icone||'🏦'} ${b.nome}</span>`:'—'; })()}</td>
            <td style="padding:8px 12px;text-align:center;font-family:'Space Mono',monospace;font-size:0.78rem;font-weight:700;color:var(--text2)">${parcNum}</td>
            <td style="padding:8px 12px;text-align:center;font-size:0.75rem;font-weight:700">${restamStr}</td>
            <td style="padding:8px 12px;text-align:right;font-family:'Space Mono',monospace;font-size:0.88rem;font-weight:700;color:${corTitulo}">-${fmt(s.vlMes)}</td>
            <td style="padding:8px 8px;text-align:center;white-space:nowrap">${acaoBtns}</td>
          </tr>`;
        }).join('');
        return `<tr style="background:rgba(0,0,0,0.15)">
          <td colspan="9" style="padding:6px 12px;font-size:0.65rem;font-weight:700;color:${corTitulo};letter-spacing:.06em">${icone} ${titulo} — ${list.length} parcela${list.length>1?'s':''}</td>
          <td style="padding:6px 12px;text-align:right;font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:700;color:${corTitulo}">${fmt(total)}</td>
        </tr>${rows}`;
      };

      const isMob = window.matchMedia("(max-width:768px)").matches;

      if (isMob) {
        // ── MOBILE: cards ──
        const renderGrupoMesCard = (list, titulo, corTitulo, icone) => {
          if (!list.length) return '';
          return `<div style="font-size:0.65rem;font-weight:700;color:${corTitulo};letter-spacing:.06em;padding:8px 4px 4px">${icone} ${titulo} — ${list.length} parcela${list.length>1?'s':''}</div>` +
            list.map(s => {
              const parcNum = s.numParcelaMes ? `${s.numParcelaMes}/${s.total}` : '—';
              const restamStr = s.restam > 1 ? `<span style="color:#f59e0b">${s.restam} restam</span>`
                : s.restam === 1 ? `<span style="color:#22c55e">última!</span>`
                : `<span style="color:#22c55e">quitado</span>`;
              const sid2 = s.idMes || null;
              const bancoObj = loadBancos().find(x=>x.id===s.banco);
              const acaoBtns = sid2
                ? (s.statusMes==='pendente'
                    ? `<button onclick="toggleStatusLanc('${sid2}','pago')" style="background:rgba(48,208,128,0.15);border:1px solid rgba(48,208,128,0.4);color:var(--green);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✓ Pagar</button>`
                    : `<button onclick="toggleStatusLanc('${sid2}','pendente')" style="background:rgba(240,80,96,0.15);border:1px solid rgba(240,80,96,0.4);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">↩</button>`)
                  + `<button onclick="editLancamento('${sid2}')" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.30);color:var(--accent2);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✎ Editar</button>`
                  + `<button onclick="smartDelete('${sid2}','${s.gid}',event)" style="background:rgba(240,80,96,0.12);border:1px solid rgba(240,80,96,0.3);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✕</button>`
                : '—';
              return `<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${corTitulo};border-radius:10px;padding:12px 14px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-family:'Space Mono',monospace;font-size:0.72rem;color:var(--text2)">${parcNum} · ${restamStr}</span>
                  <span style="font-family:'Space Mono',monospace;font-size:1rem;font-weight:700;color:${corTitulo}">-${fmt(s.vlMes)}</span>
                </div>
                <div style="font-weight:700;font-size:0.9rem;margin-bottom:6px;">${s.descClean}${s.vencMes?`<span style="font-size:0.7rem;color:var(--muted);font-weight:400;margin-left:6px">venc. ${s.vencMes}</span>`:''}</div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                  <span style="font-size:0.75rem;color:var(--text2)">${s.categoria||'—'}${s.subCategoria?' › '+s.subCategoria:''}</span>
                  ${s.pagamento?`<span style="background:var(--surface2);border:1px solid var(--border);padding:2px 8px;border-radius:10px;font-size:0.7rem;color:var(--text2)">${s.pagamento}</span>`:''}
                  ${bancoObj?`<span style="background:${bancoObj.cor}18;border:1px solid ${bancoObj.cor}44;color:${bancoObj.cor};padding:2px 8px;border-radius:10px;font-size:0.7rem">${bancoObj.icone||'🏦'} ${bancoObj.nome}</span>`:''}
                  ${s.terceiro?`<span style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;padding:2px 8px;border-radius:10px;font-size:0.7rem;">👤 ${s.terceiro}</span>`:''}
                </div>
                <div style="display:flex;gap:5px;flex-wrap:wrap;">${acaoBtns}</div>
              </div>`;
            }).join('');
        };
        mesListaEl.innerHTML =
          renderGrupoMesCard(pendMes,   'PENDENTES', '#f59e0b', '⏳') +
          renderGrupoMesCard(pagosMesL, 'PAGAS',     '#22c55e', '✓');
      } else {
        mesListaEl.innerHTML = `<div class="table-scroll-wrap"><table style="width:100%;border-collapse:separate;border-spacing:0">
          <thead>${headerRow}</thead>
          <tbody>
            ${renderGrupoMes(pendMes,   'PENDENTES', '#f59e0b', '⏳')}
            ${renderGrupoMes(pagosMesL, 'PAGAS',     '#22c55e', '✓')}
          </tbody>
        </table></div>`;
      }
    }
  }

  // Armazena para exportação Excel
  window._parcNoMesList = noMesList;
}

function exportParceladosExcel() {
  const list = window._parcNoMesList || [];
  if (!list.length) { alert('Nenhuma parcela no mês para exportar.'); return; }
  if (typeof XLSX === 'undefined') { alert('Biblioteca XLSX não carregada.'); return; }
  const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const nomeMes = MONTHS_SHORT[currentMonth-1] + '/' + currentYear;

  const rows = list.map(s => ({
    'Descrição':  s.descClean,
    'Categoria':  s.categoria || '—',
    'Pagamento':  s.pagamento || '—',
    'Parcela':    s.numParcelaMes ? `${s.numParcelaMes}/${s.total}` : '—',
    'Restam':     s.restam,
    'Valor (R$)': s.vlMes,
    'Status':     s.statusMes || '—',
    'Vencimento': s.vencMes || '—',
  }));

  // Totais ao final
  const pendentes = list.filter(s => s.statusMes === 'pendente');
  const pagas     = list.filter(s => s.statusMes === 'pago');
  rows.push({});
  rows.push({ 'Descrição': 'TOTAL PENDENTE', 'Valor (R$)': pendentes.reduce((s,x) => s+x.vlMes, 0) });
  rows.push({ 'Descrição': 'TOTAL PAGO',     'Valor (R$)': pagas.reduce((s,x) => s+x.vlMes, 0) });
  rows.push({ 'Descrição': 'TOTAL GERAL',    'Valor (R$)': list.reduce((s,x) => s+x.vlMes, 0) });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch:36 },{ wch:22 },{ wch:18 },{ wch:10 },{ wch:8 },{ wch:14 },{ wch:12 },{ wch:14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Parcelas ${nomeMes}`);
  XLSX.writeFile(wb, `parcelas_${currentYear}_${String(currentMonth).padStart(2,'0')}.xlsx`);
}
// ======== PARCELADOS END ========


