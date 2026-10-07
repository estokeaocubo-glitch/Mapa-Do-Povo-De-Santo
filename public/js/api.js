// Cliente da API REST.
async function requisicao(url, opcoes = {}) {
  const resp = await fetch(url, { headers: { Accept: 'application/json', ...(opcoes.headers || {}) }, ...opcoes });
  let corpo = null;
  try { corpo = await resp.json(); } catch { /* resposta sem JSON */ }
  if (!resp.ok) {
    const erro = new Error(corpo?.erro || `Erro ${resp.status}`);
    erro.status = resp.status;
    erro.detalhes = corpo?.detalhes;
    throw erro;
  }
  return corpo;
}

export const api = {
  terreiros: () => requisicao('/api/terreiros'),
  estatisticas: () => requisicao('/api/estatisticas'),
  desbloquear: (slug, senha) => requisicao('/api/desbloquear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, senha }),
  }),
  cadastrar: (dados) => requisicao('/api/cadastro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  }),
};
