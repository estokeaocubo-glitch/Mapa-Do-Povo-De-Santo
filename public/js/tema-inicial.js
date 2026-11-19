// Aplica o tema escolhido ANTES de pintar a página (evita piscar).
// Script clássico e minúsculo, carregado no <head> (a CSP não permite inline).
try {
  const tema = localStorage.getItem('mps_tema');
  if (tema === 'claro' || tema === 'escuro') document.documentElement.dataset.tema = tema;
} catch { /* sem storage: segue o sistema */ }
