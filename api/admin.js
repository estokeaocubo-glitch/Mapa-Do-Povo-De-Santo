// /api/admin — moderação (protegida por token).
//   GET    /api/admin?status=Pendente        → lista completa (inclui dados privados)
//   PATCH  /api/admin  {id, status_moderacao} → aprova / rejeita
//   DELETE /api/admin?id=<uuid>               → exclusão definitiva (LGPD art. 18, VI)
//
// Autenticação: header `Authorization: Bearer <ADMIN_TOKEN>`.
import { timingSafeEqual, createHash } from 'node:crypto';
import { STATUS_MODERACAO } from '../lib/constants.js';
import { getDb } from '../lib/db.js';
import { clientIp, getQuery, methodNotAllowed, readJsonBody, sendJson, withErrors } from '../lib/http.js';
import { rateLimit } from '../lib/rate-limit.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { 'Cache-Control': 'no-store' };

function autorizado(req) {
  const esperado = process.env.ADMIN_TOKEN;
  const header = req.headers.authorization || '';
  const recebido = header.startsWith('Bearer ') ? header.slice(7) : '';
  // Compara hashes de tamanho fixo em tempo constante (evita timing attack).
  const h = (s) => createHash('sha256').update(s).digest();
  return Boolean(recebido) && timingSafeEqual(h(recebido), h(esperado));
}

export default withErrors(async (req, res) => {
  if (!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN.length < 24) {
    return sendJson(res, 503, { erro: 'Moderação desabilitada: defina ADMIN_TOKEN (mín. 24 caracteres).' }, NO_STORE);
  }
  if (!rateLimit(`admin:${clientIp(req)}`, { limit: 60, windowMs: 60 * 1000 })) {
    return sendJson(res, 429, { erro: 'Muitas requisições.' }, NO_STORE);
  }
  if (!autorizado(req)) {
    return sendJson(res, 401, { erro: 'Não autorizado.' }, { ...NO_STORE, 'WWW-Authenticate': 'Bearer' });
  }

  const db = await getDb();

  if (req.method === 'GET') {
    const status = getQuery(req).get('status') || 'Pendente';
    if (!STATUS_MODERACAO.includes(status)) return sendJson(res, 400, { erro: 'Status inválido.' }, NO_STORE);
    const { rows } = await db.query(
      `SELECT * FROM terreiros WHERE status_moderacao = $1 ORDER BY created_at DESC LIMIT 200`, [status]);
    return sendJson(res, 200, { registros: rows }, NO_STORE);
  }

  if (req.method === 'PATCH') {
    const { id, status_moderacao } = await readJsonBody(req);
    if (!UUID.test(id || '') || !STATUS_MODERACAO.includes(status_moderacao)) {
      return sendJson(res, 400, { erro: 'Informe id (UUID) e status_moderacao válido.' }, NO_STORE);
    }
    const { rows } = await db.query(
      `UPDATE terreiros SET status_moderacao = $2 WHERE id = $1 RETURNING id, nome_casa, status_moderacao`,
      [id, status_moderacao]);
    if (!rows.length) return sendJson(res, 404, { erro: 'Registro não encontrado.' }, NO_STORE);
    return sendJson(res, 200, { ok: true, registro: rows[0] }, NO_STORE);
  }

  if (req.method === 'DELETE') {
    const id = getQuery(req).get('id');
    if (!UUID.test(id || '')) return sendJson(res, 400, { erro: 'id inválido.' }, NO_STORE);
    const { rows } = await db.query(`DELETE FROM terreiros WHERE id = $1 RETURNING id`, [id]);
    if (!rows.length) return sendJson(res, 404, { erro: 'Registro não encontrado.' }, NO_STORE);
    return sendJson(res, 200, { ok: true }, NO_STORE);
  }

  methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
});
