// Sessão de desbloqueio: depois de acertar a senha UMA vez, a pessoa recebe um
// cookie assinado (HMAC) válido por 30 min e não precisa digitar a senha de
// novo em cada casa. A chave de assinatura é derivada do próprio hash da
// senha: trocar a senha invalida na hora todas as sessões abertas.
const COOKIE = 'mps_acesso';
export const DURACAO_SESSAO_S = 30 * 60;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function chave(segredo) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(`sessao:${segredo}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function criarCookieSessao(segredo, { seguro = true, agoraMs = Date.now() } = {}) {
  const expira = Math.floor(agoraMs / 1000) + DURACAO_SESSAO_S;
  const assinatura = b64url(await crypto.subtle.sign('HMAC', await chave(segredo), new TextEncoder().encode(String(expira))));
  return `${COOKIE}=${expira}.${assinatura}; Max-Age=${DURACAO_SESSAO_S}; Path=/api/desbloquear; HttpOnly; SameSite=Strict${seguro ? '; Secure' : ''}`;
}

export async function sessaoValida(request, segredo) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([A-Za-z0-9_-]+)`));
  if (!m) return false;
  const [, expira, assinatura] = m;
  if (Number(expira) < Date.now() / 1000) return false;
  let bytes;
  try {
    bytes = Uint8Array.from(atob(assinatura.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  // verify() compara em tempo constante.
  return crypto.subtle.verify('HMAC', await chave(segredo), bytes, new TextEncoder().encode(expira));
}
