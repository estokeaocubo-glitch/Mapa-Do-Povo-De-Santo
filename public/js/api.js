// Cliente da API REST.
async function requisicao(url, opcoes = {}) {
  let resp;
  try {
    resp = await fetch(url, { ...opcoes, headers: { Accept: 'application/json', ...(opcoes.headers || {}) } });
  } catch {
    // Falha de rede (sem internet, servidor fora do ar): mensagem clara em português.
    const erro = new Error('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
    erro.status = 0;
    throw erro;
  }
  let corpo = null;
  try { corpo = await resp.json(); } catch { /* resposta sem JSON */ }
  if (!resp.ok) {
    const erro = new Error(corpo?.erro || 'O servidor não conseguiu responder agora. Tente novamente em instantes.');
    erro.status = resp.status;
    erro.detalhes = corpo?.detalhes;
    erro.precisaSenha = Boolean(corpo?.precisa_senha);
    throw erro;
  }
  return corpo;
}

export const api = {
  terreiros: () => requisicao('/api/terreiros'),
  estatisticas: () => requisicao('/api/estatisticas'),
  desbloquear: (slug, senha) => requisicao('/api/desbloquear', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, senha }),
  }),
  cadastrar: (dados) => requisicao('/api/cadastro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  }),
};
