// POST /api/desbloquear  { slug, senha? }
// Libera WhatsApp, Instagram e endereço de uma casa com contato restrito.
//
// SEGURANÇA:
//  • A senha é comparada com um hash PBKDF2 (secret ACESSO_RESTRITO_HASH) no
//    servidor; o navegador nunca recebe a senha nem os contatos antes disso.
//  • Só SENHAS ERRADAS contam para o limite (8 a cada 15 min por IP, guardado
//    no D1). Acertou uma vez → cookie de sessão de 30 min (HttpOnly, assinado)
//    libera as outras casas sem digitar de novo e sem gastar tentativas.
//  • Coordenadas reais NUNCA são devolvidas, nem com a senha certa.
import { formatarTelefone } from '../../lib/constants.js';
import { excedeuLimite, registrarTentativa } from '../../lib/limite.js';
import { verificarSenha } from '../../lib/senha.js';
import { criarCookieSessao, sessaoValida } from '../../lib/sessao.js';
import { ipDe, json, lerJson, metodoNaoPermitido, NO_STORE } from '../http.js';

const LIMITE = { limite: 8, janelaMs: 15 * 60 * 1000 };

export async function desbloquear(request, env) {
  if (request.method !== 'POST') return metodoNaoPermitido(['POST']);
  const segredo = env.ACESSO_RESTRITO_HASH;
  if (!segredo) {
    return json(503, { erro: 'Desbloqueio indisponível: ACESSO_RESTRITO_HASH não configurado.' }, NO_STORE);
  }

  const { slug, senha } = await lerJson(request);
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,180}$/.test(slug)) {
    return json(400, { erro: 'Casa inválida.' }, NO_STORE);
  }

  const headers = { ...NO_STORE };
  if (!(await sessaoValida(request, segredo))) {
    // Sem sessão: precisa da senha. Pedido sem senha = só "tenho sessão?".
    if (senha === undefined || senha === null || senha === '') {
      return json(401, { erro: 'Informe a senha de segurança.', precisa_senha: true }, headers);
    }
    const ip = ipDe(request);
    if (await excedeuLimite(env, 'desbloquear', ip, LIMITE)) {
      return json(429, { erro: 'Muitas tentativas com senha errada. Aguarde 15 minutos e tente novamente.' }, headers);
    }
    if (!(await verificarSenha(senha, segredo))) {
      await registrarTentativa(env, 'desbloquear', ip);
      return json(401, { erro: 'Acesso negado. A senha de segurança informada está incorreta.' }, headers);
    }
    const seguro = new URL(request.url).protocol === 'https:';
    headers['Set-Cookie'] = await criarCookieSessao(segredo, { seguro });
  }

  // Só casas aprovadas e visíveis no mapa podem ser desbloqueadas.
  const c = await env.DB.prepare(
    `SELECT whatsapp_contato, instagram_url, endereco_completo FROM terreiros
      WHERE slug = ?1 AND status_moderacao = 'Aprovado' AND nivel_privacidade <> 'Oculto_Apenas_Censo'
      LIMIT 1`,
  ).bind(slug).first();
  if (!c) return json(404, { erro: 'Casa não encontrada.' }, headers);

  return json(200, {
    sucesso: true,
    dados_restritos: {
      whatsapp: c.whatsapp_contato,
      whatsapp_formatado: formatarTelefone(c.whatsapp_contato),
      instagram_url: c.instagram_url,
      endereco_completo: c.endereco_completo,
    },
  }, headers);
}
