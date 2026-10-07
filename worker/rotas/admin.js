// /api/admin — moderação (protegida por token).
//   GET    /api/admin?status=Pendente        → lista completa (inclui dados privados)
//   PATCH  /api/admin  {id, status_moderacao} → aprova / rejeita
//   DELETE /api/admin?id=<uuid>               → exclusão definitiva (LGPD art. 18, VI)
// Autenticação: header `Authorization: Bearer <ADMIN_TOKEN>` (secret do Worker).
import { STATUS_MODERACAO } from '../../lib/constants.js';
import { dentroDoLimite } from '../../lib/limite.js';
import { iguaisTempoConstante, sha256 } from '../../lib/senha.js';
import { ipDe, json, lerJson, metodoNaoPermitido, NO_STORE } from '../http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function autorizado(request, esperado) {
  const header = request.headers.get('Authorization') || '';
  const recebido = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!recebido) return false;
  // Compara hashes de tamanho fixo em tempo constante.
  return iguaisTempoConstante(await sha256(recebido), await sha256(esperado));
}

export async function admin(request, env, url) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24) {
    return json(503, { erro: 'Moderação desabilitada: defina o secret ADMIN_TOKEN (mín. 24 caracteres).' }, NO_STORE);
  }
  if (!(await autorizado(request, env.ADMIN_TOKEN))) {
    // Só tentativas inválidas contam para o limite (contra força bruta).
    if (!(await dentroDoLimite(env.DB, 'admin', ipDe(request), { limite: 20, janelaMs: 15 * 60 * 1000 }))) {
      return json(429, { erro: 'Muitas tentativas.' }, NO_STORE);
    }
    return json(401, { erro: 'Não autorizado.' }, { ...NO_STORE, 'WWW-Authenticate': 'Bearer' });
  }

  if (request.method === 'GET') {
    const status = url.searchParams.get('status') || 'Pendente';
    if (!STATUS_MODERACAO.includes(status)) return json(400, { erro: 'Status inválido.' }, NO_STORE);
    const { results } = await env.DB
      .prepare('SELECT * FROM terreiros WHERE status_moderacao = ?1 ORDER BY created_at DESC LIMIT 200')
      .bind(status).all();
    return json(200, { registros: results }, NO_STORE);
  }

  if (request.method === 'PATCH') {
    const { id, status_moderacao } = await lerJson(request);
    if (!UUID.test(id || '') || !STATUS_MODERACAO.includes(status_moderacao)) {
      return json(400, { erro: 'Informe id (UUID) e status_moderacao válido.' }, NO_STORE);
    }
    const registro = await env.DB
      .prepare('UPDATE terreiros SET status_moderacao = ?2 WHERE id = ?1 RETURNING id, nome_casa, status_moderacao')
      .bind(id, status_moderacao).first();
    if (!registro) return json(404, { erro: 'Registro não encontrado.' }, NO_STORE);
    return json(200, { ok: true, registro }, NO_STORE);
  }

  if (request.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!UUID.test(id || '')) return json(400, { erro: 'id inválido.' }, NO_STORE);
    const apagado = await env.DB.prepare('DELETE FROM terreiros WHERE id = ?1 RETURNING id').bind(id).first();
    if (!apagado) return json(404, { erro: 'Registro não encontrado.' }, NO_STORE);
    return json(200, { ok: true }, NO_STORE);
  }

  return metodoNaoPermitido(['GET', 'PATCH', 'DELETE']);
}
