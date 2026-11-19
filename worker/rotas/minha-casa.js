// POST /api/minha-casa  { codigo, acao, ... }
// A própria casa gerencia o cadastro com o CÓDIGO DE EDIÇÃO que recebeu ao se
// cadastrar (ou que a moderação gerou e enviou pelo WhatsApp da casa).
//
//   acao: 'ler'            → dados completos da casa (inclusive os privados: são dela)
//         'salvar'         → altera dados, privacidade, giras, contato (mesmas regras do cadastro)
//         'excluir'        → apaga o cadastro definitivamente (LGPD, art. 18, VI)
//         'gerar_visitante'→ cria código de visitante { dias, rotulo } para liberar o contato restrito
//         'listar_visitantes' | 'revogar_visitante' { id }
//
// SEGURANÇA: só códigos ERRADOS contam para o limite (10 a cada 15 min por IP).
import { gerarCodigo, hashCodigo, normalizarCodigo } from '../../lib/codigos.js';
import { excedeuLimite, registrarTentativa } from '../../lib/limite.js';
import { atualizarRegistro, registrarLog, registroParaFormulario } from '../../lib/registro.js';
import { limparCachePublico } from '../cache.js';
import { ipDe, json, lerJson, metodoNaoPermitido, NO_STORE } from '../http.js';

const LIMITE = { limite: 10, janelaMs: 15 * 60 * 1000 };
const AUTOR = 'a própria casa';

export async function minhaCasa(request, env) {
  if (request.method !== 'POST') return metodoNaoPermitido(['POST']);
  const ip = ipDe(request);
  if (await excedeuLimite(env, 'minha-casa', ip, LIMITE)) {
    return json(429, { erro: 'Muitas tentativas com código errado. Aguarde 15 minutos.' }, NO_STORE);
  }

  const corpo = await lerJson(request);
  const casa = normalizarCodigo(corpo.codigo).length >= 8
    ? await env.DB.prepare('SELECT * FROM terreiros WHERE codigo_edicao_hash = ?1').bind(await hashCodigo(corpo.codigo)).first()
    : null;
  if (!casa) {
    await registrarTentativa(env, 'minha-casa', ip);
    return json(401, { erro: 'Código de edição inválido. Confira as letras e os números.' }, NO_STORE);
  }

  switch (corpo.acao) {
    case 'ler':
      return json(200, {
        casa: { ...registroParaFormulario(casa), slug: casa.slug, status_moderacao: casa.status_moderacao, editado_em: casa.editado_em },
      }, NO_STORE);

    case 'salvar': {
      const alteracoes = corpo.dados && typeof corpo.dados === 'object' ? corpo.dados : {};
      const r = await atualizarRegistro(env.DB, casa, alteracoes, { autor: AUTOR, acao: 'editado_pela_casa' });
      if (r.erros) return json(422, { erro: 'Revise os campos destacados.', detalhes: r.erros }, NO_STORE);
      await limparCachePublico(request);
      return json(200, { ok: true, mensagem: 'Alterações salvas.' }, NO_STORE);
    }

    case 'excluir':
      await env.DB.batch([
        env.DB.prepare('DELETE FROM codigos_visitante WHERE terreiro_id = ?1').bind(casa.id),
        env.DB.prepare('DELETE FROM terreiros WHERE id = ?1').bind(casa.id),
        registrarLog(env.DB, { terreiro_id: casa.id, nome_casa: casa.nome_casa, acao: 'excluido_pela_casa', autor: AUTOR }),
      ]);
      await limparCachePublico(request);
      return json(200, { ok: true, mensagem: 'Cadastro excluído definitivamente.' }, NO_STORE);

    case 'gerar_visitante': {
      const dias = Math.min(Math.max(Number.parseInt(corpo.dias, 10) || 7, 1), 90);
      const rotulo = typeof corpo.rotulo === 'string' ? corpo.rotulo.replace(/\s+/g, ' ').trim().slice(0, 60) : null;
      const { total } = await env.DB.prepare('SELECT COUNT(*) AS total FROM codigos_visitante WHERE terreiro_id = ?1 AND expira_em > ?2')
        .bind(casa.id, Date.now()).first();
      if (total >= 50) return json(409, { erro: 'Limite de 50 códigos ativos. Revogue algum antes de criar outro.' }, NO_STORE);
      const codigo = gerarCodigo(2);                       // ex.: K7QM-3XPA
      const expira = Date.now() + dias * 24 * 60 * 60 * 1000;
      await env.DB.prepare('INSERT INTO codigos_visitante (id, terreiro_id, codigo_hash, rotulo, expira_em) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(crypto.randomUUID(), casa.id, await hashCodigo(codigo), rotulo || null, expira).run();
      return json(201, { codigo, expira_em: new Date(expira).toISOString() }, NO_STORE);
    }

    case 'listar_visitantes': {
      const { results } = await env.DB.prepare(
        'SELECT id, rotulo, expira_em, criado_em FROM codigos_visitante WHERE terreiro_id = ?1 AND expira_em > ?2 ORDER BY criado_em DESC',
      ).bind(casa.id, Date.now()).all();
      return json(200, { codigos: results.map((c) => ({ ...c, expira_em: new Date(c.expira_em).toISOString() })) }, NO_STORE);
    }

    case 'revogar_visitante':
      await env.DB.prepare('DELETE FROM codigos_visitante WHERE id = ?1 AND terreiro_id = ?2').bind(String(corpo.id || ''), casa.id).run();
      return json(200, { ok: true }, NO_STORE);

    default:
      return json(400, { erro: 'Ação desconhecida.' }, NO_STORE);
  }
}
