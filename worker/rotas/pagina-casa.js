// GET /casa/<slug> → o mesmo site, mas com título e prévia de compartilhamento
// (Open Graph) da casa, para links enviados por WhatsApp e redes sociais.
// Usa só dados da view pública: casas ocultas, pendentes ou inexistentes
// recebem a página padrão, sem nenhuma informação a mais.
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function paginaCasa(request, env, url) {
  const slug = decodeURIComponent(url.pathname.slice('/casa/'.length)).replace(/\/$/, '');
  const pagina = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: request.headers }));
  if (!/^[a-z0-9-]{1,180}$/.test(slug)) return pagina;

  const casa = await env.DB.prepare(
    'SELECT nome_casa, vertente, nacao_linha, bairro, categoria, historia_resumo FROM vw_terreiros_publicos WHERE slug = ?1',
  ).bind(slug).first();
  if (!casa) return pagina;

  const titulo = `${casa.nome_casa} · Mapa do Povo de Santo`;
  const tipo = casa.categoria === 'Economia do Axé' ? 'Economia do Axé' : [casa.vertente, casa.nacao_linha].filter(Boolean).join(' · ');
  let descricao = `${tipo} em ${casa.bairro}, Petrópolis/RJ.`;
  if (casa.historia_resumo) descricao += ` ${casa.historia_resumo.slice(0, 140)}${casa.historia_resumo.length > 140 ? '…' : ''}`;

  const html = (await pagina.text())
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(titulo)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(descricao)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(titulo)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(descricao)}`)
    .replace('</head>', `  <link rel="canonical" href="${esc(new URL(`/casa/${slug}`, url).href)}" />\n</head>`);
  const headers = new Headers(pagina.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.delete('Content-Length');
  return new Response(html, { status: 200, headers });
}
