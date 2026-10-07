// Página de estatísticas do censo em Bento Grid.
// Os números incluem as casas ocultas (apenas agregadas; nunca nomeadas).
import { SEGMENTOS, segmentoDe } from './constants.js';
import { esc, icones } from './utils.js';

const fmt = new Intl.NumberFormat('pt-BR');

function barras(itens, { cor = () => 'var(--terracota)', rotulo = (i) => i.rotulo } = {}) {
  if (!itens.length) return '<p class="text-sm text-stone-500">Sem dados ainda.</p>';
  const max = Math.max(...itens.map((i) => i.total), 1);
  return `<ul class="space-y-2.5">${itens.map((i) => `
    <li title="${esc(rotulo(i))}: ${fmt.format(i.total)}">
      <div class="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span class="truncate text-stone-300">${esc(rotulo(i))}</span>
        <span class="font-semibold tabular-nums text-algodao">${fmt.format(i.total)}</span>
      </div>
      <div class="trilho"><div class="barra" style="width:${(i.total / max) * 100}%;--cor:${cor(i)}"></div></div>
    </li>`).join('')}</ul>`;
}

const tile = (classes, titulo, icone, corpo) => `
  <section class="bento ${classes}">
    <h3 class="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
      <i data-lucide="${icone}" class="h-4 w-4 text-ouro"></i>${esc(titulo)}</h3>
    ${corpo}
  </section>`;

export function renderizarCenso(el, s) {
  const noMapa = s.total_casas - s.casas_ocultas;
  const corVertente = (i) => SEGMENTOS[segmentoDe({ vertente: i.rotulo })].cor;

  const priv = Object.fromEntries(s.por_privacidade.map((p) => [p.rotulo, p.total]));
  const totalPriv = Math.max(s.total_casas, 1);
  const partes = [
    { chave: 'Exato', rotulo: 'Local exato', cor: '#D4AF37' },
    { chave: 'Aproximado', rotulo: 'Área aproximada', cor: '#C85A32' },
    { chave: 'Oculto_Apenas_Censo', rotulo: 'Só no censo', cor: '#78716C' },
  ];
  const privacidade = `
    <div class="flex h-3 w-full gap-0.5 overflow-hidden rounded">
      ${partes.map((p) => (priv[p.chave] ? `<div style="flex:${priv[p.chave]};background:${p.cor}" title="${p.rotulo}: ${priv[p.chave]}"></div>` : '')).join('')}
    </div>
    <ul class="mt-4 space-y-1.5 text-xs">
      ${partes.map((p) => `<li class="flex items-center gap-2"><span class="dot" style="background:${p.cor}"></span>
        <span class="text-stone-300">${p.rotulo}</span>
        <span class="ml-auto font-semibold tabular-nums">${fmt.format(priv[p.chave] || 0)} · ${Math.round(((priv[p.chave] || 0) / totalPriv) * 100)}%</span></li>`).join('')}
    </ul>
    <p class="mt-3 text-[11px] leading-relaxed text-stone-500">A escolha de privacidade de cada casa é respeitada: a ofuscação é feita no servidor.</p>`;

  const antigas = s.mais_antigas.length ? `<ol class="relative space-y-4 border-l border-ouro/30 pl-5">${s.mais_antigas.map((c) => `
    <li class="relative">
      <span class="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-breu" style="background:${SEGMENTOS[segmentoDe(c)].cor}"></span>
      <p class="font-display text-lg font-bold text-ouro">${c.anonimizada ? `Década de ${esc(c.decada_fundacao)}` : esc(c.ano_fundacao)}</p>
      <p class="text-sm font-semibold">${c.anonimizada
        ? '<span class="inline-flex items-center gap-1.5 text-stone-300"><i data-lucide="eye-off" class="h-3.5 w-3.5"></i>Casa preservada (identidade protegida)</span>'
        : `<a class="hover:text-ouro hover:underline" href="#${esc(c.slug)}" data-ir-para="${esc(c.slug)}">${esc(c.nome_casa)}</a>`}</p>
      <p class="text-xs text-stone-400">${esc([c.vertente, c.nacao_linha, c.distrito?.replace(/ - .*/, '')].filter(Boolean).join(' · '))}${c.anos_de_historia ? ` · ${c.anos_de_historia} anos` : ''}</p>
    </li>`).join('')}</ol>` : '<p class="text-sm text-stone-500">Sem dados ainda.</p>';

  el.innerHTML = `
    <div class="grid auto-rows-auto grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <section class="bento relative overflow-hidden sm:col-span-2">
        <div class="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-terracota/20 blur-3xl"></div>
        <p class="text-xs font-semibold uppercase tracking-wider text-stone-400">Casas de axé recenseadas</p>
        <p class="mt-2 font-display text-6xl font-bold text-algodao">${fmt.format(s.total_casas)}</p>
        <p class="mt-2 text-sm text-stone-300"><strong class="text-ouro">${fmt.format(noMapa)}</strong> visíveis no mapa ·
          <strong class="text-ouro">${fmt.format(s.casas_ocultas)}</strong> protegidas (só no censo)</p>
        <div class="kente mt-5 rounded-full opacity-70"></div>
      </section>

      <section class="bento">
        <p class="text-xs font-semibold uppercase tracking-wider text-stone-400">Fundação mais antiga</p>
        <p class="mt-2 font-display text-4xl font-bold text-ouro">${s.fundacao_mais_antiga ?? '—'}</p>
        <p class="mt-1 text-sm text-stone-400">Média de <strong class="text-algodao">${s.media_anos_de_historia ?? '—'} anos</strong> de história por casa</p>
      </section>

      <section class="bento">
        <p class="text-xs font-semibold uppercase tracking-wider text-stone-400">Economia do Axé</p>
        <p class="mt-2 font-display text-4xl font-bold" style="color:${SEGMENTOS.axe.cor}">${fmt.format(s.total_economia_axe)}</p>
        <p class="mt-1 text-sm text-stone-400">lojas, ervanários e artesãos mapeados</p>
      </section>

      ${tile('sm:col-span-2 lg:row-span-2', 'Casas por distrito', 'map', barras(s.por_distrito, { rotulo: (i) => i.rotulo.replace(' - ', ' · ') }))}
      ${tile('sm:col-span-2', 'Vertentes', 'sparkles', barras(s.por_vertente, { cor: corVertente }))}
      ${tile('', 'Privacidade escolhida', 'shield-check', privacidade)}
      ${tile('', 'Nações e linhas', 'drum', barras(s.por_nacao.slice(0, 8), { cor: () => 'var(--ouro)' }))}
      ${tile('sm:col-span-2', 'Ações sociais', 'hand-heart', barras(s.acoes_sociais.slice(0, 8), { cor: () => '#3A9460' }))}
      ${tile('sm:col-span-2', 'Casas mais antigas', 'landmark', antigas)}
    </div>`;
  icones();

  el.querySelectorAll('[data-ir-para]').forEach((a) => a.addEventListener('click', () => {
    el.closest('.modal')?.classList.remove('aberto');
    setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 0);
  }));
}
