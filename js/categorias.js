// ======== PROV MODAL ========
var _editProvGroupId = null;

async function openProvModal(groupId) {
  _editProvGroupId = groupId || null;
  const cats = (loadCats()).filter(c => c.tipo === 'despesa' || c.tipo === 'ambos');
  const sel = document.getElementById('pCategoria');
  sel.innerHTML = '<option value="">— Selecione —</option>';
  cats.sort((a,b) => a.nome.localeCompare(b.nome,'pt-BR')).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.nome;
    opt.textContent = (c.icone ? c.icone + ' ' : '') + c.nome;
    sel.appendChild(opt);
  });
  const pBanco = document.getElementById('pBanco');
  if (pBanco) {
    const bancos = loadBancos();
    pBanco.innerHTML = '<option value="">— Selecione o banco —</option>' +
      bancos.map(b=>`<option value="${b.id}">${b.icone||'🏦'} ${b.nome}</option>`).join('');
    const ctx7 = getBancoContexto();
    if (ctx7 && ctx7 !== 'consolidado') pBanco.value = ctx7;
    else if (bancos.length === 1) pBanco.value = bancos[0].id;
  }
  document.getElementById('pCatSearch').value = '';
  document.getElementById('pSubCatSearch').value = '';
  const now = new Date();
  document.getElementById('pMesInicio').value = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  document.getElementById('pQtdMeses').value = '12';

  if (groupId) {
    document.getElementById('provModalTitle').textContent = 'Editar Provisão';
    const provs = loadProvisoes();
    const grupo = provs.filter(p => p.groupId === groupId).sort((a,b) => a.ano*12+a.mes - b.ano*12-b.mes);
    if (grupo.length) {
      sel.value = grupo[0].categoria;
      updateProvSubcatSelect(grupo[0].subCategoria || '');
      document.getElementById('pValor').value = grupo[0].valor;
      document.getElementById('pMesInicio').value = grupo[0].ano + '-' + String(grupo[0].mes).padStart(2,'0');
      document.getElementById('pQtdMeses').value = grupo.length;
      if (pBanco && grupo[0].banco) pBanco.value = grupo[0].banco;
    }
  } else {
    document.getElementById('provModalTitle').textContent = 'Nova Provisão';
    document.getElementById('pValor').value = '';
    updateProvSubcatSelect('');
  }
  updateProvPreview();
  document.getElementById('provModalOverlay').classList.add('open');
}

async function updateProvSubcatSelect(preSelect) {
  const catNome = document.getElementById('pCategoria').value;
  const subSel = document.getElementById('pSubCategoria');
  if (!catNome) {
    _populateSubcatFromAllCats('', 'pSubCategoria', null);
    return;
  }
  subSel.innerHTML = '<option value="">— Toda a categoria —</option>';
  const cats = loadCats();
  const cat = cats.find(c => c.nome === catNome);
  if (cat && cat.subs && cat.subs.length) {
    const subNomes = cat.subs.map(s => typeof s === 'string' ? s : s.nome).sort();
    subNomes.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      subSel.appendChild(opt);
    });
  }
  if (preSelect !== undefined) subSel.value = preSelect || '';
}

function closeProvModal() {
  document.getElementById('provModalOverlay').classList.remove('open');
  _editProvGroupId = null;
}

async function filterProvCatSelect() {
  var q = (document.getElementById('pCatSearch').value || '').toLowerCase().trim();
  var sel = document.getElementById('pCategoria');
  var visible = [];
  Array.from(sel.options).forEach(function(opt) {
    if (!opt.value) { opt.style.display = ''; return; }
    var show = opt.textContent.toLowerCase().includes(q);
    opt.style.display = show ? '' : 'none';
    if (show) visible.push(opt.value);
  });
  if (q && visible.length === 1 && sel.value !== visible[0]) {
    sel.value = visible[0];
    await updateProvSubcatSelect('');
  }
}

