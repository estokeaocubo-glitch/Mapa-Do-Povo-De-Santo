// POST /api/desbloquear  { slug, senha }
// Libera WhatsApp, Instagram e endereço de uma casa com contato_restrito.
//
// SEGURANÇA:
//  • A senha é comparada com um hash scrypt (ACESSO_RESTRITO_HASH) no servidor;
//    o navegador nunca recebe a senha nem os contatos antes da verificação.
//  • Limite de tentativas por IP contra adivinhação por força bruta.
//  • Coordenadas reais NUNCA são devolvidas, nem com a senha certa.
import { getDb } from '../lib/db.js';
import { clientIp, methodNotAllowed, readJsonBody, sendJson, withErrors } from '../lib/http.js';
import { rateLimit } from '../lib/rate-limit.js';
import { verificarSenha } from '../lib/senha.js';
import { formatarWhatsapp } from '../lib/validation.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

export default withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  if (!process.env.ACESSO_RESTRITO_HASH) {
    return sendJson(res, 503, { erro: 'Desbloqueio indisponível: ACESSO_RESTRITO_HASH não configurado.' }, NO_STORE);
  }
  if (!rateLimit(`desbloquear:${clientIp(req)}`, { limit: 8, windowMs: 15 * 60 * 1000 })) {
    return sendJson(res, 429, { erro: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }, NO_STORE);
  }

  const { slug, senha } = await readJsonBody(req);
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,180}$/.test(slug)) {
    return sendJson(res, 400, { erro: 'Casa inválida.' }, NO_STORE);
  }
  if (!verificarSenha(senha, process.env.ACESSO_RESTRITO_HASH)) {
    return sendJson(res, 401, { erro: 'Acesso negado. A senha de segurança informada está incorreta.' }, NO_STORE);
  }

  // Só casas aprovadas e visíveis no mapa podem ser desbloqueadas.
  const { rows } = await (await getDb()).query(
    `SELECT whatsapp_contato, instagram_url, endereco_completo
       FROM terreiros
      WHERE slug = $1 AND status_moderacao = 'Aprovado'
        AND nivel_privacidade <> 'Oculto_Apenas_Censo'
      LIMIT 1`,
    [slug],
  );
  if (!rows.length) return sendJson(res, 404, { erro: 'Casa não encontrada.' }, NO_STORE);

  const c = rows[0];
  sendJson(res, 200, {
    sucesso: true,
    dados_restritos: {
      whatsapp: c.whatsapp_contato,
      whatsapp_formatado: formatarWhatsapp(c.whatsapp_contato),
      instagram_url: c.instagram_url,
      endereco_completo: c.endereco_completo,
    },
  }, NO_STORE);
});
