// /api/admin — moderação (protegida por token).
//   GET    /api/admin?status=Pendente         → lista completa (inclui dados privados)
//   GET    /api/admin?historico=1             → últimas 200 ações de moderação
//   PATCH  /api/admin {id, status_moderacao}  → aprova / rejeita
//   PATCH  /api/admin {id, campos:{...}}      → corrige dados antes/depois de aprovar
//   POST   /api/admin {acao:'codigo_edicao', id} → gera novo código de edição para a casa
//   DELETE /api/admin?id=<uuid>               → exclusão definitiva (LGPD, art. 18, VI)
//
// Autenticação: `Authorization: Bearer <token>`. Cada moderador pode ter o seu
// token (secret ADMIN_TOKENS = "Nome:token;Outro Nome:token2"), para que o
// histórico registre quem fez o quê. ADMIN_TOKEN (único) continua aceito.
import { gerarCodigo, hashCodigo } from '../../lib/codigos.js';
import { STATUS_MODERACAO } from '../../lib/constants.js';
import { excedeuLimite, registrarTentativa } from '../../lib/limite.js';
import { atualizarRegistro, registrarLog } from '../../lib/registro.js';
import { iguaisTempoConstante, sha256 } from '../../lib/senha.js';
import { limparCachePublico } from '../cache.js';
import { ipDe, json, lerJson, metodoNaoPermitido, NO_STORE } from '../http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPOS_EDITAVEIS = [
  'nome_casa', 'categoria', 'vertente', 'nacao_linha', 'orixa_guia_regente', 'lideranca_titulo', 'lideranca_nome_religioso',
  'ano_fundacao', 'distrito', 'bairro', 'endereco_completo', 'historia_resumo', 'whatsapp_contato', 'instagram_url', 'contato_restrito',
];

function moderadores(env) {
  const lista = [];
  for (const par of String(env.ADMIN_TOKENS || '').split(';')) {
    const i = par.indexOf(':');
    if (i > 0) lista.push({ nome: par.slice(0, i).trim(), token: par.slice(i + 1).trim() });
  }
  if (env.ADMIN_TOKEN) lista.push({ nome: 'Moderação', token: env.ADMIN_TOKEN });
  return lista.filter((m) => m.nome && m.token.length >= 24);
}

// Compara hashes de tamanho fixo em tempo constante e devolve o moderador.
async function identificar(request, lista) {
  const header = request.headers.get('Authorization') || '';
  const recebido = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!recebido) return null;
  const h = await sha256(recebido);
  let achado = null;
  for (const m of lista) if (iguaisTempoConstante(h, await sha256(m.token))) achado = m;
  return achado;
}

