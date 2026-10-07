// Validação e normalização do formulário público de cadastro.
// Tudo que vem do navegador é tratado como não confiável.
import { CATEGORIAS, DISTRITOS, NIVEIS_PRIVACIDADE, PETROPOLIS_BBOX, VERTENTES } from './constants.js';

const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function texto(valor, { max, min = 0, obrigatorio = false, multilinha = false }, campo, erros) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) erros[campo] = 'Campo obrigatório.';
    return null;
  }
  if (typeof valor !== 'string') {
    erros[campo] = 'Formato inválido.';
    return null;
  }
  let v = valor.replace(CONTROLE, '');
  v = multilinha ? v.replace(/\r\n/g, '\n').trim() : v.replace(/\s+/g, ' ').trim();
  if (!v) {
    if (obrigatorio) erros[campo] = 'Campo obrigatório.';
    return null;
  }
  if (v.length < min) erros[campo] = `Mínimo de ${min} caracteres.`;
  if (v.length > max) erros[campo] = `Máximo de ${max} caracteres.`;
  return v;
}

function enumeracao(valor, opcoes, campo, erros, padrao) {
  if ((valor === undefined || valor === null || valor === '') && padrao !== undefined) return padrao;
  if (!opcoes.includes(valor)) {
    erros[campo] = 'Selecione uma opção válida.';
    return null;
  }
  return valor;
}

export function slugify(nome) {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 150) || 'casa';
}

export function normalizarWhatsapp(valor) {
  if (!valor) return null;
  let d = String(valor).replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`; // DDD + número → padrão internacional
  return /^55\d{10,11}$/.test(d) ? d : undefined;
}

export function normalizarInstagram(valor) {
  if (!valor) return null;
  const v = String(valor).trim();
  const m = v.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:\?.*)?$/i)
         || v.match(/^@?([A-Za-z0-9._]{1,30})$/);
  return m ? `https://instagram.com/${m[1]}` : undefined;
}

export function validarCadastro(body) {
  const erros = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { erros: { _: 'Corpo inválido.' } };
  }

  const dados = {
    nome_casa: texto(body.nome_casa, { min: 3, max: 160, obrigatorio: true }, 'nome_casa', erros),
    categoria: enumeracao(body.categoria, CATEGORIAS, 'categoria', erros, 'Casa de Axé'),
    vertente: enumeracao(body.vertente, VERTENTES, 'vertente', erros),
    nacao_linha: texto(body.nacao_linha, { max: 80 }, 'nacao_linha', erros),
    orixa_guia_regente: texto(body.orixa_guia_regente, { max: 120 }, 'orixa_guia_regente', erros),
    lideranca_titulo: texto(body.lideranca_titulo, { max: 60 }, 'lideranca_titulo', erros),
    lideranca_nome_religioso: texto(body.lideranca_nome_religioso, { max: 120 }, 'lideranca_nome_religioso', erros),
    distrito: enumeracao(body.distrito, DISTRITOS, 'distrito', erros),
    bairro: texto(body.bairro, { min: 2, max: 100, obrigatorio: true }, 'bairro', erros),
    endereco_completo: texto(body.endereco_completo, { max: 300 }, 'endereco_completo', erros),
    nivel_privacidade: enumeracao(body.nivel_privacidade, NIVEIS_PRIVACIDADE, 'nivel_privacidade', erros),
    historia_resumo: texto(body.historia_resumo, { max: 2000, multilinha: true }, 'historia_resumo', erros),
  };

  // Ano de fundação
  if (body.ano_fundacao !== undefined && body.ano_fundacao !== null && body.ano_fundacao !== '') {
    const ano = Number(body.ano_fundacao);
    const max = new Date().getFullYear();
    if (!Number.isInteger(ano) || ano < 1800 || ano > max) erros.ano_fundacao = `Informe um ano entre 1800 e ${max}.`;
    else dados.ano_fundacao = ano;
  } else {
    dados.ano_fundacao = null;
  }

  // Coordenadas reais — ficam APENAS no banco (lat_real/lng_real).
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const b = PETROPOLIS_BBOX;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    erros.localizacao = 'Marque a localização da casa no mapa.';
  } else if (lat < b.latMin || lat > b.latMax || lng < b.lngMin || lng > b.lngMax) {
    erros.localizacao = 'A localização precisa estar dentro do município de Petrópolis.';
  } else {
    dados.lat_real = Number(lat.toFixed(6));
    dados.lng_real = Number(lng.toFixed(6));
  }

  // Calendário de giras (JSONB) — estrutura fechada, nada além destes campos.
  const giras = Array.isArray(body.calendario_giras) ? body.calendario_giras : [];
  if (giras.length > 14) erros.calendario_giras = 'Máximo de 14 giras/atendimentos.';
  dados.calendario_giras = giras.slice(0, 14).map((g, i) => {
    const e = {};
    const item = {
      dia: texto(g?.dia, { max: 30, obrigatorio: true }, 'dia', e),
      horario: texto(g?.horario, { max: 20 }, 'horario', e),
      tipo: texto(g?.tipo, { max: 80 }, 'tipo', e),
      frequencia: texto(g?.frequencia, { max: 40 }, 'frequencia', e),
    };
    if (Object.keys(e).length) erros[`calendario_giras.${i}`] = 'Informe ao menos o dia (textos curtos).';
    return Object.fromEntries(Object.entries(item).filter(([, v]) => v));
  });

  // Ações sociais (TEXT[])
  const acoes = Array.isArray(body.acoes_sociais) ? body.acoes_sociais : [];
  const acoesLimpas = [];
  for (const a of acoes.slice(0, 12)) {
    const e = {};
    const v = texto(a, { max: 60 }, 'a', e);
    if (Object.keys(e).length) erros.acoes_sociais = 'Cada ação social deve ter até 60 caracteres.';
    else if (v && !acoesLimpas.includes(v)) acoesLimpas.push(v);
  }
  dados.acoes_sociais = acoesLimpas;

  // Contatos
  const whats = normalizarWhatsapp(body.whatsapp_contato);
  if (whats === undefined) erros.whatsapp_contato = 'WhatsApp inválido. Use DDD + número, ex.: (24) 99999-0000.';
  dados.whatsapp_contato = whats ?? null;

  const insta = normalizarInstagram(body.instagram_url);
  if (insta === undefined) erros.instagram_url = 'Informe o @ ou o link do perfil do Instagram.';
  dados.instagram_url = insta ?? null;

  // Para 'Aproximado' o WhatsApp é o canal para pedir o endereço.
  if (dados.nivel_privacidade === 'Aproximado' && !dados.whatsapp_contato) {
    erros.whatsapp_contato = 'Casas com localização aproximada precisam de um WhatsApp para receber pedidos de endereço.';
  }

  // Consentimento explícito para tratamento de dado religioso (LGPD art. 11, I).
  if (body.consentimento_lgpd !== true) {
    erros.consentimento_lgpd = 'É necessário consentir com o tratamento dos dados para enviar o cadastro.';
  }

  return Object.keys(erros).length ? { erros } : { dados };
}
