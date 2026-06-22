// Service Worker do Mes Redondo
// Estratégia: network-first com fallback pro cache. Permite uso offline
// preservando dados em cache, mas sempre tenta buscar versão fresca antes.

const CACHE_NAME = 'mesredondo-v25';
const ASSETS = [
  './',
  './index.html',
  './logo.png',
  './css/main.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Não cacheia chamadas externas (Supabase, CDNs, etc.) — só same-origin
  if (url.origin !== self.location.origin) return;

  // 'no-cache' força revalidação com o servidor (via ETag/304) em vez de
  // servir cópia do HTTP cache do browser — evita HTML/JS velhos dentro do
  // max-age=600 do GitHub Pages, que travava deploys novos.
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        // Cacheia versão fresca pra fallback offline
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => null);
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
