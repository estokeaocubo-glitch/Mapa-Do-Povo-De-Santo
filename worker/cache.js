// Cache na borda da Cloudflare para as rotas públicas de leitura.
// Evita ir ao D1 a cada visita; a moderação limpa o cache ao aprovar,
// rejeitar ou excluir, então mudanças aparecem na hora.
// Obs.: a Cache API não age em domínios *.workers.dev — funciona no domínio próprio.
const ROTAS_CACHEADAS = ['/api/terreiros', '/api/estatisticas'];
const TTL_S = 60;

export async function comCache(request, ctx, gerar) {
  const cache = caches.default;
  const chave = new Request(request.url, { method: 'GET' });
  const salvo = await cache.match(chave);
  if (salvo) return salvo;

  const resposta = await gerar();
  if (resposta.status === 200) {
    const copia = new Response(resposta.clone().body, resposta);
    copia.headers.set('Cache-Control', `public, max-age=${TTL_S}`);
    ctx.waitUntil(cache.put(chave, copia));
  }
  return resposta;
}

export async function limparCachePublico(request) {
  const origem = new URL(request.url).origin;
  await Promise.all(ROTAS_CACHEADAS.map((rota) => caches.default.delete(new Request(origem + rota))));
}
