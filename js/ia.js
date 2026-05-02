// ═══════════════════════════════════════════════════════
//  ia.js — Categorização Inteligente via Claude (Anthropic)
//  Chave da API fica no servidor (variável de ambiente).
//  O front-end chama o endpoint /api/ia que você hospeda.
// ═══════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────
//  CONFIGURAÇÃO — ajuste IA_ENDPOINT para o seu backend
// ──────────────────────────────────────────────────────
var IA_CONFIG = window.IA_CONFIG || {
  // Endpoint do seu backend que recebe { prompt } e chama a Anthropic.
  // Durante desenvolvimento local use um proxy simples (ver README).
  // Em produção, aponte para a sua função serverless / Edge Function.
  endpoint: (typeof IA_ENDPOINT !== 'undefined') ? IA_ENDPOINT : '/api/ia',

  // Quantidade máxima de lançamentos do histórico que enviamos como contexto
  maxHistorico: 30,

  // Tamanho máximo do lote na importação
  loteTamanho: 15,
};

// ──────────────────────────────────────────────────────
//  Estado interno
// ──────────────────────────────────────────────────────
let _ia_pendingCat = null;
let _ia_pendingSub = null;

// ──────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────
function _iaCats() {
  try {
    var cats = loadCats();
    if (!cats || !cats.length) return [];
    return cats.map(function(cat) {
      // subs pode estar em cat.subs (array de objetos ou strings)
      var subs = [];
      if (cat.subs && cat.subs.length) {
        subs = cat.subs.map(function(s) { return typeof s === 'string' ? s : (s.nome || ''); }).filter(Boolean);
      }
      return cat.nome + (subs.length ? ' [' + subs.join(', ') + ']' : '');
    });
  } catch(e) { return []; }
}

function _iaHistorico() {
  try {
    var all = loadData ? loadData() : [];
    return all.slice(-IA_CONFIG.maxHistorico).map(function(l) {
      return l.desc + ' => ' + (l.categoria || '?') + (l.subCategoria ? ' / ' + l.subCategoria : '');
    });
  } catch(e) { return []; }
}

