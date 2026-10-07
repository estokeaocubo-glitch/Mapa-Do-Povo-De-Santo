// Motor de mapa: Leaflet + OpenStreetMap (tiles escuros da CARTO).
//
// SEGURANÇA GEOGRÁFICA NO FRONT-END:
//  • 'Exato'      → pino (L.marker) na coordenada pública (= real).
//  • 'Aproximado' → círculo de 500 m (L.circle) centrado na coordenada JÁ
//    OFUSCADA pelo servidor. O navegador nunca recebe a coordenada real,
//    então não há o que "descobrir" inspecionando a página.
//  • Mesmo no zoom máximo, a área aproximada continua sendo só um círculo.
import { CENTRO_PETROPOLIS, SEGMENTOS, segmentoDe } from './constants.js';
import { esc } from './utils.js';

let mapa;
let cluster;
let camadaAreas;
const camadas = new Map(); // id → { camada, tipo }
let ativoId = null;

export function criarMapa(elementoId, { aoSelecionar }) {
  mapa = L.map(elementoId, {
    center: CENTRO_PETROPOLIS,
    zoom: 11,
    minZoom: 9,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: true,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(mapa);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(mapa);

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
  mapa.addLayer(camadaAreas);
  mapa.addLayer(cluster);

  mapa._aoSelecionar = aoSelecionar;
  return mapa;
}

function iconePino(casa, ativo = false) {
  const seg = SEGMENTOS[segmentoDe(casa)];
  return L.divIcon({
    className: '',
    html: `<div class="pino${ativo ? ' ativo' : ''}" style="--cor:${seg.cor};${seg.anel ? `--anel:${seg.anel}` : ''}">
             <span class="pino-gota"></span><span class="pino-letra" aria-hidden="true">${esc(seg.letra)}</span></div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 35],
    tooltipAnchor: [0, -30],
  });
}

export function renderizarCasas(casas) {
  cluster.clearLayers();
  camadaAreas.clearLayers();
  camadas.clear();

  for (const casa of casas) {
    const { lat, lng, tipo, raio_m } = casa.localizacao;
    const seg = SEGMENTOS[segmentoDe(casa)];
    let camada;

    if (tipo === 'area') {
      // Área aproximada: círculo translúcido em vez de pino cravado.
      camada = L.circle([lat, lng], {
        radius: raio_m,
        color: seg.cor,
        weight: 2,
        dashArray: '6 6',
        fillColor: seg.cor,
        fillOpacity: 0.18,
      });
      camadaAreas.addLayer(camada);
    } else {
      camada = L.marker([lat, lng], { icon: iconePino(casa), title: casa.nome_casa, riseOnHover: true, keyboard: true });
      cluster.addLayer(camada);
    }

    camada.bindTooltip(
      `${esc(casa.nome_casa)}${tipo === 'area' ? ` · <span style="font-weight:400;opacity:.75">${esc(casa.bairro)} (área aproximada)</span>` : ''}`,
      { className: 'tooltip-casa', direction: 'top', sticky: tipo === 'area' },
    );
    camada.on('click', () => mapa._aoSelecionar(casa.id));
    camadas.set(casa.id, { camada, tipo, casa });
  }
}

export function enquadrar(casas) {
  if (!casas.length) return;
  const limites = L.latLngBounds(casas.map((c) => [c.localizacao.lat, c.localizacao.lng]));
  mapa.fitBounds(limites.pad(0.15), { maxZoom: 14, animate: true });
}

export function focarCasa(id, { deslocarPara = null } = {}) {
  const item = camadas.get(id);
  if (!item) return;
  marcarAtivo(id);
  const { lat, lng } = item.casa.localizacao;
  const zoom = item.tipo === 'area' ? 15 : 16;

  // Compensa o espaço ocupado pelo drawer/bottom sheet para o alvo ficar visível.
  const alvo = mapa.project([lat, lng], zoom);
  if (deslocarPara === 'esquerda') alvo.x += 200;
  if (deslocarPara === 'cima') alvo.y += mapa.getSize().y * 0.25;
  mapa.flyTo(mapa.unproject(alvo, zoom), zoom, { duration: 0.8 });
}

export function marcarAtivo(id) {
  if (ativoId && camadas.has(ativoId)) estilizar(camadas.get(ativoId), false);
  ativoId = id;
  if (id && camadas.has(id)) estilizar(camadas.get(id), true);
}

function estilizar(item, ativo) {
  if (item.tipo === 'area') {
    item.camada.setStyle({ weight: ativo ? 3 : 2, fillOpacity: ativo ? 0.3 : 0.18, dashArray: ativo ? null : '6 6' });
  } else {
    item.camada.setIcon(iconePino(item.casa, ativo));
  }
}

export function invalidar() {
  mapa?.invalidateSize();
}
