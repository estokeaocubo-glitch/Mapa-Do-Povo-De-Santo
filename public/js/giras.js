// Interpretação do calendário de giras (módulo compartilhado: navegador e Worker).
// O calendário é guardado como texto curto (dia, horário, frequência); aqui ele
// vira dias da semana e regras de recorrência para "Gira hoje" e para a agenda .ics.

export const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const OPCOES_DIA = [...DIAS_SEMANA, 'Segunda a sexta', 'Segunda a sábado', 'Todos os dias'];
export const OPCOES_FREQUENCIA = [
  'Semanal', 'Quinzenal', '1ª semana do mês', '2ª semana do mês', '3ª semana do mês', '4ª semana do mês',
  'Última semana do mês', 'Datas festivas (combinar)',
];
const SIGLAS_ICS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const RAIZES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

// "Sábado" → [6]; "Segunda a sábado" → [1..6]; "Sexta e sábado" → [5, 6]
export function diasDaSemana(dia) {
  const t = normalizar(dia);
  if (!t) return [];
  if (/todos os dias|diari/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  const achados = [];
  for (const m of t.matchAll(/\b(dom|seg|ter|qua|qui|sex|sab)[a-z-]*/g)) achados.push(RAIZES.indexOf(m[1]));
  if (/\ba\b|\bate\b/.test(t) && achados.length === 2) {
    const [ini, fim] = achados;
    const lista = [];
    for (let d = ini; ; d = (d + 1) % 7) { lista.push(d); if (d === fim || lista.length > 7) break; }
    return lista;
  }
  return [...new Set(achados)];
}

// "Semanal" → {tipo:'semanal'}; "1ª semana do mês" / "1º sábado do mês" → {tipo:'mensal', ordem:1}
export function regraFrequencia(frequencia) {
  const t = normalizar(frequencia);
  if (!t || /semanal|toda semana|diari/.test(t)) return { tipo: 'semanal' };
  if (/quinzen/.test(t)) return { tipo: 'quinzenal' };
  if (/ultim/.test(t)) return { tipo: 'mensal', ordem: -1 };
  const ordem = t.match(/\b([1-4])\s*[ºoªa°]?/);
  if (ordem && /mes/.test(t)) return { tipo: 'mensal', ordem: Number(ordem[1]) };
  return null; // datas festivas, meses ("Abril") e outros textos: sem regra automática
}

// Qual ocorrência do dia da semana no mês (1–5) e se é a última.
function ordemNoMes(data) {
  const n = Math.ceil(data.getDate() / 7);
  const ultima = new Date(data.getFullYear(), data.getMonth(), data.getDate() + 7).getMonth() !== data.getMonth();
  return { n, ultima };
}

// 'sim' (tem gira hoje), 'talvez' (quinzenal) ou 'nao'.
export function giraNoDia(gira, data = new Date()) {
  if (!diasDaSemana(gira.dia).includes(data.getDay())) return 'nao';
  const regra = regraFrequencia(gira.frequencia);
  if (!regra) return 'nao';
  if (regra.tipo === 'semanal') return 'sim';
  if (regra.tipo === 'quinzenal') return 'talvez';
  const { n, ultima } = ordemNoMes(data);
  return (regra.ordem === -1 ? ultima : regra.ordem === n) ? 'sim' : 'nao';
}

export function girasDoDia(casa, data = new Date()) {
  return (casa.calendario_giras || [])
    .map((g) => ({ ...g, hoje: giraNoDia(g, data) }))
    .filter((g) => g.hoje !== 'nao');
}

// "19:00", "20h", "20h30", "09:00–18:00" → "19:00"
export function horarioInicial(horario) {
  const m = String(horario ?? '').match(/(\d{1,2})\s*(?:[:h]\s*(\d{2}))?/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : null;
}

// Regra RRULE (iCalendar) da gira, ou null quando não há recorrência automática.
export function rruleDaGira(gira) {
  const dias = diasDaSemana(gira.dia);
  const regra = regraFrequencia(gira.frequencia);
  if (!dias.length || !regra) return null;
  const byday = dias.map((d) => SIGLAS_ICS[d]);
  if (regra.tipo === 'semanal') return `FREQ=WEEKLY;BYDAY=${byday.join(',')}`;
  if (regra.tipo === 'quinzenal') return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${byday.join(',')}`;
  return `FREQ=MONTHLY;BYDAY=${byday.map((s) => `${regra.ordem}${s}`).join(',')}`;
}
