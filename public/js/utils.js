// Utilitários do front-end.

// Escapa texto antes de inserir em HTML — todo dado vindo da API passa por aqui.
export function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function linkWhatsapp(numero, mensagem) {
  const digitos = String(numero || '').replace(/\D/g, '');
  if (!digitos) return null;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

// Só permite links https do Instagram (evita javascript: e afins).
export function linkInstagramSeguro(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)instagram\.com$/.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

export function formatarTelefone(numero) {
  const d = String(numero || '').replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return numero;
}

// Substitui os <i data-lucide="..."> recém-inseridos por SVGs.
export function icones() {
  window.lucide?.createIcons();
}

export function toast(mensagem, tipo = 'info') {
  const el = document.createElement('div');
  const cor = tipo === 'erro' ? 'border-red-400/40' : tipo === 'ok' ? 'border-emerald-400/40' : 'border-white/10';
  el.className = `glass pointer-events-auto max-w-md rounded-xl border ${cor} px-4 py-3 text-sm shadow-xl`;
  el.textContent = mensagem;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 5000);
}

export const ehMobile = () => window.matchMedia('(max-width: 767px)').matches;
