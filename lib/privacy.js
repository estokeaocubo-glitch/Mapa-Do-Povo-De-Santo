// =============================================================================
// SEGURANÇA GEOGRÁFICA — saneamento final antes de qualquer resposta pública.
//
// A primeira barreira é o banco: a API pública só consulta a VIEW
// vw_terreiros_publicos, que nem possui as colunas lat_real/lng_real.
// Esta função é a SEGUNDA barreira (defesa em profundidade): monta o objeto
// de saída por LISTA BRANCA de campos. Se alguém um dia trocar a view por
// um `SELECT * FROM terreiros`, nada privado vaza mesmo assim.
// =============================================================================

export const RAIO_APROXIMADO_M = 500;

export function toPublicTerreiro(row) {
  if (!row) return null;

  // Casas ocultas jamais vão para o mapa (só entram nas estatísticas).
  if (row.nivel_privacidade !== 'Exato' && row.nivel_privacidade !== 'Aproximado') return null;
  // Somente registros moderados e aprovados (quando o campo vier na linha).
  if (row.status_moderacao !== undefined && row.status_moderacao !== 'Aprovado') return null;

  const lat = toNumber(row.lat_publica);
  const lng = toNumber(row.lng_publica);
  if (lat === null || lng === null) return null;

  const aproximado = row.nivel_privacidade === 'Aproximado';

  return {
    id: row.id,
    slug: row.slug,
    nome_casa: row.nome_casa,
    categoria: row.categoria,
    vertente: row.vertente,
    nacao_linha: row.nacao_linha,
    orixa_guia_regente: row.orixa_guia_regente,
    lideranca_titulo: row.lideranca_titulo,
    lideranca_nome_religioso: row.lideranca_nome_religioso,
    ano_fundacao: row.ano_fundacao,
    distrito: row.distrito,
    bairro: row.bairro,
    nivel_privacidade: row.nivel_privacidade,
    // 'Aproximado': NUNCA envia endereço — apenas bairro + coordenada ofuscada.
    endereco: aproximado ? null : (row.endereco_publico ?? null),
    localizacao: aproximado
      ? { tipo: 'area', lat, lng, raio_m: RAIO_APROXIMADO_M }
      : { tipo: 'ponto', lat, lng },
    historia_resumo: row.historia_resumo,
    calendario_giras: Array.isArray(row.calendario_giras) ? row.calendario_giras : [],
    acoes_sociais: Array.isArray(row.acoes_sociais) ? row.acoes_sociais : [],
    // Contato protegido por senha: só /api/desbloquear devolve esses dados.
    contato_restrito: Boolean(row.contato_restrito),
    whatsapp_contato: row.contato_restrito ? null : (row.whatsapp_contato ?? null),
    instagram_url: row.contato_restrito ? null : (row.instagram_url ?? null),
  };
}

// Campos que NUNCA podem aparecer em uma resposta pública.
const PROIBIDOS = ['lat_real', 'lng_real', 'endereco_completo', 'consentimento_lgpd_em', 'status_moderacao'];

// Verificação defensiva usada antes de serializar a resposta pública.
export function assertSemCamposPrivados(lista) {
  for (const item of lista) {
    for (const campo of PROIBIDOS) {
      if (campo in item) throw new Error(`Vazamento bloqueado: campo privado "${campo}" na resposta pública.`);
    }
    if (item.nivel_privacidade === 'Aproximado' && item.endereco) {
      throw new Error('Vazamento bloqueado: endereço de casa com localização aproximada.');
    }
    if (item.contato_restrito && (item.whatsapp_contato || item.instagram_url || item.endereco)) {
      throw new Error('Vazamento bloqueado: contato restrito na resposta pública.');
    }
  }
  return lista;
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
