// Estatísticas do censo comunitário.
// Inclui as casas 'Oculto_Apenas_Censo' — mas apenas de forma agregada.
import { DISTRITOS, VERTENTES } from './constants.js';
import { lerJsonArray } from './privacy.js';

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

  const contar = (lista, chave, base = []) => {
    const mapa = new Map(base.map((k) => [k, 0]));
    for (const r of lista) {
      const k = typeof chave === 'function' ? chave(r) : r[chave];
      if (k) mapa.set(k, (mapa.get(k) || 0) + 1);
    }
    return [...mapa].map(([rotulo, total]) => ({ rotulo, total }));
  };
  const ordenar = (arr) => arr.sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const acoes = new Map();
  for (const r of casas) for (const a of lerJsonArray(r.acoes_sociais)) acoes.set(a, (acoes.get(a) || 0) + 1);

  const anos = casas.map((r) => r.ano_fundacao).filter(Number.isInteger);

  // Casas mais antigas: casas OCULTAS aparecem anonimizadas — sem nome, sem
  // distrito e com a fundação arredondada para a década, para que a
  // combinação "nação + distrito + ano" não permita reidentificá-las.
  const maisAntigas = casas
    .filter((r) => Number.isInteger(r.ano_fundacao))
    .sort((a, b) => a.ano_fundacao - b.ano_fundacao)
    .slice(0, 5)
    .map((r) => {
      const oculta = r.nivel_privacidade === 'Oculto_Apenas_Censo';
      return oculta
        ? { anonimizada: true, nome_casa: null, slug: null, vertente: r.vertente, nacao_linha: r.nacao_linha,
            distrito: null, decada_fundacao: Math.floor(r.ano_fundacao / 10) * 10 }
        : { anonimizada: false, nome_casa: r.nome_casa, slug: r.slug, vertente: r.vertente,
            nacao_linha: r.nacao_linha, distrito: r.distrito, ano_fundacao: r.ano_fundacao,
            anos_de_historia: anoAtual - r.ano_fundacao };
    });

  return {
    total_casas: casas.length,
    total_economia_axe: rows.length - casas.length,
    casas_ocultas: casas.filter((r) => r.nivel_privacidade === 'Oculto_Apenas_Censo').length,
    fundacao_mais_antiga: anos.length ? Math.min(...anos) : null,
    media_anos_de_historia: anos.length ? Math.round(anos.reduce((s, a) => s + (anoAtual - a), 0) / anos.length) : null,
    por_distrito: contar(casas, 'distrito', DISTRITOS),
    por_vertente: ordenar(contar(casas, 'vertente', VERTENTES)).filter((v) => v.total > 0),
    por_nacao: ordenar(contar(casas, 'nacao_linha')),
    por_privacidade: contar(casas, 'nivel_privacidade', ['Exato', 'Aproximado', 'Oculto_Apenas_Censo']),
    acoes_sociais: ordenar([...acoes].map(([rotulo, total]) => ({ rotulo, total }))),
    mais_antigas: maisAntigas,
  };
}
