// ⚔️ GUERRA À DÍVIDA — controle operacional p/ quitar a dívida em até 4 semanas.
// Persistência: Supabase (mf_guerra + mf_guerra_transacoes). NUNCA guarda saldo:
// saldo = saldo_inicial − SUM(transacoes.valor). Regras fixas: limite variável
// R$ 350/semana; meta saldo=0 em N semanas; todo valor recebido → abate a dívida.

var GUERRA_DIVIDA_DEFAULT = 37000;
var GUERRA_LIMITE_SEMANAL = 350;
var GUERRA_META_SEMANAS   = 4;
var GUERRA_ATIVOS = [
  { id: 'iphone17', nome: 'iPhone 17 Pro Max', esp: 5900 },
  { id: 'iphone12', nome: 'iPhone 12 Pro',     esp: 1600 },
  { id: 'notebook', nome: 'Notebook',          esp: 1600 },
  { id: 'airpods',  nome: 'AirPods',           esp: 550  },
  { id: 'asx',      nome: 'Carro ASX',         esp: 25000 }
];
var GUERRA_TIMELINE = [
  { sem: 'S1',   desc: 'Eletrônicos', entrada: 8000,  alvo: 29000 },
  { sem: 'S2–3', desc: 'ASX',         entrada: 25000, alvo: 4000  },
  { sem: 'S4',   desc: 'Surplus (restante)', entrada: null, alvo: 0 }
];

// Estado em memória (espelho do Supabase). NÃO contém saldo — ele é sempre derivado.
var _guerraState = null;     // { saldoInicial, metaSemanas, tx:[{id,tipo,descricao,valor,created_at}] }
var _guerraLoading = false;
var _guerraAuthTries = 0;
function _guerraAuthReady() { return !!(window._currentUser || (typeof _currentUser !== 'undefined' && _currentUser)); }

function _gF(v) { return (typeof fmt === 'function') ? fmt(v) : ('R$ ' + (v || 0).toFixed(2)); }
function _gNum(s) { if (s == null) return NaN; return parseFloat(String(s).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')); }
function _gISO() { return new Date().toISOString(); }
function _guerraUuid() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });
}

// ── Supabase (reusa _dbFetch/_uid do db.js) ──
async function _guerraFetch() {
  var uid = _uid();
  var rows = await _dbFetch('mf_guerra?user_id=eq.' + uid + '&select=*', 'GET');
  var cfg = (rows && rows[0]) || null;
  if (!cfg) {
    cfg = { id: _guerraUuid(), user_id: uid, saldo_inicial: GUERRA_DIVIDA_DEFAULT, meta_semanas: GUERRA_META_SEMANAS };
    await _dbFetch('mf_guerra', 'POST', cfg);
  }
  var tx = await _dbFetch('mf_guerra_transacoes?user_id=eq.' + uid + '&select=*&order=created_at.asc', 'GET') || [];
  _guerraState = {
    saldoInicial: Number(cfg.saldo_inicial) || 0,
    metaSemanas: Number(cfg.meta_semanas) || GUERRA_META_SEMANAS,
    tx: tx.map(function (t) { return { id: t.id, tipo: t.tipo, descricao: t.descricao, valor: Number(t.valor) || 0, created_at: t.created_at }; })
  };
}
async function _guerraInsertTx(tipo, descricao, valor) {
  var row = { id: _guerraUuid(), user_id: _uid(), tipo: tipo, descricao: descricao, valor: Math.round(valor * 100) / 100 };
  // otimista
  _guerraState.tx.push({ id: row.id, tipo: tipo, descricao: descricao, valor: row.valor, created_at: _gISO() });
  renderGuerraTab();
  try { await _dbFetch('mf_guerra_transacoes', 'POST', row); }
  catch (e) { _guerraState.tx = _guerraState.tx.filter(function (t) { return t.id !== row.id; }); renderGuerraTab(); alert('Falha ao salvar: ' + (e && e.message || e)); }
}
async function _guerraDeleteTx(id) {
  var bak = _guerraState.tx.slice();
  _guerraState.tx = _guerraState.tx.filter(function (t) { return t.id !== id; });
  renderGuerraTab();
  try { await _dbFetch('mf_guerra_transacoes?id=eq.' + id + '&user_id=eq.' + _uid(), 'DELETE'); }
  catch (e) { _guerraState.tx = bak; renderGuerraTab(); alert('Falha ao remover: ' + (e && e.message || e)); }
}
async function _guerraPatchSaldo(valor) {
  _guerraState.saldoInicial = valor; renderGuerraTab();
  try { await _dbFetch('mf_guerra?user_id=eq.' + _uid(), 'PATCH', { saldo_inicial: valor, updated_at: _gISO() }); }
  catch (e) { alert('Falha ao salvar saldo: ' + (e && e.message || e)); }
}

