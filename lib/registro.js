// Conversões entre a linha do banco e o formato do formulário, usadas na
// edição pela casa (/api/minha-casa) e pela moderação (/api/admin).
import { coordenadaPublica, lerJsonArray } from './privacy.js';
import { validarCadastro } from './validation.js';

// Linha do banco → corpo no formato do formulário de cadastro.
export function registroParaFormulario(r) {
  return {
    nome_casa: r.nome_casa, categoria: r.categoria, vertente: r.vertente, nacao_linha: r.nacao_linha,
    orixa_guia_regente: r.orixa_guia_regente, lideranca_titulo: r.lideranca_titulo,
    lideranca_nome_religioso: r.lideranca_nome_religioso, ano_fundacao: r.ano_fundacao, distrito: r.distrito,
    bairro: r.bairro, endereco_completo: r.endereco_completo, lat: r.lat_real, lng: r.lng_real,
    nivel_privacidade: r.nivel_privacidade, historia_resumo: r.historia_resumo,
    calendario_giras: lerJsonArray(r.calendario_giras), acoes_sociais: lerJsonArray(r.acoes_sociais),
    whatsapp_contato: r.whatsapp_contato, instagram_url: r.instagram_url,
    contato_restrito: Boolean(r.contato_restrito), consentimento_lgpd: true,
  };
}

// Aplica alterações a um registro existente, com as MESMAS regras do cadastro.
// A coordenada pública só é sorteada de novo se a localização real ou o nível
// de privacidade mudarem (o gatilho do banco impede qualquer outra troca).
export async function atualizarRegistro(db, atual, alteracoes, { autor, acao }) {
  const corpo = { ...registroParaFormulario(atual), ...alteracoes };
  const { dados, erros } = validarCadastro(corpo);
  if (erros) return { erros };

  const moveu = dados.lat_real !== atual.lat_real || dados.lng_real !== atual.lng_real
    || dados.nivel_privacidade !== atual.nivel_privacidade;
  const pub = moveu
    ? coordenadaPublica(dados.nivel_privacidade, dados.lat_real, dados.lng_real)
    : { lat: atual.lat_publica, lng: atual.lng_publica };
  const restrito = alteracoes.contato_restrito === undefined ? atual.contato_restrito : (alteracoes.contato_restrito ? 1 : 0);

  await db.batch([
    db.prepare(`UPDATE terreiros SET
        nome_casa=?2, categoria=?3, vertente=?4, nacao_linha=?5, orixa_guia_regente=?6, lideranca_titulo=?7,
        lideranca_nome_religioso=?8, ano_fundacao=?9, distrito=?10, bairro=?11, endereco_completo=?12,
        lat_real=?13, lng_real=?14, lat_publica=?15, lng_publica=?16, nivel_privacidade=?17, historia_resumo=?18,
        calendario_giras=?19, acoes_sociais=?20, whatsapp_contato=?21, instagram_url=?22, contato_restrito=?23,
        editado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=?1`).bind(
      atual.id, dados.nome_casa, dados.categoria, dados.vertente, dados.nacao_linha, dados.orixa_guia_regente,
      dados.lideranca_titulo, dados.lideranca_nome_religioso, dados.ano_fundacao, dados.distrito, dados.bairro,
      dados.endereco_completo, dados.lat_real, dados.lng_real, pub.lat, pub.lng, dados.nivel_privacidade,
      dados.historia_resumo, JSON.stringify(dados.calendario_giras), JSON.stringify(dados.acoes_sociais),
      dados.whatsapp_contato, dados.instagram_url, restrito,
    ),
    registrarLog(db, { terreiro_id: atual.id, nome_casa: dados.nome_casa, acao, autor }),
  ]);
  return { ok: true };
}

export function registrarLog(db, { terreiro_id, nome_casa, acao, autor, detalhes = null }) {
  return db.prepare('INSERT INTO moderacao_log (terreiro_id, nome_casa, acao, autor, detalhes) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(terreiro_id, nome_casa, acao, autor, detalhes);
}
