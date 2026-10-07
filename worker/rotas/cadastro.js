// POST /api/cadastro → envia uma casa para a FILA DE MODERAÇÃO.
// O status é sempre 'Pendente'; nada do que o cliente mandar publica direto.
import { dentroDoLimite } from '../../lib/limite.js';
import { coordenadaPublica } from '../../lib/privacy.js';
import { slugify, validarCadastro } from '../../lib/validation.js';
import { ipDe, json, lerJson, metodoNaoPermitido } from '../http.js';

export async function cadastro(request, env) {
  if (request.method !== 'POST') return metodoNaoPermitido(['POST']);

  if (!(await dentroDoLimite(env.DB, 'cadastro', ipDe(request), { limite: 5, janelaMs: 60 * 60 * 1000 }))) {
    return json(429, { erro: 'Muitos envios a partir desta conexão. Tente novamente mais tarde.' });
  }

  const body = await lerJson(request);
  // Honeypot anti-robô: campo invisível que pessoas não preenchem.
  if (body.website) return json(202, { ok: true, mensagem: 'Cadastro recebido.' });

  const { dados, erros } = validarCadastro(body);
  if (erros) return json(422, { erro: 'Revise os campos destacados.', detalhes: erros });

  const id = crypto.randomUUID();
  const slug = `${slugify(dados.nome_casa)}-${id.slice(0, 6)}`;
  // SEGURANÇA GEOGRÁFICA: a coordenada pública é calculada aqui, uma única
  // vez. O CHECK do banco recusa gravar 'Aproximado' sem deslocamento.
  const pub = coordenadaPublica(dados.nivel_privacidade, dados.lat_real, dados.lng_real);

  await env.DB.prepare(
    `INSERT INTO terreiros (
       id, nome_casa, slug, categoria, vertente, nacao_linha, orixa_guia_regente,
       lideranca_titulo, lideranca_nome_religioso, ano_fundacao, distrito, bairro,
       endereco_completo, lat_real, lng_real, lat_publica, lng_publica, nivel_privacidade,
       historia_resumo, calendario_giras, acoes_sociais, whatsapp_contato, instagram_url,
       status_moderacao, consentimento_lgpd_em
     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,
               'Pendente', strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
  ).bind(
    id, dados.nome_casa, slug, dados.categoria, dados.vertente, dados.nacao_linha, dados.orixa_guia_regente,
    dados.lideranca_titulo, dados.lideranca_nome_religioso, dados.ano_fundacao, dados.distrito, dados.bairro,
    dados.endereco_completo, dados.lat_real, dados.lng_real, pub.lat, pub.lng, dados.nivel_privacidade,
    dados.historia_resumo, JSON.stringify(dados.calendario_giras), JSON.stringify(dados.acoes_sociais),
    dados.whatsapp_contato, dados.instagram_url,
  ).run();

  return json(201, {
    ok: true,
    protocolo: id.slice(0, 8).toUpperCase(),
    mensagem: 'Cadastro recebido! Ele passará pela moderação da comunidade antes de aparecer no mapa.',
  });
}
