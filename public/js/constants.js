// Constantes do front-end (espelham os ENUMs do banco).
export { VERTENTES, DISTRITOS } from './dominio.js';

// Segmentos = cor do pino + filtro rápido. Cor + letra no pino: a identidade
// não depende só da cor (acessível para daltonismo).
export const SEGMENTOS = {
  umbanda:   { rotulo: 'Umbanda',          cor: '#5B8DEF', letra: 'U' },
  candomble: { rotulo: 'Candomblé',        cor: '#C49A22', anel: '#C85A32', letra: 'C' },
  outras:    { rotulo: 'Outras vertentes', cor: '#3A9460', letra: 'O' },
  axe:       { rotulo: 'Economia do Axé',  cor: '#9468E6', letra: 'E' },
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
    texto: 'O mapa mostra só o bairro e um círculo de ~500 m que contém a casa, sem revelar onde ela fica dentro dele. O endereço nunca sai do servidor: quem quiser visitar pede pelo WhatsApp da casa.',
  },
  Oculto_Apenas_Censo: {
    titulo: 'Oculto — apenas censo',
    icone: 'eye-off',
    texto: 'A casa não aparece no mapa nem na lista. Ela só entra nos números agregados do censo (por distrito, nação, ano), sem nome e sem localização.',
  },
};

// Glossário introdutório. Definições curtas e gerais: cada casa e cada nação
// tem seus próprios fundamentos e grafias. Revisar com as lideranças.
export const GLOSSARIO = {
  'Axé': 'Força vital sagrada que circula entre pessoas, natureza e divindades. Também nomeia a própria comunidade de uma casa.',
  'Candomblé': 'Religião afro-brasileira de culto aos orixás, inkices ou voduns, organizada em nações (Ketu, Angola, Jeje, Efòn, entre outras).',
  'Umbanda': 'Religião brasileira que reúne heranças africanas, indígenas e do espiritismo, com giras de caboclos, pretos-velhos, crianças, exus e outras linhas.',
  'Omolokô': 'Tradição afro-brasileira de raiz banto, aproximada da Umbanda, difundida no Rio de Janeiro por Tancredo da Silva Pinto.',
  'Ifá': 'Sistema religioso e oracular iorubá ligado a Orunmilá, conduzido por babalaôs.',
  'Kimbanda': 'Tradição afro-brasileira dedicada às linhas de exus e pombagiras.',
  'Nação': 'No Candomblé, a linhagem ritual e linguística de uma casa: Ketu e Efòn (iorubá), Angola (banto), Jeje (fon), entre outras.',
  'Ketu': 'Nação do Candomblé de origem iorubá, de culto aos orixás.',
  'Angola': 'Nação do Candomblé de origem banto, de culto aos inkices.',
  'Jeje': 'Nação do Candomblé de origem fon (atual Benim), de culto aos voduns.',
  'Efòn': 'Nação do Candomblé de origem iorubá, ligada à região de Efòn-Alayé.',
  'Orixá': 'Divindade do panteão iorubá, como Oxum, Ogum, Xangô e Iemanjá.',
  'Inkice': 'Divindade cultuada nas nações de origem banto (Angola, Congo).',
  'Vodum': 'Divindade cultuada na nação Jeje.',
  'Babalorixá': 'Sacerdote que lidera uma casa de Candomblé de nação iorubá ("pai de santo").',
  'Yalorixá': 'Sacerdotisa que lidera uma casa de Candomblé de nação iorubá ("mãe de santo").',
  'Tata': 'Título de sacerdote nas nações de origem banto (Angola), como em Tata de Inkice.',
  'Mametu': 'Título de sacerdotisa nas nações de origem banto (Angola), como em Mametu de Inkice.',
  'Doté': 'Título de sacerdote na nação Jeje.',
  'Doné': 'Título de sacerdotisa na nação Jeje.',
  'Babalaô': 'Sacerdote de Ifá, responsável pela consulta oracular.',
  'Pai de Santo': 'Forma popular de chamar o sacerdote que lidera uma casa de axé.',
  'Mãe de Santo': 'Forma popular de chamar a sacerdotisa que lidera uma casa de axé.',
  'Gira': 'Cerimônia da Umbanda e do Omolokô em que as entidades se manifestam, com cantos (pontos) e atendimento.',
  'Xirê': 'Roda de dança e cantigas em louvor aos orixás, em festas públicas do Candomblé.',
  'Caboclo': 'Entidade de origem indígena cultuada na Umbanda e em muitas casas de Candomblé.',
  'Preto-Velho': 'Entidade que representa a sabedoria de pessoas negras escravizadas; marca forte da Umbanda.',
  'Curimba': 'Grupo de atabaques e cantos que conduz a gira na Umbanda.',
  'Ogã': 'Cargo masculino de quem toca, canta ou cuida da casa, sem entrar em transe.',
  'Ekedi': 'Cargo feminino de quem cuida dos orixás e das pessoas em transe, sem entrar em transe.',
  'Economia do Axé': 'Comércio e serviços ligados às religiões de matriz africana: ervas, louças, guias, roupas e artesanato.',
};

// Orientações gerais para visitar uma casa de axé (cada casa tem seus fundamentos).
export const ORIENTACOES_VISITA = [
  'Confirme dia e horário com a casa antes de ir: festas e giras públicas podem mudar.',
  'Use roupas claras e discretas; pergunte se a casa tem alguma orientação de vestimenta.',
  'Não fotografe nem filme sem autorização.',
  'Silencie o celular e siga as orientações de quem recebe (ogãs, ekedis, cambones) sobre onde ficar.',
  'Não toque em objetos sagrados, assentamentos ou pessoas em transe sem orientação.',
  'Não leve comida ou bebida sem combinar antes.',
];
