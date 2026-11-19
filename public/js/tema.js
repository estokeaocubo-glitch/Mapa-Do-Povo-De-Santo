// Tema: automático (segue o sistema), claro ou escuro.
const CHAVE = 'mps_tema';
const ORDEM = ['auto', 'claro', 'escuro'];
const ROTULO = { auto: 'Tema: automático', claro: 'Tema: claro', escuro: 'Tema: escuro' };
const ICONE = { auto: 'sun-moon', claro: 'sun', escuro: 'moon' };
const midia = window.matchMedia('(prefers-color-scheme: light)');

export function preferencia() {
  try { return localStorage.getItem(CHAVE) || 'auto'; } catch { return 'auto'; }
}

export function temaEfetivo() {
  const p = preferencia();
  return p === 'auto' ? (midia.matches ? 'claro' : 'escuro') : p;
}

function aplicar(p) {
  if (p === 'auto') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = p;
  try { p === 'auto' ? localStorage.removeItem(CHAVE) : localStorage.setItem(CHAVE, p); } catch { /* sem storage */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', temaEfetivo() === 'claro' ? '#F4F1EA' : '#12100E');
  window.dispatchEvent(new CustomEvent('tema:mudou', { detail: temaEfetivo() }));
}

// Botão que alterna automático → claro → escuro.
export function iniciarBotaoTema(botao) {
  const pintar = () => {
    const p = preferencia();
    botao.setAttribute('aria-label', ROTULO[p]);
    botao.title = ROTULO[p];
    botao.innerHTML = `<i data-lucide="${ICONE[p]}" class="h-4 w-4"></i>`;
    window.lucide?.createIcons();
  };
  botao.addEventListener('click', () => {
    aplicar(ORDEM[(ORDEM.indexOf(preferencia()) + 1) % ORDEM.length]);
    pintar();
  });
  midia.addEventListener('change', () => { if (preferencia() === 'auto') aplicar('auto'); });
  aplicar(preferencia());
  pintar();
}
