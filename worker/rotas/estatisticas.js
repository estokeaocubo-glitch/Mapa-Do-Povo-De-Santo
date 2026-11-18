// GET /api/estatisticas → dados agregados do censo (inclui casas ocultas,
// sem jamais expor nome, endereço ou coordenadas delas).
import { carregarEstatisticas } from '../../lib/stats.js';
import { comCache } from '../cache.js';
import { CACHE_PUBLICO, json, metodoNaoPermitido } from '../http.js';

export async function estatisticas(request, env, url, ctx) {
  if (request.method !== 'GET') return metodoNaoPermitido(['GET']);
  return comCache(request, ctx, async () => json(200, await carregarEstatisticas(env.DB), CACHE_PUBLICO));
}
