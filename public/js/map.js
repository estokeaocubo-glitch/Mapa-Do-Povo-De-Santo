// Motor de mapa: Leaflet + OpenStreetMap (tiles escuros da CARTO).
//
// SEGURANÇA GEOGRÁFICA NO FRONT-END:
//  • 'Exato'      → pino (L.marker) na coordenada pública (= real).
//  • 'Aproximado' → coordenada JÁ OFUSCADA pelo servidor. Com o mapa afastado
//    (zoom < 13) vira um pino "vazado", agrupado com os outros; de perto, um
//    círculo de 500 m. O navegador nunca recebe a coordenada real.
import { CENTRO_PETROPOLIS, CHAVE_CARTO, SEGMENTOS, segmentoDe } from './constants.js';
import { temaEfetivo } from './tema.js';
import { esc } from './utils.js';

const ZOOM_AREA = 13;   // a partir daqui, área aproximada aparece como círculo

let mapa;
let cluster;
let camadaAreas;
let marcadorUsuario = null;
let camadaDistritos = null;
const camadas = new Map(); // id → { tipo, casa, pino, circulo }
let ativoId = null;
const menosMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function criarMapa(elementoId, { aoSelecionar, aoMover }) {
  mapa = L.map(elementoId, {
    center: CENTRO_PETROPOLIS,
    zoom: 11,
    minZoom: 9,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: true,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(mapa);

  const blocos = L.tileLayer(urlBlocos(), {
    ...OPCOES_BLOCOS,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(mapa);
  window.addEventListener('tema:mudou', () => blocos.setUrl(urlBlocos()));

  cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    iconCreateFunction: (c) => {
      const n = c.getChildCount();
      const tam = n < 10 ? 38 : 46;
      return L.divIcon({ html: `<span>${n}</span>`, className: 'marker-cluster-custom', iconSize: [tam, tam] });
    },
  });
  camadaAreas = L.layerGroup();
  mapa.addLayer(cluster);

  carregarDistritos();
  mapa._aoSelecionar = aoSelecionar;
  mapa.on('zoomend', alternarAproximadas);
  if (aoMover) mapa.on('moveend', () => aoMover());
  return mapa;
}

// Blocos claros ou escuros da CARTO, conforme o tema (com a chave da conta).
export const urlBlocos = () =>
  `https://{s}.basemaps.cartocdn.com/${temaEfetivo() === 'claro' ? 'light_all' : 'dark_all'}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CHAVE_CARTO)}`;

// Opções comuns aos mapas do site. referrerPolicy 'origin': só nos blocos, a
// CARTO recebe o domínio do site (para conferir a restrição da chave), nunca o
// caminho — /casa/<slug> continua sem vazar. O resto do site segue no-referrer.
export const OPCOES_BLOCOS = { subdomains: 'abcd', maxZoom: 19, referrerPolicy: 'origin' };

function iconePino(casa, { ativo = false, aproximado = false } = {}) {
  const seg = SEGMENTOS[segmentoDe(casa)];
  return L.divIcon({
    className: '',
    html: `<div class="pino${ativo ? ' ativo' : ''}${aproximado ? ' aproximado' : ''}" style="--cor:${seg.cor};${seg.anel ? `--anel:${seg.anel}` : ''}">
             <span class="pino-gota"></span><span class="pino-letra" aria-hidden="true">${esc(seg.letra)}</span></div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 35],
    tooltipAnchor: [0, -30],
  });
}

// Afastado: pinos vazados dentro do agrupamento. Perto: círculos de 500 m.
function alternarAproximadas() {
  const perto = mapa.getZoom() >= ZOOM_AREA;
  const pinos = [...camadas.values()].filter((i) => i.tipo === 'area').map((i) => i.pino);
  if (perto) {
    cluster.removeLayers(pinos.filter((p) => cluster.hasLayer(p)));
    if (!mapa.hasLayer(camadaAreas)) mapa.addLayer(camadaAreas);
  } else {
    if (mapa.hasLayer(camadaAreas)) mapa.removeLayer(camadaAreas);
    cluster.addLayers(pinos.filter((p) => !cluster.hasLayer(p)));
  }
}

function tornarAcessivel(circulo, casa) {
  const el = circulo.getElement();
  if (!el || el.dataset.acessivel) return;
  el.dataset.acessivel = '1';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `${casa.nome_casa} — área aproximada em ${casa.bairro}`);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      mapa._aoSelecionar(casa.id);
    }
  });
}

export function renderizarCasas(casas) {
  cluster.clearLayers();
  camadaAreas.clearLayers();
  camadas.clear();

  for (const casa of casas) {
    const { lat, lng, tipo, raio_m } = casa.localizacao;
    const seg = SEGMENTOS[segmentoDe(casa)];
    const item = { tipo, casa };
    const dica = `${esc(casa.nome_casa)}${tipo === 'area' ? ` · <span style="font-weight:400;opacity:.75">${esc(casa.bairro)} (área aproximada)</span>` : ''}`;

    item.pino = L.marker([lat, lng], {
      icon: iconePino(casa, { aproximado: tipo === 'area' }), title: casa.nome_casa, riseOnHover: true, keyboard: true,
    }).bindTooltip(dica, { className: 'tooltip-casa', direction: 'top' }).on('click', () => mapa._aoSelecionar(casa.id));

    if (tipo === 'area') {
      // Área aproximada: círculo translúcido em vez de pino cravado.
      item.circulo = L.circle([lat, lng], {
        radius: raio_m, color: seg.cor, weight: 2, dashArray: '6 6', fillColor: seg.cor, fillOpacity: 0.18,
      }).bindTooltip(dica, { className: 'tooltip-casa', direction: 'top', sticky: true })
        .on('click', () => mapa._aoSelecionar(casa.id))
        .on('add', () => tornarAcessivel(item.circulo, casa));
      camadaAreas.addLayer(item.circulo);
    } else {
      cluster.addLayer(item.pino);
    }
    camadas.set(casa.id, item);
  }
  alternarAproximadas();
}

export function enquadrar(casas) {
  if (!casas.length) return;
  const limites = L.latLngBounds(casas.map((c) => [c.localizacao.lat, c.localizacao.lng]));
  mapa.fitBounds(limites.pad(0.15), { maxZoom: 14, animate: !menosMovimento() });
}

export function focarCasa(id, { deslocarPara = null, zoom: zoomPedido } = {}) {
  const item = camadas.get(id);
  if (!item) return;
  marcarAtivo(id);
  const { lat, lng } = item.casa.localizacao;
  const zoom = zoomPedido ?? (item.tipo === 'area' ? 15 : 16);

  // Compensa o espaço ocupado pelo drawer/bottom sheet para o alvo ficar visível.
  const alvo = mapa.project([lat, lng], zoom);
  if (deslocarPara === 'esquerda') alvo.x += 200;
  if (deslocarPara === 'cima') alvo.y += mapa.getSize().y * 0.25;
  // Respeita quem pede menos movimento no sistema operacional.
  if (menosMovimento()) mapa.setView(mapa.unproject(alvo, zoom), zoom, { animate: false });
  else mapa.flyTo(mapa.unproject(alvo, zoom), zoom, { duration: 0.8 });
}

export function marcarAtivo(id) {
  if (ativoId && camadas.has(ativoId)) estilizar(camadas.get(ativoId), false);
  ativoId = id;
  if (id && camadas.has(id)) estilizar(camadas.get(id), true);
}

function estilizar(item, ativo) {
  item.pino.setIcon(iconePino(item.casa, { ativo, aproximado: item.tipo === 'area' }));
  item.circulo?.setStyle({ weight: ativo ? 3 : 2, fillOpacity: ativo ? 0.3 : 0.18, dashArray: ativo ? null : '6 6' });
}

// Limites dos 5 distritos (IBGE), se o arquivo já foi gerado por `npm run distritos`.
async function carregarDistritos() {
  try {
    const geo = await (await fetch('/data/distritos.geojson')).json();
    if (!geo.features?.length) return;
    camadaDistritos = L.geoJSON(geo, {
      interactive: false,
      style: { color: '#D4AF37', weight: 1.2, opacity: 0.45, dashArray: '4 6', fill: true, fillOpacity: 0 },
    }).addTo(mapa);
    camadaDistritos.bringToBack();
  } catch { /* sem limites: o mapa funciona normalmente */ }
}

// Destaca o distrito escolhido no filtro (e enquadra o mapa nele).
export function destacarDistrito(nome) {
  if (!camadaDistritos) return false;
  let alvo = null;
  camadaDistritos.eachLayer((l) => {
    const ativo = nome && l.feature.properties.distrito === nome;
    l.setStyle(ativo ? { weight: 2.5, opacity: 0.9, dashArray: null, fillColor: '#D4AF37', fillOpacity: 0.06 } : { weight: 1.2, opacity: nome ? 0.2 : 0.45, dashArray: '4 6', fillOpacity: 0 });
    if (ativo) alvo = l;
  });
  if (alvo) mapa.fitBounds(alvo.getBounds(), { padding: [30, 30], animate: !menosMovimento() });
  return Boolean(alvo);
}

// Centro e área visível do mapa (para ordenar a lista e filtrar "nesta área").
export const centroDoMapa = () => mapa.getCenter();
export const estaVisivel = (casa) => mapa.getBounds().pad(-0.02).contains([casa.localizacao.lat, casa.localizacao.lng]);

// "Perto de mim": a posição fica só no navegador, nunca vai ao servidor.
export function mostrarUsuario(lat, lng) {
  marcadorUsuario?.remove();
  marcadorUsuario = L.circleMarker([lat, lng], {
    radius: 8, color: '#F5F5F0', weight: 3, fillColor: '#5B8DEF', fillOpacity: 1, interactive: false,
  }).addTo(mapa);
  mapa.setView([lat, lng], Math.max(mapa.getZoom(), 13), { animate: !menosMovimento() });
}

export function invalidar() {
  mapa?.invalidateSize();
}
