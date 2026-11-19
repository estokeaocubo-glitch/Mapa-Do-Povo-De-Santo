// Mapa do Povo de Santo — ponto de entrada do front-end.
import { api } from './js/api.js';
import { DISTRITOS, GLOSSARIO, SEGMENTOS, VERTENTES, segmentoDe } from './js/constants.js';
import { abrirDetalhe, detalheAberto, fecharDetalhe } from './js/detalhe.js';
import { girasDoDia } from './js/giras.js';
import {
  centroDoMapa, criarMapa, destacarDistrito, enquadrar, estaVisivel, focarCasa, invalidar, marcarAtivo, mostrarUsuario, renderizarCasas,
} from './js/map.js';
import { iniciarCadastro } from './js/cadastro.js';
import { iniciarMinhaCasa } from './js/minha-casa.js';
import { renderizarCenso } from './js/censo.js';
import { iniciarBotaoTema } from './js/tema.js';
import { debounce, ehMobile, esc, icones, normalizar, toast } from './js/utils.js';

const estado = {
  casas: [],
  estatisticas: null,
  selecionadaId: null,
  usuario: null,               // posição do aparelho (só na memória, nunca enviada)
  ordenacao: 'centro',
  filtros: { busca: '', segmentos: new Set(), vertente: '', distrito: '', acao: '', hoje: false, area: false },
};

const $ = (id) => document.getElementById(id);

// ============================== Filtros e ordenação ==============================
// Filtros que valem para o mapa e para a lista.
function aplicarFiltros() {
  const { busca, segmentos, vertente, distrito, acao, hoje } = estado.filtros;
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
    if (hoje && (c.categoria === 'Economia do Axé' || !girasDoDia(c).length)) return false;
    if (termo) {
      const alvo = normalizar([c.nome_casa, c.orixa_guia_regente, c.lideranca_nome_religioso, c.lideranca_titulo,
        c.nacao_linha, c.vertente, c.bairro].join(' '));
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

const distanciaKm = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  return Math.hypot(x, (b.lat - a.lat) * r) * 6371;
};

// A lista acompanha o mapa: pode mostrar só o que está visível e é ordenada
// pela proximidade do centro do mapa (ou da pessoa, em "Perto de mim").
function casasDaLista(casas) {
  let lista = estado.filtros.area ? casas.filter(estaVisivel) : [...casas];
  const ponto = (c) => ({ lat: c.localizacao.lat, lng: c.localizacao.lng });
  const ordens = {
    nome: (a, b) => a.nome_casa.localeCompare(b.nome_casa, 'pt-BR'),
    antigas: (a, b) => (a.ano_fundacao ?? 9999) - (b.ano_fundacao ?? 9999),
    centro: (() => { const c = centroDoMapa(); return (a, b) => distanciaKm(c, ponto(a)) - distanciaKm(c, ponto(b)); })(),
    distancia: (a, b) => distanciaKm(estado.usuario, ponto(a)) - distanciaKm(estado.usuario, ponto(b)),
  };
  const ordem = estado.ordenacao === 'distancia' && !estado.usuario ? 'centro' : estado.ordenacao;
  lista = lista.sort(ordens[ordem]);
  return lista;
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
      // Distrito com limite desenhado: enquadra o distrito inteiro, não só as casas.
      const enquadrouDistrito = chave === 'distrito' && destacarDistrito(e.target.value);
      atualizar({ enquadrar: !enquadrouDistrito });
    });
  }

  $('ordenacao').addEventListener('change', (e) => { estado.ordenacao = e.target.value; atualizarLista(); });

  $('filtro-hoje').addEventListener('click', (e) => {
    estado.filtros.hoje = !estado.filtros.hoje;
    e.currentTarget.setAttribute('aria-pressed', String(estado.filtros.hoje));
    atualizar({ enquadrar: true });
  });
  $('filtro-area').addEventListener('click', (e) => {
    estado.filtros.area = !estado.filtros.area;
    e.currentTarget.setAttribute('aria-pressed', String(estado.filtros.area));
    atualizarLista();
  });
  $('perto-de-mim').addEventListener('click', localizarUsuario);

  $('limpar-filtros').addEventListener('click', () => {
    Object.assign(estado.filtros, { busca: '', vertente: '', distrito: '', acao: '', hoje: false, area: false });
    estado.filtros.segmentos.clear();
    $('filtro-busca').value = '';
    ['filtro-vertente', 'filtro-distrito', 'filtro-acao'].forEach((id) => { $(id).value = ''; });
    destacarDistrito('');
    document.querySelectorAll('[data-segmento], #filtro-hoje, #filtro-area').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    atualizar({ enquadrar: true });
  });
}

