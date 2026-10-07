// Converte um arquivo JSON de casas em SQL para o D1, calculando AQUI (uma
// única vez) a coordenada pública ofuscada de cada casa 'Aproximado'.
//
// Uso: node scripts/gerar-seed.mjs <entrada.json> <saida.sql>
//
// Usa INSERT OR IGNORE pelo slug: rodar de novo não sorteia novas coordenadas
// para casas já gravadas (sortear de novo permitiria triangular o endereço).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CATEGORIAS, DISTRITOS, NIVEIS_PRIVACIDADE, STATUS_MODERACAO, VERTENTES } from '../lib/constants.js';
import { coordenadaPublica } from '../lib/privacy.js';
import { slugify } from '../lib/validation.js';

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error('Uso: node scripts/gerar-seed.mjs <entrada.json> <saida.sql>');
  process.exit(1);
}

const sql = (v) => {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
};

function conferir(casa, i) {
  const erro = (msg) => { throw new Error(`Casa #${i + 1} (${casa.nome_casa || 'sem nome'}): ${msg}`); };
  if (!casa.nome_casa) erro('nome_casa é obrigatório.');
  if (!VERTENTES.includes(casa.vertente)) erro(`vertente deve ser uma de: ${VERTENTES.join(', ')}.`);
  if (!DISTRITOS.includes(casa.distrito)) erro(`distrito deve ser um de: ${DISTRITOS.join(' | ')}.`);
  if (!casa.bairro) erro('bairro é obrigatório.');
  if (!NIVEIS_PRIVACIDADE.includes(casa.nivel_privacidade ?? 'Aproximado')) erro('nivel_privacidade inválido.');
  if (!CATEGORIAS.includes(casa.categoria ?? 'Casa de Axé')) erro('categoria inválida.');
  if (!STATUS_MODERACAO.includes(casa.status_moderacao ?? 'Aprovado')) erro('status_moderacao inválido.');
  if (!Number.isFinite(casa.lat_real) || !Number.isFinite(casa.lng_real)) erro('lat_real e lng_real são obrigatórios.');
}

const casas = JSON.parse(await readFile(entrada, 'utf8'));
const linhas = casas.map((casa, i) => {
  conferir(casa, i);
  const nivel = casa.nivel_privacidade ?? 'Aproximado';
  const pub = coordenadaPublica(nivel, casa.lat_real, casa.lng_real);
  const valores = [
    crypto.randomUUID(), casa.nome_casa, casa.slug || slugify(casa.nome_casa), casa.categoria ?? 'Casa de Axé',
    casa.vertente, casa.nacao_linha, casa.orixa_guia_regente, casa.lideranca_titulo, casa.lideranca_nome_religioso,
    casa.ano_fundacao, casa.distrito, casa.bairro, casa.endereco_completo, casa.lat_real, casa.lng_real,
    pub.lat, pub.lng, nivel, casa.historia_resumo,
    JSON.stringify(casa.calendario_giras ?? []), JSON.stringify(casa.acoes_sociais ?? []),
    casa.whatsapp_contato, casa.instagram_url, Boolean(casa.contato_restrito),
    casa.status_moderacao ?? 'Aprovado', casa.consentimento_lgpd_em,
  ];
  return `(${valores.map(sql).join(', ')})`;
});

const saidaSql = `-- Gerado por scripts/gerar-seed.mjs a partir de ${entrada}. Não edite à mão.
INSERT OR IGNORE INTO terreiros (
  id, nome_casa, slug, categoria, vertente, nacao_linha, orixa_guia_regente, lideranca_titulo,
  lideranca_nome_religioso, ano_fundacao, distrito, bairro, endereco_completo, lat_real, lng_real,
  lat_publica, lng_publica, nivel_privacidade, historia_resumo, calendario_giras, acoes_sociais,
  whatsapp_contato, instagram_url, contato_restrito, status_moderacao, consentimento_lgpd_em
) VALUES
${linhas.join(',\n')};
`;
await mkdir(dirname(saida), { recursive: true });
await writeFile(saida, saidaSql);
console.log(`✔ ${casas.length} casas → ${saida}`);