// ── Métricas derivadas dos lançamentos (não persistidas) ──
function _guerraStartWeek() { var d = new Date(); var day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day); return d; }
function _guerraGastoSemana() {
  var all = (typeof loadData === 'function') ? (loadData() || []) : [];
  var ini = _guerraStartWeek(), tot = 0;
  all.forEach(function (l) {
    if (l.tipo !== 'despesa') return;
    if (!(l.categoria === 'Gastos Variaveis' || !l.categoria)) return;
    var s = l.data || l.vencimento || '', d = null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s.slice(0, 10) + 'T00:00:00');
    else if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) { var p = s.split('/'); d = new Date(p[2] + '-' + p[1] + '-' + p[0] + 'T00:00:00'); }
    if (!d || d < ini) return;
    tot += Math.abs((typeof _valorExib === 'function') ? _valorExib(l) : (parseFloat(l.valor) || 0));
  });
  return tot;
}
function _guerraCaixaLivre() {
  var all = (typeof loadData === 'function') ? (loadData() || []) : [];
  var T = { 'Dividas de terceiros': 1, 'Entrada Terceiro': 1, 'Divida de terceiros': 1 };
  var mes = (typeof currentMonth !== 'undefined') ? currentMonth : new Date().getMonth() + 1;
  var ano = (typeof currentYear !== 'undefined') ? currentYear : new Date().getFullYear();
  var rec = 0, des = 0;
  all.forEach(function (l) {
    if (Number(l.mes) !== Number(mes) || Number(l.ano) !== Number(ano)) return;
    if (T[l.categoria]) return;
    var v = Math.abs((typeof _valorExib === 'function') ? _valorExib(l) : (parseFloat(l.valor) || 0));
    if (l.tipo === 'receita') rec += v; else des += v;
  });
  return rec - des;
}
// Semana da guerra = a partir da 1ª transação (ou semana 1 se ainda não houve)
function _guerraSemanaAtual() {
  if (!_guerraState || !_guerraState.tx.length) return 1;
  var datas = _guerraState.tx.map(function (t) { return new Date(t.created_at); }).sort(function (a, b) { return a - b; });
  var dias = Math.floor((new Date() - datas[0]) / 86400000);
  return Math.max(1, Math.floor(dias / 7) + 1);
}

function _gKpi(cor, label, valor, sub) {
  return '<div style="flex:1;min-width:140px;background:var(--surface);border:1px solid var(--border);border-top:3px solid ' + cor + ';border-radius:12px;padding:13px 15px">' +
    '<div style="font-size:0.64rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:' + cor + '">' + label + '</div>' +
    '<div style="font-family:\'Space Mono\',monospace;font-size:1.3rem;font-weight:700;color:var(--text);margin-top:3px">' + valor + '</div>' +
    '<div style="font-size:0.7rem;color:var(--muted);margin-top:2px">' + (sub || '') + '</div></div>';
}

