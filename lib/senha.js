// Senha de acesso aos contatos restritos e comparação de tokens.
// A senha NUNCA fica no código: guardamos só um hash PBKDF2-SHA256 no secret
// ACESSO_RESTRITO_HASH (gerado por `npm run hash-senha`).
// Usa apenas Web Crypto, disponível tanto no Cloudflare Workers quanto no Node.
const ITERACOES = 100_000; // máximo aceito pelo PBKDF2 do Workers

// Aceita a senha com ou sem espaços, traços ou parênteses (digitação no celular).
export const normalizarSenha = (senha) => String(senha ?? '').replace(/\D/g, '');

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

async function derivar(senha, sal, iteracoes) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, chave, 256);
}

// Comparação em tempo constante (evita ataque de temporização).
export function iguaisTempoConstante(a, b) {
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function gerarHash(senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(normalizarSenha(senha), sal, ITERACOES);
  return `pbkdf2$${ITERACOES}$${hex(sal)}$${hex(hash)}`;
}

export async function verificarSenha(senha, armazenado) {
  const [alg, iter, salHex, hashHex] = String(armazenado || '').split('$');
  if (alg !== 'pbkdf2' || !iter || !salHex || !hashHex) return false;
  const normalizada = normalizarSenha(senha);
  if (!normalizada) return false;
  const calculado = await derivar(normalizada, deHex(salHex), Number(iter));
  return iguaisTempoConstante(calculado, deHex(hashHex));
}

export async function sha256(texto) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
}

export const sha256Hex = async (texto) => hex(await sha256(texto));
