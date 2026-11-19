// Cadastro de casa em PASSOS (entra na fila de moderação) — e o mesmo
// formulário para a própria casa EDITAR seus dados com o código de edição.
//
// PRIVACIDADE NO CADASTRO:
//  • A localização é marcada clicando no mini-mapa — NÃO usamos geocodificação
//    por serviço externo, para que o endereço de uma casa de axé não seja
//    enviado a terceiros (Google, Nominatim etc.).
//  • A coordenada marcada vai apenas para o nosso servidor, que calcula a
//    versão ofuscada; ela nunca é publicada se a casa escolher 'Aproximado'.
//  • O rascunho fica só neste aparelho (localStorage) e é apagado ao enviar.
import { api } from './api.js';
import {
  ACOES_SOCIAIS_SUGERIDAS, CENTRO_PETROPOLIS, DISTRITOS, TEXTO_PRIVACIDADE, TITULOS_LIDERANCA, VERTENTES,
} from './constants.js';
import { OPCOES_DIA, OPCOES_FREQUENCIA } from './giras.js';
import { urlBlocos } from './map.js';
import { esc, icones, toast } from './utils.js';
import { validarCadastro } from './validacao.js';

const PASSOS = [
  { titulo: 'Casa', campos: ['nome_casa', 'categoria', 'vertente', 'nacao_linha', 'orixa_guia_regente', 'ano_fundacao'] },
  { titulo: 'Liderança', campos: ['lideranca_titulo', 'lideranca_nome_religioso', 'historia_resumo'] },
  { titulo: 'Local e privacidade', campos: ['nivel_privacidade', 'distrito', 'bairro', 'endereco_completo', 'localizacao'] },
  { titulo: 'Giras', campos: ['calendario_giras', 'acoes_sociais'] },
  { titulo: 'Contato', campos: ['whatsapp_contato', 'instagram_url'] },
  { titulo: 'Revisão', campos: ['consentimento_lgpd'] },
];
const CHAVE_RASCUNHO = 'mps_rascunho_cadastro';

let miniMapa;
let marcador;
let posicaoPendente = null;
let passo = 0;
let modo = { tipo: 'novo' };          // ou { tipo: 'edicao', codigo, casa }

const $ = (id) => document.getElementById(id);
const form = () => $('form-cadastro');

const campo = (nome, rotulo, entrada, ajuda = '') => `
  <div data-campo="${nome}">
    <label class="label" for="cad-${nome}">${rotulo}</label>
    ${entrada}
    ${ajuda ? `<p class="mt-1 text-xs text-stone-400">${ajuda}</p>` : ''}
    <p class="erro mt-1 hidden text-xs text-red-300" role="alert"></p>
  </div>`;

