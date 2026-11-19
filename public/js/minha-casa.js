// "Editar minha casa": a casa entra com o CÓDIGO DE EDIÇÃO e pode editar os
// dados, criar/revogar códigos de visitante (para liberar o contato protegido)
// e excluir o cadastro. O código fica só na memória desta aba.
import { api } from './api.js';
import { abrirEdicao } from './cadastro.js';
import { TEXTO_PRIVACIDADE } from './constants.js';
import { esc, icones, toast } from './utils.js';

const $ = (id) => document.getElementById(id);
let codigo = null;
let casa = null;
let modais;

const conteudo = () => $('minha-casa-conteudo');
const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

function telaEntrada(erro = '') {
  conteudo().innerHTML = `
    <form id="form-entrar-casa" class="space-y-3">
      <p class="text-sm leading-relaxed text-stone-300">Digite o <strong class="text-algodao">código de edição</strong> que a casa recebeu ao se cadastrar (ou que a moderação enviou pelo WhatsApp da casa).</p>
      <label class="label" for="codigo-edicao">Código de edição</label>
      <input id="codigo-edicao" class="field font-mono uppercase tracking-widest" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX" required />
      <p class="erro text-xs text-red-300 ${erro ? '' : 'hidden'}" role="alert">${esc(erro)}</p>
      <button type="submit" class="btn-primary w-full"><i data-lucide="key-round" class="h-4 w-4"></i>Entrar</button>
      <p class="text-xs text-stone-400">Perdeu o código? Peça um novo à moderação pelo contato da <a class="text-ouro underline" href="/privacidade.html">página de privacidade</a>. Ele será enviado para o WhatsApp cadastrado da casa.</p>
    </form>`;
  icones();
  $('form-entrar-casa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const botao = e.currentTarget.querySelector('button');
    botao.disabled = true;
    try {
      const tentativa = $('codigo-edicao').value;
      const r = await api.minhaCasa(tentativa, 'ler');
      codigo = tentativa;
      casa = r.casa;
      await telaPainel();
    } catch (err) {
      telaEntrada(err.message);
    }
  });
  $('codigo-edicao').focus();
}

