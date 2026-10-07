// POST /api/cadastro → envia uma casa para a FILA DE MODERAÇÃO.
// O status é sempre forçado para 'Pendente' no servidor; nada do que o
// cliente mandar consegue publicar um registro diretamente no mapa.
import { randomBytes } from 'node:crypto';
import { getDb } from '../lib/db.js';
import { clientIp, methodNotAllowed, readJsonBody, sendJson, withErrors } from '../lib/http.js';
import { rateLimit } from '../lib/rate-limit.js';
import { slugify, validarCadastro } from '../lib/validation.js';

export default withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  if (!rateLimit(`cadastro:${clientIp(req)}`, { limit: 5, windowMs: 60 * 60 * 1000 })) {
    return sendJson(res, 429, { erro: 'Muitos envios a partir desta conexão. Tente novamente mais tarde.' });
  }

  const body = await readJsonBody(req);

  // Honeypot anti-robô: campo invisível que pessoas não preenchem.
  if (body.website) return sendJson(res, 202, { ok: true, mensagem: 'Cadastro recebido.' });

  const { dados, erros } = validarCadastro(body);
  if (erros) return sendJson(res, 422, { erro: 'Revise os campos destacados.', detalhes: erros });

  const slug = `${slugify(dados.nome_casa)}-${randomBytes(3).toString('hex')}`;

  // lat_publica/lng_publica NÃO são enviadas: o trigger do banco gera a
  // coordenada ofuscada (400–800 m) conforme o nível de privacidade.
  const { rows } = await (await getDb()).query(
    `INSERT INTO terreiros (
       nome_casa, slug, categoria, vertente, nacao_linha, orixa_guia_regente,
       lideranca_titulo, lideranca_nome_religioso, ano_fundacao, distrito, bairro,
       endereco_completo, lat_real, lng_real, nivel_privacidade, historia_resumo,
       calendario_giras, acoes_sociais, whatsapp_contato, instagram_url,
       status_moderacao, consentimento_lgpd_em
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,'Pendente',now())
     RETURNING id`,
    [
      dados.nome_casa, slug, dados.categoria, dados.vertente, dados.nacao_linha, dados.orixa_guia_regente,
      dados.lideranca_titulo, dados.lideranca_nome_religioso, dados.ano_fundacao, dados.distrito, dados.bairro,
      dados.endereco_completo, dados.lat_real, dados.lng_real, dados.nivel_privacidade, dados.historia_resumo,
      JSON.stringify(dados.calendario_giras), dados.acoes_sociais, dados.whatsapp_contato, dados.instagram_url,
    ],
  );

  sendJson(res, 201, {
    ok: true,
    protocolo: rows[0].id.slice(0, 8).toUpperCase(),
    mensagem: 'Cadastro recebido! Ele passará pela moderação da comunidade antes de aparecer no mapa.',
  });
});