const opcoes = (lista, placeholder) =>
  `<option value="">${esc(placeholder)}</option>${lista.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;

function htmlFormulario() {
  const privacidade = Object.entries(TEXTO_PRIVACIDADE).map(([valor, p]) => `
    <label class="opcao-privacidade block">
      <span class="flex items-center gap-2">
        <input type="radio" name="nivel_privacidade" value="${valor}" class="accent-[#D4AF37]" ${valor === 'Aproximado' ? 'checked' : ''} />
        <i data-lucide="${p.icone}" class="h-4 w-4 text-ouro"></i>
        <strong class="text-sm">${esc(p.titulo)}</strong>
      </span>
      <span class="mt-1.5 block text-xs leading-relaxed text-stone-400">${esc(p.texto)}</span>
    </label>`).join('');

  const acoes = ACOES_SOCIAIS_SUGERIDAS.map((a) => `
    <label class="chip cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ouro/60 has-[:checked]:border-ouro/60 has-[:checked]:bg-ouro/15 has-[:checked]:text-algodao">
      <input type="checkbox" name="acoes_sociais" value="${esc(a)}" class="sr-only" />${esc(a)}
    </label>`).join('');

  const edicao = modo.tipo === 'edicao';

  return `
    <input type="text" name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />

    <ol id="cad-progresso" class="flex gap-1.5" aria-label="Etapas do cadastro">
      ${PASSOS.map((p, i) => `
        <li class="flex-1">
          <button type="button" data-ir-passo="${i}" class="group block w-full text-left" aria-label="Etapa ${i + 1}: ${p.titulo}">
            <span class="block h-1.5 rounded-full bg-white/10 transition group-aria-[current=step]:bg-ouro group-data-[feito]:bg-terracota-600"></span>
            <span class="mt-1.5 hidden text-[11px] font-semibold text-stone-400 sm:block">${i + 1}. ${p.titulo}</span>
          </button>
        </li>`).join('')}
    </ol>
    <div id="cad-rascunho" class="hidden items-center gap-2 rounded-xl bg-ouro/10 px-3 py-2 text-xs text-stone-200">
      <i data-lucide="history" class="h-4 w-4 text-ouro"></i> Rascunho recuperado deste aparelho.
      <button type="button" id="cad-descartar" class="ml-auto font-semibold text-ouro hover:underline">Começar do zero</button>
    </div>

    <fieldset data-passo="0" class="space-y-4">
      <legend class="section-title mb-3">1 · Identidade da casa</legend>
      ${campo('nome_casa', 'Nome da casa *', '<input id="cad-nome_casa" name="nome_casa" class="field" maxlength="160" required placeholder="Ex.: Ilê Àṣẹ ... / Tenda de Umbanda ..." />')}
      <div class="grid gap-4 sm:grid-cols-2">
        ${campo('categoria', 'Tipo', `<select id="cad-categoria" name="categoria" class="field">
            <option value="Casa de Axé">Casa de Axé (terreiro, ilê, roça, tenda)</option>
            <option value="Economia do Axé">Economia do Axé (loja, ervas, artigos)</option></select>`)}
        ${campo('vertente', 'Vertente *', `<select id="cad-vertente" name="vertente" class="field" required>${opcoes(VERTENTES, 'Selecione')}</select>`)}
        ${campo('nacao_linha', 'Nação / Linha', '<input id="cad-nacao_linha" name="nacao_linha" class="field" maxlength="80" list="lista-nacoes" placeholder="Ketu, Angola, Jeje, Efòn…" />')}
        ${campo('orixa_guia_regente', 'Orixá / Guia regente', '<input id="cad-orixa_guia_regente" name="orixa_guia_regente" class="field" maxlength="120" placeholder="Ex.: Oxum, Caboclo Sete Flechas" />')}
        ${campo('ano_fundacao', 'Ano de fundação', `<input id="cad-ano_fundacao" name="ano_fundacao" type="number" inputmode="numeric" min="1800" max="${new Date().getFullYear()}" class="field" placeholder="Ex.: 1978" />`)}
      </div>
      <datalist id="lista-nacoes">
        ${['Ketu', 'Angola', 'Jeje', 'Efòn', 'Ijexá', 'Nagô', 'Umbanda Tradicional', 'Umbanda Sagrada', 'Umbanda Esotérica', 'Omolokô']
          .map((n) => `<option value="${n}"></option>`).join('')}
      </datalist>
    </fieldset>

    <fieldset data-passo="1" class="hidden space-y-4">
      <legend class="section-title mb-3">2 · Liderança e memória</legend>
      <div class="grid gap-4 sm:grid-cols-2">
        ${campo('lideranca_titulo', 'Título', `<input id="cad-lideranca_titulo" name="lideranca_titulo" class="field" maxlength="60" list="lista-titulos" placeholder="Yalorixá, Babalorixá, Tata…" />
          <datalist id="lista-titulos">${TITULOS_LIDERANCA.map((t) => `<option value="${t}"></option>`).join('')}</datalist>`)}
        ${campo('lideranca_nome_religioso', 'Nome religioso', '<input id="cad-lideranca_nome_religioso" name="lideranca_nome_religioso" class="field" maxlength="120" placeholder="Ex.: Mãe Fulana de Oxum" />',
          'Use o nome de santo/religioso. Não informe nome civil nem CPF.')}
      </div>
      ${campo('historia_resumo', 'Memória da casa', '<textarea id="cad-historia_resumo" name="historia_resumo" rows="5" maxlength="2000" class="field" placeholder="Como a casa nasceu, quem a fundou, marcos importantes…"></textarea>')}
    </fieldset>

    <fieldset data-passo="2" class="hidden space-y-4">
      <legend class="section-title mb-3">3 · Localização e privacidade</legend>
      <div class="rounded-2xl border border-ouro/30 bg-ouro/5 p-4 text-xs leading-relaxed text-stone-300">
        <p class="flex items-center gap-2 font-semibold text-ouro"><i data-lucide="shield-check" class="h-4 w-4"></i> Você decide como a casa aparece</p>
        <p class="mt-1">A localização exata marcada abaixo fica guardada de forma privada no servidor e serve para o censo e a moderação. O que vai a público depende do nível escolhido:</p>
      </div>
      <div class="grid gap-3 md:grid-cols-3" data-campo="nivel_privacidade">${privacidade}<p class="erro hidden text-xs text-red-300"></p></div>

      <div class="grid gap-4 sm:grid-cols-2">
        ${campo('distrito', 'Distrito *', `<select id="cad-distrito" name="distrito" class="field" required>${opcoes(DISTRITOS, 'Selecione')}</select>`)}
        ${campo('bairro', 'Bairro *', '<input id="cad-bairro" name="bairro" class="field" maxlength="100" required placeholder="Ex.: Quitandinha" />')}
      </div>
      ${campo('endereco_completo', 'Endereço completo', '<input id="cad-endereco_completo" name="endereco_completo" class="field" maxlength="300" placeholder="Rua, número, complemento" />',
        'Obrigatório para "Localização exata". Nos outros níveis, fica só com a moderação.')}

      <div data-campo="localizacao">
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <span class="label mb-0">Marque a casa no mapa *</span>
          <button type="button" id="cad-minha-localizacao" class="inline-flex items-center gap-1.5 text-xs font-semibold text-ouro hover:underline">
            <i data-lucide="crosshair" class="h-3.5 w-3.5"></i> Usar minha localização</button>
        </div>
        <div id="cad-mapa" class="h-64 overflow-hidden rounded-2xl border border-white/10"></div>
        <p id="cad-coords" class="mt-1 text-xs text-stone-400">Toque no mapa para posicionar o pino. Você pode arrastá-lo depois.</p>
        <p class="erro mt-1 hidden text-xs text-red-300" role="alert"></p>
      </div>
    </fieldset>

    <fieldset data-passo="3" class="hidden space-y-4">
      <legend class="section-title mb-3">4 · Giras e ações sociais</legend>
      <div data-campo="calendario_giras">
        <span class="label">Giras / atendimentos públicos</span>
        <p class="mb-2 text-xs text-stone-400">Escolha dia e frequência: assim a casa aparece em "Gira hoje" e as giras podem ir para a agenda do celular.</p>
        <div id="cad-giras" class="space-y-2"></div>
        <button type="button" id="cad-add-gira" class="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ouro hover:underline">
          <i data-lucide="plus" class="h-3.5 w-3.5"></i> Adicionar gira</button>
        <p class="erro mt-1 hidden text-xs text-red-300" role="alert"></p>
      </div>
      <div data-campo="acoes_sociais">
        <span class="label">Ações sociais</span>
        <div class="flex flex-wrap gap-1.5">${acoes}</div>
        <input id="cad-acoes-outras" class="field mt-2" maxlength="200" placeholder="Outras (separe por vírgula)" aria-label="Outras ações sociais" />
        <p class="erro mt-1 hidden text-xs text-red-300" role="alert"></p>
      </div>
    </fieldset>

    <fieldset data-passo="4" class="hidden space-y-4">
      <legend class="section-title mb-3">5 · Contato</legend>
      <div class="grid gap-4 sm:grid-cols-2">
        ${campo('whatsapp_contato', 'WhatsApp da casa', '<input id="cad-whatsapp_contato" name="whatsapp_contato" type="tel" inputmode="tel" class="field" maxlength="20" placeholder="(24) 99999-0000" />',
          'Obrigatório para localização aproximada.')}
        ${campo('instagram_url', 'Instagram', '<input id="cad-instagram_url" name="instagram_url" class="field" maxlength="200" placeholder="@suacasa" />')}
      </div>
      <label class="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <input type="checkbox" name="contato_restrito" class="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37]" />
        <span><strong class="block">Proteger o contato</strong>
          <span class="text-xs text-stone-400">WhatsApp, Instagram e endereço só aparecem para quem tiver um código que a própria casa entrega (você cria esses códigos em "Editar minha casa").</span></span>
      </label>
    </fieldset>

    <fieldset data-passo="5" class="hidden space-y-4">
      <legend class="section-title mb-3">6 · Revisão</legend>
      <div id="cad-resumo" class="space-y-2 text-sm"></div>
      <div data-campo="consentimento_lgpd" class="rounded-2xl border border-white/10 bg-black/30 p-4">
        <label class="flex items-start gap-3 text-xs leading-relaxed text-stone-300">
          <input type="checkbox" name="consentimento_lgpd" class="mt-0.5 h-4 w-4 shrink-0 accent-[#C85A32]" />
          <span>Declaro que represento esta casa (ou tenho autorização da liderança) e <strong>consinto</strong> com o tratamento destes dados — incluindo a informação sobre convicção religiosa, dado sensível pela LGPD (art. 11) — para fins de mapeamento, censo e defesa contra a intolerância religiosa. Posso pedir correção ou exclusão a qualquer momento, como explica a <a href="/privacidade.html" target="_blank" class="font-semibold text-ouro underline">política de privacidade</a>.</span>
        </label>
        <p class="erro mt-2 hidden text-xs text-red-300" role="alert"></p>
      </div>
    </fieldset>

    <div class="sticky bottom-0 -mx-5 flex items-center gap-2 border-t border-white/10 bg-stone-900/95 px-5 py-4 md:-mx-7 md:px-7">
      <button type="button" id="cad-voltar" class="btn-ghost"><i data-lucide="arrow-left" class="h-4 w-4"></i>Voltar</button>
      <p id="cad-etapa" class="hidden text-xs text-stone-400 sm:block"></p>
      <button type="button" id="cad-avancar" class="btn-primary ml-auto">Continuar<i data-lucide="arrow-right" class="h-4 w-4"></i></button>
      <button type="submit" id="cad-enviar" class="btn-primary ml-auto hidden"><i data-lucide="${edicao ? 'save' : 'send'}" class="h-4 w-4"></i>${edicao ? 'Salvar alterações' : 'Enviar para moderação'}</button>
    </div>`;
}

function linhaGira(g = {}) {
  const div = document.createElement('div');
  div.className = 'grid grid-cols-2 gap-2 rounded-xl bg-white/[0.03] p-2 sm:grid-cols-[1.1fr_.7fr_1.3fr_1.2fr_auto]';
  // Mantém valores antigos fora da lista (texto livre de cadastros anteriores).
  const opcoesCom = (lista, valor) => [...lista, ...(valor && !lista.includes(valor) ? [valor] : [])]
    .map((v) => `<option value="${esc(v)}" ${v === valor ? 'selected' : ''}>${esc(v)}</option>`).join('');
  div.innerHTML = `
    <select class="field" data-gira="dia" aria-label="Dia"><option value="">Dia</option>${opcoesCom(OPCOES_DIA, g.dia)}</select>
    <input class="field" data-gira="horario" maxlength="20" placeholder="19:00" aria-label="Horário" value="${esc(g.horario || '')}" />
    <input class="field" data-gira="tipo" maxlength="80" placeholder="Tipo (ex.: Gira de Caboclo)" aria-label="Tipo" value="${esc(g.tipo || '')}" />
    <select class="field" data-gira="frequencia" aria-label="Frequência"><option value="">Frequência</option>${opcoesCom(OPCOES_FREQUENCIA, g.frequencia)}</select>
    <button type="button" class="btn-ghost h-10 w-10 p-0" aria-label="Remover gira"><i data-lucide="trash-2" class="h-4 w-4"></i></button>`;
  div.querySelector('button').addEventListener('click', () => { div.remove(); salvarRascunho(); });
  return div;
}

// ---------------------------------------------------------------- mapa
function posicionar(latlng) {
  if (!miniMapa) { posicaoPendente = latlng; return; }
  if (!marcador) {
    marcador = L.marker(latlng, {
      draggable: true,
      icon: L.divIcon({
        className: '',
        html: '<div class="pino" style="--cor:#C85A32"><span class="pino-gota"></span><span class="pino-letra">●</span></div>',
        iconSize: [34, 44], iconAnchor: [17, 35],
      }),
    }).addTo(miniMapa);
    marcador.on('dragend', () => { mostrarCoords(marcador.getLatLng()); salvarRascunho(); });
  } else {
    marcador.setLatLng(latlng);
  }
  mostrarCoords(latlng);
}

function mostrarCoords({ lat, lng }) {
  $('cad-coords').textContent = `Ponto marcado: ${lat.toFixed(5)}, ${lng.toFixed(5)} (privado)`;
}

function iniciarMiniMapa() {
  if (miniMapa) { setTimeout(() => miniMapa.invalidateSize(), 50); return; }
  miniMapa = L.map('cad-mapa', { center: CENTRO_PETROPOLIS, zoom: 11, zoomControl: true });
  L.tileLayer(urlBlocos(), { subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(miniMapa);
  miniMapa.on('click', (e) => { posicionar(e.latlng); salvarRascunho(); });
  if (posicaoPendente) {
    const p = posicaoPendente;
    posicaoPendente = null;
    posicionar(p);
    miniMapa.setView(p, 15);
  }
  setTimeout(() => miniMapa.invalidateSize(), 50);
}

// ---------------------------------------------------------------- dados
function coletar() {
  const f = form();
  const fd = new FormData(f);
  const outras = $('cad-acoes-outras').value.split(',').map((s) => s.trim()).filter(Boolean);
  const giras = [...f.querySelectorAll('#cad-giras > div')].map((linha) =>
    Object.fromEntries([...linha.querySelectorAll('[data-gira]')].map((i) => [i.dataset.gira, i.value.trim()])))
    .filter((g) => g.dia || g.tipo);
  const pos = marcador?.getLatLng() || posicaoPendente;

  return {
    website: fd.get('website'),
    nome_casa: fd.get('nome_casa'),
    categoria: fd.get('categoria'),
    vertente: fd.get('vertente'),
    nacao_linha: fd.get('nacao_linha'),
    orixa_guia_regente: fd.get('orixa_guia_regente'),
    ano_fundacao: fd.get('ano_fundacao') || null,
    lideranca_titulo: fd.get('lideranca_titulo'),
    lideranca_nome_religioso: fd.get('lideranca_nome_religioso'),
    historia_resumo: fd.get('historia_resumo'),
    nivel_privacidade: fd.get('nivel_privacidade'),
    distrito: fd.get('distrito'),
    bairro: fd.get('bairro'),
    endereco_completo: fd.get('endereco_completo'),
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
    calendario_giras: giras,
    acoes_sociais: [...new Set([...fd.getAll('acoes_sociais'), ...outras])],
    whatsapp_contato: fd.get('whatsapp_contato'),
    instagram_url: fd.get('instagram_url'),
    contato_restrito: fd.get('contato_restrito') === 'on',
    consentimento_lgpd: fd.get('consentimento_lgpd') === 'on',
  };
}

function preencher(dados) {
  const f = form();
  for (const nome of ['nome_casa', 'categoria', 'vertente', 'nacao_linha', 'orixa_guia_regente', 'ano_fundacao', 'lideranca_titulo',
    'lideranca_nome_religioso', 'historia_resumo', 'distrito', 'bairro', 'endereco_completo', 'whatsapp_contato', 'instagram_url']) {
    const el = f.elements[nome];
    if (el && dados[nome] !== undefined && dados[nome] !== null) el.value = dados[nome];
  }
  if (dados.nivel_privacidade) f.querySelector(`[name=nivel_privacidade][value="${dados.nivel_privacidade}"]`)?.click();
  f.elements.contato_restrito.checked = Boolean(dados.contato_restrito);
  const sugeridas = new Set(ACOES_SOCIAIS_SUGERIDAS);
  f.querySelectorAll('[name=acoes_sociais]').forEach((c) => { c.checked = (dados.acoes_sociais || []).includes(c.value); });
  $('cad-acoes-outras').value = (dados.acoes_sociais || []).filter((a) => !sugeridas.has(a)).join(', ');
  const giras = $('cad-giras');
  giras.innerHTML = '';
  for (const g of (dados.calendario_giras?.length ? dados.calendario_giras : [{}])) giras.append(linhaGira(g));
  if (Number.isFinite(dados.lat) && Number.isFinite(dados.lng)) posicionar(L.latLng(dados.lat, dados.lng));
  icones();
}

// Rascunho só para cadastro novo; nunca guarda o consentimento.
function salvarRascunho() {
  if (modo.tipo !== 'novo' || !form().elements.nome_casa) return;
  try {
    const { consentimento_lgpd, website, ...dados } = coletar();
    localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ dados, passo, em: Date.now() }));
  } catch { /* sem storage: segue sem rascunho */ }
}
const lerRascunho = () => { try { return JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) || 'null'); } catch { return null; } };
const apagarRascunho = () => { try { localStorage.removeItem(CHAVE_RASCUNHO); } catch { /* sem storage */ } };

// ---------------------------------------------------------------- erros
function limparErros() {
  form().querySelectorAll('.erro').forEach((p) => { p.textContent = ''; p.classList.add('hidden'); });
  form().querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
}

const campoDoErro = (nome) => (nome.startsWith('calendario_giras') ? 'calendario_giras' : nome);
const passoDoCampo = (nome) => PASSOS.findIndex((p) => p.campos.includes(campoDoErro(nome)));

function mostrarErros(detalhes = {}) {
  let primeiro = null;
  for (const [nome, mensagem] of Object.entries(detalhes)) {
    const bloco = form().querySelector(`[data-campo="${campoDoErro(nome)}"]`);
    if (!bloco) continue;
    const p = bloco.querySelector('.erro');
    p.textContent = nome.startsWith('calendario_giras') ? `Giras: ${mensagem}` : mensagem;
    p.classList.remove('hidden');
    bloco.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea, input')?.setAttribute('aria-invalid', 'true');
    primeiro ??= bloco;
  }
  primeiro?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------------------------------------------------------------- passos
function irPara(novo) {
  passo = Math.max(0, Math.min(novo, PASSOS.length - 1));
  const f = form();
  f.querySelectorAll('[data-passo]').forEach((fs) => fs.classList.toggle('hidden', Number(fs.dataset.passo) !== passo));
  f.querySelectorAll('[data-ir-passo]').forEach((b) => {
    const i = Number(b.dataset.irPasso);
    b.toggleAttribute('data-feito', i < passo);
    if (i === passo) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  $('cad-voltar').classList.toggle('invisible', passo === 0);
  const ultimo = passo === PASSOS.length - 1;
  $('cad-avancar').classList.toggle('hidden', ultimo);
  $('cad-enviar').classList.toggle('hidden', !ultimo);
  $('cad-etapa').textContent = `Etapa ${passo + 1} de ${PASSOS.length} · ${PASSOS[passo].titulo}`;
  if (passo === 2) iniciarMiniMapa();
  if (ultimo) $('cad-resumo').innerHTML = resumo(coletar());
  f.scrollTop = 0;
  f.closest('.modal')?.querySelector('form')?.scrollTo?.(0, 0);
  icones();
}

// Valida só os campos da etapa atual (as mesmas regras do servidor).
function etapaValida() {
  limparErros();
  const { erros = {} } = validarCadastro(coletar());
  const daEtapa = Object.fromEntries(Object.entries(erros).filter(([nome]) => passoDoCampo(nome) === passo));
  if (Object.keys(daEtapa).length) { mostrarErros(daEtapa); return false; }
  return true;
}

function resumo(d) {
  const linha = (rotulo, valor) => (valor ? `<div class="flex gap-3 border-b border-white/5 pb-2"><span class="w-32 shrink-0 text-xs uppercase tracking-wider text-stone-400">${rotulo}</span><span>${esc(valor)}</span></div>` : '');
  const nivel = TEXTO_PRIVACIDADE[d.nivel_privacidade]?.titulo;
  return [
    linha('Casa', d.nome_casa),
    linha('Vertente', [d.vertente, d.nacao_linha].filter(Boolean).join(' · ')),
    linha('Liderança', [d.lideranca_titulo, d.lideranca_nome_religioso].filter(Boolean).join(' ')),
    linha('Local', [d.bairro, d.distrito].filter(Boolean).join(' · ')),
    linha('Privacidade', nivel),
    linha('Giras', d.calendario_giras.map((g) => [g.dia, g.horario, g.tipo].filter(Boolean).join(' ')).join('; ')),
    linha('Contato', [d.whatsapp_contato, d.instagram_url].filter(Boolean).join(' · ') + (d.contato_restrito ? ' (protegido)' : '')),
  ].join('') + '<p class="pt-1 text-xs text-stone-400">Para corrigir algo, toque na etapa correspondente no topo.</p>';
}

// ---------------------------------------------------------------- telas finais
function telaSucessoNovo(resposta) {
  form().innerHTML = `
    <div class="py-6 text-center">
      <span class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ouro/15 text-ouro"><i data-lucide="check" class="h-8 w-8"></i></span>
      <h3 class="mt-4 font-display text-2xl font-bold">Axé! Cadastro recebido.</h3>
      <p class="mx-auto mt-2 max-w-md text-sm text-stone-300">${esc(resposta.mensagem)}</p>
      <div class="mx-auto mt-6 max-w-md rounded-2xl border border-ouro/40 bg-ouro/10 p-5 text-left">
        <p class="section-title">Código de edição da casa</p>
        <p class="mt-2 select-all text-center font-mono text-2xl font-bold tracking-widest text-algodao">${esc(resposta.codigo_edicao)}</p>
        <button type="button" id="copiar-codigo" class="btn-gold mt-3 w-full"><i data-lucide="copy" class="h-4 w-4"></i>Copiar código</button>
        <p class="mt-3 text-xs leading-relaxed text-stone-300"><strong>Guarde este código.</strong> Com ele a casa edita os dados, muda a privacidade, cria códigos de visitante ou exclui o cadastro, em "Editar minha casa". Não compartilhe: ele não será mostrado de novo.</p>
      </div>
      <p class="mt-4 text-xs uppercase tracking-widest text-stone-400">Protocolo <strong class="text-algodao">${esc(resposta.protocolo)}</strong></p>
      <button type="button" class="btn-ghost mt-6" data-fechar>Voltar ao mapa</button>
    </div>`;
  $('copiar-codigo').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(resposta.codigo_edicao); toast('Código copiado.', 'ok'); } catch { toast('Selecione e copie o código.', 'info'); }
  });
  icones();
}

function telaSucessoEdicao() {
  form().innerHTML = `
    <div class="py-10 text-center">
      <span class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ouro/15 text-ouro"><i data-lucide="check" class="h-8 w-8"></i></span>
      <h3 class="mt-4 font-display text-2xl font-bold">Alterações salvas.</h3>
      <p class="mx-auto mt-2 max-w-md text-sm text-stone-300">O mapa já mostra os dados novos para quem abrir o site.</p>
      <button type="button" class="btn-primary mt-6" id="recarregar-mapa"><i data-lucide="refresh-cw" class="h-4 w-4"></i>Ver no mapa</button>
    </div>`;
  $('recarregar-mapa').addEventListener('click', () => location.assign('/'));
  icones();
}

// ---------------------------------------------------------------- montagem
function montar() {
  const f = form();
  f.innerHTML = htmlFormulario();
  marcador = null;
  if (miniMapa) { miniMapa.remove(); miniMapa = null; }
  $('cad-giras').append(linhaGira());
  $('cad-add-gira').addEventListener('click', () => {
    if (f.querySelectorAll('#cad-giras > div').length >= 14) return;
    $('cad-giras').append(linhaGira());
    icones();
  });
  $('cad-minha-localizacao').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Seu navegador não permite obter a localização.', 'erro');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const ll = L.latLng(coords.latitude, coords.longitude);
        posicionar(ll);
        miniMapa?.setView(ll, 16);
        salvarRascunho();
      },
      () => toast('Não foi possível obter sua localização. Marque no mapa.', 'erro'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
  $('cad-voltar').addEventListener('click', () => irPara(passo - 1));
  $('cad-avancar').addEventListener('click', () => { if (etapaValida()) { irPara(passo + 1); salvarRascunho(); } });
  f.querySelectorAll('[data-ir-passo]').forEach((b) => b.addEventListener('click', () => {
    const alvo = Number(b.dataset.irPasso);
    if (alvo <= passo || etapaValida()) irPara(alvo);
  }));
  $('cad-descartar').addEventListener('click', () => { apagarRascunho(); montar(); irPara(0); });

  const titulo = $('titulo-cadastro');
  if (modo.tipo === 'edicao') {
    titulo.textContent = `Editar · ${modo.casa.nome_casa}`;
    preencher(modo.casa);
    f.elements.consentimento_lgpd.checked = true;
  } else {
    titulo.textContent = 'Cadastrar uma casa';
    const rascunho = lerRascunho();
    if (rascunho?.dados?.nome_casa) {
      preencher(rascunho.dados);
      $('cad-rascunho').classList.replace('hidden', 'flex');
    }
  }
  passo = 0;
  icones();
}

let timerRascunho;
function debounceRascunho() { clearTimeout(timerRascunho); timerRascunho = setTimeout(salvarRascunho, 400); }

// Abre o formulário em modo de edição (chamado por "Editar minha casa").
export function abrirEdicao(casa, codigo, abrirModal) {
  modo = { tipo: 'edicao', casa, codigo };
  montar();
  $('modal-cadastro').dataset.modo = 'edicao';   // o evento "modal:aberto" não reinicia o formulário
  abrirModal('modal-cadastro');
}

export function iniciarCadastro() {
  const modal = $('modal-cadastro');
  const f = form();
  montar();
  irPara(0);
  f.addEventListener('input', debounceRascunho);
  f.addEventListener('change', debounceRascunho);

  modal.addEventListener('modal:aberto', () => {
    // Após um envio, ou vindo de uma edição, volta ao formulário de cadastro novo.
    if (!f.querySelector('[name="nome_casa"]') || (modo.tipo === 'edicao' && modal.dataset.modo !== 'edicao')) {
      modo = { tipo: 'novo' };
      montar();
    }
    modal.dataset.modo = '';
    irPara(passo);
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Enter num campo das etapas anteriores = "Continuar".
    if (passo !== PASSOS.length - 1) { $('cad-avancar').click(); return; }
    limparErros();
    const dados = coletar();
    // Mesmas regras do servidor, antes de enviar: erros aparecem na hora e
    // não gastam o limite de envios.
    const { erros } = validarCadastro(dados);
    if (erros) {
      const primeiro = Math.min(...Object.keys(erros).map(passoDoCampo).filter((i) => i >= 0));
      irPara(primeiro);
      mostrarErros(Object.fromEntries(Object.entries(erros).filter(([n]) => passoDoCampo(n) === primeiro)));
      toast('Revise os campos destacados.', 'erro');
      return;
    }
    const botao = $('cad-enviar');
    botao.disabled = true;
    botao.innerHTML = '<i data-lucide="loader-circle" class="h-4 w-4 animate-spin"></i> Enviando…';
    icones();
    try {
      if (modo.tipo === 'edicao') {
        await api.minhaCasa(modo.codigo, 'salvar', { dados });
        telaSucessoEdicao();
      } else {
        const resposta = await api.cadastrar(dados);
        apagarRascunho();
        telaSucessoNovo(resposta);
      }
      f.scrollTop = 0;
    } catch (err) {
      if (err.detalhes) {
        const primeiro = Math.min(...Object.keys(err.detalhes).map(passoDoCampo).filter((i) => i >= 0));
        if (Number.isFinite(primeiro)) irPara(primeiro);
        mostrarErros(err.detalhes);
      }
      toast(err.message, 'erro');
      botao.disabled = false;
      botao.innerHTML = `<i data-lucide="${modo.tipo === 'edicao' ? 'save' : 'send'}" class="h-4 w-4"></i>${modo.tipo === 'edicao' ? 'Salvar alterações' : 'Enviar para moderação'}`;
      icones();
    }
  });
}
