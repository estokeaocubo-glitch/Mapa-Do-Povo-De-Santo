// Códigos curtos para pessoas digitarem (edição da casa e visitante).
// Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L). Só o HASH vai para o banco.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function gerarCodigo(blocos = 3) {
  const bytes = crypto.getRandomValues(new Uint8Array(blocos * 4));
  const letras = [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('');
  return letras.match(/.{4}/g).join('-');            // ex.: K7QM-3XPA-WN9C (~59 bits)
}

export const normalizarCodigo = (codigo) => String(codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Códigos têm entropia alta (e tentativas são limitadas), então SHA-256 basta.
export async function hashCodigo(codigo) {
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`mps-codigo:${normalizarCodigo(codigo)}`));
  return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const pareceCodigo = (texto) => /^[A-Z2-9]{8,12}$/.test(normalizarCodigo(texto));
