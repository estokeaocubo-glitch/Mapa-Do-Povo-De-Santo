// POST /api/desbloquear  { slug, senha }
// Libera WhatsApp, Instagram e endereço de uma casa com contato restrito.
//
// SEGURANÇA:
//  • A senha é comparada com um hash PBKDF2 (secret ACESSO_RESTRITO_HASH) no
//    servidor; o navegador nunca recebe a senha nem os contatos antes disso.
//  • Limite de tentativas por IP, guardado no D1 (vale para o mundo todo).
//  • Coordenadas reais NUNCA são devolvidas, nem com a senha certa.
import { dentroDoLimite } from '../../lib/limite.js';
import { verificarSenha } from '../../lib/senha.js';
import { formatarWhatsapp } from '../../lib/validation.js';
import { ipDe, json, lerJson, metodoNaoPermitido, NO_STORE } from '../http.js';

export async function desbloquear(request, env) {
  if (request.method !== 'POST') return metodoNaoPermitido(['POST']);
  if (!env.ACESSO_RESTRITO_HASH) {
    return json(503, { erro: 'Desbloqueio indisponível: ACESSO_RESTRITO_HASH não configurado.' }, NO_STORE);
  }
  if (!(await dentroDoLimite(env.DB, 'desbloquear', ipDe(request), { limite: 8, janelaMs: 15 * 60 * 1000 }))) {
    return json(429, { erro: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }, NO_STORE);
  }

  const { slug, senha } = await lerJson(request);
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,180}$/.test(slug)) {
    return json(400, { erro: 'Casa inválida.' }, NO_STORE);
  }
  if (!(await verificarSenha(senha, env.ACESSO_RESTRITO_HASH))) {
    return json(401, { erro: 'Acesso negado. A senha de segurança informada está incorreta.' }, NO_STORE);
  }

  // Só casas aprovadas e visíveis no mapa podem ser desbloqueadas.
  const c = await env.DB.prepare(
    `SELECT whatsapp_contato, instagram_url, endereco_completo FROM terreiros
      WHERE slug = ?1 AND status_moderacao = 'Aprovado' AND nivel_privacidade <> 'Oculto_Apenas_Censo'
      LIMIT 1`,
  ).bind(slug).first();
  if (!c) return json(404, { erro: 'Casa não encontrada.' }, NO_STORE);

  return json(200, {
    sucesso: true,
    dados_restritos: {
      whatsapp: c.whatsapp_contato,
      whatsapp_formatado: formatarWhatsapp(c.whatsapp_contato),
      instagram_url: c.instagram_url,
      endereco_completo: c.endereco_completo,
    },
  }, NO_STORE);
}
