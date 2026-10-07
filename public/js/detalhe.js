// Drawer lateral (desktop) / bottom sheet (mobile) com a ficha completa da casa.
import { MENSAGEM_WHATSAPP, MENSAGEM_WHATSAPP_ENDERECO, RAIO_APROXIMADO_M, SEGMENTOS, segmentoDe } from './constants.js';
import { esc, formatarTelefone, icones, linkInstagramSeguro, linkWhatsapp } from './utils.js';

const drawer = () => document.getElementById('drawer');

export function abrirDetalhe(casa, { aoFechar }) {
  const el = drawer();
  document.getElementById('drawer-conteudo').innerHTML = htmlDetalhe(casa);
  icones();
  el.classList.add('aberto');
  el.setAttribute('aria-hidden', 'false');
  el.querySelector('[data-fechar-drawer]').addEventListener('click', aoFechar);
  el.focus({ preventScroll: true });
}

export function fecharDetalhe() {
  const el = drawer();
  el.classList.remove('aberto');
  el.setAttribute('aria-hidden', 'true');
}

export const detalheAberto = () => drawer().classList.contains('aberto');

function htmlDetalhe(c) {
  const seg = SEGMENTOS[segmentoDe(c)];
  const aproximado = c.nivel_privacidade === 'Aproximado';
  const whats = linkWhatsapp(c.whatsapp_contato, aproximado ? MENSAGEM_WHATSAPP_ENDERECO : MENSAGEM_WHATSAPP);
  const insta = linkInstagramSeguro(c.instagram_url);
  const idade = c.ano_fundacao ? new Date().getFullYear() - c.ano_fundacao : null;
  const subtitulo = [c.nacao_linha, c.orixa_guia_regente].filter(Boolean).map(esc).join(' · ');

  const giras = c.calendario_giras.length
    ? c.calendario_giras.map((g) => `
        <li class="flex gap-3 rounded-xl bg-white/[0.04] p-3">
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-terracota/15 text-terracota-400"><i data-lucide="calendar-days" class="h-4 w-4"></i></span>
          <span class="min-w-0 text-sm">
            <strong class="block text-algodao">${esc(g.tipo || 'Atendimento')}</strong>
            <span class="text-stone-300">${esc(g.dia)}${g.horario ? ` · ${esc(g.horario)}` : ''}</span>
            ${g.frequencia ? `<span class="block text-xs text-stone-500">${esc(g.frequencia)}</span>` : ''}
          </span>
        </li>`).join('')
    : '<li class="text-sm text-stone-400">A casa não divulgou um calendário público. Fale pelo WhatsApp.</li>';

  const acoes = c.acoes_sociais.length
    ? c.acoes_sociais.map((a) => `<span class="chip cursor-default"><i data-lucide="hand-heart" class="h-3.5 w-3.5 text-ouro"></i>${esc(a)}</span>`).join('')
    : '';

  const blocoLocal = aproximado
    ? `<div class="rounded-2xl border border-dashed border-white/20 bg-white/[0.03] p-4">
         <p class="flex items-center gap-2 text-sm font-semibold"><i data-lucide="circle-dashed" class="h-4 w-4 text-ouro"></i> Localização aproximada · ${esc(c.bairro)}</p>
         <p class="mt-1 text-xs leading-relaxed text-stone-400">Por segurança, esta casa mostra apenas uma área de ~${RAIO_APROXIMADO_M} m. O endereço é informado diretamente pela casa.</p>
         ${whats ? `<a href="${esc(whats)}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp mt-3 w-full"><i data-lucide="message-circle" class="h-4 w-4"></i>Solicitar endereço e agendamento via WhatsApp</a>` : ''}
       </div>`
    : `<div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
         <p class="flex items-center gap-2 text-sm font-semibold"><i data-lucide="map-pin" class="h-4 w-4 text-ouro"></i> ${esc(c.bairro)} · ${esc(c.distrito)}</p>
         ${c.endereco ? `<p class="mt-1 text-sm text-stone-300">${esc(c.endereco)}</p>` : ''}
         <a href="https://www.openstreetmap.org/directions?to=${c.localizacao.lat}%2C${c.localizacao.lng}" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ouro hover:underline">
           <i data-lucide="navigation" class="h-3.5 w-3.5"></i> Como chegar</a>
       </div>`;

  return `
    <div class="sticky top-0 z-10 flex justify-center bg-gradient-to-b from-stone-900 to-transparent pb-1 pt-2.5 md:hidden"><span class="h-1.5 w-12 rounded-full bg-white/25"></span></div>
    <article class="px-5 pb-8 md:px-6 md:pt-6">
      <div class="flex items-start gap-3">
        <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
              style="background:${seg.cor}26;color:${seg.cor}"><span class="dot" style="background:${seg.cor}"></span>${esc(c.categoria === 'Economia do Axé' ? 'Economia do Axé' : c.vertente)}</span>
        <button type="button" data-fechar-drawer class="btn-ghost ml-auto h-9 w-9 shrink-0 p-0" aria-label="Fechar detalhes"><i data-lucide="x" class="h-4 w-4"></i></button>
      </div>

      <h2 class="mt-3 font-display text-2xl font-bold leading-tight">${esc(c.nome_casa)}</h2>
      ${subtitulo ? `<p class="mt-1 text-sm text-ouro">${subtitulo}</p>` : ''}

      <dl class="mt-5 grid grid-cols-2 gap-2">
        ${c.lideranca_nome_religioso ? `
        <div class="col-span-2 rounded-2xl bg-white/[0.04] p-3.5">
          <dt class="text-[11px] uppercase tracking-wider text-stone-500">${esc(c.lideranca_titulo || 'Liderança')}</dt>
          <dd class="mt-0.5 font-semibold">${esc(c.lideranca_nome_religioso)}</dd>
        </div>` : ''}
        ${c.ano_fundacao ? `
        <div class="rounded-2xl bg-white/[0.04] p-3.5">
          <dt class="text-[11px] uppercase tracking-wider text-stone-500">Fundação</dt>
          <dd class="mt-0.5 font-semibold">${esc(c.ano_fundacao)}</dd>
        </div>
        <div class="rounded-2xl bg-white/[0.04] p-3.5">
          <dt class="text-[11px] uppercase tracking-wider text-stone-500">História</dt>
          <dd class="mt-0.5 font-semibold">${esc(idade)} anos de axé</dd>
        </div>` : ''}
      </dl>

      <div class="mt-4">${blocoLocal}</div>

      ${c.historia_resumo ? `
      <section class="mt-6">
        <h3 class="section-title">Memória da casa</h3>
        <p class="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-300">${esc(c.historia_resumo)}</p>
      </section>` : ''}

      <section class="mt-6">
        <h3 class="section-title">${c.categoria === 'Economia do Axé' ? 'Funcionamento' : 'Giras e atendimentos'}</h3>
        <ul class="mt-2 space-y-2">${giras}</ul>
      </section>

      ${acoes ? `
      <section class="mt-6">
        <h3 class="section-title">Ações sociais</h3>
        <div class="mt-2 flex flex-wrap gap-1.5">${acoes}</div>
      </section>` : ''}

      <section class="mt-7 space-y-2">
        ${whats && !aproximado ? `<a href="${esc(whats)}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp w-full"><i data-lucide="message-circle" class="h-4 w-4"></i>Falar no WhatsApp · ${esc(formatarTelefone(c.whatsapp_contato))}</a>` : ''}
        ${insta ? `<a href="${esc(insta)}" target="_blank" rel="noopener noreferrer" class="btn-ghost w-full"><i data-lucide="instagram" class="h-4 w-4"></i>Instagram</a>` : ''}
      </section>

      <p class="mt-6 rounded-xl bg-black/30 p-3 text-xs leading-relaxed text-stone-400">
        <i data-lucide="info" class="mr-1 inline h-3.5 w-3.5 align-[-2px]"></i>
        Ao visitar, respeite os fundamentos da casa: chegue no horário, prefira roupas claras e pergunte antes de fotografar.
      </p>
    </article>`;
}
