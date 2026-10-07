// Formulário público de cadastro de casa (entra na fila de moderação).
//
// PRIVACIDADE NO CADASTRO:
//  • A localização é marcada clicando no mini-mapa — NÃO usamos geocodificação
//    por serviço externo, para que o endereço de uma casa de axé não seja
//    enviado a terceiros (Google, Nominatim etc.).
//  • A coordenada marcada vai apenas para o nosso servidor, que calcula a
//    versão ofuscada; ela nunca é publicada se a casa escolher 'Aproximado'.
import { api } from './api.js';
import {
  ACOES_SOCIAIS_SUGERIDAS, CENTRO_PETROPOLIS, DISTRITOS, TEXTO_PRIVACIDADE, TITULOS_LIDERANCA, VERTENTES,
} from './constants.js';
import { esc, icones, toast } from './utils.js';

let miniMapa;
let marcador;

const campo = (nome, rotulo, entrada, ajuda = '') => `
  <div data-campo="${nome}">
    <label class="label" for="cad-${nome}">${rotulo}</label>
    ${entrada}
    ${ajuda ? `<p class="mt-1 text-xs text-stone-500">${ajuda}</p>` : ''}
    <p class="erro mt-1 hidden text-xs text-red-300"></p>
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

  return `
    <input type="text" name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />

    <fieldset class="space-y-4">
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

    <fieldset class="space-y-4">
      <legend class="section-title mb-3">2 · Liderança</legend>
      <div class="grid gap-4 sm:grid-cols-2">
        ${campo('lideranca_titulo', 'Título', `<input id="cad-lideranca_titulo" name="lideranca_titulo" class="field" maxlength="60" list="lista-titulos" placeholder="Yalorixá, Babalorixá, Tata…" />
          <datalist id="lista-titulos">${TITULOS_LIDERANCA.map((t) => `<option value="${t}"></option>`).join('')}</datalist>`)}
        ${campo('lideranca_nome_religioso', 'Nome religioso', '<input id="cad-lideranca_nome_religioso" name="lideranca_nome_religioso" class="field" maxlength="120" placeholder="Ex.: Mãe Fulana de Oxum" />',
          'Use o nome de santo/religioso. Não informe nome civil nem CPF.')}
      </div>
      ${campo('historia_resumo', 'Memória da casa', '<textarea id="cad-historia_resumo" name="historia_resumo" rows="4" maxlength="2000" class="field" placeholder="Como a casa nasceu, quem a fundou, marcos importantes…"></textarea>')}
    </fieldset>

    <fieldset class="space-y-4">
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
        'Só é exibido se você escolher "Localização exata".')}

      <div data-campo="localizacao">
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <span class="label mb-0">Marque a casa no mapa *</span>
          <button type="button" id="cad-minha-localizacao" class="inline-flex items-center gap-1.5 text-xs font-semibold text-ouro hover:underline">
            <i data-lucide="crosshair" class="h-3.5 w-3.5"></i> Usar minha localização</button>
        </div>
        <div id="cad-mapa" class="h-64 overflow-hidden rounded-2xl border border-white/10"></div>
        <p id="cad-coords" class="mt-1 text-xs text-stone-500">Toque no mapa para posicionar o pino. Você pode arrastá-lo depois.</p>
        <p class="erro mt-1 hidden text-xs text-red-300"></p>
      </div>
    </fieldset>

    <fieldset class="space-y-4">
      <legend class="section-title mb-3">4 · Giras e ações sociais</legend>
      <div>
        <span class="label">Giras / atendimentos públicos</span>
        <div id="cad-giras" class="space-y-2"></div>
        <button type="button" id="cad-add-gira" class="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ouro hover:underline">
          <i data-lucide="plus" class="h-3.5 w-3.5"></i> Adicionar gira</button>
      </div>
      <div data-campo="acoes_sociais">
        <span class="label">Ações sociais</span>
        <div class="flex flex-wrap gap-1.5">${acoes}</div>
        <input id="cad-acoes-outras" class="field mt-2" maxlength="200" placeholder="Outras (separe por vírgula)" />
        <p class="erro mt-1 hidden text-xs text-red-300"></p>
      </div>
    </fieldset>

    <fieldset class="space-y-4">
      <legend class="section-title mb-3">5 · Contato</legend>
      <div class="grid gap-4 sm:grid-cols-2">
        ${campo('whatsapp_contato', 'WhatsApp da casa', '<input id="cad-whatsapp_contato" name="whatsapp_contato" type="tel" inputmode="tel" class="field" maxlength="20" placeholder="(24) 99999-0000" />',
          'Obrigatório para localização aproximada.')}
        ${campo('instagram_url', 'Instagram', '<input id="cad-instagram_url" name="instagram_url" class="field" maxlength="200" placeholder="@suacasa" />')}
      </div>
    </fieldset>

    <div data-campo="consentimento_lgpd" class="rounded-2xl border border-white/10 bg-black/30 p-4">
      <label class="flex items-start gap-3 text-xs leading-relaxed text-stone-300">
        <input type="checkbox" name="consentimento_lgpd" class="mt-0.5 h-4 w-4 shrink-0 accent-[#C85A32]" />
        <span>Declaro que represento esta casa (ou tenho autorização da liderança) e <strong>consinto</strong> com o tratamento destes dados — incluindo a informação sobre convicção religiosa, dado sensível pela LGPD (art. 11) — para fins de mapeamento, censo e defesa contra a intolerância religiosa. Posso pedir correção ou exclusão a qualquer momento.</span>
      </label>
      <p class="erro mt-2 hidden text-xs text-red-300"></p>
    </div>

    <div class="sticky bottom-0 -mx-5 flex flex-col gap-2 border-t border-white/10 bg-stone-900/95 px-5 py-4 sm:flex-row sm:items-center md:-mx-7 md:px-7">
      <p class="text-xs text-stone-400">Todo cadastro passa por moderação antes de ir ao mapa.</p>
      <button type="submit" class="btn-primary sm:ml-auto"><i data-lucide="send" class="h-4 w-4"></i> Enviar para moderação</button>
    </div>`;
}

function linhaGira() {
  const div = document.createElement('div');
  div.className = 'grid grid-cols-2 gap-2 rounded-xl bg-white/[0.03] p-2 sm:grid-cols-[1fr_.7fr_1.3fr_1fr_auto]';
  div.innerHTML = `
    <input class="field" data-gira="dia" maxlength="30" placeholder="Dia (ex.: Sábado)" aria-label="Dia" />
    <input class="field" data-gira="horario" maxlength="20" placeholder="Horário" aria-label="Horário" />
    <input class="field" data-gira="tipo" maxlength="80" placeholder="Tipo (ex.: Gira de Caboclo)" aria-label="Tipo" />
    <input class="field" data-gira="frequencia" maxlength="40" placeholder="Frequência" aria-label="Frequência" />
    <button type="button" class="btn-ghost h-10 w-10 p-0" aria-label="Remover gira"><i data-lucide="trash-2" class="h-4 w-4"></i></button>`;
  div.querySelector('button').addEventListener('click', () => div.remove());
  return div;
}

function posicionar(latlng) {
  if (!marcador) {
    marcador = L.marker(latlng, {
      draggable: true,
      icon: L.divIcon({
        className: '',
        html: '<div class="pino" style="--cor:#C85A32"><span class="pino-gota"></span><span class="pino-letra">●</span></div>',
        iconSize: [34, 44], iconAnchor: [17, 35],
      }),
    }).addTo(miniMapa);
    marcador.on('dragend', () => mostrarCoords(marcador.getLatLng()));
  } else {
    marcador.setLatLng(latlng);
  }
  mostrarCoords(latlng);
}

function mostrarCoords({ lat, lng }) {
  document.getElementById('cad-coords').textContent = `Ponto marcado: ${lat.toFixed(5)}, ${lng.toFixed(5)} (privado)`;
}

function iniciarMiniMapa() {
  if (miniMapa) {
    setTimeout(() => miniMapa.invalidateSize(), 50);
    return;
  }
  miniMapa = L.map('cad-mapa', { center: CENTRO_PETROPOLIS, zoom: 11, zoomControl: true });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO',
  }).addTo(miniMapa);
  miniMapa.on('click', (e) => posicionar(e.latlng));
  setTimeout(() => miniMapa.invalidateSize(), 50);
}

function limparErros(form) {
  form.querySelectorAll('.erro').forEach((p) => { p.textContent = ''; p.classList.add('hidden'); });
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
}

function mostrarErros(form, detalhes = {}) {
  let primeiro = null;
  for (const [nome, mensagem] of Object.entries(detalhes)) {
    const chave = nome.startsWith('calendario_giras') ? 'acoes_sociais' : nome;
    const bloco = form.querySelector(`[data-campo="${chave}"]`);
    if (!bloco) continue;
    const p = bloco.querySelector('.erro');
    p.textContent = nome.startsWith('calendario_giras') ? `Giras: ${mensagem}` : mensagem;
    p.classList.remove('hidden');
    bloco.querySelector('input, select, textarea')?.setAttribute('aria-invalid', 'true');
    primeiro ??= bloco;
  }
  primeiro?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function coletar(form) {
  const fd = new FormData(form);
  const outras = document.getElementById('cad-acoes-outras').value.split(',').map((s) => s.trim()).filter(Boolean);
  const giras = [...form.querySelectorAll('#cad-giras > div')].map((linha) =>
    Object.fromEntries([...linha.querySelectorAll('[data-gira]')].map((i) => [i.dataset.gira, i.value.trim()])))
    .filter((g) => g.dia || g.tipo);
  const pos = marcador?.getLatLng();

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
    acoes_sociais: [...fd.getAll('acoes_sociais'), ...outras],
    whatsapp_contato: fd.get('whatsapp_contato'),
    instagram_url: fd.get('instagram_url'),
    consentimento_lgpd: fd.get('consentimento_lgpd') === 'on',
  };
}

function telaSucesso(form, resposta) {
  form.innerHTML = `
    <div class="py-10 text-center">
      <span class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ouro/15 text-ouro"><i data-lucide="check" class="h-8 w-8"></i></span>
      <h3 class="mt-4 font-display text-2xl font-bold">Axé! Cadastro recebido.</h3>
      <p class="mx-auto mt-2 max-w-md text-sm text-stone-300">${esc(resposta.mensagem)}</p>
      <p class="mt-4 text-xs uppercase tracking-widest text-stone-500">Protocolo <strong class="text-algodao">${esc(resposta.protocolo)}</strong></p>
      <button type="button" class="btn-ghost mt-6" data-fechar>Voltar ao mapa</button>
    </div>`;
  icones();
}

function montar(form) {
  form.innerHTML = htmlFormulario();
  marcador = null;
  if (miniMapa) { miniMapa.remove(); miniMapa = null; }
  document.getElementById('cad-giras').append(linhaGira());
  document.getElementById('cad-add-gira').addEventListener('click', () => {
    if (document.querySelectorAll('#cad-giras > div').length >= 14) return;
    document.getElementById('cad-giras').append(linhaGira());
    icones();
  });
  document.getElementById('cad-minha-localizacao').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Seu navegador não permite obter a localização.', 'erro');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const ll = L.latLng(coords.latitude, coords.longitude);
        posicionar(ll);
        miniMapa.setView(ll, 16);
      },
      () => toast('Não foi possível obter sua localização. Marque no mapa.', 'erro'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
  icones();
}

export function iniciarCadastro() {
  const modal = document.getElementById('modal-cadastro');
  const form = document.getElementById('form-cadastro');
  montar(form);

  modal.addEventListener('modal:aberto', () => {
    if (!form.querySelector('[name="nome_casa"]')) montar(form); // após um envio bem-sucedido
    iniciarMiniMapa();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros(form);
    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    botao.innerHTML = '<i data-lucide="loader-circle" class="h-4 w-4 animate-spin"></i> Enviando…';
    icones();
    try {
      const resposta = await api.cadastrar(coletar(form));
      telaSucesso(form, resposta);
      form.scrollTop = 0;
    } catch (err) {
      if (err.detalhes) mostrarErros(form, err.detalhes);
      toast(err.message, 'erro');
      botao.disabled = false;
      botao.innerHTML = '<i data-lucide="send" class="h-4 w-4"></i> Enviar para moderação';
      icones();
    }
  });
}