var _iaRequestRunning = false;
async function _iaChamar(prompt) {
  if (_iaRequestRunning) { console.warn('[IA] Já em execução'); return ''; }
  _iaRequestRunning = true;
  try {
    if (window._iaStopVerificacao) throw new Error('STOPPED');
    const res = await fetch(IA_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    if (!res.ok) {
      console.error('[IA] HTTP:', res.status);
      if (res.status === 401 || res.status === 403) {
        window._iaStopVerificacao = true;
        throw new Error('AUTH_ERROR');
      }
      throw new Error('HTTP_' + res.status);
    }
    const data = await res.json();
    return data.text || (data.content && data.content[0] && data.content[0].text) || '';
  } catch(e) {
    console.error('[IA] Erro:', e.message);
    throw e;
  } finally {
    _iaRequestRunning = false;
  }
}

// ──────────────────────────────────────────────────────
//  1. Sugestão no modal "Novo Lançamento"
// ──────────────────────────────────────────────────────
async function iaSugerirCategoria(desc) {
  if (!desc || desc.length < 3) return;
  var cats = _iaCats();
  var hist = _iaHistorico();
  if (!cats.length) return;

  // Mostra spinner no banner enquanto processa
  var box = document.getElementById('catSugestao');
  var nomeEl = document.getElementById('catSugestaoNome');
  var confEl = document.getElementById('catSugestaoConf');
  if (box && nomeEl) {
    nomeEl.textContent = '⏳ Analisando...';
    if (confEl) confEl.textContent = '';
    box.style.display = 'flex';
  }

  // Consulta histórico de deletados antes de chamar a IA
  try {
    var _deletedIdx = await _iaDeletedIndex();
    var _deletedMatch = _deletedIdx[desc.trim().toLowerCase()];
    if (_deletedMatch && _deletedMatch.categoria) {
      var fCat = document.getElementById('fCategoria');
      if (fCat && fCat.value && fCat.value !== '') { if (box) box.style.display = 'none'; return; }
      _ia_pendingCat = _deletedMatch.categoria;
      _ia_pendingSub = _deletedMatch.subCategoria || null;
      _iaMostrarSugestao(_deletedMatch.categoria, _deletedMatch.subCategoria);
      return;
    }
  } catch(_e) {}

  var prompt = [
    'Você é um assistente de finanças pessoais.',
    'Categorias disponíveis (nome [sub-categorias]):\n' + cats.join('\n'),
    hist.length ? 'Histórico de lançamentos do usuário (descrição => categoria):\n' + hist.join('\n') : '',
    '',
    'Para a descrição: "' + desc + '"',
    'Responda APENAS com um JSON no formato: {"categoria":"NOME_EXATO","subCategoria":"NOME_EXATO_OU_VAZIO"}',
    'Use exatamente os nomes das listas acima. Se não tiver sub-categoria adequada, use string vazia.'
  ].filter(Boolean).join('\n');

  try {
    var raw = await _iaChamar(prompt);
    var clean = raw.replace(/```json|```/g, '').trim();
    var json = JSON.parse(clean);

    // Verifica se o usuário já selecionou categoria manualmente
    var fCat = document.getElementById('fCategoria');
    if (fCat && fCat.value && fCat.value !== '') { if (box) box.style.display = 'none'; return; }

    if (json.categoria) {
      _ia_pendingCat = json.categoria;
      _ia_pendingSub = json.subCategoria || null;
      _iaMostrarSugestao(json.categoria, json.subCategoria);
    } else {
      if (box) box.style.display = 'none';
    }
  } catch(e) {
    console.warn('[IA] Erro ao sugerir categoria:', e.message);
    if (box) box.style.display = 'none';
  }
}


function _iaMostrarSugestao(cat, sub) {
  var box = document.getElementById('catSugestao');
  if (!box) return;
  var cats = loadCats ? loadCats() : [];
  var catObj = cats.find(function(c) { return c.nome === cat; });
  var label = (catObj && catObj.icone ? catObj.icone + ' ' : '') + cat;
  if (sub) label += ' › ' + sub;
  var nomeEl = document.getElementById('catSugestaoNome');
  var confEl = document.getElementById('catSugestaoConf');
  if (nomeEl) nomeEl.textContent = label;
  if (confEl) confEl.textContent = '✨ via IA';
  box.style.display = 'flex';
}

// Hook chamado pelo botão ✨ no modal
async function iaBtnSugerir() {
  var descEl = document.getElementById('fDesc');
  var desc = descEl ? descEl.value.trim() : '';
  if (!desc || desc.length < 3) {
    alert('Digite ao menos 3 caracteres na descrição antes de usar a IA.');
    return;
  }
  // Limpa seleção anterior para forçar exibição do banner
  _ia_pendingCat = null;
  _ia_pendingSub = null;

  var btn = document.getElementById('iaSugerirBtn');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    await iaSugerirCategoria(desc);
  } catch(e) {
    console.error('[IA] Erro ao sugerir:', e);
    var box = document.getElementById('catSugestao');
    var nomeEl = document.getElementById('catSugestaoNome');
    if (box && nomeEl) {
      nomeEl.textContent = '❌ Erro ao contatar IA';
      box.style.display = 'flex';
    }
  } finally {
    if (btn) { btn.textContent = '✨ IA'; btn.disabled = false; }
  }
}

// Aplica a sugestão da IA (reutiliza o aplicarSugestao existente)
function iaAplicarSugestao() {
  if (!_ia_pendingCat) return;
  var fCat = document.getElementById('fCategoria');
  if (fCat) {
    fCat.value = _ia_pendingCat;
    if (typeof onCatChange === 'function') onCatChange();
  }
  if (_ia_pendingSub) {
    setTimeout(function() {
      var fSub = document.getElementById('fSubCategoria');
      if (fSub) fSub.value = _ia_pendingSub;
    }, 60);
  }
  var box = document.getElementById('catSugestao');
  if (box) box.style.display = 'none';
  _ia_pendingCat = null;
  _ia_pendingSub = null;
}