function updateProvPreview() {
  const val = parseFloat(document.getElementById('pValor').value) || 0;
  const qtd = parseInt(document.getElementById('pQtdMeses').value) || 0;
  const mesInicio = document.getElementById('pMesInicio').value;
  const preview = document.getElementById('pProvPreview');
  if (!val || !qtd || !mesInicio) { preview.textContent = 'Preencha os campos acima para ver o resumo.'; return; }
  const [ano, mes] = mesInicio.split('-').map(Number);
  const mNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  let a = ano, m = mes, parts = [];
  for (let i = 0; i < Math.min(qtd, 4); i++) {
    parts.push(mNames[m-1] + '/' + String(a).slice(2));
    m++; if (m > 12) { m = 1; a++; }
  }
  if (qtd > 4) parts.push('...');
  const last = new Date(ano, mes-1 + qtd - 1);
  const lastStr = mNames[last.getMonth()] + '/' + String(last.getFullYear()).slice(2);
  preview.innerHTML = `<strong>${qtd}x</strong> de <strong style="color:var(--accent)">R$ ${val.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong> &nbsp;·&nbsp; ${parts.join(', ')} &nbsp;·&nbsp; até <strong>${lastStr}</strong> &nbsp;·&nbsp; Total: <strong style="color:var(--accent2)">R$ ${(val*qtd).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong>`;
}

async function salvarProvisao() {
  const cat = document.getElementById('pCategoria').value.trim();
  const subCat = document.getElementById('pSubCategoria').value.trim();
  const val = parseFloat(document.getElementById('pValor').value) || 0;
  const qtd = parseInt(document.getElementById('pQtdMeses').value) || 0;
  const mesInicio = document.getElementById('pMesInicio').value;
  const banco = document.getElementById('pBanco')?.value || '';
  if (!cat)    { alert('Selecione uma categoria.'); return; }
  if (!banco)  { alert('Selecione o banco desta provisão.'); return; }
  if (!val)    { alert('Informe o valor mensal.'); return; }
  if (!qtd || qtd < 1) { alert('Informe a quantidade de meses.'); return; }
  if (!mesInicio) { alert('Informe o mês de início.'); return; }

  let provs = loadProvisoes();
  if (_editProvGroupId) provs = provs.filter(p => p.groupId !== _editProvGroupId);

  const [anoInicio, mesI] = mesInicio.split('-').map(Number);
  const groupId = _editProvGroupId || ('prov_' + Date.now());
  let a = anoInicio, m = mesI;
  for (let i = 0; i < qtd; i++) {
    const entry = { id: groupId + '_' + i, groupId, categoria: cat, valor: val, mes: m, ano: a, banco };
    if (subCat) entry.subCategoria = subCat;
    provs.push(entry);
    m++; if (m > 12) { m = 1; a++; }
  }
  saveProvisoes(provs);
  closeProvModal();
  renderAll();
}

// ======== CATEGORIAS ========
const CAT_COLORS = ['#f0c040','#30d080','#f05060','#4090f0','#f090f0','#f09040','#40c0f0','#a0f040','#a040f0','#40f0c0','#f04090','#90f040'];

const DEFAULT_CATS = [
  { id: 'academia',      nome: 'Academia/Esportes',     tipo: 'despesa', cor: '#4af0a0', icone: '🏋️', subs: ['Academia/Esportes'] },
  { id: 'supermercado',  nome: 'Supermercado',          tipo: 'despesa', cor: '#30d080', icone: '🛒', subs: ['Açougue','Feira','Mercado','Padaria','Perfumaria'] },
  { id: 'gastos_var',    nome: 'Gastos Variaveis',      tipo: 'despesa', cor: '#40c0f0', icone: '📦', subs: ['Alimentação','Estética Pessoal','Farmácia','Lazer','Roupas','Uber / Frete','Utensílios Casa'] },
  { id: 'combustivel',   nome: 'Combustível',           tipo: 'despesa', cor: '#f09040', icone: '⛽', subs: ['Combustível'] },
  { id: 'casa',          nome: 'Moradia',               tipo: 'despesa', cor: '#4090f0', icone: '🏠', subs: ['Concessionárias','Gás cozinha','Manutenção Casa','Streaming / Apps','Telefonia'] },
  { id: 'saude',         nome: 'Saude',                 tipo: 'despesa', cor: '#f05060', icone: '💊', subs: ['Consulta Médica','Convênio','Remédio','Vacina'] },
  { id: 'divida',        nome: 'Divida',                tipo: 'despesa', cor: '#f040a0', icone: '⚠️', subs: ['Divida'] },
  { id: 'dividas3',      nome: 'Dividas de terceiros',  tipo: 'despesa', cor: '#f070b0', icone: '👥', subs: ['Dividas de terceiros'] },
  { id: 'carro',         nome: 'Carro',                 tipo: 'despesa', cor: '#90a0f0', icone: '🚗', subs: ['Documento','Financiamento','Mecânica','Seguro'] },
  { id: 'educacao',      nome: 'Educação',              tipo: 'despesa', cor: '#a040f0', icone: '📚', subs: ['Educação','Papelaria','Cursos'] },
  { id: 'tarifas',       nome: 'Tarifas Bancárias',     tipo: 'despesa', cor: '#808090', icone: '🏦', subs: ['Juros','Tarifas Bancárias'] },
  { id: 'investimento',  nome: 'Investimento',          tipo: 'ambos',   cor: '#c0f040', icone: '📈', subs: ['Juros Investimentos'] },
  { id: 'emprestimos',   nome: 'Emprestimos',           tipo: 'despesa', cor: '#f090f0', icone: '💳', subs: ['Emprestimos'] },
  { id: 'salario',       nome: 'Salario',               tipo: 'receita', cor: '#30d080', icone: '💰', subs: ['Salario'] },
  { id: 'rec_diversas',  nome: 'Receita Diversas',      tipo: 'receita', cor: '#40f090', icone: '💵', subs: ['Receita Diversas'] },
  { id: 'entrada3',      nome: 'Entrada Terceiro',      tipo: 'receita', cor: '#40d0b0', icone: '📥', subs: ['Entrada Terceiro'] },
  { id: 'reembolso',     nome: 'Reembolso Convenio',    tipo: 'receita', cor: '#40e080', icone: '🔄', subs: ['Reembolso Convenio'] },
];

