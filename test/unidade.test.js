import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertSemCamposPrivados, coordenadaPublica, DESLOCAMENTO_MAX_M, DESLOCAMENTO_MIN_M, ofuscarCoordenada, toPublicTerreiro,
} from '../lib/privacy.js';
import { gerarHash, normalizarSenha, verificarSenha } from '../lib/senha.js';
import { criarCookieSessao, sessaoValida } from '../lib/sessao.js';
import { calcularEstatisticas } from '../lib/stats.js';
import { normalizarWhatsapp, validarCadastro } from '../lib/validation.js';

const distanciaM = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));

test('ofuscação fica sempre entre 200 e 450 m (dentro do círculo de 500 m)', () => {
  const real = { lat: -22.505, lng: -43.178 };
  for (let i = 0; i < 2000; i++) {
    const d = distanciaM(real, ofuscarCoordenada(real.lat, real.lng));
    assert.ok(d >= DESLOCAMENTO_MIN_M - 1 && d <= DESLOCAMENTO_MAX_M + 1, `distância fora da faixa: ${d}`);
  }
});

test('coordenada pública por nível', () => {
  assert.deepEqual(coordenadaPublica('Exato', -22.5, -43.1), { lat: -22.5, lng: -43.1 });
  assert.deepEqual(coordenadaPublica('Oculto_Apenas_Censo', -22.5, -43.1), { lat: null, lng: null });
  assert.notDeepEqual(coordenadaPublica('Aproximado', -22.5, -43.1), { lat: -22.5, lng: -43.1 });
});

test('saneamento público remove tudo que é privado', () => {
  const base = {
    id: '1', slug: 's', nome_casa: 'Casa', nivel_privacidade: 'Aproximado', status_moderacao: 'Aprovado',
    lat_real: -22.5, lng_real: -43.1, lat_publica: -22.502, lng_publica: -43.103, endereco_completo: 'Rua X',
    endereco_publico: 'Rua X', whatsapp_contato: '5524999990000', contato_restrito: 0,
  };
  const p = toPublicTerreiro(base);
  for (const campo of ['lat_real', 'lng_real', 'endereco_completo', 'status_moderacao']) assert.ok(!(campo in p));
  assert.equal(p.endereco, null);
  assert.equal(p.localizacao.tipo, 'area');

  const restrito = toPublicTerreiro({ ...base, nivel_privacidade: 'Exato', contato_restrito: 1 });
  assert.equal(restrito.whatsapp_contato, null);
  assert.equal(restrito.endereco, null);

  assert.equal(toPublicTerreiro({ ...base, nivel_privacidade: 'Oculto_Apenas_Censo' }), null);
  assert.equal(toPublicTerreiro({ ...base, status_moderacao: 'Pendente' }), null);
  assert.throws(() => assertSemCamposPrivados([{ lat_real: 1 }]));
});

test('validação: pino não marcado, endereço obrigatório no Exato, WhatsApp', () => {
  assert.equal(validarCadastro({ lat: null, lng: null }).erros.localizacao, 'Marque a localização da casa no mapa.');
  assert.match(validarCadastro({ lat: 0, lng: 0 }).erros.localizacao, /município de Petrópolis/);
  assert.ok(validarCadastro({ nivel_privacidade: 'Exato' }).erros.endereco_completo);
  assert.equal(normalizarWhatsapp('(24) 99999-0000'), '5524999990000');
  assert.equal(normalizarWhatsapp('123'), undefined);
  const ok = validarCadastro({
    nome_casa: 'Casa Teste', vertente: 'Umbanda', distrito: '2º Distrito - Cascatinha', bairro: 'Nogueira',
    lat: -22.46, lng: -43.14, nivel_privacidade: 'Aproximado', whatsapp_contato: '24 98888-7777', consentimento_lgpd: true,
  });
  assert.equal(ok.erros, undefined);
});

test('senha: aceita formato de telefone e frase-senha', async () => {
  assert.equal(normalizarSenha('(11) 2222-3333'), '1122223333');
  assert.equal(normalizarSenha('  Axé de   Oxum '), 'axé de oxum');
  const hash = await gerarHash('11 2222 3333');
  assert.ok(await verificarSenha('(11) 2222-3333', hash));
  assert.ok(!(await verificarSenha('11 2222 3334', hash)));
  assert.ok(!(await verificarSenha('', hash)));
});

test('sessão: cookie assinado vale, adulterado ou vencido não', async () => {
  const pedido = (cookie) => new Request('https://x/api/desbloquear', { headers: { Cookie: cookie } });
  const valor = (await criarCookieSessao('segredo')).split(';')[0];
  assert.ok(await sessaoValida(pedido(valor), 'segredo'));
  assert.ok(!(await sessaoValida(pedido(valor), 'outro-segredo')));
  assert.ok(!(await sessaoValida(pedido(valor.replace(/=(\d)/, (_, d) => `=${(Number(d) + 1) % 10}`)), 'segredo')));
  const vencido = (await criarCookieSessao('segredo', { agoraMs: Date.now() - 3600_000 })).split(';')[0];
  assert.ok(!(await sessaoValida(pedido(vencido), 'segredo')));
});

test('censo: categoria pequena com casa oculta não tem número publicado', () => {
  const casa = (o) => ({ categoria: 'Casa de Axé', vertente: 'Umbanda', distrito: '1º Distrito - Petrópolis (Centro)', acoes_sociais: '[]', ...o });
  const s = calcularEstatisticas([
    casa({ nome_casa: 'A', nivel_privacidade: 'Exato', ano_fundacao: 1990 }),
    casa({ nivel_privacidade: 'Oculto_Apenas_Censo', vertente: 'Candomblé', nacao_linha: 'Angola', distrito: '2º Distrito - Cascatinha', ano_fundacao: 1985 }),
  ]);
  assert.deepEqual(s.por_distrito.find((d) => d.rotulo.startsWith('2º')), { rotulo: '2º Distrito - Cascatinha', total: null, suprimido: true });
  assert.equal(s.por_nacao.find((n) => n.rotulo === 'Angola').suprimido, true);
  assert.equal(s.fundacao_mais_antiga, 'década de 1980');
  assert.equal(s.mais_antigas[0].nome_casa, null);
  assert.equal(s.mais_antigas[0].nacao_linha, null);
  assert.equal(s.casas_ocultas, 1);
});
