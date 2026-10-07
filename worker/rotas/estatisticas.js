// GET /api/estatisticas → dados agregados do censo (inclui casas ocultas,
// sem jamais expor nome, endereço ou coordenadas delas).
import { carregarEstatisticas } from '../../lib/stats.js';
import { CACHE_PUBLICO, json, metodoNaoPermitido } from '../http.js';

export async function estatisticas(request, env) {
  if (request.method !== 'GET') return metodoNaoPermitido(['GET']);
  return json(200, await carregarEstatisticas(env.DB), CACHE_PUBLICO);
}
