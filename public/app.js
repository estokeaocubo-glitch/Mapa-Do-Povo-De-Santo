// Mapa do Povo de Santo — ponto de entrada do front-end.
import { api } from './js/api.js';
import { DISTRITOS, SEGMENTOS, VERTENTES, segmentoDe } from './js/constants.js';
import { abrirDetalhe, detalheAberto, fecharDetalhe } from './js/detalhe.js';
import { criarMapa, enquadrar, focarCasa, invalidar, marcarAtivo, renderizarCasas } from './js/map.js';
import { iniciarCadastro } from './js/cadastro.js';
import { renderizarCenso } from './js/censo.js';
import { debounce, ehMobile, esc, icones, normalizar, toast } from './js/utils.js';

const estado = {
  casas: [],
  estatisticas: null,
  selecionadaId: null,
  filtros: { busca: '', segmentos: new Set(), vertente: '', distrito: '', acao: '' },
};

const $ = (id) => document.getElementById(id);

// ============================== Filtros ==============================
function aplicarFiltros() {
  const { busca, segmentos, vertente, distrito, acao } = estado.filtros;
  const termo = normalizar(busca.trim());

  return estado.casas.filter((c) => {
    if (segmentos.size && !segmentos.has(segmentoDe(c))) return false;
    if (vertente) {
      const [tipo, valor] = vertente.split(':');
      if (tipo === 'v' && c.vertente !== valor) return false;
      if (tipo === 'n' && c.nacao_linha !== valor) return false;
    }
    if (distrito && c.distrito !== distrito) return false;
    if (acao && !c.acoes_sociais.includes(acao)) return false;
    if (termo) {
      const alvo = normalizar([c.nome_casa, c.orixa_guia_regente, c.lideranca_nome_religioso, c.lideranca_titulo,
        c.nacao_linha, c.vertente, c.bairro].join(' '));
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

function montarFiltros() {
  // Chips de segmento: funcionam também como legenda das cores do mapa.
  $('filtro-segmentos').innerHTML = Object.entries(SEGMENTOS).map(([chave, s]) => `
    <button type="button" class="chip" data-segmento="${chave}" aria-pressed="false">
      <span class="dot" style="background:${s.cor}"></span>${esc(s.rotulo)}
    </button>`).join('');

  const nacoes = [...new Set(estado.casas.map((c) => c.nacao_linha).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  $('filtro-vertente').innerHTML = `
    <option value="">Todas as vertentes e nações</option>
    <optgroup label="Vertente">${VERTENTES.map((v) => `<option value="v:${esc(v)}">${esc(v)}</option>`).join('')}</optgroup>
    <optgroup label="Nação / Linha">${nacoes.map((n) => `<option value="n:${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>`;

  $('filtro-distrito').innerHTML = `<option value="">Todos os distritos</option>${
    DISTRITOS.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}`;

  const acoes = [...new Set(estado.casas.flatMap((c) => c.acoes_sociais))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  $('filtro-acao').innerHTML = `<option value="">Todas as ações sociais</option>${
    acoes.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}`;

  $('filtro-segmentos').addEventListener('click', (e) => {
    const botao = e.target.closest('[data-segmento]');
    if (!botao) return;
    const s = botao.dataset.segmento;
    estado.filtros.segmentos.has(s) ? estado.filtros.segmentos.delete(s) : estado.filtros.segmentos.add(s);
    botao.setAttribute('aria-pressed', String(estado.filtros.segmentos.has(s)));
    atualizar({ enquadrar: true });
  });

  $('filtro-busca').addEventListener('input', debounce((e) => {
    estado.filtros.busca = e.target.value;
    atualizar({ enquadrar: true });
  }, 180));

  for (const [id, chave] of [['filtro-vertente', 'vertente'], ['filtro-distrito', 'distrito'], ['filtro-acao', 'acao']]) {
    $(id).addEventListener('change', (e) => {
      estado.filtros[chave] = e.target.value;
      atualizar({ enquadrar: true });
    });
  }

  $('limpar-filtros').addEventListener('click', () => {
    Object.assign(estado.filtros, { busca: '', vertente: '', distrito: '', acao: '' });
    estado.filtros.segmentos.clear();
    $('filtro-busca').value = '';
    ['filtro-vertente', 'filtro-distrito', 'filtro-acao'].forEach((id) => { $(id).value = ''; });
    document.querySelectorAll('[data-segmento]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    atualizar({ enquadrar: true });
  });
}

// ============================== Lista ==============================
function renderizarLista(casas) {
  const lista = $('lista-casas');
  if (!casas.length) {
    lista.innerHTML = `
      <li class="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-stone-400">
        <i data-lucide="search-x" class="mx-auto mb-2 h-6 w-6"></i>
        Nenhuma casa encontrada com esses filtros.
      </li>`;
    icones();
    return;
  }
  lista.innerHTML = casas.map((c) => {
    const seg = SEGMENTOS[segmentoDe(c)];
    const aproximado = c.nivel_privacidade === 'Aproximado';
    return `
      <li>
        <button type="button" class="card-casa" data-id="${esc(c.id)}" aria-current="${c.id === estado.selecionadaId}">
          <div class="flex items-start gap-3">
            <span class="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-breu" style="background:${seg.cor}">${esc(seg.letra)}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-semibold">${esc(c.nome_casa)}</span>
              <span class="block truncate text-xs text-stone-400">${esc([c.nacao_linha || c.vertente, c.orixa_guia_regente].filter(Boolean).join(' · '))}</span>
              <span class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
                <span class="inline-flex items-center gap-1"><i data-lucide="${aproximado ? 'circle-dashed' : 'map-pin'}" class="h-3 w-3"></i>${esc(c.bairro)}${aproximado ? ' (aprox.)' : ''}</span>
                ${c.ano_fundacao ? `<span class="inline-flex items-center gap-1"><i data-lucide="landmark" class="h-3 w-3"></i>desde ${esc(c.ano_fundacao)}</span>` : ''}
                ${c.acoes_sociais.length ? `<span class="inline-flex items-center gap-1"><i data-lucide="hand-heart" class="h-3 w-3"></i>${c.acoes_sociais.length} ações sociais</span>` : ''}
              </span>
            </span>
          </div>
        </button>
      </li>`;
  }).join('');
  icones();
}

function atualizarContagem(casas) {
  const total = estado.casas.length;
  const ocultas = estado.estatisticas?.casas_ocultas || 0;
  $('contagem').textContent = casas.length === total
    ? `${total} ${total === 1 ? 'casa' : 'casas'} no mapa${ocultas ? ` · +${ocultas} só no censo` : ''}`
    : `${casas.length} de ${total} casas`;

  const f = estado.filtros;
  const ativos = [f.vertente, f.distrito, f.acao].filter(Boolean).length;
  $('filtros-ativos').textContent = ativos;
  $('filtros-ativos').classList.toggle('hidden', !ativos);
  $('limpar-filtros').classList.toggle('hidden', !(ativos || f.busca || f.segmentos.size));
}

function atualizar({ enquadrar: deveEnquadrar = false } = {}) {
  const casas = aplicarFiltros();
  renderizarCasas(casas);
  renderizarLista(casas);
  atualizarContagem(casas);
  if (estado.selecionadaId) marcarAtivo(estado.selecionadaId);
  if (deveEnquadrar && casas.length) enquadrar(casas);
}

// ============================== Seleção / detalhe ==============================
function selecionar(id, { voar = true } = {}) {
  const casa = estado.casas.find((c) => c.id === id);
  if (!casa) return;
  estado.selecionadaId = id;
  document.querySelectorAll('.card-casa').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
  abrirDetalhe(casa, { aoFechar: desselecionar });
  if (ehMobile()) definirEstadoPainel('recolhido');
  if (voar) focarCasa(id, { deslocarPara: ehMobile() ? 'cima' : 'esquerda' });
  else marcarAtivo(id);
  history.replaceState(null, '', `#${casa.slug}`);
}

function desselecionar() {
  estado.selecionadaId = null;
  fecharDetalhe();
  marcarAtivo(null);
  document.querySelectorAll('.card-casa').forEach((b) => b.setAttribute('aria-current', 'false'));
  history.replaceState(null, '', location.pathname);
}

// ============================== Bottom sheet (mobile) ==============================
const ESTADOS_PAINEL = ['recolhido', 'meio', 'cheio'];

function definirEstadoPainel(novo) {
  $('painel').dataset.estado = novo;
}

function iniciarBottomSheet() {
  const painel = $('painel');
  const alca = $('painel-alca');
  let inicioY = 0;
  let inicioTranslate = 0;
  let ultimoY = 0;
  let arrastou = false;

  const translateAtual = () => new DOMMatrixReadOnly(getComputedStyle(painel).transform).m42;

  alca.addEventListener('pointerdown', (e) => {
    if (!ehMobile()) return;
    inicioY = ultimoY = e.clientY;
    inicioTranslate = translateAtual();
    arrastou = false;
    painel.classList.add('arrastando');
    alca.setPointerCapture(e.pointerId);
  });

  alca.addEventListener('pointermove', (e) => {
    if (!painel.classList.contains('arrastando')) return;
    const delta = e.clientY - inicioY;
    if (Math.abs(delta) > 4) arrastou = true;
    ultimoY = e.clientY;
    const max = painel.offsetHeight - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--peek'));
    painel.style.transform = `translateY(${Math.min(Math.max(inicioTranslate + delta, 0), max)}px)`;
  });

  const soltar = () => {
    if (!painel.classList.contains('arrastando')) return;
    painel.classList.remove('arrastando');
    const y = translateAtual();
    painel.style.transform = '';
    if (!arrastou) {
      // Toque simples na alça: alterna entre os estados.
      const i = ESTADOS_PAINEL.indexOf(painel.dataset.estado);
      return definirEstadoPainel(ESTADOS_PAINEL[(i + 1) % ESTADOS_PAINEL.length]);
    }
    const h = painel.offsetHeight;
    const alvos = { cheio: 0, meio: h * 0.45, recolhido: h - 172 };
    const maisProximo = Object.entries(alvos).sort((a, b) => Math.abs(a[1] - y) - Math.abs(b[1] - y))[0][0];
    definirEstadoPainel(maisProximo);
  };
  alca.addEventListener('pointerup', soltar);
  alca.addEventListener('pointercancel', soltar);

  // Focar a busca no mobile expande o painel.
  $('filtro-busca').addEventListener('focus', () => {
    if (ehMobile() && painel.dataset.estado === 'recolhido') definirEstadoPainel('meio');
  });
}

// ============================== Modais ==============================
let ultimoFoco = null;

export function abrirModal(id) {
  ultimoFoco = document.activeElement;
  const modal = $(id);
  modal.classList.add('aberto');
  modal.querySelector('input, select, textarea, button')?.focus({ preventScroll: true });
  modal.dispatchEvent(new CustomEvent('modal:aberto'));
}

function fecharModal(modal) {
  modal.classList.remove('aberto');
  ultimoFoco?.focus?.({ preventScroll: true });
}

function iniciarModais() {
  document.addEventListener('click', (e) => {
    const abrir = e.target.closest('[data-abrir]');
    if (abrir) return abrirModal(abrir.dataset.abrir);
    const fechar = e.target.closest('[data-fechar]');
    if (fechar) fecharModal(fechar.closest('.modal'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = document.querySelector('.modal.aberto');
    if (modal) fecharModal(modal);
    else if (detalheAberto()) desselecionar();
  });

  $('modal-censo').addEventListener('modal:aberto', async () => {
    try {
      const stats = await api.estatisticas();
      estado.estatisticas = stats;
      renderizarCenso($('censo-conteudo'), stats);
    } catch {
      $('censo-conteudo').innerHTML = '<p class="text-sm text-red-300">Não foi possível carregar o censo agora.</p>';
    }
  });
}

// ============================== Inicialização ==============================
async function iniciar() {
  icones();
  criarMapa('mapa', { aoSelecionar: (id) => selecionar(id) });
  iniciarModais();
  iniciarBottomSheet();
  iniciarCadastro();

  $('lista-casas').addEventListener('click', (e) => {
    const card = e.target.closest('.card-casa');
    if (card) selecionar(card.dataset.id);
  });

  try {
    const { terreiros, estatisticas } = await api.terreiros();
    estado.casas = terreiros;
    estado.estatisticas = estatisticas;
  } catch (err) {
    $('contagem').textContent = 'Não foi possível carregar as casas.';
    toast(err.message, 'erro');
    return;
  }

  montarFiltros();
  atualizar();
  enquadrar(estado.casas);

  // Link direto para uma casa: /#slug-da-casa
  const irParaHash = () => {
    const slug = decodeURIComponent(location.hash.slice(1));
    const casa = slug && estado.casas.find((c) => c.slug === slug);
    if (casa && casa.id !== estado.selecionadaId) selecionar(casa.id);
  };
  window.addEventListener('hashchange', irParaHash);
  setTimeout(irParaHash, 400);

  window.addEventListener('resize', debounce(invalidar, 150));
}

iniciar();
