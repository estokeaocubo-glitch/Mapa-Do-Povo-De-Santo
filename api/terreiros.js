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
//  3. assertSemCamposPrivados() aborta a resposta se algo privado escapar.
// =============================================================================
import { getDb } from '../lib/db.js';
import { getQuery, methodNotAllowed, sendJson, withErrors } from '../lib/http.js';
import { assertSemCamposPrivados, toPublicTerreiro } from '../lib/privacy.js';
import { carregarEstatisticas } from '../lib/stats.js';

const SQL_PUBLICO = `
  SELECT id, slug, nome_casa, categoria, vertente, nacao_linha, orixa_guia_regente,
         lideranca_titulo, lideranca_nome_religioso, ano_fundacao, distrito, bairro,
         endereco_publico, lat_publica, lng_publica, nivel_privacidade,
         historia_resumo, calendario_giras, acoes_sociais, whatsapp_contato, instagram_url
  FROM vw_terreiros_publicos`;

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const db = await getDb();
  const slug = getQuery(req).get('slug');
  const cache = { 'Cache-Control': 'public, max-age=60, s-maxage=300' };

  if (slug) {
    if (!/^[a-z0-9-]{1,180}$/.test(slug)) return sendJson(res, 400, { erro: 'Slug inválido.' });
    const { rows } = await db.query(`${SQL_PUBLICO} WHERE slug = $1 LIMIT 1`, [slug]);
    const terreiro = toPublicTerreiro(rows[0]);
    if (!terreiro) return sendJson(res, 404, { erro: 'Casa não encontrada.' });
    assertSemCamposPrivados([terreiro]);
    return sendJson(res, 200, { terreiro }, cache);
  }

  const [{ rows }, estatisticas] = await Promise.all([
    db.query(`${SQL_PUBLICO} ORDER BY nome_casa`),
    carregarEstatisticas(db),
  ]);

  const terreiros = assertSemCamposPrivados(rows.map(toPublicTerreiro).filter(Boolean));
  sendJson(res, 200, { terreiros, estatisticas, gerado_em: new Date().toISOString() }, cache);
});