const DEFAULT_CATS_VERSION = 3;

const _CATS_TERCEIRO = new Set(['Entrada Terceiro','Dividas de terceiros','Divida de terceiros']);

let selectedCatId = null;
let catTipoAtual = 'despesa';
let catColorAtual = CAT_COLORS[0];
let editCatId = null;
let editSubId = null;

function setCatTipo(t) {
  catTipoAtual = t;
  ['despesa','receita','ambos'].forEach(x => {
    const btn = document.getElementById('cBtn' + x.charAt(0).toUpperCase() + x.slice(1));
    if (btn) btn.className = 'tipo-btn' + (x === t ? (t === 'despesa' ? ' active-despesa' : ' active-receita') : '');
  });
}

async function openCatModal(id) {
  editCatId = id || null;
  const picker = document.getElementById('colorPicker');
  picker.innerHTML = CAT_COLORS.map(c =>
    `<div class="color-swatch${c === catColorAtual ? ' selected' : ''}" style="background:${c}" onclick="selectColor('${c}')" data-color="${c}"></div>`
  ).join('');

  if (editCatId) {
    const cat = (loadCats()).find(c => c.id === editCatId);
    document.getElementById('cNome').value = cat.nome;
    document.getElementById('cIcone').value = cat.icone || '';
    catColorAtual = cat.cor;
    setCatTipo(cat.tipo);
    document.getElementById('catModalTitle').textContent = 'Editar Categoria';
    picker.innerHTML = CAT_COLORS.map(c =>
      `<div class="color-swatch${c === catColorAtual ? ' selected' : ''}" style="background:${c}" onclick="selectColor('${c}')" data-color="${c}"></div>`
    ).join('');
  } else {
    document.getElementById('cNome').value = '';
    document.getElementById('cIcone').value = '';
    catColorAtual = CAT_COLORS[0];
    setCatTipo('despesa');
    document.getElementById('catModalTitle').textContent = 'Nova Categoria';
  }
  document.getElementById('catModalOverlay').classList.add('open');
}
function closeCatModal() { document.getElementById('catModalOverlay').classList.remove('open'); }

function selectColor(c) {
  catColorAtual = c;
  document.querySelectorAll('.color-swatch').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === c);
  });
}

async function salvarCategoria() {
  const nome = document.getElementById('cNome').value.trim();
  if (!nome) return;
  const cats = loadCats();
  if (editCatId) {
    const idx = cats.findIndex(c => c.id === editCatId);
    cats[idx] = { ...cats[idx], nome, tipo: catTipoAtual, cor: catColorAtual, icone: document.getElementById('cIcone').value.trim() };
  } else {
    cats.push({ id: 'cat_' + Date.now(), nome, tipo: catTipoAtual, cor: catColorAtual, icone: document.getElementById('cIcone').value.trim(), subs: [] });
  }
  saveCats(cats);
  closeCatModal();
  renderCatTab();
  populateCatSelects();
}

