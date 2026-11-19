// Service worker: o site continua abrindo com sinal fraco ou sem internet
// (ex.: áreas rurais de Pedro do Rio e Posse).
//  • Arquivos do site: entregues do cache e atualizados em segundo plano.
//  • Lista de casas e censo: rede primeiro; sem rede, a última versão salva.
//  • Blocos do mapa já vistos: guardados (até 400) para rever sem internet.
//  • Nada privado é guardado: só respostas públicas (GET). Desbloqueio,
//    moderação e "minha casa" são POST/autenticados e nunca passam pelo cache.
const VERSAO = 'mps-v3';
const SITE = `${VERSAO}-site`;
const DADOS = `${VERSAO}-dados`;
const MAPA = `${VERSAO}-mapa`;
const ESSENCIAIS = [
  '/', '/app.js', '/assets/app.css', '/vendor/fonts/fonts.css', '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css',
  '/vendor/markercluster/leaflet.markercluster.js', '/vendor/markercluster/MarkerCluster.css', '/vendor/lucide/lucide.min.js',
  '/js/api.js', '/js/cadastro.js', '/js/censo.js', '/js/constants.js', '/js/detalhe.js', '/js/dominio.js', '/js/giras.js',
  '/js/map.js', '/js/minha-casa.js', '/js/tema.js', '/js/tema-inicial.js', '/js/utils.js', '/js/validacao.js', '/favicon.svg', '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SITE).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((chaves) => Promise.all(chaves.filter((k) => !k.startsWith(VERSAO)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function limitar(nome, maximo) {
  const cache = await caches.open(nome);
  const chaves = await cache.keys();
  for (const k of chaves.slice(0, Math.max(0, chaves.length - maximo))) await cache.delete(k);
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Blocos do mapa (CARTO): cache primeiro.
  if (url.hostname.endsWith('basemaps.cartocdn.com')) {
    e.respondWith(caches.open(MAPA).then(async (cache) => {
      const salvo = await cache.match(request);
      if (salvo) return salvo;
      const resp = await fetch(request);
      cache.put(request, resp.clone()).then(() => limitar(MAPA, 400));
      return resp;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Dados públicos: rede primeiro, cache como reserva.
  if (url.pathname === '/api/terreiros' || url.pathname === '/api/estatisticas') {
    e.respondWith(fetch(request).then((resp) => {
      if (resp.ok) caches.open(DADOS).then((c) => c.put(request, resp.clone()));
      return resp.clone();
    }).catch(() => caches.match(request)));
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  // Páginas: rede primeiro; sem rede, a página inicial salva (inclusive /casa/<slug>).
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(async () => (await caches.match(request)) || caches.match('/')));
    return;
  }

  // Arquivos do site: cache e atualização em segundo plano.
  e.respondWith(caches.open(SITE).then(async (cache) => {
    const salvo = await cache.match(request);
    const rede = fetch(request).then((resp) => { if (resp.ok) cache.put(request, resp.clone()); return resp; }).catch(() => salvo);
    return salvo || rede;
  }));
});
