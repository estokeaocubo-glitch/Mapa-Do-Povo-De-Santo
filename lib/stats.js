// Estatísticas do censo comunitário.
// Inclui as casas 'Oculto_Apenas_Censo' — mas apenas de forma agregada.
import { DISTRITOS, VERTENTES } from './constants.js';
import { lerJsonArray } from './privacy.js';

// Categorias com menos casas que isto, contendo alguma oculta, ficam sem número.
export const LIMIAR_SUPRESSAO = 3;

const SQL_CENSO = `
  SELECT nome_casa, slug, categoria, vertente, nacao_linha, ano_fundacao,
         distrito, nivel_privacidade, acoes_sociais
  FROM vw_terreiros_censo`;

export async function carregarEstatisticas(db) {
  const { results } = await db.prepare(SQL_CENSO).all();
  return calcularEstatisticas(results);
}

export function calcularEstatisticas(rows) {
  const casas = rows.filter((r) => r.categoria !== 'Economia do Axé');
  const anoAtual = new Date().getFullYear();

  const oculta = (r) => r.nivel_privacidade === 'Oculto_Apenas_Censo';

  // PROTEÇÃO CONTRA REIDENTIFICAÇÃO: uma categoria com 1 ou 2 casas em que
  // ao menos uma é oculta não tem o número publicado ("menos de 3").
  // Sem isso, "Cascatinha: 1" + "Angola: 1" + "década de 1980" apontaria a casa.
  const contar = (lista, chaves, base = []) => {
    const mapa = new Map(base.map((k) => [k, { total: 0, ocultas: 0 }]));
    for (const r of lista) {
      for (const k of chaves(r)) {
        if (!k) continue;
        const c = mapa.get(k) || { total: 0, ocultas: 0 };
        c.total += 1;
        if (oculta(r)) c.ocultas += 1;
        mapa.set(k, c);
      }
    }
    return [...mapa].map(([rotulo, { total, ocultas }]) =>
      (total > 0 && total < LIMIAR_SUPRESSAO && ocultas > 0 ? { rotulo, total: null, suprimido: true } : { rotulo, total }));
  };
  const valor = (i) => (i.suprimido ? 1 : i.total);
  const ordenar = (arr) => arr.sort((a, b) => valor(b) - valor(a) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  const campo = (nome) => (r) => [r[nome]];

  const anos = casas.map((r) => r.ano_fundacao).filter(Number.isInteger);
  const maisAntiga = casas.filter((r) => Number.isInteger(r.ano_fundacao)).sort((a, b) => a.ano_fundacao - b.ano_fundacao)[0];

  // Casas mais antigas: casas OCULTAS aparecem anonimizadas — sem nome, sem
  // distrito e com a fundação arredondada para a década, para que a
  // combinação "nação + distrito + ano" não permita reidentificá-las.
  const maisAntigas = casas
    .filter((r) => Number.isInteger(r.ano_fundacao))
    .sort((a, b) => a.ano_fundacao - b.ano_fundacao)
    .slice(0, 5)
    .map((r) => {
      return oculta(r)
        ? { anonimizada: true, nome_casa: null, slug: null, vertente: r.vertente, nacao_linha: null,
            distrito: null, decada_fundacao: Math.floor(r.ano_fundacao / 10) * 10 }
        : { anonimizada: false, nome_casa: r.nome_casa, slug: r.slug, vertente: r.vertente,
            nacao_linha: r.nacao_linha, distrito: r.distrito, ano_fundacao: r.ano_fundacao,
            anos_de_historia: anoAtual - r.ano_fundacao };
    });

  return {
    total_casas: casas.length,
    total_economia_axe: rows.length - casas.length,
    casas_ocultas: casas.filter((r) => r.nivel_privacidade === 'Oculto_Apenas_Censo').length,
    // Se a mais antiga for oculta, publica só a década.
    fundacao_mais_antiga: !maisAntiga ? null
      : oculta(maisAntiga) ? `década de ${Math.floor(maisAntiga.ano_fundacao / 10) * 10}` : maisAntiga.ano_fundacao,
    media_anos_de_historia: anos.length ? Math.round(anos.reduce((s, a) => s + (anoAtual - a), 0) / anos.length) : null,
    por_distrito: contar(casas, campo('distrito'), DISTRITOS),
    por_vertente: ordenar(contar(casas, campo('vertente'), VERTENTES)).filter((v) => v.suprimido || v.total > 0),
    por_nacao: ordenar(contar(casas, campo('nacao_linha'))),
    // Total por nível não identifica ninguém (o total de ocultas já é público).
    por_privacidade: ['Exato', 'Aproximado', 'Oculto_Apenas_Censo']
      .map((rotulo) => ({ rotulo, total: casas.filter((r) => r.nivel_privacidade === rotulo).length })),
    acoes_sociais: ordenar(contar(casas, (r) => lerJsonArray(r.acoes_sociais))),
    mais_antigas: maisAntigas,
  };
}
