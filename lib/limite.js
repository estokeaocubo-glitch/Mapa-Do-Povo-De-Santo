// Limite de tentativas guardado no D1: vale para todas as instâncias do
// Worker no mundo (um contador em memória seria zerado a cada instância).
//
// Uso em duas etapas, para NÃO punir quem usa o site corretamente:
//   1. excedeuLimite()      → só consulta;
//   2. registrarTentativa() → chamado apenas no evento que deve contar
//      (senha errada, token errado, cadastro aceito).
//
// O IP vira um HMAC com o secret IP_SALT: sem o secret, não dá para reverter
// o hash testando os ~4 bilhões de IPv4 possíveis.
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function chaveDe(env, tipo, ip) {
  const segredo = env.IP_SALT || env.ACESSO_RESTRITO_HASH || 'mapa-povo-de-santo-dev';
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  // IPv6: agrupa pelo prefixo /64 (um único cliente costuma controlar o /64 inteiro).
  const ipNormalizado = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
  return `${tipo}:${hex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(ipNormalizado)))}`;
}

export async function excedeuLimite(env, tipo, ip, { limite, janelaMs }) {
  const { total } = await env.DB
    .prepare('SELECT COUNT(*) AS total FROM tentativas WHERE chave = ?1 AND em > ?2')
    .bind(await chaveDe(env, tipo, ip), Date.now() - janelaMs)
    .first();
  return total >= limite;
}

export async function registrarTentativa(env, tipo, ip) {
  const agora = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO tentativas (chave, em) VALUES (?1, ?2)').bind(await chaveDe(env, tipo, ip), agora),
    // Faxina: nada é guardado por mais de 24 h.
    env.DB.prepare('DELETE FROM tentativas WHERE em < ?1').bind(agora - 24 * 60 * 60 * 1000),
  ]);
}
