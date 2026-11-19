// GET /api/agenda.ics[?slug=...] → giras públicas recorrentes em formato de
// calendário (iCalendar), para assinar no celular (Google Agenda, Apple, Outlook).
// Só casas visíveis no mapa. Local = bairro; endereço só quando a própria casa
// escolheu "Exato" e o contato não é restrito (a view pública já garante isso).
import { horarioInicial, giraNoDia, rruleDaGira } from '../../public/js/giras.js';
import { lerJsonArray } from '../../lib/privacy.js';
import { metodoNaoPermitido } from '../http.js';

const escTexto = (t) => String(t ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dobrar = (linha) => linha.match(/.{1,70}/gu).join('\r\n ');          // linhas longas (RFC 5545)
const doisDigitos = (n) => String(n).padStart(2, '0');

// Data de "hoje" em Brasília (UTC−3, sem horário de verão) como Date local.
function hojeEmBrasilia() {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Primeira data, a partir de hoje, em que a gira acontece.
function primeiraOcorrencia(gira) {
  const base = hojeEmBrasilia();
  for (let i = 0; i < 70; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    if (giraNoDia(gira, d) !== 'nao') return d;
  }
  return null;
}

export async function agenda(request, env, url) {
  if (request.method !== 'GET') return metodoNaoPermitido(['GET']);
  const slug = url.searchParams.get('slug');
  const filtro = slug && /^[a-z0-9-]{1,180}$/.test(slug) ? slug : null;
  const { results } = await env.DB.prepare(
    `SELECT slug, nome_casa, bairro, endereco_publico, calendario_giras FROM vw_terreiros_publicos
      WHERE categoria = 'Casa de Axé' ${filtro ? 'AND slug = ?1' : ''}`,
  ).bind(...(filtro ? [filtro] : [])).all();

  const agora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const eventos = [];
  for (const casa of results) {
    lerJsonArray(casa.calendario_giras).forEach((gira, i) => {
      const regra = rruleDaGira(gira);
      const hora = horarioInicial(gira.horario);
      const inicio = regra && hora && primeiraOcorrencia(gira);
      if (!inicio) return;
      const dt = `${inicio.getFullYear()}${doisDigitos(inicio.getMonth() + 1)}${doisDigitos(inicio.getDate())}T${hora.replace(':', '')}00`;
      const link = new URL(`/casa/${casa.slug}`, url).href;
      eventos.push([
        'BEGIN:VEVENT',
        `UID:${casa.slug}-${i}@mapa-povo-de-santo`,
        `DTSTAMP:${agora}`,
        `DTSTART;TZID=America/Sao_Paulo:${dt}`,
        'DURATION:PT3H',
        `RRULE:${regra}`,
        `SUMMARY:${escTexto(`${gira.tipo || 'Gira'} — ${casa.nome_casa}`)}`,
        `LOCATION:${escTexto(casa.endereco_publico || `${casa.bairro}, Petrópolis/RJ (endereço com a casa)`)}`,
        `DESCRIPTION:${escTexto(`${gira.frequencia ? `${gira.frequencia}. ` : ''}Confirme com a casa antes de ir. ${link}`)}`,
        `URL:${link}`,
        'END:VEVENT',
      ].map(dobrar).join('\r\n'));
    });
  }

  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mapa do Povo de Santo//Petropolis//PT', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Giras públicas · Mapa do Povo de Santo', 'X-WR-TIMEZONE:America/Sao_Paulo',
    'BEGIN:VTIMEZONE', 'TZID:America/Sao_Paulo', 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0300', 'TZNAME:-03', 'END:STANDARD', 'END:VTIMEZONE',
    ...eventos, 'END:VCALENDAR',
  ].join('\r\n');
  return new Response(`${ics}\r\n`, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="giras${filtro ? `-${filtro}` : ''}.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
