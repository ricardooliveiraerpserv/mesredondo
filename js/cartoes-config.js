var _cartaoNomeFiltroAtivo = '';
// ======== CONFIG ========
function _fillDeployVersionLabel(versao, dtStr) {
  // versao e dtStr opcionais — se não passados, lê do localStorage/comentário
  if (!versao) versao = (typeof _lsGet==='function') ? _lsGet('gh_deploy_versao','') : '';
  if (!dtStr) {
    try {
      var iter = document.createNodeIterator(document.head, NodeFilter.SHOW_COMMENT);
      var node, dc = null;
      while ((node = iter.nextNode())) { if (node.nodeValue.startsWith(' deploy:')) { dc = node.nodeValue; break; } }
      if (dc) {
        var m = dc.match(/deploy:([\dT:.Z-]+)/);
        if (m) dtStr = new Date(m[1]).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
      }
    } catch(e){}
  }
  var label = versao ? ('Publicado: ' + versao + (dtStr ? ' · ' + dtStr : '')) : 'Publicado: —';
  // Card versão
  var dVEl = document.getElementById('versaoDeployLabel');
  if (dVEl) dVEl.textContent = label;
  // Rodapé
  var footerV = document.getElementById('app-version-label');
  if (footerV) footerV.textContent = versao || '—';
  var footerD = document.getElementById('app-deploy-date');
  if (footerD && dtStr) footerD.textContent = dtStr;
}

function renderConfigTab() {
  const storageEl = document.getElementById('storageInfo');
  if (storageEl) {
    const keys = ['financeos_lancamentos','financeos_provisoes','financeos_categorias','financeos_pagamentos','financeos_terceiros'];
    let totalBytes = 0;
    const lines = keys.map(k => {
      const v = localStorage.getItem(k) || '';
      totalBytes += v.length;
      const kb = (v.length / 1024).toFixed(1);
      const label = {financeos_lancamentos:'Lançamentos',financeos_provisoes:'Provisões',financeos_categorias:'Categorias',financeos_pagamentos:'Pagamentos',financeos_terceiros:'Terceiros'}[k]||k;
      return `<div style="display:flex;justify-content:space-between"><span>${label}</span><span style="color:var(--text);font-weight:600">${kb} KB</span></div>`;
    });
    lines.push(`<div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);margin-top:6px;padding-top:6px"><span style="font-weight:700">Total usado</span><span style="color:var(--accent);font-weight:700">${(totalBytes/1024).toFixed(1)} KB / ~5 MB</span></div>`);
    storageEl.innerHTML = lines.join('');
  }
  const allData = loadDataBanco();
  const cats = loadCats();
  const vEl = document.getElementById('versaoCats');
  if (vEl) vEl.textContent = `Categorias: ${cats.length} · Lançamentos: ${allData.length}`;
  _fillDeployVersionLabel();
  const dEl = document.getElementById('diagResult');
  if (dEl) dEl.style.display = 'none';
}

function diagnosticoModal() {
  // Redireciona para o novo diagnóstico Supabase
  if (typeof _diagLoad === 'function') { _diagLoad(); return; }
  alert('Função _diagLoad não encontrada.');
}

function limparDados() {
  if (!confirm('⚠️ Isso vai apagar TODOS os lançamentos e provisões.\n\nFaça um backup antes!')) return;
  if (!confirm('Última confirmação — apagar tudo?')) return;
  _lsRemove('financeos_lancamentos');
  _lsRemove('financeos_provisoes');
  renderAll();
  renderConfigTab();
  alert('✅ Dados apagados.');
}
// ======== CARTÕES ========
function setCartaoSort(col) {
  if (!window._cartaoSort) window._cartaoSort = { col: 'data', dir: -1 };
  const cs = window._cartaoSort;
  if (cs.col === col) cs.dir *= -1;
  else { cs.col = col; cs.dir = 1; }
  renderCartoesTab();
}


// ── Clique no card de cartão — ativa filtro ────────────────────────────────
function _cartaoCardClick(nome, cor) {
  if (_cartaoNomeFiltroAtivo === nome) {
    // Clique no mesmo: limpa filtro
    _cartaoNomeFiltroAtivo = '';
  } else {
    _cartaoNomeFiltroAtivo = nome;
    // Sincroniza com o fsel (se existir)
    if (window.FSEL) {
      const sel = document.getElementById('cartaoFiltroNome');
      if (sel) {
        // set value and trigger change
        Array.from(sel.options).forEach(o => { o.selected = o.value === nome; });
        FSEL.build('fsel-cartaoFiltroNome', 'cartaoFiltroNome',
          Array.from(sel.options).map(o => ({value:o.value, text:o.text})),
          function(){ renderCartoesTab(); });
      }
    }
  }
  renderCartoesTab();
}

