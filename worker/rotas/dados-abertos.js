// GET /api/dados-abertos            → censo agregado em JSON, com metodologia e licença
// GET /api/dados-abertos?formato=csv → o mesmo em CSV (indicador, categoria, total)
// Contém apenas números agregados, com a mesma supressão de grupos pequenos do
// censo do site: nenhuma casa oculta pode ser identificada.
import { carregarEstatisticas } from '../../lib/stats.js';
import { comCache } from '../cache.js';
import { CACHE_PUBLICO, json, metodoNaoPermitido } from '../http.js';

const METODOLOGIA = 'Autodeclaração das casas, com moderação comunitária. Inclui casas que optaram por não aparecer no mapa. '
  + 'Grupos com 1 ou 2 casas que contenham alguma casa oculta têm o total suprimido (valor "<3"). '
  + 'Casas ocultas aparecem no ranking de antiguidade só pela década de fundação, sem nome, distrito ou nação.';

export async function dadosAbertos(request, env, url, ctx) {
  if (request.method !== 'GET') return metodoNaoPermitido(['GET']);
  return comCache(request, ctx, async () => {
    const e = await carregarEstatisticas(env.DB);
    const gerado_em = new Date().toISOString();
    if (url.searchParams.get('formato') === 'csv') {
      const linhas = [['indicador', 'categoria', 'total']];
      const totais = { total_casas: e.total_casas, total_economia_axe: e.total_economia_axe, casas_ocultas: e.casas_ocultas };
      for (const [k, v] of Object.entries(totais)) linhas.push(['totais', k, v]);
      for (const chave of ['por_distrito', 'por_vertente', 'por_nacao', 'por_privacidade', 'acoes_sociais']) {
        for (const i of e[chave]) linhas.push([chave, i.rotulo, i.suprimido ? '<3' : i.total]);
      }
      const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      return new Response(`\uFEFF${csv}\r\n`, {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="censo-povo-de-santo-petropolis.csv"', ...CACHE_PUBLICO },
      });
    }
    return json(200, {
      titulo: 'Censo comunitário do Povo de Santo de Petrópolis/RJ',
      licenca: 'CC BY 4.0 — cite "Mapa do Povo de Santo de Petrópolis"',
      metodologia: METODOLOGIA,
      gerado_em,
      dados: e,
    }, CACHE_PUBLICO);
  });
}
