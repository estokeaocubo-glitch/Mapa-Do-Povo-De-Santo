// Painel de moderação: lista cadastros por situação; permite corrigir dados,
// aprovar, rejeitar, excluir, gerar novo código de edição e avisar a casa pelo
// WhatsApp; mostra o histórico de ações. O token fica só nesta aba.
import { DISTRITOS, VERTENTES } from './dominio.js';
import { esc, formatarTelefone, icones, toast } from './utils.js';

const $ = (id) => document.getElementById(id);
const CHAVE = 'mps_admin_token';
let statusAtual = 'Pendente';
let registros = [];

const lerToken = () => { try { return sessionStorage.getItem(CHAVE) || ''; } catch { return ''; } };
const salvarToken = (t) => { try { t ? sessionStorage.setItem(CHAVE, t) : sessionStorage.removeItem(CHAVE); } catch { /* sem storage */ } };

async function chamar(metodo, url, corpo) {
  let resp;
  try {
    resp = await fetch(url, {
      method: metodo,
      headers: { Authorization: `Bearer ${lerToken()}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error('Sem conexão com o servidor.');
  }
  const json = await resp.json().catch(() => ({}));
  if (resp.status === 401) { sair(); throw new Error(json.erro || 'Token inválido.'); }
  if (!resp.ok) {
    const erro = new Error(json.erro || 'Erro no servidor.');
    erro.detalhes = json.detalhes;
    throw erro;
  }
  return json;
}

const lista = (valor) => { try { return Array.isArray(valor) ? valor : JSON.parse(valor || '[]'); } catch { return []; } };
const linkWhats = (numero, texto) => `https://wa.me/${String(numero || '').replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;

function cartao(r) {
  const giras = lista(r.calendario_giras).map((g) => [g.dia, g.horario, g.tipo].filter(Boolean).join(' · ')).join('; ');
  const acoes = lista(r.acoes_sociais).join(', ');
  const linha = (rotulo, valor) => (valor ? `<div><dt class="text-[11px] uppercase tracking-wider text-stone-400">${rotulo}</dt><dd class="text-sm">${esc(valor)}</dd></div>` : '');
  return `
    <li class="glass rounded-2xl p-4" data-id="${esc(r.id)}">
      <div class="flex flex-wrap items-start gap-2">
        <div class="min-w-0 flex-1">
          <h2 class="font-semibold">${esc(r.nome_casa)}</h2>
          <p class="text-xs text-stone-300">${esc([r.categoria, r.vertente, r.nacao_linha].filter(Boolean).join(' · '))}</p>
        </div>
        <span class="chip cursor-default">${esc(r.nivel_privacidade.replace(/_/g, ' '))}</span>
        ${r.contato_restrito ? '<span class="chip cursor-default"><i data-lucide="lock" class="h-3 w-3"></i>contato protegido</span>' : ''}
        ${r.editado_em ? `<span class="chip cursor-default">editado ${esc(new Date(r.editado_em).toLocaleDateString('pt-BR'))}</span>` : ''}
      </div>
      <dl class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        ${linha('Liderança', [r.lideranca_titulo, r.lideranca_nome_religioso].filter(Boolean).join(' '))}
        ${linha('Distrito / bairro', `${r.distrito} · ${r.bairro}`)}
        ${linha('Endereço (privado)', r.endereco_completo)}
        ${linha('Localização real (privada)', `${r.lat_real}, ${r.lng_real}`)}
        ${linha('WhatsApp', formatarTelefone(r.whatsapp_contato))}
        ${linha('Instagram', r.instagram_url)}
        ${linha('Fundação', r.ano_fundacao)}
        ${linha('Giras', giras)}
        ${linha('Ações sociais', acoes)}
        ${linha('Consentimento LGPD', r.consentimento_lgpd_em)}
        ${linha('Enviado em', r.created_at)}
      </dl>
      ${r.historia_resumo ? `<p class="mt-3 whitespace-pre-line text-sm text-stone-300">${esc(r.historia_resumo)}</p>` : ''}
      <div class="avisos mt-3"></div>
      <div class="mt-4 flex flex-wrap gap-2">
        ${r.status_moderacao !== 'Aprovado' ? '<button type="button" class="btn-primary" data-acao="Aprovado"><i data-lucide="check" class="h-4 w-4"></i>Aprovar</button>' : ''}
        ${r.status_moderacao !== 'Rejeitado' ? '<button type="button" class="btn-ghost" data-acao="Rejeitado"><i data-lucide="x" class="h-4 w-4"></i>Rejeitar</button>' : ''}
        <button type="button" class="btn-ghost" data-acao="editar"><i data-lucide="pencil" class="h-4 w-4"></i>Corrigir dados</button>
        ${r.whatsapp_contato ? '<button type="button" class="btn-ghost" data-acao="codigo"><i data-lucide="key-round" class="h-4 w-4"></i>Novo código de edição</button>' : ''}
        <button type="button" class="btn-ghost ml-auto text-red-300" data-acao="excluir"><i data-lucide="trash-2" class="h-4 w-4"></i>Excluir</button>
      </div>
    </li>`;
}

// Formulário de correção (campos de texto; localização e privacidade ficam com a casa).
function formEdicao(r) {
  const opcoes = (lista, atual) => lista.map((v) => `<option ${v === atual ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const texto = (nome, rotulo, valor, extra = '') => `
    <label class="block"><span class="label">${rotulo}</span><input class="field" name="${nome}" value="${esc(valor ?? '')}" ${extra} /></label>`;
  return `
    <form class="editar mt-4 grid gap-3 rounded-2xl border border-white/10 p-4 sm:grid-cols-2">
      ${texto('nome_casa', 'Nome da casa', r.nome_casa, 'required maxlength="160"')}
      <label class="block"><span class="label">Vertente</span><select class="field" name="vertente">${opcoes(VERTENTES, r.vertente)}</select></label>
      ${texto('nacao_linha', 'Nação / linha', r.nacao_linha, 'maxlength="80"')}
      ${texto('orixa_guia_regente', 'Orixá / guia', r.orixa_guia_regente, 'maxlength="120"')}
      ${texto('lideranca_titulo', 'Título da liderança', r.lideranca_titulo, 'maxlength="60"')}
      ${texto('lideranca_nome_religioso', 'Nome religioso', r.lideranca_nome_religioso, 'maxlength="120"')}
      <label class="block"><span class="label">Distrito</span><select class="field" name="distrito">${opcoes(DISTRITOS, r.distrito)}</select></label>
      ${texto('bairro', 'Bairro', r.bairro, 'required maxlength="100"')}
      ${texto('endereco_completo', 'Endereço (privado)', r.endereco_completo, 'maxlength="300"')}
      ${texto('ano_fundacao', 'Ano de fundação', r.ano_fundacao, 'inputmode="numeric"')}
      ${texto('whatsapp_contato', 'WhatsApp', r.whatsapp_contato, 'maxlength="20"')}
      ${texto('instagram_url', 'Instagram', r.instagram_url, 'maxlength="200"')}
      <label class="block sm:col-span-2"><span class="label">Memória da casa</span><textarea class="field" name="historia_resumo" rows="3" maxlength="2000">${esc(r.historia_resumo ?? '')}</textarea></label>
      <p class="erro hidden text-xs text-red-300 sm:col-span-2" role="alert"></p>
      <div class="flex gap-2 sm:col-span-2">
        <button type="submit" class="btn-primary"><i data-lucide="save" class="h-4 w-4"></i>Salvar correção</button>
        <button type="button" class="btn-ghost" data-cancelar>Cancelar</button>
      </div>
    </form>`;
}

async function carregar() {
  $('resumo').textContent = 'Carregando…';
  try {
    if (statusAtual === 'historico') return carregarHistorico();
    const r = await chamar('GET', `/api/admin?status=${encodeURIComponent(statusAtual)}`);
    registros = r.registros;
    $('moderador').textContent = `Moderando como ${r.moderador}`;
    $('resumo').textContent = `${registros.length} cadastro(s) com situação "${statusAtual}".`;
    $('registros').innerHTML = registros.map(cartao).join('')
      || '<li class="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-stone-300">Nada por aqui.</li>';
    icones();
  } catch (err) {
    $('resumo').textContent = err.message;
  }
}

const ACOES_LOG = {
  aprovado: 'aprovou', rejeitado: 'rejeitou', pendente: 'voltou para pendente', editado: 'corrigiu', excluido: 'excluiu',
  codigo_edicao: 'gerou novo código de edição de', editado_pela_casa: 'editou', excluido_pela_casa: 'excluiu',
};

async function carregarHistorico() {
  const { historico, moderador } = await chamar('GET', '/api/admin?historico=1');
  $('moderador').textContent = `Moderando como ${moderador}`;
  $('resumo').textContent = `Últimas ${historico.length} ações.`;
  $('registros').innerHTML = historico.map((h) => `
    <li class="flex flex-wrap items-baseline gap-x-2 rounded-xl bg-white/[0.04] px-4 py-3 text-sm">
      <strong>${esc(h.autor)}</strong> ${esc(ACOES_LOG[h.acao] || h.acao)} <span class="text-ouro">${esc(h.nome_casa || '—')}</span>
      <span class="ml-auto text-xs text-stone-400">${esc(new Date(h.em).toLocaleString('pt-BR'))}</span>
    </li>`).join('') || '<li class="text-sm text-stone-300">Nenhuma ação registrada ainda.</li>';
}

function entrar() {
  $('form-token').classList.add('hidden');
  $('painel-admin').classList.remove('hidden');
  carregar();
}

function sair() {
  salvarToken('');
  $('painel-admin').classList.add('hidden');
  $('form-token').classList.remove('hidden');
  $('registros').innerHTML = '';
}

$('form-token').addEventListener('submit', (e) => {
  e.preventDefault();
  salvarToken($('token').value.trim());
  $('token').value = '';
  entrar();
});
$('sair').addEventListener('click', sair);

document.querySelector('[aria-label="Filtrar por situação"]').addEventListener('click', (e) => {
  const aba = e.target.closest('[data-status]');
  if (!aba) return;
  statusAtual = aba.dataset.status;
  document.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-pressed', String(b === aba)));
  carregar();
});

function aviso(item, html) {
  item.querySelector('.avisos').innerHTML = `<div class="rounded-2xl border border-ouro/40 bg-ouro/10 p-4 text-sm">${html}</div>`;
  icones();
}

$('registros').addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-acao], [data-cancelar]');
  if (!botao) return;
  const item = botao.closest('[data-id]');
  const r = registros.find((x) => x.id === item.dataset.id);
  if (botao.hasAttribute('data-cancelar')) { item.querySelector('form.editar')?.remove(); return; }
  try {
    switch (botao.dataset.acao) {
      case 'excluir':
        if (!confirm(`Excluir definitivamente "${r.nome_casa}"? Esta ação não pode ser desfeita.`)) return;
        await chamar('DELETE', `/api/admin?id=${encodeURIComponent(r.id)}`);
        toast(`"${r.nome_casa}" excluída.`, 'ok');
        return carregar();
      case 'editar':
        if (!item.querySelector('form.editar')) { item.insertAdjacentHTML('beforeend', formEdicao(r)); icones(); }
        return;
      case 'codigo': {
        if (!confirm('Gerar um novo código de edição? O código anterior deixa de funcionar.')) return;
        const { codigo } = await chamar('POST', '/api/admin', { acao: 'codigo_edicao', id: r.id });
        const msg = `Olá! Aqui é a moderação do Mapa do Povo de Santo de Petrópolis. O novo código de edição da casa "${r.nome_casa}" é ${codigo}. Com ele vocês podem editar os dados, mudar a privacidade ou excluir o cadastro em "Editar minha casa". Guardem com cuidado.`;
        return aviso(item, `<p>Novo código: <strong class="select-all font-mono tracking-widest">${esc(codigo)}</strong> (não será mostrado de novo).</p>
          <a class="btn-whatsapp mt-3" target="_blank" rel="noopener noreferrer" href="${esc(linkWhats(r.whatsapp_contato, msg))}"><i data-lucide="message-circle" class="h-4 w-4"></i>Enviar para o WhatsApp da casa</a>`);
      }
      default: {
        const status = botao.dataset.acao;
        const { registro } = await chamar('PATCH', '/api/admin', { id: r.id, status_moderacao: status });
        toast(`"${r.nome_casa}" → ${status.toLowerCase()}.`, 'ok');
        if (status === 'Aprovado' && registro.whatsapp_contato) {
          const link = new URL(`/casa/${registro.slug}`, location.origin).href;
          const msg = `Olá! Aqui é a moderação do Mapa do Povo de Santo de Petrópolis. O cadastro da casa "${registro.nome_casa}" foi aprovado e já está no mapa: ${link}. Axé!`;
          aviso(item, `<p>Cadastro aprovado. Quer avisar a casa?</p>
            <a class="btn-whatsapp mt-3" target="_blank" rel="noopener noreferrer" href="${esc(linkWhats(registro.whatsapp_contato, msg))}"><i data-lucide="message-circle" class="h-4 w-4"></i>Avisar pelo WhatsApp</a>
            <button type="button" class="btn-ghost mt-3" data-recarregar>Continuar</button>`);
          item.querySelector('[data-recarregar]').addEventListener('click', carregar);
          item.querySelectorAll('[data-acao]').forEach((b) => { b.disabled = true; });
        } else {
          carregar();
        }
      }
    }
  } catch (err) {
    toast(err.message, 'erro');
  }
});

$('registros').addEventListener('submit', async (e) => {
  const formulario = e.target.closest('form.editar');
  if (!formulario) return;
  e.preventDefault();
  const id = formulario.closest('[data-id]').dataset.id;
  const campos = Object.fromEntries(new FormData(formulario));
  try {
    await chamar('PATCH', '/api/admin', { id, campos });
    toast('Correção salva.', 'ok');
    carregar();
  } catch (err) {
    const p = formulario.querySelector('.erro');
    p.textContent = err.detalhes ? Object.values(err.detalhes).join(' ') : err.message;
    p.classList.remove('hidden');
  }
});

icones();
if (lerToken()) entrar();