async function deleteCategoria(id) {
  if (!await _showSimpleConfirm('🗑 Excluir categoria', 'Excluir esta categoria e todas as suas sub-categorias?', 'Excluir', 'var(--red)')) return;
  saveCats((loadCats()).filter(c => c.id !== id));
  if (selectedCatId === id) selectedCatId = null;
  renderCatTab();
  populateCatSelects();
}

async function openSubCatModal(subId) {
  if (!selectedCatId) return;
  editSubId = subId || null;
  document.getElementById('sCatPai').value = (loadCats()).find(c => c.id === selectedCatId)?.nome || '';
  if (editSubId) {
    const cat = (loadCats()).find(c => c.id === selectedCatId);
    const sub = cat.subs.find(s => s.id === editSubId);
    document.getElementById('sNome').value = sub.nome;
    document.getElementById('sDesc').value = sub.desc || '';
    document.getElementById('subCatModalTitle').textContent = 'Editar Sub-Categoria';
  } else {
    document.getElementById('sNome').value = '';
    document.getElementById('sDesc').value = '';
    document.getElementById('subCatModalTitle').textContent = 'Nova Sub-Categoria';
  }
  document.getElementById('subCatModalOverlay').classList.add('open');
}
function closeSubCatModal() { document.getElementById('subCatModalOverlay').classList.remove('open'); }

async function salvarSubCategoria() {
  const nome = document.getElementById('sNome').value.trim();
  if (!nome || !selectedCatId) return;
  const cats = loadCats();
  const catIdx = cats.findIndex(c => c.id === selectedCatId);
  if (editSubId) {
    const subIdx = cats[catIdx].subs.findIndex(s => s.id === editSubId);
    cats[catIdx].subs[subIdx] = { ...cats[catIdx].subs[subIdx], nome, desc: document.getElementById('sDesc').value.trim() };
  } else {
    cats[catIdx].subs.push({ id: 'sub_' + Date.now(), nome, desc: document.getElementById('sDesc').value.trim() });
  }
  saveCats(cats);
  closeSubCatModal();
  renderCatTab();
}

async function deleteSubCategoria(subId) {
  if (!await _showSimpleConfirm('🗑 Excluir sub-categoria', 'Excluir esta sub-categoria?', 'Excluir', 'var(--red)')) return;
  const cats = loadCats();
  const catIdx = cats.findIndex(c => c.id === selectedCatId);
  cats[catIdx].subs = cats[catIdx].subs.filter(s => s.id !== subId);
  saveCats(cats);
  renderCatTab();
}

function selectCat(id) {
  selectedCatId = id;
  renderCatTab();
}

function renderCatTab() {
  const cats = loadCats();
  const listEl = document.getElementById('catList');
  const subListEl = document.getElementById('subCatList');
  const titleEl = document.getElementById('subCatPanelTitle');
  const addSubBtn = document.getElementById('btnAddSub');

  if (!cats.length) {
    listEl.innerHTML = '<div class="empty-state">Nenhuma categoria. Clique em + Nova Categoria.</div>';
  } else {
    listEl.innerHTML = cats.map(c => {
      const tipoLabel = c.tipo === 'despesa' ? 'Despesa' : c.tipo === 'receita' ? 'Receita' : 'Ambos';
      return `<div class="cat-item${selectedCatId === c.id ? ' selected' : ''}" onclick="selectCat('${c.id}')">
        <div class="cat-item-left">
          <div class="cat-dot" style="background:${c.cor}"></div>
          <div>
            <div class="cat-name">${c.icone ? c.icone + ' ' : ''}${c.nome}</div>
            <div class="cat-tipo">${tipoLabel} · ${c.subs.length} sub-cat</div>
          </div>
        </div>
        <div class="cat-actions">
          <span class="cat-sub-count">${c.subs.length}</span>
          <button class="del-btn" onclick="openCatModal('${c.id}');event.stopPropagation()" title="Editar" style="color:var(--accent)">✎</button>
          <button class="del-btn" onclick="deleteCategoria('${c.id}');event.stopPropagation()">✕</button>
        </div>
      </div>`;
    }).join('');
  }

  if (!selectedCatId) {
    subListEl.innerHTML = '<div class="empty-state">Selecione uma categoria à esquerda.</div>';
    titleEl.textContent = 'Sub-Categorias';
    addSubBtn.style.display = 'none';
    return;
  }

  const cat = cats.find(c => c.id === selectedCatId);
  if (!cat) return;
  titleEl.textContent = `Sub-Categorias de "${cat.nome}"`;
  addSubBtn.style.display = 'inline-flex';

  if (!cat.subs.length) {
    subListEl.innerHTML = '<div class="empty-state">Nenhuma sub-categoria. Clique em + Sub-Categoria.</div>';
    return;
  }
  subListEl.innerHTML = cat.subs.map(s => `
    <div class="subcat-item">
      <div>
        <div class="subcat-name" style="color:${cat.cor}">${s.nome}</div>
        ${s.desc ? `<div class="subcat-desc">${s.desc}</div>` : ''}
      </div>
      <div class="cat-actions">
        <button class="del-btn" onclick="openSubCatModal('${s.id}')" title="Editar" style="color:var(--accent)">✎</button>
        <button class="del-btn" onclick="deleteSubCategoria('${s.id}')">✕</button>
      </div>
    </div>`).join('');
}

