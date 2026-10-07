// Domínios válidos — espelham os ENUMs de db/schema.sql.
export const VERTENTES = ['Umbanda', 'Candomblé', 'Omolokô', 'Ifá', 'Kimbanda', 'Misto/Outros'];

export const DISTRITOS = [
  '1º Distrito - Petrópolis (Centro)',
  '2º Distrito - Cascatinha',
  '3º Distrito - Itaipava',
  '4º Distrito - Pedro do Rio',
  '5º Distrito - Posse',
];

export const NIVEIS_PRIVACIDADE = ['Exato', 'Aproximado', 'Oculto_Apenas_Censo'];
export const STATUS_MODERACAO = ['Pendente', 'Aprovado', 'Rejeitado'];
export const CATEGORIAS = ['Casa de Axé', 'Economia do Axé'];

// Caixa envolvente do município de Petrópolis (com folga). Cadastros fora
// dela são recusados — evita lixo e coordenadas digitadas trocadas.
export const PETROPOLIS_BBOX = { latMin: -22.65, latMax: -22.13, lngMin: -43.40, lngMax: -42.93 };