// ──────────────────────────────────────────────────────
//  2. Categorização em lote na importação de fatura
// ──────────────────────────────────────────────────────
async function iaCategorizarImportacao() {
  if (!window.importParsedRows || !importParsedRows.length) return;

  var rows = importParsedRows.filter(function(r) {
    return !r.xlsxCat && !r.categoria;
  });

  if (!rows.length) {
    // Se chamado manualmente pelo botão, avisa. Se chamado pelo bootstrap, silencioso.
    if (!window._iaChamadoPorBootstrap) alert('Todos os lançamentos já têm categoria definida.');
    return;
  }

  var cats = _iaCats();
  if (!cats.length) { if (!window._iaChamadoPorBootstrap) alert('Nenhuma categoria cadastrada.'); return; }
  var hist = _iaHistorico();

  // Desabilita botão imediatamente — impede duplo clique durante qualquer await
  var btn = document.getElementById('iaBtnImport');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Processando...'; }

  function _iaEsconderBarra() {
    var w = document.getElementById('iaProgressWrap');
    if (w) w.style.display = 'none';
  }

  // Etapa 1: recupera do histórico de registros deletados (sem chamar a IA)
  try {
    var _dIdx = await _iaDeletedIndex();
    var _recuperados = 0;
    rows.forEach(function(r) {
      var key = (r.desc || '').trim().toLowerCase();
      var m = _dIdx[key];
      if (m && m.categoria) {
        r.categoria    = m.categoria;
        r.subCategoria = m.subCategoria;
        if (m.terceiro) r.terceiro = m.terceiro;
        r._iaFromDeleted = true;
        _recuperados++;
      }
    });
    if (_recuperados > 0) console.log('[IA] Recuperados do histórico deletado:', _recuperados, 'de', rows.length);
    // Descarta os já classificados — só envia o restante para a IA
    rows = rows.filter(function(r) { return !r.categoria; });
  } catch(_e) { console.warn('[IA] Erro no índice de deletados:', _e.message); }

  // Se todos foram resolvidos pelo histórico de deletados, não precisa chamar a IA
  if (!rows.length) {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Categorizar com IA'; }
    _iaEsconderBarra();
    if (!window._iaChamadoPorBootstrap && typeof renderImportPreview === 'function') {
      renderImportPreview(window.importParsedRows);
    }
    return;
  }

  // Progresso — só mostra se há itens para processar com IA
  var barWrap = document.getElementById('iaProgressWrap');
  var bar = document.getElementById('iaProgressBar');
  var barLabel = document.getElementById('iaProgressLabel');
  if (barWrap) barWrap.style.display = 'flex';

  var total = rows.length;
  var processados = 0;

  window._iaStopVerificacao = false;
  for (var i = 0; i < rows.length; i += IA_CONFIG.loteTamanho) {
    if (window._iaStopVerificacao) break;
    var lote = rows.slice(i, i + IA_CONFIG.loteTamanho);
    var items = lote.map(function(r, idx) {
      return (i + idx) + '. "' + r.desc + '"';
    }).join('\n');

    var prompt = [
      'Você é um assistente de finanças pessoais.',
      'Categorias disponíveis (nome [sub-categorias]):\n' + cats.join('\n'),
      hist.length ? 'Histórico do usuário:\n' + hist.join('\n') : '',
      '',
      'Classifique cada item abaixo.',
      'Responda APENAS com JSON array, ex: [{"i":0,"categoria":"X","subCategoria":"Y"},...]',
      'Use exatamente os nomes das listas. subCategoria pode ser string vazia.',
      '',
      'Itens:\n' + items
    ].filter(Boolean).join('\n');

    try {
      var raw = await _iaChamar(prompt);
      var clean = raw.replace(/```json|```/g, '').trim();
      var resultados = JSON.parse(clean);
      resultados.forEach(function(res) {
        var idx = i + res.i;
        if (importParsedRows[idx] && res.categoria) {
          importParsedRows[idx].categoria    = res.categoria;
          importParsedRows[idx].subCategoria = res.subCategoria || '';
          importParsedRows[idx]._iaCateg = true;
        }
      });
    } catch(e) {
      console.warn('[IA] Erro no lote', i, e.message);
      // Se erro de autenticação, para o loop imediatamente
      if (e.message && (e.message.includes('401') || e.message.includes('403'))) {
        if (btn) { btn.disabled = false; btn.textContent = '✨ Categorizar com IA'; }
        _iaEsconderBarra();
        break;
      }
    }

    processados = Math.min(i + IA_CONFIG.loteTamanho, total);
    if (bar) bar.style.width = Math.round(processados / total * 100) + '%';
    if (barLabel) barLabel.textContent = processados + ' / ' + total;
  }

  if (btn) { btn.disabled = false; btn.textContent = '✨ Categorizar com IA'; }
  _iaEsconderBarra();

  // Fallback: lançamentos que a IA não identificou → Gastos Variáveis / Não identificado
  var CAT_FALLBACK = 'Gastos Variáveis';
  var SUB_FALLBACK = 'Não identificado';
  importParsedRows.forEach(function(r) {
    if (!r.categoria && !r.xlsxCat) {
      r.categoria    = CAT_FALLBACK;
      r.subCategoria = SUB_FALLBACK;
      r._iaNaoId = true;
    }
  });

  // Re-renderiza apenas se chamado manualmente pelo botão (não pelo iaCategorizarERenderizar)
  if (!window._iaChamadoPorBootstrap && typeof renderImportPreview === 'function') {
    renderImportPreview(window.importParsedRows);
  }
}