function renderGuerraTab() {
  var host = document.getElementById('guerraContent');
  if (!host) return;

  // Carrega do Supabase na 1ª vez
  if (!_guerraState) {
    // Espera a sessão estar pronta (boot pode renderizar a aba antes do login)
    if (!_guerraAuthReady()) {
      _guerraAuthTries++;
      host.innerHTML = '<div style="padding:28px;color:var(--muted);font-size:0.9rem">⚔️ Aguardando sessão…</div>';
      if (_guerraAuthTries < 15) setTimeout(renderGuerraTab, 700);
      else host.innerHTML = '<div style="padding:24px;color:var(--danger)">Sessão não detectada. Faça login novamente e reabra a aba ⚔️ Guerra.</div>';
      return;
    }
    _guerraAuthTries = 0;
    if (!_guerraLoading) {
      _guerraLoading = true;
      host.innerHTML = '<div style="padding:28px;color:var(--muted);font-size:0.9rem">⚔️ Carregando guerra…</div>';
      _guerraFetch().then(function () { _guerraLoading = false; renderGuerraTab(); })
        .catch(function (e) {
          _guerraLoading = false;
          var msg = (e && e.message) || String(e);
          if (/n[ãa]o autenticado/i.test(msg)) { host.innerHTML = '<div style="padding:28px;color:var(--muted)">⚔️ Aguardando sessão…</div>'; setTimeout(renderGuerraTab, 700); return; }
          host.innerHTML = '<div style="padding:24px;color:var(--danger)">Erro ao carregar: ' + msg + '<br><br>Rodou a migration <code>mf_guerra</code> no Supabase?</div>';
        });
    }
    return;
  }

  var st = _guerraState;
  var pago = st.tx.reduce(function (s, t) { return s + (t.valor || 0); }, 0);
  var saldo = Math.max(0, st.saldoInicial - pago);
  var prog = st.saldoInicial > 0 ? Math.min(100, pago / st.saldoInicial * 100) : 0;
  var vendas = st.tx.filter(function (t) { return t.tipo === 'VENDA'; }).reduce(function (s, t) { return s + t.valor; }, 0);
  var vendasMeta = GUERRA_ATIVOS.reduce(function (s, a) { return s + a.esp; }, 0);
  var caixa = _guerraCaixaLivre();
  var gasto = _guerraGastoSemana();
  var travado = gasto > GUERRA_LIMITE_SEMANAL;
  var semAtual = _guerraSemanaAtual();
  var meta = st.metaSemanas || GUERRA_META_SEMANAS;
  var alvoSem = (GUERRA_TIMELINE[Math.min(semAtual, GUERRA_TIMELINE.length) - 1] || {}).alvo;
  var acimaMeta = saldo > 0 && alvoSem != null && saldo > alvoSem;
  var atrasado = saldo > 0 && semAtual > meta;
  function vendido(id) { var a = GUERRA_ATIVOS.find(function (x) { return x.id === id; }); return a && st.tx.some(function (t) { return t.tipo === 'VENDA' && t.descricao === a.nome; }); }

  // STATUS GLOBAL
  var status, sCor, sBg;
  if (saldo <= 0) { status = '✅ QUITADO'; sCor = 'var(--green)'; sBg = 'rgba(48,208,128,.15)'; }
  else if (atrasado) { status = '⛔ ATRASADO'; sCor = 'var(--red)'; sBg = 'rgba(240,80,96,.15)'; }
  else if (travado) { status = '🔒 TRAVADO (consumo)'; sCor = 'var(--red)'; sBg = 'rgba(240,80,96,.15)'; }
  else if (acimaMeta) { status = '⚠️ EM RISCO'; sCor = 'var(--accent)'; sBg = 'rgba(240,192,64,.15)'; }
  else { status = '🟢 NO PRAZO'; sCor = 'var(--green)'; sBg = 'rgba(48,208,128,.12)'; }

  var H = [];

  // (0) AJUDA — "Como funciona" (abre/fecha; lembra o estado)
  var helpOpen = localStorage.getItem('mf_guerra_help') !== '0';
  H.push('<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;overflow:hidden">');
  H.push('<button onclick="guerraToggleHelp()" style="width:100%;display:flex;align-items:center;gap:8px;background:none;border:none;color:var(--text);padding:12px 16px;cursor:pointer;font-size:0.85rem;font-weight:700;text-align:left">❔ Como funciona esta página<span style="margin-left:auto;color:var(--muted)">' + (helpOpen ? '▲' : '▼') + '</span></button>');
  if (helpOpen) {
    H.push('<div style="padding:0 16px 16px;font-size:0.82rem;color:var(--text2);line-height:1.55">');
    H.push('Esta é a sua <strong>sala de guerra</strong> para zerar a dívida no menor tempo. Tudo num lugar só: quanto falta, o que já fez e se está no prazo.');
    H.push('<ul style="margin:8px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:5px">');
    H.push('<li><strong>Topo:</strong> quanto <strong>falta pagar</strong> + barra que enche até zerar. O selo se pinta sozinho: 🟢 No prazo · ⚠️ Em risco · 🔒 Travado (gastou demais) · ⛔ Atrasado · ✅ Quitado.</li>');
    H.push('<li><strong>5 cartões:</strong> saldo · já pago · vendas · caixa livre do mês · gasto da semana (teto R$ 350 — passou, fica vermelho).</li>');
    H.push('<li><strong>Plano semanal:</strong> o que fazer em cada semana e quanto a dívida deveria estar.</li>');
    H.push('<li><strong>Vendas:</strong> clica <strong>“Vender”</strong>, digita quanto recebeu, e o valor <strong>desconta da dívida na hora</strong>.</li>');
    H.push('<li><strong>Botões:</strong> “Registrar pagamento” (sobrou no mês → joga na dívida) e “Ajustar saldo inicial” (valor real quando o banco informar).</li>');
    H.push('</ul>');
    H.push('<div style="margin-top:8px;padding:8px 12px;background:var(--surface2);border-radius:8px;font-size:0.78rem"><strong>Regra de ouro:</strong> todo dinheiro que entra abate a dívida. Você nunca digita o saldo — ele é sempre <strong>dívida inicial − tudo que já foi pago</strong>. Salvo na nuvem, aparece em qualquer aparelho.</div>');
    H.push('</div>');
  }
  H.push('</div>');

  // (A) HEADER
  H.push('<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px 22px;margin-bottom:14px">');
  H.push('<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">');
  H.push('<div><div style="font-size:0.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">⚔️ Saldo da dívida</div>' +
    '<div style="font-family:\'Space Mono\',monospace;font-size:2.4rem;font-weight:700;color:' + (saldo <= 0 ? 'var(--green)' : 'var(--red)') + ';line-height:1.05">' + _gF(saldo) + '</div>' +
    '<div style="font-size:0.72rem;color:var(--muted)">Meta: quitar em ' + meta + ' semanas · você está na <strong style="color:var(--text)">Semana ' + semAtual + '</strong></div></div>');
  H.push('<div style="text-align:right"><span style="display:inline-block;background:' + sBg + ';color:' + sCor + ';border:1px solid ' + sCor + ';border-radius:20px;padding:4px 14px;font-size:0.8rem;font-weight:700">' + status + '</span>' +
    '<div style="margin-top:6px;font-size:0.72rem;color:var(--muted)">Pago <strong style="color:var(--green)">' + _gF(pago) + '</strong> de ' + _gF(st.saldoInicial) + ' <button onclick="guerraRefresh()" title="Atualizar do servidor" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:0.85rem">↻</button></div></div>');
  H.push('</div>');
  H.push('<div style="margin-top:12px;height:18px;background:var(--surface2);border-radius:9px;overflow:hidden;border:1px solid var(--border)">' +
    '<div style="height:100%;width:' + prog.toFixed(1) + '%;background:' + (saldo <= 0 ? 'var(--green)' : prog >= 50 ? 'var(--accent)' : 'var(--red)') + ';transition:width .4s"></div></div>');
  H.push('<div style="text-align:center;font-size:0.74rem;color:var(--muted);margin-top:4px">' + prog.toFixed(0) + '% quitado</div>');
  H.push('</div>');

  // (C) KPIs
  H.push('<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">');
  H.push(_gKpi('var(--red)', 'Saldo dívida', _gF(saldo), 'inicial ' + _gF(st.saldoInicial)));
  H.push(_gKpi('var(--green)', 'Pago acumulado', _gF(pago), st.tx.length + ' transação(ões)'));
  H.push(_gKpi('#60a5fa', 'Vendas realizadas', _gF(vendas), 'meta ' + _gF(vendasMeta)));
  H.push(_gKpi(caixa >= 5000 ? 'var(--green)' : 'var(--accent)', 'Caixa livre (mês)', _gF(caixa), 'receita − despesa'));
  H.push(_gKpi(travado ? 'var(--red)' : 'var(--green)', 'Gasto semanal', _gF(gasto), 'limite ' + _gF(GUERRA_LIMITE_SEMANAL) + ' · ' + (travado ? 'BLOQUEADO' : 'OK')));
  H.push('</div>');

  // ALERTAS
  var alertas = [];
  if (travado) alertas.push(['var(--red)', '🚨 Gasto acima do limite — ' + _gF(gasto) + ' > ' + _gF(GUERRA_LIMITE_SEMANAL) + '. CONSUMO TRAVADO até o reset da semana.']);
  if (acimaMeta) alertas.push(['var(--accent)', '⚠️ Dívida acima da meta da Semana ' + semAtual + ' (alvo ≤ ' + _gF(alvoSem) + ', está em ' + _gF(saldo) + ').']);
  GUERRA_ATIVOS.forEach(function (a) {
    if (vendido(a.id)) return;
    if (a.id === 'asx' && semAtual >= 3) alertas.push(['var(--red)', '⛔ Venda atrasada: ' + a.nome + ' deveria ter sido vendido até a Semana 3.']);
    else if (a.id !== 'asx' && semAtual >= 2) alertas.push(['var(--accent)', '🏷️ Venda atrasada: ' + a.nome + ' (eletrônicos eram p/ Semana 1).']);
  });
  if (atrasado) alertas.push(['var(--red)', '⛔ EXECUÇÃO EM RISCO: passou de ' + meta + ' semanas e a dívida não zerou.']);
  if (saldo <= 0) alertas.push(['var(--green)', '✅ Dívida quitada. Redirecione todo o caixa livre para a próxima dívida (bola de neve).']);
  if (alertas.length) {
    H.push('<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">');
    alertas.forEach(function (a) { H.push('<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ' + a[0] + ';border-radius:8px;padding:8px 12px;font-size:0.8rem;color:var(--text)">' + a[1] + '</div>'); });
    H.push('</div>');
  }

  // (B) TIMELINE SEMANAL
  H.push('<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:14px;overflow-x:auto">');
  H.push('<div style="font-size:0.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">📅 Execução semanal (plano)</div>');
  H.push('<table style="width:100%;border-collapse:collapse;font-size:0.82rem"><thead><tr style="color:var(--muted);text-align:left">' +
    '<th style="padding:5px 8px">Semana</th><th style="padding:5px 8px">Entrada</th><th style="padding:5px 8px;text-align:right">Aplicado</th><th style="padding:5px 8px;text-align:right">Saldo planejado</th></tr></thead><tbody>');
  var saldoPlan = st.saldoInicial;
  GUERRA_TIMELINE.forEach(function (t, i) {
    var entrada = t.entrada != null ? t.entrada : Math.max(0, saldoPlan);
    saldoPlan = Math.max(0, saldoPlan - entrada);
    var atual = (i + 1) === Math.min(semAtual, GUERRA_TIMELINE.length);
    H.push('<tr style="border-top:1px solid var(--border);' + (atual ? 'background:rgba(240,192,64,.06)' : '') + '">' +
      '<td style="padding:6px 8px;font-weight:700">' + t.sem + (atual ? ' <span style="font-size:0.6rem;color:var(--accent)">◄ agora</span>' : '') + '</td>' +
      '<td style="padding:6px 8px;color:var(--text2)">' + t.desc + '</td>' +
      '<td style="padding:6px 8px;text-align:right;font-family:\'Space Mono\',monospace">' + _gF(entrada) + '</td>' +
      '<td style="padding:6px 8px;text-align:right;font-family:\'Space Mono\',monospace;color:' + (saldoPlan <= 0 ? 'var(--green)' : 'var(--text)') + '">' + _gF(saldoPlan) + '</td></tr>');
  });
  H.push('</tbody></table></div>');

  // (3) CONTROLE DE VENDAS
  H.push('<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:14px;overflow-x:auto">');
  H.push('<div style="font-size:0.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">🏷️ Vendas de ativos</div>');
  H.push('<table style="width:100%;border-collapse:collapse;font-size:0.82rem"><thead><tr style="color:var(--muted);text-align:left">' +
    '<th style="padding:5px 8px">Item</th><th style="padding:5px 8px;text-align:right">Esperado</th><th style="padding:5px 8px;text-align:right">Real</th><th style="padding:5px 8px;text-align:center">Status</th><th></th></tr></thead><tbody>');
  GUERRA_ATIVOS.forEach(function (a) {
    var v = vendido(a.id);
    var txV = v ? st.tx.filter(function (t) { return t.tipo === 'VENDA' && t.descricao === a.nome; }).slice(-1)[0] : null;
    H.push('<tr style="border-top:1px solid var(--border)">' +
      '<td style="padding:6px 8px;font-weight:600">' + a.nome + '</td>' +
      '<td style="padding:6px 8px;text-align:right;font-family:\'Space Mono\',monospace;color:var(--muted)">' + _gF(a.esp) + '</td>' +
      '<td style="padding:6px 8px;text-align:right;font-family:\'Space Mono\',monospace;color:' + (v ? '#60a5fa' : 'var(--muted)') + '">' + (v ? _gF(txV.valor) : '—') + '</td>' +
      '<td style="padding:6px 8px;text-align:center"><span class="badge badge-' + (v ? 'pago' : 'pendente') + '">' + (v ? '✓ Vendido' : '⏳ Pendente') + '</span></td>' +
      '<td style="padding:6px 8px;text-align:right">' + (v
        ? '<button onclick="guerraDesfazVenda(\'' + a.id + '\')" style="background:none;border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:3px 9px;font-size:0.72rem;cursor:pointer">desfazer</button>'
        : '<button onclick="guerraVender(\'' + a.id + '\')" style="background:rgba(96,165,250,0.12);border:1px solid rgba(96,165,250,0.4);color:#60a5fa;border-radius:6px;padding:3px 11px;font-size:0.72rem;font-weight:700;cursor:pointer">Vender</button>') + '</td></tr>');
  });
  H.push('</tbody></table></div>');

  // AÇÕES
  H.push('<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">');
  H.push('<button onclick="guerraAddPagamento()" style="background:rgba(48,208,128,0.12);border:1px solid rgba(48,208,128,0.4);color:var(--green);border-radius:8px;padding:8px 14px;font-size:0.8rem;font-weight:700;cursor:pointer">💸 Registrar pagamento (surplus)</button>');
  H.push('<button onclick="guerraAjustarDivida()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:8px 14px;font-size:0.8rem;font-weight:700;cursor:pointer">⚙️ Ajustar saldo inicial</button>');
  H.push('</div>');

  // LOG transações
  if (st.tx.length) {
    H.push('<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px">');
    H.push('<div style="font-size:0.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:4px">📒 Movimentos (abatem a dívida)</div>');
    st.tx.slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }).forEach(function (t) {
      var cor = t.tipo === 'VENDA' ? '#60a5fa' : 'var(--green)';
      H.push('<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid var(--border);font-size:0.8rem">' +
        '<span style="color:' + cor + ';font-size:0.62rem;font-weight:700;border:1px solid ' + cor + ';border-radius:10px;padding:1px 7px">' + t.tipo + '</span>' +
        '<span style="flex:1">' + (t.descricao || '') + '</span>' +
        '<span style="font-family:\'Space Mono\',monospace;color:' + cor + '">' + _gF(t.valor) + '</span>' +
        '<button onclick="guerraDelTx(\'' + t.id + '\')" style="background:none;border:none;color:var(--danger);cursor:pointer">✕</button></div>');
    });
    H.push('</div>');
  }

  H.push('<div style="font-size:0.66rem;color:var(--muted);margin-top:10px">Limite semanal R$ 350 e meta de ' + meta + ' semanas são fixos. Saldo = saldo inicial − soma das transações (sincronizado no Supabase, RLS por usuário).</div>');

  host.innerHTML = H.join('');
}