async function telaPainel() {
  const situacao = { Pendente: 'aguardando moderação', Aprovado: 'publicada no mapa', Rejeitado: 'não aprovada' }[casa.status_moderacao] || casa.status_moderacao;
  conteudo().innerHTML = `
    <div class="rounded-2xl bg-white/[0.04] p-4">
      <p class="font-display text-lg font-bold">${esc(casa.nome_casa)}</p>
      <p class="mt-1 text-xs text-stone-300">${esc(TEXTO_PRIVACIDADE[casa.nivel_privacidade]?.titulo || '')} · ${esc(situacao)}${casa.editado_em ? ` · editada em ${dataBR(casa.editado_em)}` : ''}</p>
      <button type="button" id="mc-editar" class="btn-primary mt-4 w-full"><i data-lucide="pencil" class="h-4 w-4"></i>Editar dados, giras e privacidade</button>
    </div>

    <section class="mt-5">
      <h3 class="section-title">Códigos de visitante</h3>
      ${casa.contato_restrito ? `
        <p class="mt-2 text-xs leading-relaxed text-stone-300">Seu contato está protegido. Crie um código para cada pessoa ou grupo que pode ver o WhatsApp e o endereço desta casa; ele vence sozinho e pode ser revogado.</p>
        <form id="mc-gerar" class="mt-3 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input id="mc-rotulo" class="field" maxlength="60" placeholder="Para quem? (opcional, só a casa vê)" aria-label="Para quem é o código" />
          <select id="mc-dias" class="field" aria-label="Validade">
            <option value="1">1 dia</option><option value="7" selected>7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option>
          </select>
          <button type="submit" class="btn-gold col-span-2 sm:col-span-1"><i data-lucide="ticket" class="h-4 w-4"></i>Criar</button>
        </form>
        <div id="mc-novo" class="mt-3"></div>
        <ul id="mc-codigos" class="mt-3 space-y-2 text-sm"><li class="text-xs text-stone-400">Carregando…</li></ul>`
    : '<p class="mt-2 text-xs leading-relaxed text-stone-300">O contato desta casa é público. Para mostrá-lo só a quem você escolher, ative "Proteger o contato" em <em>Editar dados → Contato</em>.</p>'}
    </section>

    <section class="mt-6 rounded-2xl border border-red-400/30 p-4">
      <h3 class="text-sm font-semibold text-red-300">Excluir cadastro</h3>
      <p class="mt-1 text-xs text-stone-300">Remove a casa do mapa e do censo, definitivamente (LGPD, art. 18).</p>
      <button type="button" id="mc-excluir" class="btn-ghost mt-3 text-red-300"><i data-lucide="trash-2" class="h-4 w-4"></i>Excluir definitivamente</button>
    </section>

    <button type="button" id="mc-sair" class="mt-5 text-xs font-semibold text-stone-300 hover:underline">Sair</button>`;
  icones();

  $('mc-editar').addEventListener('click', () => {
    modais.fechar($('modal-minha-casa'));
    abrirEdicao(casa, codigo, modais.abrir);
  });
  $('mc-sair').addEventListener('click', () => { codigo = null; casa = null; telaEntrada(); });
  $('mc-excluir').addEventListener('click', async () => {
    if (!confirm(`Excluir "${casa.nome_casa}" do mapa e do censo? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.minhaCasa(codigo, 'excluir');
      codigo = null; casa = null;
      conteudo().innerHTML = '<p class="py-6 text-center text-sm text-stone-300">Cadastro excluído. Axé!</p>';
      setTimeout(() => location.assign('/'), 1800);
    } catch (err) { toast(err.message, 'erro'); }
  });

  if (casa.contato_restrito) {
    $('mc-gerar').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api.minhaCasa(codigo, 'gerar_visitante', { dias: $('mc-dias').value, rotulo: $('mc-rotulo').value });
        const msg = `Seu código para ver o contato de "${casa.nome_casa}" no Mapa do Povo de Santo de Petrópolis: ${r.codigo} (vale até ${dataBR(r.expira_em)}).`;
        $('mc-novo').innerHTML = `
          <div class="rounded-2xl border border-ouro/40 bg-ouro/10 p-4">
            <p class="select-all text-center font-mono text-xl font-bold tracking-widest">${esc(r.codigo)}</p>
            <p class="mt-1 text-center text-xs text-stone-300">Vale até ${dataBR(r.expira_em)}. Ele não será mostrado de novo.</p>
            <a class="btn-whatsapp mt-3 w-full" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${encodeURIComponent(msg)}"><i data-lucide="message-circle" class="h-4 w-4"></i>Enviar pelo WhatsApp</a>
          </div>`;
        $('mc-rotulo').value = '';
        icones();
        listarCodigos();
      } catch (err) { toast(err.message, 'erro'); }
    });
    listarCodigos();
  }
}

async function listarCodigos() {
  try {
    const { codigos } = await api.minhaCasa(codigo, 'listar_visitantes');
    $('mc-codigos').innerHTML = codigos.length
      ? codigos.map((c) => `
          <li class="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
            <span class="min-w-0 flex-1"><span class="block truncate">${esc(c.rotulo || 'Sem identificação')}</span>
              <span class="text-xs text-stone-400">vence em ${dataBR(c.expira_em)}</span></span>
            <button type="button" class="text-xs font-semibold text-red-300 hover:underline" data-revogar="${esc(c.id)}">Revogar</button>
          </li>`).join('')
      : '<li class="text-xs text-stone-400">Nenhum código ativo.</li>';
    $('mc-codigos').querySelectorAll('[data-revogar]').forEach((b) => b.addEventListener('click', async () => {
      await api.minhaCasa(codigo, 'revogar_visitante', { id: b.dataset.revogar });
      toast('Código revogado.', 'ok');
      listarCodigos();
    }));
  } catch (err) { toast(err.message, 'erro'); }
}

export function iniciarMinhaCasa(funcoes) {
  modais = funcoes;
  $('modal-minha-casa').addEventListener('modal:aberto', () => {
    if (codigo && casa) telaPainel(); else telaEntrada();
  });
}