function _filterCatsByTipo(tipo) {
  const cats = loadCats();
  const fCat = document.getElementById('fCategoria');
  if (!fCat) return;
  const curVal = fCat.value;
  const catsFiltradas = cats
    .filter(c => !tipo || c.tipo === tipo || c.tipo === 'ambos')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const terceiros = window._hideTerceirosInModal
    ? []
    : catsFiltradas.filter(c =>  _CATS_TERCEIRO.has(c.nome));
  const normais   = catsFiltradas.filter(c => !_CATS_TERCEIRO.has(c.nome));

  let html = '<option value="">— Selecione —</option>';
  if (terceiros.length) {
    html += `<option disabled style="color:var(--muted);font-size:0.65rem;letter-spacing:.08em">── TERCEIROS (fora orç.) ──</option>`;
    html += terceiros.map(c => `<option value="${c.nome}" data-terceiro="1" style="color:#f59e0b">${c.icone ? c.icone + ' ' : ''}${c.nome} ⚠️</option>`).join('');
    html += `<option disabled style="color:var(--muted);font-size:0.65rem;letter-spacing:.08em">── CATEGORIAS ──</option>`;
  }
  html += normais.map(c => `<option value="${c.nome}">${c.icone ? c.icone + ' ' : ''}${c.nome}</option>`).join('');
  fCat.innerHTML = html;

  if (catsFiltradas.some(c => c.nome === curVal)) {
    fCat.value = curVal;
  } else {
    fCat.value = '';
    onCatChange();
  }
  const cs = document.getElementById('fCategoriaSearch');
  if (cs) { cs.value = ''; filterCatSelect(); }
}

function populateCatSelects() {
  const cats = loadCats();
  _filterCatsByTipo(tipoAtual);

  const sel = document.getElementById('filtroCategoria');
  const catsSortedAll = [...cats].sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  sel.innerHTML = '<option value="">Todas categorias</option>' + catsSortedAll.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
  onFiltroCategChange(false);

  populatePagSelects();
  if(window.FSEL){ _fselRebuild('filtroCategoria'); }
}

function onCatChange() {
  const catNome = document.getElementById('fCategoria').value;
  const subSel = document.getElementById('fSubCategoria');
  const subSearch = document.getElementById('fSubCatSearch');
  if (subSearch) subSearch.value = '';

  const fCatEl = document.getElementById('fCategoria');
  if (_CATS_TERCEIRO.has(catNome) || (typeof CAT_TERC_SET !== 'undefined' && CAT_TERC_SET.has(catNome))) {
    fCatEl.style.borderColor = 'rgba(245,158,11,0.6)';
    fCatEl.style.color = '#f59e0b';
  } else {
    fCatEl.style.borderColor = '';
    fCatEl.style.color = '';
  }

  if (!catNome) {
    _populateSubcatFromAllCats('', 'fSubCategoria', tipoAtual);
    onCatChangeTerceiro();
    return;
  }

  subSel.innerHTML = '<option value="">— Nenhuma —</option>';
  const cats = loadCats();
  const cat = cats.find(c => c.nome === catNome);
  if (cat && cat.subs.length) {
    const subsSorted = [...cat.subs].map(s => typeof s === 'string' ? s : s.nome).sort((a,b) => a.localeCompare(b, 'pt-BR'));
    subsSorted.forEach(sNome => {
      const opt = document.createElement('option');
      opt.value = sNome; opt.textContent = sNome;
      subSel.appendChild(opt);
    });
  }
  onCatChangeTerceiro();
}