function localizarUsuario() {
  if (!navigator.geolocation) return toast('Este navegador não permite obter a localização.', 'erro');
  const botao = $('perto-de-mim');
  botao.disabled = true;
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      botao.disabled = false;
      botao.setAttribute('aria-pressed', 'true');
      estado.usuario = { lat: coords.latitude, lng: coords.longitude };
      const opcao = $('ordenacao').querySelector('[value=distancia]');
      opcao.hidden = false;
      $('ordenacao').value = estado.ordenacao = 'distancia';
      mostrarUsuario(coords.latitude, coords.longitude);
      atualizarLista();
      toast('Lista ordenada pela sua localização. Ela fica só neste aparelho.', 'ok');
    },
    () => {
      botao.disabled = false;
      toast('Não foi possível obter sua localização.', 'erro');
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

// ============================== Lista e carrossel ==============================
function seloHoje(c) {
  const hoje = girasDoDia(c);
  if (!hoje.length) return '';
  const certa = hoje.find((g) => g.hoje === 'sim');
  const rotulo = c.categoria === 'Economia do Axé' ? 'Aberto hoje' : 'Gira hoje';
  return certa
    ? `<span class="selo-hoje"><i data-lucide="calendar-check" class="h-3 w-3"></i>${rotulo}${certa.horario ? ` · ${esc(certa.horario)}` : ''}</span>`
    : '<span class="selo-hoje">Pode ter gira hoje</span>';
}

function htmlCard(c, { compacto = false } = {}) {
  const seg = SEGMENTOS[segmentoDe(c)];
  const aproximado = c.nivel_privacidade === 'Aproximado';
  const distancia = estado.usuario ? distanciaKm(estado.usuario, c.localizacao) : null;
  return `
    <button type="button" class="card-casa${compacto ? ' glass !bg-stone-900/95' : ''}" data-id="${esc(c.id)}" aria-current="${c.id === estado.selecionadaId}">
      <div class="flex items-start gap-3">
        <span class="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-tinta" style="background:${seg.cor}" aria-hidden="true">${esc(seg.letra)}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">${esc(c.nome_casa)}</span>
          <span class="block truncate text-xs text-stone-400">${esc([c.nacao_linha || c.vertente, c.orixa_guia_regente].filter(Boolean).join(' · '))}</span>
          <span class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-400">
            ${seloHoje(c)}
            <span class="inline-flex items-center gap-1"><i data-lucide="${aproximado ? 'circle-dashed' : 'map-pin'}" class="h-3 w-3"></i>${esc(c.bairro)}${aproximado ? ' (aprox.)' : ''}</span>
            ${distancia !== null ? `<span>${distancia < 1 ? `${Math.round(distancia * 1000)} m` : `${distancia.toFixed(1).replace('.', ',')} km`}</span>` : ''}
            ${!compacto && c.ano_fundacao ? `<span class="inline-flex items-center gap-1"><i data-lucide="landmark" class="h-3 w-3"></i>desde ${esc(c.ano_fundacao)}</span>` : ''}
            ${!compacto && c.acoes_sociais.length ? `<span class="inline-flex items-center gap-1"><i data-lucide="hand-heart" class="h-3 w-3"></i>${c.acoes_sociais.length} ações sociais</span>` : ''}
          </span>
        </span>
      </div>
    </button>`;
}

function renderizarLista(casas) {
  const lista = $('lista-casas');
  if (!casas.length) {
    lista.innerHTML = `
      <li class="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-stone-400">
        <i data-lucide="search-x" class="mx-auto mb-2 h-6 w-6"></i>
        ${estado.filtros.area ? 'Nenhuma casa nesta área do mapa. Afaste o zoom ou desligue "Só nesta área".' : 'Nenhuma casa encontrada com esses filtros.'}
      </li>`;
  } else {
    lista.innerHTML = casas.map((c) => `<li>${htmlCard(c)}</li>`).join('');
  }
  // Carrossel do celular: mesmas casas, cards compactos.
  $('carrossel').innerHTML = casas.slice(0, 30).map((c) => `<div role="listitem">${htmlCard(c, { compacto: true })}</div>`).join('');
  icones();
}

function atualizarContagem(casasMapa, casasLista) {
  const total = estado.casas.length;
  const ocultas = estado.estatisticas?.casas_ocultas || 0;
  let texto = casasMapa.length === total
    ? `${total} ${total === 1 ? 'casa' : 'casas'} no mapa${ocultas ? ` · +${ocultas} só no censo` : ''}`
    : `${casasMapa.length} de ${total} casas`;
  if (estado.filtros.area) texto += ` · ${casasLista.length} nesta área`;
  $('contagem').textContent = texto;

  const f = estado.filtros;
  const ativos = [f.vertente, f.distrito, f.acao].filter(Boolean).length;
  $('filtros-ativos').textContent = ativos;
  $('filtros-ativos').classList.toggle('hidden', !ativos);
  $('limpar-filtros').classList.toggle('hidden', !(ativos || f.busca || f.segmentos.size || f.hoje || f.area));
}

let casasFiltradas = [];
function atualizarLista() {
  const lista = casasDaLista(casasFiltradas);
  renderizarLista(lista);
  atualizarContagem(casasFiltradas, lista);
}

function atualizar({ enquadrar: deveEnquadrar = false } = {}) {
  casasFiltradas = aplicarFiltros();
  renderizarCasas(casasFiltradas);
  if (estado.selecionadaId) marcarAtivo(estado.selecionadaId);
  if (deveEnquadrar && casasFiltradas.length) enquadrar(casasFiltradas);
  atualizarLista();
}

// Ao deslizar o carrossel, o mapa vai até a casa do card central.
function iniciarCarrossel() {
  const carrossel = $('carrossel');
  carrossel.addEventListener('click', (e) => {
    const card = e.target.closest('.card-casa');
    if (card) selecionar(card.dataset.id);
  });
  carrossel.addEventListener('scroll', debounce(() => {
    const meio = carrossel.getBoundingClientRect().left + carrossel.clientWidth / 2;
    const central = [...carrossel.querySelectorAll('.card-casa')]
      .sort((a, b) => Math.abs(a.getBoundingClientRect().left + a.offsetWidth / 2 - meio) - Math.abs(b.getBoundingClientRect().left + b.offsetWidth / 2 - meio))[0];
    if (!central) return;
    estado.movidoPeloCarrossel = true;   // não reordena a lista enquanto a pessoa desliza
    focarCasa(central.dataset.id, { deslocarPara: 'cima', zoom: 14 });
  }, 200));
}

// ============================== Seleção / detalhe ==============================
function selecionar(id, { voar = true } = {}) {
  const casa = estado.casas.find((c) => c.id === id);
  if (!casa) return;
  // Guarda de onde a pessoa veio para devolver o foco ao fechar a ficha.
  if (!document.getElementById('drawer').contains(document.activeElement)) estado.origemFoco = document.activeElement;
  estado.selecionadaId = id;
  document.querySelectorAll('.card-casa').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
  abrirDetalhe(casa, { aoFechar: desselecionar, aoAbrirTermo: abrirGlossario });
  if (ehMobile()) definirEstadoPainel('recolhido');
  estado.movidoPeloCarrossel = true;
  if (voar) focarCasa(id, { deslocarPara: ehMobile() ? 'cima' : 'esquerda' });
  else marcarAtivo(id);
  // Endereço próprio da casa (compartilhável, com prévia nas redes).
  history.replaceState(null, '', `/casa/${casa.slug}`);
  document.title = `${casa.nome_casa} · Mapa do Povo de Santo`;
}

function desselecionar() {
  estado.selecionadaId = null;
  fecharDetalhe();
  marcarAtivo(null);
  document.querySelectorAll('.card-casa').forEach((b) => b.setAttribute('aria-current', 'false'));
  history.replaceState(null, '', '/');
  document.title = 'Mapa do Povo de Santo · Petrópolis';
  // Devolve o foco ao card (ou elemento) que abriu a ficha; se ele sumiu
  // (filtro mudou), vai para a lista.
  const origem = estado.origemFoco;
  estado.origemFoco = null;
  if (origem?.isConnected && origem !== document.body) origem.focus({ preventScroll: true });
  else $('lista-casas').querySelector('.card-casa')?.focus({ preventScroll: true });
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
  let arrastou = false;

  const translateAtual = () => new DOMMatrixReadOnly(getComputedStyle(painel).transform).m42;
  const peek = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--peek'));

  alca.addEventListener('pointerdown', (e) => {
    if (!ehMobile()) return;
    inicioY = e.clientY;
    inicioTranslate = translateAtual();
    arrastou = false;
    painel.classList.add('arrastando');
    alca.setPointerCapture(e.pointerId);
  });

  alca.addEventListener('pointermove', (e) => {
    if (!painel.classList.contains('arrastando')) return;
    const delta = e.clientY - inicioY;
    if (Math.abs(delta) > 4) arrastou = true;
    painel.style.transform = `translateY(${Math.min(Math.max(inicioTranslate + delta, 0), painel.offsetHeight - peek())}px)`;
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
    const alvos = { cheio: 0, meio: h * 0.45, recolhido: h - peek() };
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

// Enquanto uma janela está aberta, o resto da página fica "inerte": o Tab não
// sai da janela e leitores de tela não leem o fundo.
const FUNDO = () => [document.querySelector('header'), document.querySelector('main'), document.querySelector('a[href="#lista-casas"]')];

export function abrirModal(id) {
  if (!document.querySelector('.modal.aberto')) ultimoFoco = document.activeElement;
  const modal = $(id);
  FUNDO().forEach((el) => el && (el.inert = true));
  modal.classList.add('aberto');
  modal.querySelector('input:not([type=hidden]), select, textarea, button')?.focus({ preventScroll: true });
  modal.dispatchEvent(new CustomEvent('modal:aberto'));
}

function fecharModal(modal) {
  modal.classList.remove('aberto');
  if (!document.querySelector('.modal.aberto')) {
    FUNDO().forEach((el) => el && (el.inert = false));
    ultimoFoco?.focus?.({ preventScroll: true });
  }
}

function iniciarModais() {
  document.addEventListener('click', (e) => {
    const abrir = e.target.closest('[data-abrir]');
    if (abrir) return abrirModal(abrir.dataset.abrir);
    const fechar = e.target.closest('[data-fechar]');
    if (fechar) {
      fecharModal(fechar.closest('.modal'));
      if (fechar.dataset.depoisAbrir) abrirModal(fechar.dataset.depoisAbrir);
    }
  });
  document.addEventListener('keydown', (e) => {
    // Prende o foco dentro da janela aberta: Tab no último item volta ao primeiro.
    const aberta = document.querySelector('.modal.aberto');
    if (e.key === 'Tab' && aberta) {
      const focaveis = [...aberta.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]):not([tabindex="-1"]), select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null);
      if (!focaveis.length) return;
      const [primeiro, ultimo] = [focaveis[0], focaveis[focaveis.length - 1]];
      if (e.shiftKey && (document.activeElement === primeiro || !aberta.contains(document.activeElement))) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && (document.activeElement === ultimo || !aberta.contains(document.activeElement))) { e.preventDefault(); primeiro.focus(); }
      return;
    }
    if (e.key !== 'Escape') return;
    const modal = document.querySelector('.modal.aberto');
    if (modal) fecharModal(modal);
    else if (detalheAberto()) desselecionar();
  });

  $('modal-censo').addEventListener('modal:aberto', async () => {
    try {
      // Reaproveita as estatísticas que vieram com /api/terreiros (até 5 min).
      if (!estado.estatisticas || Date.now() - estado.estatisticasEm > 5 * 60 * 1000) {
        estado.estatisticas = await api.estatisticas();
        estado.estatisticasEm = Date.now();
      }
      renderizarCenso($('censo-conteudo'), estado.estatisticas, { aoAbrirCasa: (slug) => {
        fecharModal($('modal-censo'));
        const casa = estado.casas.find((c) => c.slug === slug);
        if (casa) selecionar(casa.id);
      } });
    } catch {
      $('censo-conteudo').innerHTML = '<p class="text-sm text-red-300">Não foi possível carregar o censo agora.</p>';
    }
  });
}

// ============================== Glossário ==============================
function renderizarGlossario(filtro = '') {
  const termo = normalizar(filtro);
  const itens = Object.entries(GLOSSARIO)
    .filter(([t, d]) => !termo || normalizar(`${t} ${d}`).includes(termo))
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  $('glossario-lista').innerHTML = itens.map(([t, d]) => `
    <div id="termo-${esc(normalizar(t).replace(/\W+/g, '-'))}" class="rounded-xl bg-white/[0.03] p-3">
      <dt class="font-semibold text-ouro">${esc(t)}</dt><dd class="mt-1 text-sm leading-relaxed text-stone-300">${esc(d)}</dd>
    </div>`).join('') || '<p class="text-sm text-stone-400">Nenhum termo encontrado.</p>';
}

function abrirGlossario(termo) {
  abrirModal('modal-glossario');
  $('glossario-busca').value = '';
  renderizarGlossario();
  if (termo) {
    const alvo = document.getElementById(`termo-${normalizar(termo).replace(/\W+/g, '-')}`);
    alvo?.scrollIntoView({ block: 'center' });
    alvo?.classList.add('ring-2', 'ring-ouro/60');
  }
}

function iniciarGlossario() {
  renderizarGlossario();
  $('glossario-busca').addEventListener('input', (e) => renderizarGlossario(e.target.value));
}

// ============================== Boas-vindas ==============================
const CHAVE_BOAS_VINDAS = 'mps_boas_vindas';
function iniciarBoasVindas() {
  $('rever-boas-vindas').addEventListener('click', () => abrirModal('modal-boas-vindas'));
  let visto = true;
  try { visto = localStorage.getItem(CHAVE_BOAS_VINDAS) === '1'; } catch { /* sem storage: não insiste */ }
  // Quem chega por um link de casa vai direto à casa.
  if (!visto && !location.pathname.startsWith('/casa/')) {
    abrirModal('modal-boas-vindas');
    try { localStorage.setItem(CHAVE_BOAS_VINDAS, '1'); } catch { /* sem storage */ }
  }
}

// ============================== Carregamento ==============================
async function carregarCasas() {
  const lista = $('lista-casas');
  try {
    const { terreiros, estatisticas } = await api.terreiros();
    estado.casas = terreiros;
    estado.estatisticas = estatisticas;
    estado.estatisticasEm = Date.now();
    lista.removeAttribute('aria-busy');
    return true;
  } catch (err) {
    lista.removeAttribute('aria-busy');
    $('contagem').textContent = 'Não foi possível carregar as casas.';
    lista.innerHTML = `
      <li class="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-stone-300">
        <i data-lucide="wifi-off" class="mx-auto mb-2 h-6 w-6 text-ouro"></i>
        <p>${esc(err.message)}</p>
        <button type="button" id="tentar-novamente" class="btn-ghost mt-4"><i data-lucide="refresh-cw" class="h-4 w-4"></i>Tentar novamente</button>
      </li>`;
    icones();
    $('tentar-novamente').addEventListener('click', () => location.reload());
    return false;
  }
}

// Casa indicada no endereço: /casa/<slug> (ou o formato antigo /#slug).
function slugDoEndereco() {
  if (location.pathname.startsWith('/casa/')) return decodeURIComponent(location.pathname.slice(6)).replace(/\/$/, '');
  return decodeURIComponent(location.hash.slice(1));
}

// ============================== Inicialização ==============================
async function iniciar() {
  iniciarBotaoTema($('botao-tema'));
  icones();
  criarMapa('mapa', {
    aoSelecionar: (id) => selecionar(id),
    aoMover: debounce(() => {
      // Reordena/filtra a lista pelo que está visível — exceto quando o próprio
      // carrossel moveu o mapa (senão os cards mudariam de lugar sob o dedo).
      if (estado.movidoPeloCarrossel) { estado.movidoPeloCarrossel = false; return; }
      if (estado.casas.length && (estado.filtros.area || estado.ordenacao === 'centro')) atualizarLista();
    }, 250),
  });
  iniciarModais();
  iniciarBottomSheet();
  iniciarCarrossel();
  iniciarGlossario();
  iniciarCadastro();
  iniciarMinhaCasa({ abrir: abrirModal, fechar: fecharModal });
  iniciarBoasVindas();

  $('lista-casas').addEventListener('click', (e) => {
    const card = e.target.closest('.card-casa');
    if (card) selecionar(card.dataset.id);
  });

  if (!(await carregarCasas())) return;
  montarFiltros();
  atualizar();
  enquadrar(estado.casas);

  const irParaEndereco = () => {
    const slug = slugDoEndereco();
    const casa = slug && estado.casas.find((c) => c.slug === slug);
    if (casa && casa.id !== estado.selecionadaId) selecionar(casa.id);
  };
  window.addEventListener('hashchange', irParaEndereco);
  setTimeout(irParaEndereco, 400);

  window.addEventListener('resize', debounce(invalidar, 150));
}

iniciar();

// Uso sem internet (service worker). Só em HTTPS ou localhost.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
