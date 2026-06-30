// ⚔️ GUERRA À DÍVIDA — controle operacional p/ quitar R$ 37.000 em até 4 semanas.
// Regras fixas (hardcoded): limite variável semanal R$ 350; meta saldo=0 em 4 semanas;
// todo valor recebido → abate a dívida. Persistência local (mf_guerra).

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
// Timeline planejada e alvo de saldo por semana (p/ status ATRASADO/RISCO)
var GUERRA_TIMELINE = [
  { sem: 'S1',   desc: 'Eletrônicos', entrada: 8000,  alvo: 29000 },
  { sem: 'S2–3', desc: 'ASX',         entrada: 25000, alvo: 4000  },
  { sem: 'S4',   desc: 'Surplus (restante)', entrada: null, alvo: 0 }
];
var GUERRA_KEY = 'mf_guerra';

function _guerraLoad() {
  var def = { dividaInicial: GUERRA_DIVIDA_DEFAULT, inicio: null, pagamentos: [], ativos: {} };
  try {
    var c = JSON.parse(localStorage.getItem(GUERRA_KEY) || '{}');
    var m = Object.assign(def, c, { pagamentos: c.pagamentos || [], ativos: c.ativos || {} });
    if (!m.inicio) { m.inicio = new Date().toISOString().slice(0, 10); _guerraSave(m); }
    return m;
  } catch (e) { def.inicio = new Date().toISOString().slice(0, 10); return def; }
}
function _guerraSave(c) { try { localStorage.setItem(GUERRA_KEY, JSON.stringify(c)); } catch (e) {} }
function _gF(v) { return (typeof fmt === 'function') ? fmt(v) : ('R$ ' + (v || 0).toFixed(2)); }
function _gNum(s) { if (s == null) return NaN; return parseFloat(String(s).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')); }
function _gISO() { return new Date().toISOString().slice(0, 10); }

function _guerraSemanaAtual(cfg) {
  var ini = new Date((cfg.inicio || _gISO()) + 'T00:00:00');
  var dias = Math.floor((new Date() - ini) / 86400000);
  return Math.max(1, Math.floor(dias / 7) + 1);
}
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

function _gKpi(cor, label, valor, sub) {
  return '<div style="flex:1;min-width:140px;background:var(--surface);border:1px solid var(--border);border-top:3px solid ' + cor + ';border-radius:12px;padding:13px 15px">' +
    '<div style="font-size:0.64rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:' + cor + '">' + label + '</div>' +
    '<div style="font-family:\'Space Mono\',monospace;font-size:1.3rem;font-weight:700;color:var(--text);margin-top:3px">' + valor + '</div>' +
    '<div style="font-size:0.7rem;color:var(--muted);margin-top:2px">' + (sub || '') + '</div></div>';
}

function renderGuerraTab() {
  var host = document.getElementById('guerraContent');
  if (!host) return;
  var cfg = _guerraLoad();

  // ── cálculos ──
  var pago = (cfg.pagamentos || []).reduce(function (s, p) { return s + (parseFloat(p.valor) || 0); }, 0);
  var saldo = Math.max(0, (cfg.dividaInicial || 0) - pago);
  var prog = cfg.dividaInicial > 0 ? Math.min(100, pago / cfg.dividaInicial * 100) : 0;
  var vendas = GUERRA_ATIVOS.reduce(function (s, a) { var e = cfg.ativos[a.id]; return s + (e && e.vendido ? (parseFloat(e.valorReal) || 0) : 0); }, 0);
  var vendasMeta = GUERRA_ATIVOS.reduce(function (s, a) { return s + a.esp; }, 0);
  var caixa = _guerraCaixaLivre();
  var gasto = _guerraGastoSemana();
  var travado = gasto > GUERRA_LIMITE_SEMANAL;
  var semAtual = _guerraSemanaAtual(cfg);
  var alvoSem = (GUERRA_TIMELINE[Math.min(semAtual, GUERRA_TIMELINE.length) - 1] || {}).alvo;
  var acimaMeta = saldo > 0 && alvoSem != null && saldo > alvoSem;
  var atrasado = saldo > 0 && semAtual > GUERRA_META_SEMANAS;

  // ── STATUS GLOBAL ──
  var status, sCor, sBg;
  if (saldo <= 0) { status = '✅ QUITADO'; sCor = 'var(--green)'; sBg = 'rgba(48,208,128,.15)'; }
  else if (atrasado) { status = '⛔ ATRASADO'; sCor = 'var(--red)'; sBg = 'rgba(240,80,96,.15)'; }
  else if (travado) { status = '🔒 TRAVADO (consumo)'; sCor = 'var(--red)'; sBg = 'rgba(240,80,96,.15)'; }
  else if (acimaMeta) { status = '⚠️ EM RISCO'; sCor = 'var(--accent)'; sBg = 'rgba(240,192,64,.15)'; }
  else { status = '🟢 NO PRAZO'; sCor = 'var(--green)'; sBg = 'rgba(48,208,128,.12)'; }

  var H = [];

  // (A) HEADER
  H.push('<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px 22px;margin-bottom:14px">');
  H.push('<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">');
  H.push('<div><div style="font-size:0.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">⚔️ Saldo da dívida</div>' +
    '<div style="font-family:\'Space Mono\',monospace;font-size:2.4rem;font-weight:700;color:' + (saldo <= 0 ? 'var(--green)' : 'var(--red)') + ';line-height:1.05">' + _gF(saldo) + '</div>' +
    '<div style="font-size:0.72rem;color:var(--muted)">Meta: quitar em ' + GUERRA_META_SEMANAS + ' semanas · você está na <strong style="color:var(--text)">Semana ' + semAtual + '</strong></div></div>');
  H.push('<div style="text-align:right"><span style="display:inline-block;background:' + sBg + ';color:' + sCor + ';border:1px solid ' + sCor + ';border-radius:20px;padding:4px 14px;font-size:0.8rem;font-weight:700">' + status + '</span>' +
    '<div style="margin-top:6px;font-size:0.72rem;color:var(--muted)">Pago <strong style="color:var(--green)">' + _gF(pago) + '</strong> de ' + _gF(cfg.dividaInicial) + '</div></div>');
  H.push('</div>');
  H.push('<div style="margin-top:12px;height:18px;background:var(--surface2);border-radius:9px;overflow:hidden;border:1px solid var(--border)">' +
    '<div style="height:100%;width:' + prog.toFixed(1) + '%;background:' + (saldo <= 0 ? 'var(--green)' : prog >= 50 ? 'var(--accent)' : 'var(--red)') + ';transition:width .4s"></div></div>');
  H.push('<div style="text-align:center;font-size:0.74rem;color:var(--muted);margin-top:4px">' + prog.toFixed(0) + '% quitado</div>');
  H.push('</div>');

  // (C) KPIs
  H.push('<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">');
  H.push(_gKpi('var(--red)', 'Saldo dívida', _gF(saldo), 'inicial ' + _gF(cfg.dividaInicial)));
  H.push(_gKpi('var(--green)', 'Pago acumulado', _gF(pago), (cfg.pagamentos || []).length + ' aporte(s)'));
  H.push(_gKpi('#60a5fa', 'Vendas realizadas', _gF(vendas), 'meta ' + _gF(vendasMeta)));
  H.push(_gKpi(caixa >= 5000 ? 'var(--green)' : 'var(--accent)', 'Caixa livre (mês)', _gF(caixa), 'receita − despesa'));
  H.push(_gKpi(travado ? 'var(--red)' : 'var(--green)', 'Gasto semanal', _gF(gasto), 'limite ' + _gF(GUERRA_LIMITE_SEMANAL) + ' · ' + (travado ? 'BLOQUEADO' : 'OK')));
  H.push('</div>');

  // (4) ALERTAS
  var alertas = [];
  if (travado) alertas.push(['var(--red)', '🚨 Gasto acima do limite — ' + _gF(gasto) + ' > ' + _gF(GUERRA_LIMITE_SEMANAL) + '. CONSUMO TRAVADO até o reset da semana.']);
  if (acimaMeta) alertas.push(['var(--accent)', '⚠️ Dívida acima da meta da Semana ' + semAtual + ' (alvo ≤ ' + _gF(alvoSem) + ', está em ' + _gF(saldo) + ').']);
  GUERRA_ATIVOS.forEach(function (a) {
    var e = cfg.ativos[a.id]; var vendido = e && e.vendido;
    if (!vendido) {
      if (a.id === 'asx' && semAtual >= 3) alertas.push(['var(--red)', '⛔ Venda atrasada: ' + a.nome + ' deveria ter sido vendido até a Semana 3.']);
      else if (a.id !== 'asx' && semAtual >= 2) alertas.push(['var(--accent)', '🏷️ Venda atrasada: ' + a.nome + ' (eletrônicos eram p/ Semana 1).']);
    }
  });
  if (atrasado) alertas.push(['var(--red)', '⛔ EXECUÇÃO EM RISCO: passou de ' + GUERRA_META_SEMANAS + ' semanas e a dívida não zerou.']);
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
  var saldoPlan = cfg.dividaInicial;
  GUERRA_TIMELINE.forEach(function (t, i) {
    var entrada = t.entrada != null ? t.entrada : Math.max(0, saldoPlan); // S4 = restante
    saldoPlan = Math.max(0, saldoPlan - entrada);
    var atual = (i + 1) === Math.min(semAtual, GUERRA_TIMELINE.length);
    H.push('<tr style="border-top:1px solid var(--border);' + (atual ? 'background:rgba(240,192,64,.06)' : '') + '">' +
      '<td style="padding:6px 8px;font-weight:700">' + t.sem + (atual ? ' <span style="font-size:0.6rem;color:var(--accent)">◄ agora</span>' : '') + '</td>' +
      '<td style="padding:6px 8px;color:var(--text2)">' + t.desc + '</td>' +
      '<td style="padding:6px 8px;text-align:right;font-family:\'Space Mono\',monospace">' + _gF(entrada) + '</td>' +
      '<td style="padding:6px 8px;text-align:right;font-family:\'Space Mono\',monospace;color:' + (saldoPlan <= 0 ? 'var(--green)' : 'var(--text)') + '">' + _gF(saldoPlan) + '</td></tr>');
  });
  H.push('</tbody></table></div>');

  // (3) CONTROLE DE VENDAS — itens fixos
  H.push('<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:14px;overflow-x:auto">');
  H.push('<div style="font-size:0.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">🏷️ Vendas de ativos</div>');
  H.push('<table style="width:100%;border-collapse:collapse;font-size:0.82rem"><thead><tr style="color:var(--muted);text-align:left">' +
    '<th style="padding:5px 8px">Item</th><th style="padding:5px 8px;text-align:right">Esperado</th><th style="padding:5px 8px;text-align:right">Real</th><th style="padding:5px 8px;text-align:center">Status</th><th></th></tr></thead><tbody>');
  GUERRA_ATIVOS.forEach(function (a) {
    var e = cfg.ativos[a.id]; var vendido = e && e.vendido;
    H.push('<tr style="border-top:1px solid var(--border)">' +
      '<td style="padding:6px 8px;font-weight:600">' + a.nome + '</td>' +
      '<td style="padding:6px 8px;text-align:right;font-family:\'Space Mono\',monospace;color:var(--muted)">' + _gF(a.esp) + '</td>' +
      '<td style="padding:6px 8px;text-align:right;font-family:\'Space Mono\',monospace;color:' + (vendido ? '#60a5fa' : 'var(--muted)') + '">' + (vendido ? _gF(e.valorReal) : '—') + '</td>' +
      '<td style="padding:6px 8px;text-align:center"><span class="badge badge-' + (vendido ? 'pago' : 'pendente') + '">' + (vendido ? '✓ Vendido' : '⏳ Pendente') + '</span></td>' +
      '<td style="padding:6px 8px;text-align:right">' + (vendido
        ? '<button onclick="guerraDesfazVenda(\'' + a.id + '\')" style="background:none;border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:3px 9px;font-size:0.72rem;cursor:pointer">desfazer</button>'
        : '<button onclick="guerraVender(\'' + a.id + '\')" style="background:rgba(96,165,250,0.12);border:1px solid rgba(96,165,250,0.4);color:#60a5fa;border-radius:6px;padding:3px 11px;font-size:0.72rem;font-weight:700;cursor:pointer">Vender</button>') + '</td></tr>');
  });
  H.push('</tbody></table></div>');

  // AÇÕES (pagamento manual + ajuste saldo inicial)
  H.push('<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">');
  H.push('<button onclick="guerraAddPagamento()" style="background:rgba(48,208,128,0.12);border:1px solid rgba(48,208,128,0.4);color:var(--green);border-radius:8px;padding:8px 14px;font-size:0.8rem;font-weight:700;cursor:pointer">💸 Registrar pagamento (surplus)</button>');
  H.push('<button onclick="guerraAjustarDivida()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:8px 14px;font-size:0.8rem;font-weight:700;cursor:pointer">⚙️ Ajustar saldo inicial</button>');
  H.push('</div>');

  // LOG pagamentos
  if ((cfg.pagamentos || []).length) {
    H.push('<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px">');
    H.push('<div style="font-size:0.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:4px">💸 Pagamentos na dívida</div>');
    cfg.pagamentos.slice().reverse().forEach(function (p, ri) {
      var idx = cfg.pagamentos.length - 1 - ri;
      H.push('<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid var(--border);font-size:0.8rem">' +
        '<span style="color:var(--muted);font-family:\'Space Mono\',monospace;font-size:0.72rem">' + (p.data || '') + '</span><span style="flex:1">' + (p.obs || 'aporte') + '</span>' +
        '<span style="font-family:\'Space Mono\',monospace;color:var(--green)">' + _gF(p.valor) + '</span>' +
        '<button onclick="guerraDelPagamento(' + idx + ')" style="background:none;border:none;color:var(--danger);cursor:pointer">✕</button></div>');
    });
    H.push('</div>');
  }

  H.push('<div style="font-size:0.66rem;color:var(--muted);margin-top:10px">Limite semanal R$ 350 e meta de 4 semanas são fixos. Todo valor recebido abate a dívida automaticamente. Dados ficam neste dispositivo.</div>');

  host.innerHTML = H.join('');
}

// ── ações ──
function guerraVender(id) {
  var a = GUERRA_ATIVOS.find(function (x) { return x.id === id; }); if (!a) return;
  var v = _gNum(prompt('Valor REAL recebido na venda de "' + a.nome + '" (R$):', a.esp));
  if (isNaN(v) || v <= 0) return;
  var cfg = _guerraLoad();
  v = Math.round(v * 100) / 100;
  cfg.ativos[id] = { vendido: true, valorReal: v, data: _gISO() };
  cfg.pagamentos.push({ data: _gISO(), valor: v, obs: 'venda: ' + a.nome }); // todo valor → dívida
  _guerraSave(cfg); renderGuerraTab();
}
function guerraDesfazVenda(id) {
  var cfg = _guerraLoad(); var e = cfg.ativos[id]; if (!e) return;
  if (!confirm('Desfazer a venda e retirar o valor da dívida?')) return;
  var a = GUERRA_ATIVOS.find(function (x) { return x.id === id; });
  // remove o pagamento correspondente (venda: nome)
  var obs = 'venda: ' + (a ? a.nome : '');
  for (var i = cfg.pagamentos.length - 1; i >= 0; i--) { if (cfg.pagamentos[i].obs === obs && Math.abs(cfg.pagamentos[i].valor - e.valorReal) < 0.01) { cfg.pagamentos.splice(i, 1); break; } }
  delete cfg.ativos[id];
  _guerraSave(cfg); renderGuerraTab();
}
function guerraAddPagamento() {
  var v = _gNum(prompt('Valor pago na dívida (surplus do mês, etc) — R$:'));
  if (isNaN(v) || v <= 0) return;
  var obs = prompt('Origem (ex: surplus do mês):', 'surplus') || 'surplus';
  var cfg = _guerraLoad();
  cfg.pagamentos.push({ data: _gISO(), valor: Math.round(v * 100) / 100, obs: obs });
  _guerraSave(cfg); renderGuerraTab();
}
function guerraDelPagamento(i) { var c = _guerraLoad(); if (c.pagamentos[i] && confirm('Remover este pagamento?')) { c.pagamentos.splice(i, 1); _guerraSave(c); renderGuerraTab(); } }
function guerraAjustarDivida() {
  var c = _guerraLoad();
  var v = _gNum(prompt('Saldo inicial da dívida a quitar (R$):', c.dividaInicial));
  if (!isNaN(v) && v >= 0) { c.dividaInicial = Math.round(v * 100) / 100; _guerraSave(c); renderGuerraTab(); }
}
