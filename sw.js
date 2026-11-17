/* Service worker: guarda os apps no aparelho para funcionar offline.
 * Ao alterar qualquer arquivo do app, incremente CACHE para forçar a atualização. */
const CACHE = 'ferramentas-v5';
const ARQUIVOS = [
  './',
  './index.html',
  './ar-condicionado.html',
  './css/style.css',
  './css/ar.css',
  './js/calc.js',
  './js/app.js',
  './js/thermal.js',
  './js/placement.js',
  './js/room3d.js',
  './js/planta.js',
  './js/ar-app.js',
  './vendor/three.module.min.js',
  './vendor/OrbitControls.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (pega atualizações quando online), cache como reserva offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
