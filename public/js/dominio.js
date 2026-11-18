// Domínios válidos (espelham as CHECK constraints do banco D1).
// Módulo ÚNICO compartilhado: o Worker importa via lib/constants.js e o
// navegador importa direto daqui — não duplique estas listas.
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

// 5524999990001 → (24) 99999-0001
export function formatarTelefone(numero) {
  const d = String(numero || '').replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return numero || null;
}
