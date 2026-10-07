// Utilitários HTTP compatíveis com o servidor local (node:http) e com
// funções serverless no estilo Vercel (mesma assinatura req/res).

export function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function methodNotAllowed(res, allowed) {
  sendJson(res, 405, { erro: 'Método não permitido.' }, { Allow: allowed.join(', ') });
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const MAX_BODY_BYTES = 64 * 1024;

export async function readJsonBody(req) {
  // Algumas plataformas já entregam o corpo parseado.
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;

  const type = req.headers['content-type'] || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Envie o corpo como application/json.');

  let raw = '';
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    raw = req.body.toString();
  } else {
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Corpo da requisição muito grande.');
      raw += chunk;
    }
  }
  if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'Corpo da requisição muito grande.');
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'desconhecido';
}

export function getQuery(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

// Envolve um handler tratando erros de forma uniforme e sem vazar detalhes
// internos (stack, SQL) para o cliente.
export function withErrors(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { erro: err.message, ...(err.details ? { detalhes: err.details } : {}) });
      } else {
        console.error('[api]', err);
        sendJson(res, 500, { erro: 'Erro interno. Tente novamente em instantes.' });
      }
    }
  };
}
