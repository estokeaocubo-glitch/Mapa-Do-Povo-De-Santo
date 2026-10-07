// GET /api/estatisticas → dados agregados do censo (inclui casas ocultas,
// sem jamais expor nome, endereço ou coordenadas delas).
import { getDb } from '../lib/db.js';
import { methodNotAllowed, sendJson, withErrors } from '../lib/http.js';
import { carregarEstatisticas } from '../lib/stats.js';

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const estatisticas = await carregarEstatisticas(await getDb());
  sendJson(res, 200, estatisticas, { 'Cache-Control': 'public, max-age=60, s-maxage=300' });
});
