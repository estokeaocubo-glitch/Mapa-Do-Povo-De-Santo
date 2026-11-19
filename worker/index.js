// Cloudflare Worker: API em /api/* + site estático (pasta public/, servida
// pelo binding ASSETS). Banco de dados: Cloudflare D1 (binding DB).
import { HttpError, json } from './http.js';
import { admin } from './rotas/admin.js';
import { agenda } from './rotas/agenda.js';
import { dadosAbertos } from './rotas/dados-abertos.js';
import { minhaCasa } from './rotas/minha-casa.js';
import { paginaCasa } from './rotas/pagina-casa.js';
import { cadastro } from './rotas/cadastro.js';
import { desbloquear } from './rotas/desbloquear.js';
import { estatisticas } from './rotas/estatisticas.js';
import { terreiros } from './rotas/terreiros.js';

const ROTAS = {
  '/api/terreiros': terreiros,
  '/api/estatisticas': estatisticas,
  '/api/cadastro': cadastro,
  '/api/desbloquear': desbloquear,
  '/api/admin': admin,
  '/api/minha-casa': minhaCasa,
  '/api/dados-abertos': dadosAbertos,
  '/api/agenda.ics': agenda,
};

// Cabeçalhos de segurança das respostas da API (o site estático usa public/_headers).
const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const rota = ROTAS[url.pathname.replace(/\/$/, '')];

    if (!rota) {
      if (url.pathname.startsWith('/api/')) return comSeguranca(json(404, { erro: 'Rota não encontrada.' }));
      // Página da casa: o HTML do site com a prévia de compartilhamento da casa.
      // Mantém os cabeçalhos do site estático (CSP de public/_headers).
      if (url.pathname.startsWith('/casa/') && request.method === 'GET') {
        try {
          return await paginaCasa(request, env, url);
        } catch (err) {
          console.error('[casa]', err?.stack || err);
          return env.ASSETS.fetch(new Request(new URL('/', url), request));
        }
      }
      return env.ASSETS.fetch(request);
    }

    try {
      return comSeguranca(await rota(request, env, url, ctx));
    } catch (err) {
      if (err instanceof HttpError) {
        return comSeguranca(json(err.status, { erro: err.message, ...(err.details ? { detalhes: err.details } : {}) }));
      }
      // Nunca vaza stack/SQL para o cliente; o detalhe fica nos logs do Worker.
      console.error('[api]', err?.stack || err);
      return comSeguranca(json(500, { erro: 'Erro interno. Tente novamente em instantes.' }));
    }
  },
};

function comSeguranca(resposta) {
  // Cópia: respostas vindas do cache têm cabeçalhos imutáveis.
  const copia = new Response(resposta.body, resposta);
  for (const [k, v] of Object.entries(SEGURANCA)) copia.headers.set(k, v);
  return copia;
}
