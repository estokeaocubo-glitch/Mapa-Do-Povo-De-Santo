// GET /api/terreiros            → { terreiros: [...], estatisticas: {...} }
// GET /api/terreiros?slug=xxx   → { terreiro: {...} }
//
// =============================================================================
// REGRAS DE PRIVACIDADE APLICADAS AQUI
//  1. A consulta lê SOMENTE a view vw_terreiros_publicos, que:
//     - não contém lat_real / lng_real;
//     - só expõe o endereço quando a casa escolheu 'Exato';
//     - já exclui 'Oculto_Apenas_Censo' e qualquer status ≠ 'Aprovado'.
//  2. toPublicTerreiro() remonta cada registro por lista branca de campos.
//  3. Contatos com contato_restrito saem como null (ver /api/desbloquear).
//  4. assertSemCamposPrivados() aborta a resposta se algo privado escapar.
// =============================================================================
import { assertSemCamposPrivados, toPublicTerreiro } from '../../lib/privacy.js';
import { carregarEstatisticas } from '../../lib/stats.js';
import { CACHE_PUBLICO, json, metodoNaoPermitido } from '../http.js';

const SQL_PUBLICO = `
  SELECT id, slug, nome_casa, categoria, vertente, nacao_linha, orixa_guia_regente,
         lideranca_titulo, lideranca_nome_religioso, ano_fundacao, distrito, bairro,
         endereco_publico, lat_publica, lng_publica, nivel_privacidade,
         historia_resumo, calendario_giras, acoes_sociais, whatsapp_contato, instagram_url,
         contato_restrito
  FROM vw_terreiros_publicos`;

export async function terreiros(request, env, url) {
  if (request.method !== 'GET') return metodoNaoPermitido(['GET']);

  const slug = url.searchParams.get('slug');
  if (slug) {
    if (!/^[a-z0-9-]{1,180}$/.test(slug)) return json(400, { erro: 'Slug inválido.' });
    const row = await env.DB.prepare(`${SQL_PUBLICO} WHERE slug = ?1 LIMIT 1`).bind(slug).first();
    const terreiro = toPublicTerreiro(row);
    if (!terreiro) return json(404, { erro: 'Casa não encontrada.' });
    assertSemCamposPrivados([terreiro]);
    return json(200, { terreiro }, CACHE_PUBLICO);
  }

  const [{ results }, estatisticas] = await Promise.all([
    env.DB.prepare(`${SQL_PUBLICO} ORDER BY nome_casa`).all(),
    carregarEstatisticas(env.DB),
  ]);
  const lista = assertSemCamposPrivados(results.map(toPublicTerreiro).filter(Boolean));
  return json(200, { terreiros: lista, estatisticas, gerado_em: new Date().toISOString() }, CACHE_PUBLICO);
}