function renderCartoesTab() {
  const normStr = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const pags    = loadPagamentos();
  const cartoes = pags.filter(p => p.cartao);
  const all     = loadDataBanco();
  // Map normalized name -> original cartao object
  const cartaoMap = {};
  cartoes.forEach(p => { cartaoMap[normStr(p.nome)] = p; });
  const isCartaoLanc = l => !!cartaoMap[normStr(l.pagamento||'')];
  const resolveNome = pagamento => {
    const c = cartaoMap[normStr(pagamento||'')];
    return c ? c.nome : pagamento;
  };

  // All lancamentos that use a cartao pagamento in current month
  // Para cartões: usa l.mes/l.ano (mês da fatura), não o vencimento do boleto
  // Espelhos de "Entrada Terceiro" herdam o pagamento da despesa original — não
  // são gastos reais do cartão, então não devem aparecer aqui (caso contrário a
  // mesma compra apareceria duas vezes: como Dívida de terceiros + como espelho).
  const lancCartao = all.filter(l => {
    if (!isCartaoLanc(l)) return false;
    if (l._espelhoDe) return false;
    return _inRange(l);
  });

  // ── Populate pagarFaturaSelect ──
  const pfSel = document.getElementById('pagarFaturaSelect');
  if (pfSel) {
    const curVal = pfSel.value;
    pfSel.innerHTML = '<option value="">— Selecione o cartão —</option>' +
      cartoes.map(p => {
        const pendente = lancCartao.filter(l => l.tipo==='despesa' && l.status==='pendente' && resolveNome(l.pagamento)===p.nome)
          .reduce((s,l)=>s+l.valor,0);
        const label = pendente > 0 ? `${p.icone||'💳'} ${p.nome} — pendente: ${fmt(pendente)}` : `${p.icone||'💳'} ${p.nome} — ✓ quitado`;
        return `<option value="${p.nome}">${label}</option>`;
      }).join('');
    pfSel.value = curVal;
    // Update info
    _updatePagarFaturaInfo();
  }

  // Populate cartaoFiltroNome — always repopulate
  const fNome = document.getElementById('cartaoFiltroNome');
  if (fNome) {
    fNome.innerHTML = '<option value="">Todos os cartões</option>';
    cartoes.forEach(p => {
      const o = document.createElement('option');
      o.value = p.nome; o.textContent = (p.icone ? p.icone + ' ' : '') + p.nome;
      fNome.appendChild(o);
    });
    if (window.FSEL) _fselRebuild('cartaoFiltroNome');
  }

  // Apply filters
  // Card click filter takes priority over FSEL filter
  const nomeF    = _cartaoNomeFiltroAtivo ? [_cartaoNomeFiltroAtivo] : (window.FSEL ? FSEL.getValues('cartaoFiltroNome') : []);
  const statusF  = window.FSEL ? FSEL.getValues('cartaoFiltroStatus') : [];
  const catF     = window.FSEL ? FSEL.getValues('cartaoFiltroCat')    : [];
  const subCatF  = window.FSEL ? FSEL.getValues('cartaoFiltroSubCat') : [];
  const tercF    = window.FSEL ? FSEL.getValues('cartaoFiltroTerc')   : [];
  const busca    = (document.getElementById('cartaoBusca')?.value || '').toLowerCase();

  // Populate cat/subcat/terc filters once
  const catSelC = document.getElementById('cartaoFiltroCat');
  if (catSelC) {
    catSelC.innerHTML = '<option value="">— Todas as categorias —</option>';
    [...new Set(lancCartao.map(l=>l.categoria).filter(Boolean))].sort().forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;catSelC.appendChild(o);});
    if(window.FSEL) _fselRebuild('cartaoFiltroCat');
  }
  const subSelC = document.getElementById('cartaoFiltroSubCat');
  if (subSelC) {
    subSelC.innerHTML = '<option value="">— Todas as sub-cat. —</option>';
    [...new Set(lancCartao.map(l=>l.subCategoria).filter(Boolean))].sort().forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;subSelC.appendChild(o);});
    if(window.FSEL) _fselRebuild('cartaoFiltroSubCat');
  }
  const tercSelC = document.getElementById('cartaoFiltroTerc');
  if (tercSelC) {
    tercSelC.innerHTML = '<option value="">— Todos os terceiros —</option>';
    [...new Set(lancCartao.map(l=>l.terceiro).filter(Boolean))].sort().forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;tercSelC.appendChild(o);});
    if(window.FSEL) _fselRebuild('cartaoFiltroTerc');
  }

  const filtered = lancCartao.filter(l => {
    if (nomeF.length   && !nomeF.includes(resolveNome(l.pagamento)))  return false;
    if (statusF.length && !statusF.includes(l.status))                return false;
    if (catF.length    && !catF.includes(l.categoria||''))             return false;
    if (subCatF.length && !subCatF.includes(l.subCategoria||''))       return false;
    if (tercF.length   && !tercF.includes(l.terceiro||''))             return false;
    if (busca && !(l.desc||'').toLowerCase().includes(busca))          return false;
    return true;
  });

  // ── Cards por cartão — mostra TODOS os cartões cadastrados ──
  const cardsEl = document.getElementById('cartoesCards');
  if (cardsEl) {
    const byCartao = {};
    // Init all cartoes with zero
    cartoes.forEach(p => { byCartao[p.nome] = { total:0, pago:0, pendente:0, count:0, icone: p.icone||'💳', conf: p }; });
    // Fill with lancamentos — group by resolved nome
    lancCartao.filter(l => l.tipo === 'despesa').forEach(l => {
      const nome = resolveNome(l.pagamento);
      if (!byCartao[nome]) return;
      byCartao[nome].total    += l.valor;
      byCartao[nome].count++;
      if (l.status === 'pago') byCartao[nome].pago    += l.valor;
      else                     byCartao[nome].pendente += l.valor;
    });

    cardsEl.innerHTML = Object.entries(byCartao).map(([nome, d]) => {
      const allPaid = d.pendente === 0;
      const semLanc = d.count === 0;
      const cartaoConf = d.conf;

      // Determina se a fatura já fechou (corte já passou)
      const rng = window._rangeFilter || { de: { mes: currentMonth, ano: currentYear }, ate: { mes: currentMonth, ano: currentYear } };
      const filtraMes = rng.de.mes, filtraAno = rng.de.ano;
      const hoje = new Date();
      const hojeDia = hoje.getDate(), hojeMes = hoje.getMonth()+1, hojeAno = hoje.getFullYear();
      let faturaFechada = false;
      if (cartaoConf && cartaoConf.diaCorte) {
        const filtraVal = filtraAno * 100 + filtraMes;
        const hojeVal   = hojeAno  * 100 + hojeMes;
        if (filtraVal < hojeVal) {
          // Mês passado (ou anterior) → sempre fechada
          faturaFechada = true;
        } else if (filtraVal === hojeVal && hojeDia >= cartaoConf.diaCorte) {
          // Mês atual e hoje já passou do corte → fechada
          faturaFechada = true;
        }
      }

      // Cor e badge de status
      let cor, statusLabel, statusBg, statusColor;
      if (semLanc) {
        cor = 'var(--border)'; statusLabel = '— SEM LANÇAMENTOS';
        statusBg = 'rgba(80,88,112,.15)'; statusColor = 'var(--muted)';
      } else if (allPaid) {
        cor = 'var(--green)'; statusLabel = '✓ PAGO';
        statusBg = 'rgba(48,208,128,.15)'; statusColor = 'var(--green)';
      } else if (faturaFechada) {
        cor = '#f09040'; statusLabel = '🔒 FECHADA';
        statusBg = 'rgba(240,144,64,.18)'; statusColor = '#f09040';
      } else {
        cor = 'var(--accent)'; statusLabel = '⏳ ABERTA';
        statusBg = 'rgba(240,192,64,.15)'; statusColor = 'var(--accent)';
      }

      const infoBadge = (cartaoConf && (cartaoConf.diaVencimento || cartaoConf.diaCorte))
        ? `<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
            ${cartaoConf.diaVencimento ? `<span style="font-size:0.6rem;padding:2px 7px;border-radius:20px;background:rgba(64,144,240,.12);color:var(--blue);font-weight:700">📅 Venc. dia ${cartaoConf.diaVencimento}</span>` : ''}
            ${cartaoConf.diaCorte ? `<span style="font-size:0.6rem;padding:2px 7px;border-radius:20px;background:rgba(240,192,64,.12);color:var(--accent);font-weight:700">✂️ Corte dia ${cartaoConf.diaCorte}</span>` : ''}
           </div>`
        : '';

      // Botão de ação contextual
      let actionBtn;
      if (semLanc) {
        actionBtn = `<div style="text-align:center;font-size:0.75rem;color:var(--muted);padding:6px 0">Sem lançamentos neste mês</div>`;
      } else if (allPaid) {
        actionBtn = `<div style="text-align:center;font-size:0.75rem;color:var(--green);padding:6px 0;font-weight:700">✓ Fatura quitada</div>`;
      } else if (faturaFechada) {
        actionBtn = `<button onclick="pagarFaturaCartao('${nome}')"
          style="width:100%;background:rgba(240,144,64,.15);border:1px solid #f09040;color:#f09040;border-radius:7px;padding:6px 0;font-size:0.78rem;cursor:pointer;font-weight:700;font-family:'Syne',sans-serif">
          💳 Pagar Fatura Fechada — ${fmt(d.pendente)}
        </button>`;
      } else {
        actionBtn = `<button onclick="pagarFaturaCartao('${nome}')"
          style="width:100%;background:rgba(240,192,64,.12);border:1px solid var(--accent);color:var(--accent);border-radius:7px;padding:6px 0;font-size:0.78rem;cursor:pointer;font-weight:700;font-family:'Syne',sans-serif">
          💳 Pagar Fatura — ${fmt(d.pendente)}
        </button>`;
      }

      const logoCartao = cartaoConf ? (cartaoConf.logo || _logoFromName(cartaoConf.nome)) : null;
      const logoHtmlCartao = logoCartao
        ? `<img src="${logoCartao}" onerror="this.style.display='none';this.nextSibling.style.display='inline'" style="width:20px;height:20px;object-fit:contain;border-radius:4px;flex-shrink:0;vertical-align:middle"><span style="display:none">${d.icone}</span>`
        : `<span>${d.icone}</span>`;

      const isAtivo = _cartaoNomeFiltroAtivo === nome;
      const statusCardClass = semLanc ? 'status-card-vazio' : allPaid ? 'status-card-pago' : '';
      return `
      <div class="cartao-card ${isAtivo ? 'cartao-ativo' : ''} ${statusCardClass}"
        style="border-left-color:${cor}"
        onclick="_cartaoCardClick('${nome.replace(/'/g, "\\'")}', '${cor}')">
        <div class="cartao-card-body">

          <!-- Área 1: Header — logo + nome + badge de status -->
          <div class="cartao-card-header">
            <div class="cartao-card-identity">
              ${logoCartao
                ? `<img src="${logoCartao}" onerror="this.style.display='none';this.nextSibling.style.display='inline'" class="cartao-card-logo"><span style="display:none">${d.icone}</span>`
                : `<span style="font-size:1.1rem;line-height:1">${d.icone}</span>`}
              <span class="cartao-card-nome">${nome}</span>
            </div>
            <span class="cartao-status-badge ${semLanc ? 'status-vazio' : allPaid ? 'status-pago' : faturaFechada ? 'status-fechada' : 'status-aberta'}">${statusLabel}</span>
          </div>

          <!-- Info pills: vencimento e corte (quando configurados) -->
          ${(cartaoConf && (cartaoConf.diaVencimento || cartaoConf.diaCorte)) ? `
          <div class="cartao-info-badges">
            ${cartaoConf.diaVencimento ? `<span class="cartao-info-pill pill-venc">📅 Venc. dia ${cartaoConf.diaVencimento}</span>` : ''}
            ${cartaoConf.diaCorte      ? `<span class="cartao-info-pill pill-corte">✂️ Corte dia ${cartaoConf.diaCorte}</span>`      : ''}
          </div>` : ''}

          <!-- Área 2: Valor principal -->
          <div class="cartao-card-valor-wrap">
            <div class="cartao-card-valor-label">Total da fatura</div>
            <div class="cartao-card-valor ${semLanc ? 'valor-vazio' : 'valor-negativo'}">
              ${semLanc ? 'R$ 0,00' : '-' + fmt(d.total)}
            </div>
          </div>

          <!-- Breakdown: pago vs pendente -->
          <div class="cartao-card-breakdown">
            <div class="cartao-breakdown-item">
              <span class="cartao-breakdown-label">✓ Pago</span>
              <span class="cartao-breakdown-value ${d.pago > 0 ? 'val-pago' : 'val-zerado'}">${fmt(d.pago)}</span>
            </div>
            <div class="cartao-breakdown-item" style="text-align:right">
              <span class="cartao-breakdown-label">⏳ Pendente</span>
              <span class="cartao-breakdown-value ${d.pendente === 0 ? 'val-zerado' : faturaFechada ? 'val-pendente-fechada' : 'val-pendente-aberta'}">${fmt(d.pendente)}</span>
            </div>
          </div>

          <!-- Área 3: Ação contextual -->
          <div class="cartao-card-action">
            ${semLanc
              ? `<div class="cartao-action-info info-vazio">Sem lançamentos neste mês</div>`
              : allPaid
                ? `<div class="cartao-action-info info-pago">✓ Fatura quitada</div>`
                : faturaFechada
                  ? `<button onclick="event.stopPropagation();pagarFaturaCartao('${nome}')" class="cartao-btn-pagar btn-fechada">🔒 Pagar Fatura Fechada — ${fmt(d.pendente)}</button>`
                  : `<button onclick="event.stopPropagation();pagarFaturaCartao('${nome}')" class="cartao-btn-pagar btn-aberta">💳 Pagar Fatura — ${fmt(d.pendente)}</button>`}
          </div>
          <div class="cartao-filtro-ativo-label">● filtrando por este cartão</div>
        </div>
      </div>`;
    }).join('');

    if (!cartoes.length) {
      cardsEl.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:8px 0">Nenhum cartão cadastrado. Adicione em ⚙️ Config → Tipos de Pagamento marcando "Cartão de Crédito".</div>';
    }
  }

  // ── Tabela ──
  const tbody = document.getElementById('cartaoTableBody');
  const infoEl = document.getElementById('cartaoTabelaInfo');
  const totalF = filtered.reduce((s,l) => s+l.valor, 0);
  if (infoEl) infoEl.textContent = `${filtered.length} itens · ${fmt(totalF)}`;

  const resumoEl = document.getElementById('cartaoResumo');
  if (resumoEl) resumoEl.textContent = filtered.length !== lancCartao.length ? `${filtered.length} de ${lancCartao.length} itens` : `${lancCartao.length} itens`;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state" style="padding:24px">Nenhum lançamento encontrado.</td></tr>';
    return;
  }

  // ── Sort ──
  if (!window._cartaoSort) window._cartaoSort = { col: 'data', dir: -1 };
  const cs = window._cartaoSort;
  const sorted = [...filtered].sort((a,b) => {
    let av, bv;
    switch(cs.col) {
      case 'data':         av=a.data||'';               bv=b.data||'';               break;
      case 'desc':         av=(a.desc||'').toLowerCase(); bv=(b.desc||'').toLowerCase(); break;
      case 'categoria':    av=a.categoria||'';           bv=b.categoria||'';           break;
      case 'subCategoria': av=a.subCategoria||'';        bv=b.subCategoria||'';        break;
      case 'pagamento':    av=resolveNome(a.pagamento);  bv=resolveNome(b.pagamento);  break;
      case 'terceiro':     av=a.terceiro||'';            bv=b.terceiro||'';            break;
      case 'parcAtual':    av=a.parcAtual||0;            bv=b.parcAtual||0;            break;
      case 'status':       av=a.status||'';              bv=b.status||'';              break;
      case 'valor':        av=a.valor;                   bv=b.valor;                   break;
      default:             av=a.data||'';               bv=b.data||'';
    }
    if (av < bv) return -1 * cs.dir;
    if (av > bv) return  1 * cs.dir;
    return 0;
  });
  // Update sort icons in header
  document.querySelectorAll('#tab-cartoes thead th.sortable').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    const c = (th.getAttribute('onclick')||'').replace("setCartaoSort('","").replace("')","");
    if (c === cs.col) th.classList.add(cs.dir===1?'sort-asc':'sort-desc');
  });

  const isMobCart = window.matchMedia("(max-width:768px)").matches;
  if (isMobCart) {
    const table = tbody.closest('table');
    const _cPanel = table ? table.closest('.panel') : null;
    if (_cPanel) _cPanel.classList.add('ap-hidden-mobile');
    const cardCont = document.getElementById('cartaoCardContainer');
    if (cardCont) cardCont.style.display = 'block';
    const fmtDt2 = d => { if(!d)return'—'; if(/^\d{4}-\d{2}-\d{2}$/.test(d))return d.split('-').reverse().join('/'); return d; };
    cardCont.innerHTML = sorted.map(l => {
      const pago = l.status === 'pago';
      const pm = l.parcAtual ? [null, l.parcAtual+'/'+l.parcTotal] : (l.desc||'').match(/\((\d+\/\d+)\)$/);
      const _pagConf = loadPagamentos().find(p => p.nome === resolveNome(l.pagamento));
      return `<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--red);border-radius:10px;padding:12px 14px;margin-bottom:8px;${pago?'opacity:0.65':''}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div>
            <span style="font-family:'Space Mono',monospace;font-size:0.72rem;color:var(--text2)">${fmtDt2(l.data)}</span>
            ${_pagConf?`<span style="display:block;font-size:0.7rem;color:var(--accent2);margin-top:1px">${_pagConf.icone||'💳'} ${resolveNome(l.pagamento)}</span>`:''}
          </div>
          <span style="font-family:'Space Mono',monospace;font-size:1rem;font-weight:700;color:var(--red)">-${fmt(l.valor)}</span>
        </div>
        <div style="font-weight:700;font-size:0.9rem;margin-bottom:6px;">${(l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,'')}${l.parcAtual?`<span style="background:rgba(240,144,64,0.85);color:#000;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-left:6px">${l.parcAtual}/${l.parcTotal}</span>`:''}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          <span style="font-size:0.75rem;color:var(--text2)">${l.categoria||'—'}${l.subCategoria?' › '+l.subCategoria:''}</span>
          ${l.terceiro?`<span style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;padding:2px 8px;border-radius:10px;font-size:0.7rem">👤 ${l.terceiro}</span>`:''}
          ${l.tipoLanc&&l.tipoLanc!=='variavel'?`<span class="badge ${l.tipoLanc==='fixo'?'badge-fixo':'badge-parcelado'}">${l.tipoLanc==='fixo'?'↻ Fixo':pm?'⊞ '+pm[1]:'⊞ Parcelado'}</span>`:''}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
          <span class="badge badge-${l.status}">${pago?'✓ Pago':'⏳ Pendente'}</span>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            ${!pago
              ?`<button onclick="marcarPagoCartao('${l.id}')" style="background:rgba(48,208,128,0.15);border:1px solid rgba(48,208,128,0.4);color:var(--green);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✓ Pagar</button>`
              :`<button onclick="estornarPagoCartao('${l.id}')" style="background:rgba(240,80,96,0.15);border:1px solid rgba(240,80,96,0.4);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">↩</button>`}
            <button onclick="editLancamento('${l.id}')" style="background:rgba(240,192,64,0.10);border:1px solid rgba(240,192,64,0.30);color:var(--accent2);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✎ Editar</button>
            <button onclick="smartDelete(this)" data-sid="${l.id}" data-gid="${l.groupId||''}" style="background:rgba(240,80,96,0.12);border:1px solid rgba(240,80,96,0.3);color:var(--danger);border-radius:6px;padding:5px 10px;font-size:0.73rem;cursor:pointer;font-weight:700;">✕</button>
          </div>
        </div>
      </div>`;
    }).join('');
    return;
  } else {
    const table = tbody.closest('table');
    const _cPanel2 = table ? table.closest('.panel') : null;
    if (_cPanel2) _cPanel2.classList.remove('ap-hidden-mobile');
    const cardCont = document.getElementById('cartaoCardContainer');
    if (cardCont) cardCont.style.display = 'none';
  }

  tbody.innerHTML = sorted.map(l => {
    const pago = l.status === 'pago';
    const pm = l.parcAtual ? [null, l.parcAtual+'/'+l.parcTotal] : (l.desc||'').match(/\((\d+\/\d+)\)$/);
    const parcelaBadge = l.tipoLanc === 'parcelado'
      ? `<span style="font-size:0.68rem;color:var(--accent)">${pm ? pm[1] : (l.totalParcelas ? '?/'+l.totalParcelas : '—')}</span>`
      : l.tipoLanc === 'fixo' ? `<span style="font-size:0.68rem;color:var(--accent2)">↻ fixo</span>` : '—';
    const statusBadge = pago
      ? `<span class="badge" style="background:rgba(48,208,128,.15);color:var(--green);border-radius:20px;padding:2px 8px;font-size:0.68rem">✓ Pago</span>`
      : `<span class="badge" style="background:rgba(240,192,64,.12);color:var(--accent);border-radius:20px;padding:2px 8px;font-size:0.68rem">⏳ Pend.</span>`;
    const fmtDt = d => { if(!d) return '—'; if(/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.split('-').reverse().join('/'); return d; };
    // Verifica se esta compra foi reclassificada para o mês seguinte pelo corte da fatura
    let corteIndicator = '';
    if (l.data && l.pagamento) {
      const cartaoConf = _getCartaoConfig(l.pagamento);
      if (cartaoConf && cartaoConf.diaCorte) {
        const diaCompra = parseInt((l.data||'').split('-')[2]);
        if (diaCompra >= cartaoConf.diaCorte) {
          corteIndicator = `<span title="Compra realizada no dia ${diaCompra}, após o corte (dia ${cartaoConf.diaCorte}) → fatura do mês seguinte" style="display:inline-block;margin-left:4px;font-size:0.6rem;padding:1px 5px;border-radius:3px;background:rgba(240,192,64,.15);color:var(--accent);font-weight:700;cursor:help">✂️ corte</span>`;
        }
      }
    }
      const _pagConf = loadPagamentos().find(p => p.nome === resolveNome(l.pagamento));
      const _pagLogo = _pagConf ? (_pagConf.logo || _logoFromName(_pagConf.nome)) : null;
      const _pagCell = _pagConf
        ? `<span style="display:inline-flex;align-items:center;gap:5px">${_logoTag(_pagLogo, _pagConf.icone||'💳', 16)} ${resolveNome(l.pagamento)||'—'}</span>`
        : (resolveNome(l.pagamento)||'—');
      return `<tr style="border-bottom:1px solid var(--border);${pago?'opacity:.65':''}">
      <td style="padding:8px 12px;font-size:0.78rem;white-space:nowrap;color:var(--muted)">${fmtDt(l.data)}${corteIndicator}</td>
      <td style="padding:8px 10px;font-size:0.8rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(l.desc||'—').replace(/\s*\(\d+\/\d+\)\s*$/,'')}${l.parcAtual ? '<span style="background:rgba(240,144,64,0.85);color:#000;padding:1px 5px;border-radius:3px;font-size:0.68rem;font-weight:700;margin-left:4px">'+l.parcAtual+'/'+l.parcTotal+'</span>' : ''}</td>
      <td style="padding:8px 10px;font-size:0.75rem;color:var(--muted)">${l.categoria||'—'}</td>
      <td style="padding:8px 10px;font-size:0.68rem;color:var(--muted)">${l.subCategoria||'—'}</td>
      <td style="padding:8px 10px;font-size:0.75rem">${_pagCell}</td>
      <td style="padding:8px 10px;font-size:0.68rem">${l.terceiro?`<span style="background:rgba(245,158,11,0.1);color:#f59e0b;padding:1px 6px;border-radius:4px;font-size:0.65rem">👤 ${l.terceiro}</span>`:'—'}</td>
      <td style="padding:8px 10px;text-align:center">${parcelaBadge}</td>
      <td style="padding:8px 10px;text-align:center">${statusBadge}</td>
      <td style="padding:8px 12px;text-align:right;font-family:'Space Mono',monospace;font-size:0.82rem;color:var(--red);font-weight:700">-${fmt(l.valor)}</td>
      <td style="padding:8px 10px;text-align:center;white-space:nowrap">
        ${!pago
          ? `<button class="del-btn" onclick="marcarPagoCartao('${l.id}')" title="Marcar como pago" style="color:var(--green);margin-right:2px">✓</button>`
          : `<button class="del-btn" onclick="estornarPagoCartao('${l.id}')" title="Estornar para pendente" style="color:var(--danger);margin-right:2px">↩</button>`
        }
        <button class="del-btn" onclick="editLancamento('${l.id}')" title="Editar" style="color:var(--accent2);margin-right:2px">✎</button>
        <button class="del-btn" onclick="smartDelete(this)" data-sid="${l.id}" data-gid="${l.groupId||''}" title="Excluir" style="color:var(--danger)">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function _updatePagarFaturaInfo() {
  const sel = document.getElementById('pagarFaturaSelect');
  const info = document.getElementById('pagarFaturaInfo');
  if (!sel || !info) return;
  const nome = sel.value;
  if (!nome) { info.textContent = ''; return; }
  const normStr = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const all = loadDataBanco();
  const pendentes = all.filter(l =>
    normStr(l.pagamento) === normStr(nome) &&
    Number(l.mes) === currentMonth &&
    Number(l.ano) === currentYear &&
    l.tipo === 'despesa' &&
    l.status === 'pendente'
  );
  const total = pendentes.reduce((s,l)=>s+l.valor,0);
  if (pendentes.length === 0) {
    info.textContent = '✓ Fatura já quitada';
    info.style.color = 'var(--green)';
  } else {
    info.textContent = `${pendentes.length} lançamento(s) pendentes · Total: ${fmt(total)}`;
    info.style.color = 'var(--accent)';
  }
}

async function estornarFaturaCartaoSelecionado() {
  const sel = document.getElementById('pagarFaturaSelect');
  const nomeCartao = sel ? sel.value : '';
  if (!nomeCartao) { alert('Selecione um cartão para estornar.'); return; }

  const normStr = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const all = loadData();
  const pagos = all.filter(l =>
    normStr(l.pagamento) === normStr(nomeCartao) &&
    Number(l.mes) === currentMonth &&
    Number(l.ano) === currentYear &&
    l.tipo === 'despesa' &&
    l.status === 'pago'
  );

  if (pagos.length === 0) { alert('Nenhum lançamento pago encontrado para estornar neste cartão/mês.'); return; }

  const total = pagos.reduce((s,l)=>s+l.valor,0);
  const mes = MONTHS[currentMonth-1];
  // Modal personalizado em vez de confirm nativo
  const _msgEst = `Estornar fatura de ${nomeCartao} — ${mes}/${currentYear}?\n${pagos.length} lançamento(s) · ${fmt(total)}\n\nTodos voltarão para PENDENTE.`;
  if (!await _showSimpleConfirm('↩ Estornar Fatura', _msgEst, 'Estornar', '#f59e0b')) return;

  const upd = loadData().map(l =>
    normStr(l.pagamento) === normStr(nomeCartao) &&
    Number(l.mes) === currentMonth &&
    Number(l.ano) === currentYear &&
    l.tipo === 'despesa' &&
    l.status === 'pago'
      ? { ...l, status: 'pendente' }
      : l
  );
  saveData(upd);
  renderAll();
  renderCartoesTab();
  alert(`↩ ${pagos.length} lançamento(s) de ${nomeCartao} revertidos para pendente.`);
}

function pagarFaturaCartaoSelecionado() {
  const sel = document.getElementById('pagarFaturaSelect');
  const nomeCartao = sel ? sel.value : '';
  if (!nomeCartao) { alert('Selecione um cartão para pagar a fatura.'); return; }
  pagarFaturaCartao(nomeCartao);
}

async function pagarFaturaCartao(nomeCartao) {
  const mes = MONTHS[currentMonth-1];
  const ano = currentYear;
  const _msgPag = `Pagar TODA a fatura de ${nomeCartao} — ${mes}/${ano}?\n\nTodos os lançamentos pendentes serão marcados como PAGO.`;
  if (!await _showSimpleConfirm('✓ Pagar Fatura', _msgPag, 'Confirmar Pagamento', 'var(--green)')) return;

  const normStr = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const nNome = normStr(nomeCartao);
  const all  = loadData();
  let count  = 0;
  const upd  = all.map(l => {
    if (
      normStr(l.pagamento) === nNome &&
      Number(l.mes) === currentMonth &&
      Number(l.ano) === currentYear &&
      l.tipo === 'despesa' &&
      l.status === 'pendente'
    ) {
      count++;
      return { ...l, status: 'pago' };
    }
    return l;
  });

  if (count === 0) { alert('Nenhum lançamento pendente encontrado para este cartão neste mês.'); return; }
  _memCache.lancamentos = upd;
  // Atualiza cada lançamento alterado no Supabase
  upd.filter(l => normStr(l.pagamento) === nNome && Number(l.mes) === currentMonth && Number(l.ano) === currentYear && l.tipo === 'despesa' && l.status === 'pago')
    .forEach(l => dbUpdateLancamento(l.id, { status: 'pago' }).catch(e => console.error('[pagarFatura]', e.message)));
  renderAll();
  renderCartoesTab();
  alert(`✅ ${count} lançamento(s) de ${nomeCartao} marcados como pagos.`);
}

function estornarPagoCartao(id) {
  const all = loadData();
  _memCache.lancamentos = all.map(l => l.id === id || String(l.id) === String(id) ? { ...l, status:'pendente' } : l);
  dbUpdateLancamento(id, { status: 'pendente' }).catch(e => console.error('[estornarPagoCartao]', e.message));
  renderAll();
  renderCartoesTab();
}

function marcarPagoCartao(id) {
  const all = loadData();
  _memCache.lancamentos = all.map(l => l.id === id || String(l.id) === String(id) ? { ...l, status:'pago' } : l);
  dbUpdateLancamento(id, { status: 'pago' }).catch(e => console.error('[marcarPagoCartao]', e.message));
  renderAll();
  renderCartoesTab();
}
// ======== CARTÕES END ========

// ======== CONFIG END ========