// ──────────────────────────────────────────────────────
//  3. Verificação de Duplicatas Semânticas na Importação
// ──────────────────────────────────────────────────────

// Retorna os últimos N lançamentos do banco como contexto
function _iaHistoricoImport(limite) {
  try {
    var all = loadData ? loadData() : [];
    return all.slice(-(limite || 60)).map(function(l) {
      var d = l.data || (l.mes + '/' + l.ano);
      return { desc: l.desc, valor: Math.abs(l.valor || 0), data: d };
    });
  } catch(e) { return []; }
}

// Índice de registros deletados: desc normalizada → {categoria, subCategoria, terceiro}
// Permite recuperar classificações sem chamar a IA quando o usuário reimporta
async function _iaDeletedIndex() {
  if (typeof dbLoadDeletedLancamentos !== 'function') return {};
  try {
    var deletados = await dbLoadDeletedLancamentos();
    var idx = {};
    // Já vêm ordenados por _ts.desc — o mais recente de cada desc vence
    deletados.forEach(function(l) {
      if (!l.desc || !l.categoria) return;
      var key = l.desc.trim().toLowerCase();
      if (!idx[key]) {
        idx[key] = {
          categoria:    l.categoria,
          subCategoria: l.subCategoria || '',
          terceiro:     l.terceiro     || ''
        };
      }
    });
    return idx;
  } catch(e) {
    console.warn('[IA] _iaDeletedIndex erro:', e.message);
    return {};
  }
}

