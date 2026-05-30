// ======== SSEL — SINGLE SEARCHABLE SELECT ========
// Envolve um <select> nativo (escondido) e adiciona busca por texto.
// O <select> original continua sendo a fonte da verdade: .value, .options,
// onchange e repopulação via innerHTML seguem funcionando. Após repopular o
// <select> por fora, chame SSEL.refresh(selId) para re-sincronizar o visual.
(function(){
  var _active = null;        // selId aberto
  var _instances = {};       // selId -> true

  // CSS próprio (clonado do .fsel em css/main.css) — auto-contido para não
  // depender de classes externas.
  (function injectCSS(){
    if(document.getElementById('ssel-css')) return;
    var st = document.createElement('style');
    st.id = 'ssel-css';
    st.textContent =
      '.ssel{position:relative;display:inline-block;min-width:0;}'+
      '.ssel-input{background:var(--surface);border:1px solid var(--border);color:var(--text);padding:5px 26px 5px 10px;border-radius:6px;font-size:0.8rem;cursor:pointer;width:100%;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
      '.ssel-input:focus,.ssel-input:hover{border-color:rgba(0,255,136,0.4);}'+
      '.ssel-arrow{position:absolute;right:9px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:0.6rem;color:var(--muted);}'+
      '.ssel-drop{position:fixed;display:none;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,0.5);z-index:999999;overflow:hidden;}'+
      '.ssel-drop.open{display:block;}'+
      '.ssel-search{width:calc(100% - 16px);margin:8px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:0.78rem;outline:none;box-sizing:border-box;}'+
      '.ssel-search:focus{border-color:rgba(0,255,136,0.4);}'+
      '.ssel-list{max-height:220px;overflow-y:scroll;padding:4px 0;}'+
      '.ssel-list::-webkit-scrollbar{width:4px;}'+
      '.ssel-list::-webkit-scrollbar-track{background:var(--surface);}'+
      '.ssel-list::-webkit-scrollbar-thumb{background:rgba(0,255,136,0.4);border-radius:4px;}'+
      '.ssel-opt{display:flex;align-items:center;gap:8px;padding:7px 13px;font-size:0.79rem;color:var(--text2);cursor:pointer;white-space:nowrap;user-select:none;}'+
      '.ssel-opt:hover{background:rgba(0,255,136,0.08);color:var(--text);}'+
      '.ssel-opt.sel{color:var(--accent);background:rgba(0,255,136,0.06);}'+
      '.ssel-empty{padding:9px 14px;font-size:0.75rem;color:var(--muted);font-style:italic;display:none;}';
    document.head.appendChild(st);
  })();

  function _close(){
    if(_active){
      var drop = document.getElementById('ssd-'+_active);
      if(drop) drop.classList.remove('open');
      _active = null;
    }
  }

  function _selText(sel){
    var o = sel.options[sel.selectedIndex];
    return o ? o.text : '';
  }

  function _syncLabel(selId){
    var sel = document.getElementById(selId);
    var inp = document.getElementById('ssi-'+selId);
    if(sel && inp){ inp.value = _selText(sel); inp.title = _selText(sel); }
  }

  function _buildList(selId){
    var sel  = document.getElementById(selId);
    var list = document.getElementById('ssl-'+selId);
    if(!sel || !list) return;
    var html = '';
    Array.from(sel.options).forEach(function(o, i){
      var txt = (o.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
      html += '<div class="ssel-opt'+(i===sel.selectedIndex?' sel':'')+'" data-idx="'+i+'">'+txt+'</div>';
    });
    html += '<div class="ssel-empty" id="sse-'+selId+'">Nenhum resultado</div>';
    list.innerHTML = html;
    list.querySelectorAll('.ssel-opt').forEach(function(d){
      d.addEventListener('click', function(e){
        e.stopPropagation();
        var sel2 = document.getElementById(selId);
        if(!sel2) return;
        sel2.selectedIndex = parseInt(this.getAttribute('data-idx'), 10);
        sel2.dispatchEvent(new Event('change', {bubbles:true}));
        _syncLabel(selId);
        _close();
      });
    });
  }

  function _filter(selId, q){
    var list  = document.getElementById('ssl-'+selId);
    var empty = document.getElementById('sse-'+selId);
    if(!list) return;
    var lo = (q||'').toLowerCase(), none = true;
    list.querySelectorAll('.ssel-opt').forEach(function(d){
      var m = d.textContent.toLowerCase().indexOf(lo) !== -1;
      d.style.display = m ? '' : 'none';
      if(m) none = false;
    });
    if(empty) empty.style.display = none ? 'block' : 'none';
  }

  function _open(selId){
    _close();
    var wrap = document.getElementById('ssel-'+selId);
    var drop = document.getElementById('ssd-'+selId);
    var srch = document.getElementById('sss-'+selId);
    if(!wrap || !drop) return;
    _buildList(selId); // reflete as opções/seleção atuais
    var rect = wrap.getBoundingClientRect();
    var isMobile = window.innerWidth <= 768;
    if(isMobile){
      var dropW = Math.min(window.innerWidth - 16, 360);
      var leftPos = Math.max(8, Math.min(rect.left, window.innerWidth - dropW - 8));
      drop.style.left = leftPos + 'px';
      drop.style.minWidth = dropW + 'px';
      drop.style.maxWidth = dropW + 'px';
    } else {
      drop.style.left = rect.left + 'px';
      drop.style.minWidth = Math.max(rect.width, 180) + 'px';
      drop.style.maxWidth = '320px';
    }
    var spaceBelow = window.innerHeight - rect.bottom;
    if(spaceBelow >= 260 || spaceBelow >= rect.top){
      drop.style.top = (rect.bottom + 4) + 'px';
      drop.style.bottom = 'auto';
    } else {
      drop.style.top = 'auto';
      drop.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    }
    drop.classList.add('open');
    _active = selId;
    if(srch){ srch.value = ''; if(!isMobile) srch.focus(); }
    _filter(selId, '');
  }

  window.SSEL = {
    // Constrói o wrapper a partir de um <select> já existente no DOM.
    build: function(selId){
      var sel = document.getElementById(selId);
      if(!sel) return;
      if(document.getElementById('ssel-'+selId)){ this.refresh(selId); return; }
      sel.style.display = 'none';
      sel.setAttribute('data-ssel', '1');
      var wrap = document.createElement('div');
      wrap.className = 'ssel';
      wrap.id = 'ssel-' + selId;
      // herda min-width inline do select original, se houver
      var mw = sel.style.minWidth;
      if(mw) wrap.style.minWidth = mw;
      wrap.innerHTML =
        '<input readonly class="ssel-input" id="ssi-'+selId+'" placeholder="Selecione...">'+
        '<span class="ssel-arrow">▾</span>'+
        '<div class="ssel-drop" id="ssd-'+selId+'">'+
          '<input class="ssel-search" id="sss-'+selId+'" placeholder="🔍 Buscar..." autocomplete="off">'+
          '<div class="ssel-list" id="ssl-'+selId+'"></div>'+
        '</div>';
      sel.parentNode.insertBefore(wrap, sel.nextSibling);
      _instances[selId] = true;
      _syncLabel(selId);
      _buildList(selId);
      wrap.querySelector('.ssel-input').addEventListener('click', function(e){
        e.stopPropagation();
        if(_active === selId){ _close(); return; }
        _open(selId);
      });
      var srch = document.getElementById('sss-'+selId);
      if(srch) srch.addEventListener('input', function(){ _filter(selId, this.value); });
      var drop = document.getElementById('ssd-'+selId);
      drop.addEventListener('click', function(e){ e.stopPropagation(); });
      drop.addEventListener('wheel', function(e){ e.stopPropagation(); }, {passive:true});
      drop.addEventListener('touchmove', function(e){ e.stopPropagation(); }, {passive:true});
    },

    // Re-sincroniza o visual após o <select> nativo ter sido repopulado/alterado.
    refresh: function(selId){
      if(!_instances[selId]){ this.build(selId); return; }
      _syncLabel(selId);
      _buildList(selId);
    }
  };

  document.addEventListener('click', _close);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') _close(); });
  window.addEventListener('resize', _close);
})();
// ======== SSEL END ========
