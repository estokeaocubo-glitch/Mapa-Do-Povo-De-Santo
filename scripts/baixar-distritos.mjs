// Baixa do IBGE os limites oficiais dos 5 distritos de Petrópolis (código
// 3303906) e grava public/data/distritos.geojson, usado pelo mapa.
// Uso: npm run distritos   (precisa de acesso a servicodados.ibge.gov.br)
import { writeFile } from 'node:fs/promises';
import { DISTRITOS } from '../public/js/dominio.js';

const MUNICIPIO = '3303906';
const base = 'https://servicodados.ibge.gov.br/api';
const [malha, distritos] = await Promise.all([
  fetch(`${base}/v3/malhas/municipios/${MUNICIPIO}?intrarregiao=distrito&formato=application/vnd.geo%2Bjson&qualidade=intermediaria`).then((r) => r.json()),
  fetch(`${base}/v1/localidades/municipios/${MUNICIPIO}/distritos`).then((r) => r.json()),
]);

const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nomePorCodigo = new Map(distritos.map((d) => [String(d.id), d.nome]));
const arredondar = (c) => (typeof c[0] === 'number' ? [Number(c[0].toFixed(5)), Number(c[1].toFixed(5))] : c.map(arredondar));

const features = malha.features.map((f) => {
  const nome = nomePorCodigo.get(String(f.properties.codarea)) || f.properties.codarea;
  const rotulo = DISTRITOS.find((d) => normalizar(d).includes(normalizar(nome))) || nome;
  return { type: 'Feature', properties: { nome, distrito: rotulo }, geometry: { ...f.geometry, coordinates: arredondar(f.geometry.coordinates) } };
});
await writeFile(new URL('../public/data/distritos.geojson', import.meta.url),
  JSON.stringify({ type: 'FeatureCollection', fonte: 'IBGE — Malhas territoriais', features }));
console.log(`✔ ${features.length} distritos gravados em public/data/distritos.geojson`);