// ── ações ──
function guerraRefresh() { _guerraState = null; renderGuerraTab(); }
function guerraToggleHelp() { var open = localStorage.getItem('mf_guerra_help') !== '0'; localStorage.setItem('mf_guerra_help', open ? '0' : '1'); renderGuerraTab(); }
function guerraVender(id) {
  var a = GUERRA_ATIVOS.find(function (x) { return x.id === id; }); if (!a || !_guerraState) return;
  var v = _gNum(prompt('Valor REAL recebido na venda de "' + a.nome + '" (R$):', a.esp));
  if (isNaN(v) || v <= 0) return;
  _guerraInsertTx('VENDA', a.nome, v); // todo valor → dívida
}
function guerraDesfazVenda(id) {
  if (!_guerraState) return;
  var a = GUERRA_ATIVOS.find(function (x) { return x.id === id; }); if (!a) return;
  var tx = _guerraState.tx.filter(function (t) { return t.tipo === 'VENDA' && t.descricao === a.nome; }).slice(-1)[0];
  if (!tx) return;
  if (!confirm('Desfazer a venda de "' + a.nome + '" e retirar o valor da dívida?')) return;
  _guerraDeleteTx(tx.id);
}
function guerraAddPagamento() {
  if (!_guerraState) return;
  var v = _gNum(prompt('Valor pago na dívida (surplus do mês, etc) — R$:'));
  if (isNaN(v) || v <= 0) return;
  var obs = prompt('Origem (ex: surplus do mês):', 'surplus') || 'surplus';
  _guerraInsertTx('PAGAMENTO', obs, v);
}
function guerraDelTx(id) { if (_guerraState && confirm('Remover esta transação?')) _guerraDeleteTx(id); }
function guerraAjustarDivida() {
  if (!_guerraState) return;
  var v = _gNum(prompt('Saldo inicial da dívida a quitar (R$):', _guerraState.saldoInicial));
  if (!isNaN(v) && v >= 0) _guerraPatchSaldo(Math.round(v * 100) / 100);
}
