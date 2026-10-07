// Constantes do front-end (espelham os ENUMs do banco).
export const VERTENTES = ['Umbanda', 'Candomblé', 'Omolokô', 'Ifá', 'Kimbanda', 'Misto/Outros'];

export const DISTRITOS = [
  '1º Distrito - Petrópolis (Centro)',
  '2º Distrito - Cascatinha',
  '3º Distrito - Itaipava',
  '4º Distrito - Pedro do Rio',
  '5º Distrito - Posse',
];

// Segmentos = cor do pino + filtro rápido. Cor + letra no pino: a identidade
// não depende só da cor (acessível para daltonismo).
export const SEGMENTOS = {
  umbanda:   { rotulo: 'Umbanda',          cor: '#5B8DEF', letra: 'U' },
  candomble: { rotulo: 'Candomblé',        cor: '#C49A22', anel: '#C85A32', letra: 'C' },
  outras:    { rotulo: 'Outras vertentes', cor: '#3A9460', letra: 'O' },
  axe:       { rotulo: 'Economia do Axé',  cor: '#9468E6', letra: '$' },
};

export function segmentoDe(casa) {
  if (casa.categoria === 'Economia do Axé') return 'axe';
  if (casa.vertente === 'Umbanda') return 'umbanda';
  if (casa.vertente === 'Candomblé') return 'candomble';
  return 'outras';
}

export const ACOES_SOCIAIS_SUGERIDAS = [
  'Cesta Básica', 'Oficina de Percussão', 'Biblioteca Afro', 'Acolhimento Psicológico',
  'Reforço Escolar', 'Doação de Roupas', 'Horta Comunitária', 'Atendimento Jurídico',
];

export const TITULOS_LIDERANCA = [
  'Babalorixá', 'Yalorixá', 'Tata', 'Mametu', 'Doté', 'Doné', 'Babalaô',
  'Pai de Santo', 'Mãe de Santo', 'Zelador(a)', 'Dirigente',
];

export const CENTRO_PETROPOLIS = [-22.43, -43.16];
export const RAIO_APROXIMADO_M = 500;

export const MENSAGEM_WHATSAPP =
  'Olá, vi o perfil da casa no Mapa do Povo de Santo de Petrópolis e gostaria de informações sobre as próximas giras...';
export const MENSAGEM_WHATSAPP_ENDERECO =
  'Olá, vi o perfil da casa no Mapa do Povo de Santo de Petrópolis e gostaria de informações sobre as próximas giras. Poderia me passar o endereço e como faço para agendar uma visita?';

export const TEXTO_PRIVACIDADE = {
  Exato: {
    titulo: 'Localização exata',
    icone: 'map-pin',
    texto: 'O pino aparece no endereço da casa e o endereço completo fica visível. Indicado para casas abertas ao público e já conhecidas na vizinhança.',
  },
  Aproximado: {
    titulo: 'Área aproximada (recomendado)',
    icone: 'circle-dashed',
    texto: 'O mapa mostra só um círculo de ~500 m em torno de um ponto deslocado de 400 a 800 m em direção aleatória, mais o bairro. O endereço nunca sai do servidor: quem quiser visitar pede pelo WhatsApp da casa.',
  },
  Oculto_Apenas_Censo: {
    titulo: 'Oculto — apenas censo',
    icone: 'eye-off',
    texto: 'A casa não aparece no mapa nem na lista. Ela só entra nos números agregados do censo (por distrito, nação, ano), sem nome e sem localização.',
  },
};
