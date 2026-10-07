// Utilitários HTTP do Worker.
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export const NO_STORE = { 'Cache-Control': 'no-store' };
export const CACHE_PUBLICO = { 'Cache-Control': 'public, max-age=60' };

const MAX_BODY_BYTES = 64 * 1024;

export async function lerJson(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    throw new HttpError(415, 'Envie o corpo como application/json.');
  }
  const texto = await request.text();
  if (texto.length > MAX_BODY_BYTES) throw new HttpError(413, 'Corpo da requisição muito grande.');
  try {
    const corpo = JSON.parse(texto || '{}');
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new Error();
    return corpo;
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

// IP real do visitante, informado pela própria Cloudflare.
export const ipDe = (request) => request.headers.get('CF-Connecting-IP') || 'desconhecido';

export const metodoNaoPermitido = (permitidos) =>
  json(405, { erro: 'Método não permitido.' }, { Allow: permitidos.join(', ') });