async function iaVerificarDuplicatas() {
  if (!window.importParsedRows || !importParsedRows.length) return;

  // Pega apenas linhas que NÃO foram marcadas como duplicata exata pelo sistema
  var candidatos = importParsedRows.filter(function(r) {
    return !r._existingMatch && !r._iaDupChecked;
  });

  if (!candidatos.length) {
    alert('Nenhum lançamento novo para verificar.');
    return;
  }

  var historico = _iaHistoricoImport(80);
  if (!historico.length) {
    alert('Sem histórico de lançamentos para comparar.');
    return;
  }

  // Botão e barra de progresso
  var btn = document.getElementById('iaBtnDup');
  var barWrap = document.getElementById('iaProgressWrap');
  var bar = document.getElementById('iaProgressBar');
  var barLabel = document.getElementById('iaProgressLabel');
  if (btn) { btn.disabled = true; btn.textContent = '🔍 Verificando...'; }
  if (barWrap) barWrap.style.display = 'flex';
  if (bar) bar.style.width = '0%';

  var total = candidatos.length;
  var processados = 0;
  var dupCount = 0;
  var LOTE = 10; // lotes menores para análise semântica

  window._iaStopVerificacao = false;
  for (var i = 0; i < candidatos.length; i += LOTE) {
    if (window._iaStopVerificacao) break;
    var lote = candidatos.slice(i, i + LOTE);

    var items = lote.map(function(r, idx) {
      return idx + '. desc="' + (r.desc || r.descRaw) + '" valor=' + (r.value||0).toFixed(2) + ' data=' + (r.date||'');
    }).join('\n');

    var histStr = historico.map(function(h) {
      return 'desc="' + h.desc + '" valor=' + (h.valor||0).toFixed(2) + ' data=' + h.data;
    }).join('\n');

    var prompt = [
      'Você é um assistente financeiro especialista em detectar lançamentos duplicados.',
      'Analise se algum dos itens abaixo já existe no histórico do usuário considerando:',
      '- FIXOS MENSAIS: mesmo serviço recorrente (Netflix, Spotify, academia, seguro, assinatura) com qualquer data = DUPLICATA',
      '- Mesmo estabelecimento com descrição levemente diferente (ex: "NETFLIX" vs "Netflix Entretenimento", "UBER *TRIP" vs "Uber")',
      '- Variações de banco: prefixos como "PG*", "MP*", "NF*", "PIX*", "EBN*", asteriscos, códigos numéricos no fim',
      '- Mesmo valor no mesmo mês com descrição parecida',
      '',
      'Histórico de lançamentos existentes (desc | valor | data):',
      histStr,
      '',
      'Itens a verificar:',
      items,
      '',
      'Responda APENAS com JSON array. Para cada item diga se é duplicata e motivo CURTO.',
      'Formato: [{"i":0,"duplicata":true,"motivo":"Netflix já lançado como fixo mensal"},...]',
      'Se não for duplicata: {"i":0,"duplicata":false,"motivo":""}',
      'Marque como duplicata se certeza > 80%. Prefira marcar demais a deixar passar.'
    ].join('\n');

    try {
      var raw = await _iaChamar(prompt);
      var clean = raw.replace(/```json|```/g, '').trim();
      var resultados = JSON.parse(clean);
      resultados.forEach(function(res) {
        var row = lote[res.i];
        if (!row) return;
        row._iaDupChecked = true;
        if (res.duplicata) {
          row._iaDupSemantic = true;
          row._iaDupMotivo = res.motivo || 'Possível duplicata detectada pela IA';
          dupCount++;
        }
      });
    } catch(e) {
      console.warn('[IA] Erro ao verificar duplicatas lote', i, e.message);
      // Se erro de autenticação, para o loop imediatamente
      if (e.message && (e.message.includes('401') || e.message.includes('403'))) {
        if (btn) { btn.disabled = false; btn.textContent = '🔍 Duplicatas IA'; }
        if (barWrap) barWrap.style.display = 'none';
        break;
      }
    }

    processados = Math.min(i + LOTE, total);
    if (bar) bar.style.width = Math.round(processados / total * 100) + '%';
    if (barLabel) barLabel.textContent = processados + ' / ' + total;
  }

  if (btn) { btn.disabled = false; btn.textContent = '🔍 Duplicatas IA'; }
  if (barWrap) setTimeout(function() { barWrap.style.display = 'none'; }, 1500);

  // Notifica resultado
  if (dupCount > 0) {
    console.log('[IA] ' + dupCount + ' possível(is) duplicata(s) semântica(s) encontrada(s)');
  }

  // Re-renderiza para mostrar os alertas visuais
  if (typeof renderImportPreview === 'function' && importParsedRows && importParsedRows.length) renderImportPreview(importParsedRows);
}

