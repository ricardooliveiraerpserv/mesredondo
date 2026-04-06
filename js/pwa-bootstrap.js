  (function() {
    // Usa logo.png como ícone — carrega via Image e desenha no canvas
    function makeIcon(size) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var ctx = c.getContext('2d');
      // Retorna PNG do logo.png já carregado (ou data URL vazio se não carregou)
      if (window._logoImg && window._logoImg.complete) {
        ctx.drawImage(window._logoImg, 0, 0, size, size);
      } else {
        // Fallback simples enquanto carrega
        ctx.fillStyle = '#0D1E3E';
        ctx.beginPath(); ctx.arc(size/2,size/2,size/2,0,Math.PI*2); ctx.fill();
      }
      return c.toDataURL('image/png');
    }
    // Pré-carrega a imagem do logo
    if (!window._logoImg) {
      window._logoImg = new Image();
      window._logoImg.src = 'logo.png';
    }

    var icon = makeIcon(512);
    var iconSmall = makeIcon(192);

    // Apple touch icon
    var iconLink = document.getElementById('pwa-icon-link');
    if (iconLink) iconLink.href = icon;
    var favLink = document.getElementById('pwa-favicon-link');
    if (favLink) { favLink.type = 'image/png'; favLink.href = makeIcon(64); }

    // Manifest (sem service worker — blob URL quebra Safari)
    var manifest = {
      name: 'Mês Redondo',
      short_name: 'Mês Redondo',
      description: 'Controle financeiro pessoal',
      start_url: './',
      display: 'standalone',
      background_color: '#0f1117',
      theme_color: '#0f1117',
      orientation: 'portrait',
      icons: [
        { src: iconSmall, sizes: '192x192', type: 'image/png' },
        { src: icon,      sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    };
    try {
      var mLink = document.getElementById('pwa-manifest-link');
      if (mLink) {
        // Usa data: URL em vez de blob: para evitar erro "blob:null" em contextos restritos
        // (GitHub Pages, iframes, Service Worker ativando) onde URL.createObjectURL
        // gera blob:null/... que o browser bloqueia
        var encoded = encodeURIComponent(JSON.stringify(manifest));
        mLink.href = 'data:application/json,' + encoded;
      }
    } catch(e) {}
  })();