function filterCatSelect() {
  var q = (document.getElementById('fCategoriaSearch').value || '').toLowerCase().trim();
  var sel = document.getElementById('fCategoria');
  var visible = [];
  Array.from(sel.options).forEach(function(opt) {
    if (!opt.value) { opt.style.display = ''; return; }
    var show = opt.textContent.toLowerCase().includes(q);
    opt.style.display = show ? '' : 'none';
    if (show) visible.push(opt.value);
  });
  if (q && visible.length === 1 && sel.value !== visible[0]) {
    sel.value = visible[0];
    onCatChange();
  }
}

function _populateSubcatFromAllCats(q, subSelId, filterType) {
  var cats = loadCats();
  if (filterType) cats = cats.filter(function(c){ return c.tipo === filterType || c.tipo === 'ambos'; });
  var subSel = document.getElementById(subSelId || 'fSubCategoria');
  var blankLabel = subSelId === 'pSubCategoria' ? '— Toda a categoria —' : '— Nenhuma —';
  subSel.innerHTML = '<option value="">' + blankLabel + '</option>';
  var ql = (q || '').toLowerCase();
  cats.sort(function(a,b){ return a.nome.localeCompare(b.nome,'pt-BR'); }).forEach(function(cat) {
    if (!cat.subs || !cat.subs.length) return;
    var matching = cat.subs.map(function(s){ return typeof s === 'string' ? s : s.nome; })
      .filter(function(nome){ return !ql || nome.toLowerCase().includes(ql); })
      .sort(function(a,b){ return a.localeCompare(b,'pt-BR'); });
    if (!matching.length) return;
    var groupOpt = document.createElement('option');
    groupOpt.disabled = true;
    groupOpt.textContent = '── ' + (cat.icone ? cat.icone + ' ' : '') + cat.nome + ' ──';
    groupOpt.style.cssText = 'color:var(--accent);font-size:0.7rem;font-weight:700;letter-spacing:.05em;background:var(--surface2)';
    subSel.appendChild(groupOpt);
    matching.forEach(function(nome) {
      var opt = document.createElement('option');
      opt.value = nome;
      opt.textContent = '  ' + nome;
      opt.dataset.catNome = cat.nome;
      subSel.appendChild(opt);
    });
  });
}

function _findCatBySubNome(subNome) {
  var cats = loadCats();
  for (var i = 0; i < cats.length; i++) {
    var cat = cats[i];
    if (!cat.subs) continue;
    var found = cat.subs.some(function(s){ return (typeof s === 'string' ? s : s.nome) === subNome; });
    if (found) return cat;
  }
  return null;
}