// ──────────────────────────────────────────────────────
//  Injeção de botão ✨ IA no modal de lançamento
//  (chamada no DOMContentLoaded)
// ──────────────────────────────────────────────────────
function iaInjetarBotaoModal() {
  var labelDesc = document.querySelector('label[for="fDesc"], #modalOverlay label');
  // Encontra o form-row da descrição
  var fDescEl = document.getElementById('fDesc');
  if (!fDescEl) return;
  var formRow = fDescEl.closest ? fDescEl.closest('.form-row') : null;
  if (!formRow) return;
  var label = formRow.querySelector('label');
  if (!label || document.getElementById('iaSugerirBtn')) return;

  label.style.display = 'flex';
  label.style.alignItems = 'center';
  label.style.gap = '8px';

  var btn = document.createElement('button');
  btn.id = 'iaSugerirBtn';
  btn.type = 'button';
  btn.textContent = '✨ IA';
  btn.title = 'Sugerir categoria com IA';
  btn.style.cssText = [
    'background:rgba(167,139,250,0.12)',
    'border:1px solid rgba(167,139,250,0.4)',
    'color:#a78bfa',
    'border-radius:5px',
    'padding:2px 9px',
    'font-size:0.7rem',
    'font-weight:700',
    'cursor:pointer',
    'margin-left:4px',
    'line-height:1.5',
  ].join(';');
  btn.onclick = iaBtnSugerir;
  label.appendChild(btn);
}

// ──────────────────────────────────────────────────────
//  Injeção do botão ✨ e barra de progresso no modal de importação
// ──────────────────────────────────────────────────────
function iaInjetarBotaoImport() {
  var btnImport = document.getElementById('btnDoImport');
  if (!btnImport || document.getElementById('iaBtnImport')) return;

  // Botão IA
  var btn = document.createElement('button');
  btn.id = 'iaBtnImport';
  btn.type = 'button';
  btn.textContent = '✨ Categorizar com IA';
  btn.style.cssText = [
    'background:rgba(167,139,250,0.12)',
    'border:1px solid rgba(167,139,250,0.4)',
    'color:#a78bfa',
    'border-radius:7px',
    'padding:7px 16px',
    'font-size:0.82rem',
    'font-weight:700',
    'cursor:pointer',
  ].join(';');
  btn.onclick = iaCategorizarImportacao;
  btnImport.parentNode.insertBefore(btn, btnImport);

  // Botão "Duplicatas IA" desabilitado — requer ANTHROPIC_API_KEY configurada
  // var btnDup = ... (removido para evitar loop de erro 401)

  // Barra de progresso
  var wrap = document.createElement('div');
  wrap.id = 'iaProgressWrap';
  wrap.style.cssText = 'display:none;align-items:center;gap:10px;margin-top:10px;width:100%';
  wrap.innerHTML = [
    '<div style="flex:1;background:rgba(167,139,250,0.12);border-radius:4px;height:6px;overflow:hidden">',
    '  <div id="iaProgressBar" style="height:100%;background:#a78bfa;border-radius:4px;width:0%;transition:width 0.3s"></div>',
    '</div>',
    '<span id="iaProgressLabel" style="font-size:0.72rem;color:#a78bfa;white-space:nowrap;min-width:60px">0 / 0</span>',
  ].join('');
  btnImport.parentNode.appendChild(wrap);
}

// ──────────────────────────────────────────────────────
//  Inicialização
// ──────────────────────────────────────────────────────

// Chamada pelo render.js após o parse do arquivo:
// roda IA de categorização → depois renderiza → depois verifica duplicatas
async function iaCategorizarERenderizar() {
  // Auto-categorização desabilitada — use os botões manualmente
  // Apenas injeta botões e renderiza o preview
  iaInjetarBotaoImport();
  if (typeof renderImportPreview === 'function' && window.importParsedRows && window.importParsedRows.length) {
    renderImportPreview(window.importParsedRows);
  }
}
document.addEventListener('DOMContentLoaded', function() {
  // Aguarda o modal ser aberto para injetar o botão (MutationObserver no overlay)
  var modalOvl = document.getElementById('modalOverlay');
  if (modalOvl) {
    var obs = new MutationObserver(function() {
      if (modalOvl.classList.contains('open')) {
        setTimeout(iaInjetarBotaoModal, 80);
      }
    });
    obs.observe(modalOvl, { attributes: true, attributeFilter: ['class'] });
  }

  var importOvl = document.getElementById('importModalOverlay');
  if (importOvl) {
    var obs2 = new MutationObserver(function() {
      if (importOvl.classList.contains('open')) {
        setTimeout(iaInjetarBotaoImport, 200);
      }
    });
    obs2.observe(importOvl, { attributes: true, attributeFilter: ['class'] });
  }
});