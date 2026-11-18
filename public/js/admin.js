// Painel de moderação: lista cadastros por situação e permite aprovar,
// rejeitar ou excluir. O token fica só nesta aba (sessionStorage).
import { esc, formatarTelefone, icones, toast } from './utils.js';

const $ = (id) => document.getElementById(id);
const CHAVE = 'mps_admin_token';
let statusAtual = 'Pendente';

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
  if (!resp.ok) throw new Error(json.erro || 'Erro no servidor.');
  return json;
}

const lista = (valor) => { try { return Array.isArray(valor) ? valor : JSON.parse(valor || '[]'); } catch { return []; } };

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
        ${r.contato_restrito ? '<span class="chip cursor-default"><i data-lucide="lock" class="h-3 w-3"></i>contato restrito</span>' : ''}
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
      <div class="mt-4 flex flex-wrap gap-2">
        ${r.status_moderacao !== 'Aprovado' ? '<button type="button" class="btn-primary" data-acao="Aprovado"><i data-lucide="check" class="h-4 w-4"></i>Aprovar</button>' : ''}
        ${r.status_moderacao !== 'Rejeitado' ? '<button type="button" class="btn-ghost" data-acao="Rejeitado"><i data-lucide="x" class="h-4 w-4"></i>Rejeitar</button>' : ''}
        <button type="button" class="btn-ghost ml-auto text-red-300" data-acao="excluir"><i data-lucide="trash-2" class="h-4 w-4"></i>Excluir</button>
      </div>
    </li>`;
}

async function carregar() {
  $('resumo').textContent = 'Carregando…';
  try {
    const { registros } = await chamar('GET', `/api/admin?status=${encodeURIComponent(statusAtual)}`);
    $('resumo').textContent = `${registros.length} cadastro(s) com situação "${statusAtual}".`;
    $('registros').innerHTML = registros.map(cartao).join('')
      || '<li class="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-stone-300">Nada por aqui.</li>';
    icones();
  } catch (err) {
    $('resumo').textContent = err.message;
  }
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

$('registros').addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-acao]');
  if (!botao) return;
  const item = botao.closest('[data-id]');
  const id = item.dataset.id;
  const nome = item.querySelector('h2').textContent;
  try {
    if (botao.dataset.acao === 'excluir') {
      if (!confirm(`Excluir definitivamente "${nome}"? Esta ação não pode ser desfeita.`)) return;
      await chamar('DELETE', `/api/admin?id=${encodeURIComponent(id)}`);
      toast(`"${nome}" excluída.`, 'ok');
    } else {
      await chamar('PATCH', '/api/admin', { id, status_moderacao: botao.dataset.acao });
      toast(`"${nome}" → ${botao.dataset.acao.toLowerCase()}.`, 'ok');
    }
    carregar();
  } catch (err) {
    toast(err.message, 'erro');
  }
});

icones();
if (lerToken()) entrar();