export async function admin(request, env, url) {
  const lista = moderadores(env);
  if (!lista.length) {
    return json(503, { erro: 'Moderação desabilitada: defina ADMIN_TOKENS ou ADMIN_TOKEN (mín. 24 caracteres).' }, NO_STORE);
  }
  const ip = ipDe(request);
  // Só tokens errados contam para o limite (contra força bruta).
  if (await excedeuLimite(env, 'admin', ip, { limite: 20, janelaMs: 15 * 60 * 1000 })) {
    return json(429, { erro: 'Muitas tentativas com token inválido. Aguarde 15 minutos.' }, NO_STORE);
  }
  const moderador = await identificar(request, lista);
  if (!moderador) {
    await registrarTentativa(env, 'admin', ip);
    return json(401, { erro: 'Token de moderação inválido.' }, { ...NO_STORE, 'WWW-Authenticate': 'Bearer' });
  }
  const autor = moderador.nome;
  const buscar = (id) => env.DB.prepare('SELECT * FROM terreiros WHERE id = ?1').bind(id).first();

  if (request.method === 'GET') {
    if (url.searchParams.get('historico')) {
      const { results } = await env.DB.prepare('SELECT * FROM moderacao_log ORDER BY id DESC LIMIT 200').all();
      return json(200, { historico: results, moderador: autor }, NO_STORE);
    }
    const status = url.searchParams.get('status') || 'Pendente';
    if (!STATUS_MODERACAO.includes(status)) return json(400, { erro: 'Status inválido.' }, NO_STORE);
    const { results } = await env.DB
      .prepare(`SELECT * FROM terreiros WHERE status_moderacao = ?1 ORDER BY COALESCE(editado_em, created_at) DESC LIMIT 200`)
      .bind(status).all();
    // O hash do código de edição não interessa à moderação.
    return json(200, { registros: results.map(({ codigo_edicao_hash, ...r }) => ({ ...r, tem_codigo_edicao: Boolean(codigo_edicao_hash) })), moderador: autor }, NO_STORE);
  }

  if (request.method === 'PATCH') {
    const { id, status_moderacao, campos } = await lerJson(request);
    if (!UUID.test(id || '')) return json(400, { erro: 'Informe o id (UUID) do registro.' }, NO_STORE);
    const atual = await buscar(id);
    if (!atual) return json(404, { erro: 'Registro não encontrado.' }, NO_STORE);

    if (campos && typeof campos === 'object') {
      const alteracoes = Object.fromEntries(Object.entries(campos).filter(([k]) => CAMPOS_EDITAVEIS.includes(k)));
      const r = await atualizarRegistro(env.DB, atual, alteracoes, { autor, acao: 'editado' });
      if (r.erros) return json(422, { erro: 'Revise os campos.', detalhes: r.erros }, NO_STORE);
    }
    if (status_moderacao !== undefined) {
      if (!STATUS_MODERACAO.includes(status_moderacao)) return json(400, { erro: 'status_moderacao inválido.' }, NO_STORE);
      await env.DB.batch([
        env.DB.prepare('UPDATE terreiros SET status_moderacao = ?2 WHERE id = ?1').bind(id, status_moderacao),
        registrarLog(env.DB, { terreiro_id: id, nome_casa: atual.nome_casa, acao: status_moderacao.toLowerCase(), autor }),
      ]);
    }
    await limparCachePublico(request);
    const registro = await env.DB.prepare('SELECT id, nome_casa, slug, status_moderacao, whatsapp_contato FROM terreiros WHERE id = ?1').bind(id).first();
    return json(200, { ok: true, registro }, NO_STORE);
  }

  if (request.method === 'POST') {
    const { acao, id } = await lerJson(request);
    if (acao !== 'codigo_edicao' || !UUID.test(id || '')) return json(400, { erro: 'Ação inválida.' }, NO_STORE);
    const atual = await buscar(id);
    if (!atual) return json(404, { erro: 'Registro não encontrado.' }, NO_STORE);
    // Novo código invalida o anterior. Ele é mostrado uma única vez, para ser
    // enviado pelo WhatsApp DA CASA (nunca de terceiros).
    const codigo = gerarCodigo(3);
    await env.DB.batch([
      env.DB.prepare('UPDATE terreiros SET codigo_edicao_hash = ?2 WHERE id = ?1').bind(id, await hashCodigo(codigo)),
      registrarLog(env.DB, { terreiro_id: id, nome_casa: atual.nome_casa, acao: 'codigo_edicao', autor }),
    ]);
    return json(201, { codigo }, NO_STORE);
  }

  if (request.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!UUID.test(id || '')) return json(400, { erro: 'id inválido.' }, NO_STORE);
    const atual = await buscar(id);
    if (!atual) return json(404, { erro: 'Registro não encontrado.' }, NO_STORE);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM codigos_visitante WHERE terreiro_id = ?1').bind(id),
      env.DB.prepare('DELETE FROM terreiros WHERE id = ?1').bind(id),
      registrarLog(env.DB, { terreiro_id: id, nome_casa: atual.nome_casa, acao: 'excluido', autor }),
    ]);
    await limparCachePublico(request);
    return json(200, { ok: true }, NO_STORE);
  }

  return metodoNaoPermitido(['GET', 'PATCH', 'POST', 'DELETE']);
}
