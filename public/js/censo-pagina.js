// Página pública do censo (/censo.html): mesma visualização do site, com
// endereço próprio para compartilhar, imprimir/salvar em PDF e baixar os dados.
import { api } from './api.js';
import { renderizarCenso } from './censo.js';
import { icones } from './utils.js';

const conteudo = document.getElementById('censo-conteudo');
document.getElementById('imprimir').addEventListener('click', () => window.print());
icones();
try {
  renderizarCenso(conteudo, await api.estatisticas());
  document.getElementById('gerado-em').textContent = new Date().toLocaleString('pt-BR');
} catch (err) {
  conteudo.innerHTML = `<p class="text-sm text-red-300">${err.message}</p>`;
}
