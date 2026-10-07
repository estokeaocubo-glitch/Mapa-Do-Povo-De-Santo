// Senha de acesso aos contatos restritos.
// A senha NUNCA fica no código: guardamos só um hash scrypt na variável de
// ambiente ACESSO_RESTRITO_HASH (gerado por `npm run hash-senha`).
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Aceita a senha com ou sem espaços, traços ou parênteses (digitação no celular).
export const normalizarSenha = (senha) => String(senha ?? '').replace(/\D/g, '');

export function gerarHash(senha) {
  const sal = randomBytes(16);
  const hash = scryptSync(normalizarSenha(senha), sal, 32);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

export function verificarSenha(senha, hashArmazenado) {
  const [alg, salHex, hashHex] = String(hashArmazenado || '').split('$');
  if (alg !== 'scrypt' || !salHex || !hashHex) return false;
  const normalizada = normalizarSenha(senha);
  if (!normalizada) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = scryptSync(normalizada, Buffer.from(salHex, 'hex'), esperado.length);
  return timingSafeEqual(calculado, esperado);
}
