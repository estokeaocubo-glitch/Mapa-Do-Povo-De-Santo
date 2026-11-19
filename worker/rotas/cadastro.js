// POST /api/cadastro → envia uma casa para a FILA DE MODERAÇÃO.
// O status é sempre 'Pendente'; nada do que o cliente mandar publica direto.
import { gerarCodigo, hashCodigo } from '../../lib/codigos.js';
import { excedeuLimite, registrarTentativa } from '../../lib/limite.js';
import { coordenadaPublica } from '../../lib/privacy.js';
import { normalizarNome, slugify, validarCadastro } from '../../lib/validation.js';
import { ipDe, json, lerJson, metodoNaoPermitido } from '../http.js';

// Conta apenas cadastros ACEITOS: quem erra o preenchimento pode corrigir e
// reenviar quantas vezes precisar, sem ser bloqueado.
const LIMITE = { limite: 5, janelaMs: 60 * 60 * 1000 };

export async function cadastro(request, env) {
  if (request.method !== 'POST') return metodoNaoPermitido(['POST']);
  const ip = ipDe(request);

  if (await excedeuLimite(env, 'cadastro', ip, LIMITE)) {
    return json(429, { erro: 'Esta conexão já enviou 5 cadastros na última hora. Tente novamente mais tarde.' });
  }

  const body = await lerJson(request);
  // Honeypot anti-robô: campo invisível que pessoas não preenchem.
  if (body.website) return json(202, { ok: true, mensagem: 'Cadastro recebido.' });

  const { dados, erros } = validarCadastro(body);
  if (erros) return json(422, { erro: 'Revise os campos destacados.', detalhes: erros });

  // Duplicata: mesmo nome (sem acentos/caixa) e mesmo bairro, ainda não rejeitado.
  const { results: mesmoDistrito } = await env.DB
    .prepare(`SELECT nome_casa, bairro FROM terreiros WHERE distrito = ?1 AND status_moderacao <> 'Rejeitado'`)
    .bind(dados.distrito).all();
  const duplicada = mesmoDistrito.some((r) =>
    normalizarNome(r.nome_casa) === normalizarNome(dados.nome_casa) && normalizarNome(r.bairro) === normalizarNome(dados.bairro));
  if (duplicada) {
    return json(409, {
      erro: 'Esta casa já foi cadastrada (ou está aguardando moderação). Para corrigir dados, use o contato da página de privacidade.',
    });
  }

  const id = crypto.randomUUID();
  const slug = `${slugify(dados.nome_casa)}-${id.slice(0, 6)}`;
  // SEGURANÇA GEOGRÁFICA: a coordenada pública é calculada aqui, uma única
  // vez. O CHECK do banco recusa gravar 'Aproximado' sem deslocamento.
  const pub = coordenadaPublica(dados.nivel_privacidade, dados.lat_real, dados.lng_real);
  // Código de edição: mostrado UMA vez a quem cadastrou; só o hash fica no banco.
  const codigoEdicao = gerarCodigo(3);

  await env.DB.prepare(
    `INSERT INTO terreiros (
       id, nome_casa, slug, categoria, vertente, nacao_linha, orixa_guia_regente,
       lideranca_titulo, lideranca_nome_religioso, ano_fundacao, distrito, bairro,
       endereco_completo, lat_real, lng_real, lat_publica, lng_publica, nivel_privacidade,
       historia_resumo, calendario_giras, acoes_sociais, whatsapp_contato, instagram_url,
       status_moderacao, consentimento_lgpd_em, codigo_edicao_hash, contato_restrito
     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,
               'Pendente', strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?24, ?25)`,
  ).bind(
    id, dados.nome_casa, slug, dados.categoria, dados.vertente, dados.nacao_linha, dados.orixa_guia_regente,
    dados.lideranca_titulo, dados.lideranca_nome_religioso, dados.ano_fundacao, dados.distrito, dados.bairro,
    dados.endereco_completo, dados.lat_real, dados.lng_real, pub.lat, pub.lng, dados.nivel_privacidade,
    dados.historia_resumo, JSON.stringify(dados.calendario_giras), JSON.stringify(dados.acoes_sociais),
    dados.whatsapp_contato, dados.instagram_url, await hashCodigo(codigoEdicao), body.contato_restrito === true ? 1 : 0,
  ).run();
  await registrarTentativa(env, 'cadastro', ip);

  return json(201, {
    ok: true,
    protocolo: id.slice(0, 8).toUpperCase(),
    codigo_edicao: codigoEdicao,
    mensagem: 'Cadastro recebido! Ele passará pela moderação da comunidade antes de aparecer no mapa.',
  });
}
