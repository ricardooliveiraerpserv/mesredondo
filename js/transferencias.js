// ======== TRANSFERÊNCIAS ENTRE BANCOS ========
//
// Modelo: 1 transferência = 2 lançamentos vinculados pelo mesmo groupId
// (prefixo 'transf_'). Uma despesa no banco origem + uma receita no banco
// destino, ambas com categoria 'Transferência' e sub 'Saída'/'Entrada'.
// No consolidado as duas pontas se cancelam; nos extratos por banco cada
// uma aparece no seu lado.

const CAT_TRANSF_NOME = 'Transferência';
const CAT_TRANSF_SUB_OUT = 'Saída';
const CAT_TRANSF_SUB_IN = 'Entrada';

function _ensureCategoriaTransferencia() {
  const cats = loadCats();
  const exists = cats.find(c => c.nome === CAT_TRANSF_NOME);
  if (exists) {
    const subs = exists.subs || [];
    const norm = s => (typeof s === 'string' ? s : s.nome);
    const hasOut = subs.some(s => norm(s) === CAT_TRANSF_SUB_OUT);
    const hasIn  = subs.some(s => norm(s) === CAT_TRANSF_SUB_IN);
    if (hasOut && hasIn) return;
    const newSubs = [...subs];
    if (!hasOut) newSubs.push({ id: 'sub_transf_out_' + Date.now(), nome: CAT_TRANSF_SUB_OUT, desc: '' });
    if (!hasIn)  newSubs.push({ id: 'sub_transf_in_'  + Date.now(), nome: CAT_TRANSF_SUB_IN,  desc: '' });
    exists.subs = newSubs;
    saveCats(cats);
    return;
  }
  cats.push({
    id: 'cat_transferencia',
    nome: CAT_TRANSF_NOME,
    tipo: 'ambos',
    cor: '#4090f0',
    icone: '🔄',
    subs: [
      { id: 'sub_transf_out', nome: CAT_TRANSF_SUB_OUT, desc: '' },
      { id: 'sub_transf_in',  nome: CAT_TRANSF_SUB_IN,  desc: '' },
    ],
  });
  saveCats(cats);
}

function _populateTransferBancoSelects() {
  const bancos = loadBancos();
  const sOrig = document.getElementById('tfBancoOrigem');
  const sDest = document.getElementById('tfBancoDestino');
  if (!sOrig || !sDest) return;
  const opts = '<option value="">— Selecione —</option>' +
    bancos.map(b => `<option value="${b.id}">${b.icone || '🏦'} ${b.nome}</option>`).join('');
  sOrig.innerHTML = opts;
  sDest.innerHTML = opts;
  const ctx = typeof getBancoAtivo === 'function' ? getBancoAtivo() : null;
  if (ctx) sOrig.value = ctx;
}

window.openTransferModal = function () {
  const bancos = loadBancos();
  if (!bancos || bancos.length < 2) {
    alert('Cadastre ao menos 2 bancos antes de fazer uma transferência.');
    return;
  }
  _populateTransferBancoSelects();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('tfData').value = today;
  document.getElementById('tfValor').value = '';
  document.getElementById('tfDesc').value = '';
  const sDest = document.getElementById('tfBancoDestino');
  if (sDest) sDest.value = '';
  document.getElementById('transferModalOverlay').classList.add('open');
  setTimeout(() => { const v = document.getElementById('tfValor'); if (v) v.focus(); }, 50);
};

window.closeTransferModal = function () {
  document.getElementById('transferModalOverlay').classList.remove('open');
};

window.salvarTransferencia = async function () {
  const origemId  = document.getElementById('tfBancoOrigem').value;
  const destinoId = document.getElementById('tfBancoDestino').value;
  const dataStr   = document.getElementById('tfData').value;
  const valor     = parseFloat(String(document.getElementById('tfValor').value).replace(',', '.')) || 0;
  const desc      = (document.getElementById('tfDesc').value || '').trim();
  const btn       = document.getElementById('btnSalvarTransfer');

  if (!origemId)  { alert('Selecione o banco de origem.'); return; }
  if (!destinoId) { alert('Selecione o banco de destino.'); return; }
  if (origemId === destinoId) { alert('Origem e destino devem ser bancos diferentes.'); return; }
  if (!valor || valor <= 0)   { alert('Informe um valor maior que zero.'); return; }
  if (!dataStr) { alert('Informe a data da transferência.'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    _ensureCategoriaTransferencia();

    const bancos  = loadBancos();
    const bOrig   = bancos.find(b => b.id === origemId);
    const bDest   = bancos.find(b => b.id === destinoId);
    const nomeOrig = bOrig ? bOrig.nome : 'Origem';
    const nomeDest = bDest ? bDest.nome : 'Destino';

    const venc    = (typeof inputDateToVenc === 'function') ? inputDateToVenc(dataStr) : dataStr;
    const mes     = parseInt(dataStr.split('-')[1]);
    const ano     = parseInt(dataStr.split('-')[0]);
    const groupId = 'transf_' + Date.now();
    const suffix  = desc ? ': ' + desc : '';

    const saida = {
      id: groupId + '_out',
      tipo: 'despesa',
      data: dataStr,
      valor,
      desc: `Transferência → ${nomeDest}${suffix}`,
      categoria: CAT_TRANSF_NOME,
      subCategoria: CAT_TRANSF_SUB_OUT,
      status: 'pago',
      pagamento: '',
      tipoLanc: 'variavel',
      vencimento: venc,
      banco: origemId,
      terceiro: '',
      mes, ano,
      groupId,
    };
    const entrada = {
      id: groupId + '_in',
      tipo: 'receita',
      data: dataStr,
      valor,
      desc: `Transferência ← ${nomeOrig}${suffix}`,
      categoria: CAT_TRANSF_NOME,
      subCategoria: CAT_TRANSF_SUB_IN,
      status: 'pago',
      pagamento: '',
      tipoLanc: 'variavel',
      vencimento: venc,
      banco: destinoId,
      terceiro: '',
      mes, ano,
      groupId,
    };

    const all = loadData();
    saveData([...all, saida, entrada]);
    closeTransferModal();
    if (typeof renderAll === 'function') renderAll();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Transferir'; }
  }
};