function filterSubCatSelect() {
  var q = (document.getElementById('fSubCatSearch').value || '').toLowerCase().trim();
  var catSel = document.getElementById('fCategoria');
  if (!catSel.value) {
    _populateSubcatFromAllCats(q, 'fSubCategoria', tipoAtual);
    return;
  }
  var sel = document.getElementById('fSubCategoria');
  Array.from(sel.options).forEach(function(opt) {
    if (!opt.value) { opt.style.display = ''; return; }
    opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function onSubCatChange() {
  var subSel = document.getElementById('fSubCategoria');
  var subVal = subSel.value;
  if (!subVal) return;
  var catSel = document.getElementById('fCategoria');
  var selectedOpt = subSel.options[subSel.selectedIndex];
  var catNome = (selectedOpt && selectedOpt.dataset && selectedOpt.dataset.catNome) || '';
  if (!catNome) {
    var catFound = _findCatBySubNome(subVal);
    if (catFound) catNome = catFound.nome;
  }
  if (catNome && catSel.value !== catNome) {
    catSel.value = catNome;
    onCatChange();
    document.getElementById('fSubCategoria').value = subVal;
    document.getElementById('fSubCatSearch').value = '';
  }
}

function filterProvSubCatSelect() {
  var q = (document.getElementById('pSubCatSearch').value || '').toLowerCase().trim();
  var catSel = document.getElementById('pCategoria');
  if (!catSel.value) {
    _populateSubcatFromAllCats(q, 'pSubCategoria', null);
    return;
  }
  var sel = document.getElementById('pSubCategoria');
  Array.from(sel.options).forEach(function(opt) {
    if (!opt.value) { opt.style.display = ''; return; }
    opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function onProvSubCatChange() {
  var subSel = document.getElementById('pSubCategoria');
  var subVal = subSel.value;
  if (!subVal) return;
  var catSel = document.getElementById('pCategoria');
  var selectedOpt = subSel.options[subSel.selectedIndex];
  var catNome = (selectedOpt && selectedOpt.dataset && selectedOpt.dataset.catNome) || '';
  if (!catNome) {
    var catFound = _findCatBySubNome(subVal);
    if (catFound) catNome = catFound.nome;
  }
  if (catNome && catSel.value !== catNome) {
    catSel.value = catNome;
    updateProvSubcatSelect(subVal);
    document.getElementById('pSubCatSearch').value = '';
  }
}

function onFiltroCategChange(doRender) {
  var catVals = window.FSEL ? FSEL.getValues('filtroCategoria') : [];
  var subSel = document.getElementById('filtroSubCategoria');
  if (!subSel) return;
  subSel.innerHTML = '<option value="">Todas sub-cat</option>';

  const allData = loadDataBanco();

  if (catVals.length === 0) {
    var allSubs = [...new Set(allData.filter(function(l){ return l.subCategoria; }).map(function(l){
      return JSON.stringify({ sub: l.subCategoria, cat: l.categoria });
    }))].map(function(s){ return JSON.parse(s); }).sort(function(a,b){ return a.sub.localeCompare(b.sub,'pt-BR'); });
    allSubs.forEach(function(item) {
      var opt = document.createElement('option');
      opt.value = item.sub; opt.textContent = item.sub; opt.dataset.catNome = item.cat;
      subSel.appendChild(opt);
    });
  } else if (catVals.length === 1) {
    var catNome = catVals[0];
    var subs = [...new Set(allData.filter(function(l){ return l.categoria === catNome && l.subCategoria; }).map(function(l){ return l.subCategoria; }))].sort();
    subs.forEach(function(s) { var opt = document.createElement('option'); opt.value = s; opt.textContent = s; subSel.appendChild(opt); });
  } else {
    var subs2 = [...new Set(allData.filter(function(l){ return catVals.includes(l.categoria) && l.subCategoria; }).map(function(l){ return l.subCategoria; }))].sort();
    subs2.forEach(function(s) { var opt = document.createElement('option'); opt.value = s; opt.textContent = s; subSel.appendChild(opt); });
  }

  if (window.FSEL) FSEL.reset('filtroSubCategoria');
  if (doRender !== false) renderAll();
  if (window.FSEL) _fselRebuild('filtroSubCategoria');
}

function onFiltroSubCatChange() {
  var subSel = document.getElementById('filtroSubCategoria');
  var catSel = document.getElementById('filtroCategoria');
  if (!subSel || !catSel) return;
  var subVals = window.FSEL ? FSEL.getValues('filtroSubCategoria') : [subSel.value].filter(Boolean);
  if (!subVals.length) { renderAll(); return; }
  var catVals = window.FSEL ? FSEL.getValues('filtroCategoria') : [catSel.value].filter(Boolean);
  var catsToAdd = [];
  for (const subVal of subVals) {
    var opt = Array.from(subSel.options).find(function(o){ return o.value === subVal; });
    var catNome = (opt && opt.dataset && opt.dataset.catNome) || '';
    if (!catNome) {
      var catFound = _findCatBySubNome(subVal);
      if (catFound) catNome = catFound.nome;
    }
    if (catNome && !catVals.includes(catNome)) catsToAdd.push(catNome);
  }
  if (catsToAdd.length > 0) {
    var newCatVals = [...new Set([...catVals, ...catsToAdd])];
    if (window.FSEL) {
      newCatVals.forEach(function(c) {
        Array.from(catSel.options).forEach(function(o){ if (o.value === c) o.selected = true; });
      });
      _fselRebuild('filtroCategoria');
    } else {
      catSel.value = newCatVals[0];
    }
    var subSelEl = document.getElementById('filtroSubCategoria');
    var savedSubVals = subVals;
    onFiltroCategChange(false);
    if (window.FSEL) {
      savedSubVals.forEach(function(sv) {
        Array.from(subSelEl.options).forEach(function(o){ if (o.value === sv) o.selected = true; });
      });
      _fselRebuild('filtroSubCategoria');
    }
  }
  renderAll();
}

function fmt(v) {
  return 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}