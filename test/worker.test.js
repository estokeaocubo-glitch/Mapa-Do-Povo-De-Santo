// Testes de ponta a ponta do Worker (rotas da API + banco com as migrações reais).
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { coordenadaPublica } from '../lib/privacy.js';
import { gerarHash } from '../lib/senha.js';
import worker from '../worker/index.js';
import { criarD1 } from './d1-local.js';

// Cache API da Cloudflare: no teste, um cache que nunca guarda nada.
globalThis.caches = { default: { match: async () => undefined, put: async () => {}, delete: async () => true } };

const SENHA = 'axé de oxum na serra';
const HASH = await gerarHash(SENHA);
const TOKEN = 'token-de-teste-com-mais-de-24-caracteres';
let env;
let ipSeq = 0;

beforeEach(() => {
  env = { DB: criarD1(), ACESSO_RESTRITO_HASH: HASH, ADMIN_TOKEN: TOKEN, IP_SALT: 'sal', ASSETS: { fetch: () => new Response('site') } };
});

const novoIp = () => `203.0.113.${++ipSeq % 250}`;
async function chamar(metodo, caminho, { corpo, ip = '198.51.100.1', headers = {} } = {}) {
  const req = new Request(`https://mapa.test${caminho}`, {
    method: metodo,
    headers: { 'CF-Connecting-IP': ip, ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const resp = await worker.fetch(req, env, { waitUntil() {} });
  const texto = await resp.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* não JSON */ }
  return { status: resp.status, json, texto, headers: resp.headers };
}

function inserir(casa) {
  const c = {
    id: crypto.randomUUID(), categoria: 'Casa de Axé', vertente: 'Umbanda', distrito: '1º Distrito - Petrópolis (Centro)',
    bairro: 'Centro', lat_real: -22.505, lng_real: -43.178, nivel_privacidade: 'Exato', status_moderacao: 'Aprovado',
    contato_restrito: 0, endereco_completo: 'Rua Secreta, 1', whatsapp_contato: '5524999990000', ...casa,
  };
  const pub = coordenadaPublica(c.nivel_privacidade, c.lat_real, c.lng_real);
  env.DB.bruto.prepare(`INSERT INTO terreiros (id, nome_casa, slug, categoria, vertente, distrito, bairro, endereco_completo,
      lat_real, lng_real, lat_publica, lng_publica, nivel_privacidade, whatsapp_contato, contato_restrito, status_moderacao, nacao_linha, ano_fundacao)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    c.id, c.nome_casa, c.slug, c.categoria, c.vertente, c.distrito, c.bairro, c.endereco_completo, c.lat_real, c.lng_real,
    pub.lat, pub.lng, c.nivel_privacidade, c.whatsapp_contato, c.contato_restrito, c.status_moderacao, c.nacao_linha ?? null, c.ano_fundacao ?? null,
  );
  return c;
}

const cadastroValido = (o = {}) => ({
  nome_casa: 'Tenda de Teste', vertente: 'Umbanda', distrito: '2º Distrito - Cascatinha', bairro: 'Nogueira',
  lat: -22.46, lng: -43.14, nivel_privacidade: 'Aproximado', whatsapp_contato: '(24) 98888-7777', consentimento_lgpd: true, ...o,
});

test('listagem pública não vaza nada privado nem casas ocultas/pendentes', async () => {
  inserir({ nome_casa: 'Exata', slug: 'exata' });
  inserir({ nome_casa: 'Aprox', slug: 'aprox', nivel_privacidade: 'Aproximado', endereco_completo: 'Rua Aprox, 2' });
  inserir({ nome_casa: 'Restrita', slug: 'restrita', contato_restrito: 1, endereco_completo: 'Rua Restrita, 3', whatsapp_contato: '5524911112222' });
  inserir({ nome_casa: 'Oculta', slug: 'oculta', nivel_privacidade: 'Oculto_Apenas_Censo' });
  inserir({ nome_casa: 'Pendente', slug: 'pendente', status_moderacao: 'Pendente' });

  const { status, json, texto } = await chamar('GET', '/api/terreiros');
  assert.equal(status, 200);
  assert.deepEqual(json.terreiros.map((t) => t.slug).sort(), ['aprox', 'exata', 'restrita']);
  for (const proibido of ['lat_real', 'lng_real', 'endereco_completo', 'Rua Aprox', 'Rua Restrita', '5524911112222', 'Oculta', 'Pendente']) {
    assert.ok(!texto.includes(proibido), `vazou: ${proibido}`);
  }
  assert.equal(json.estatisticas.casas_ocultas, 1);
});

test('banco recusa coordenada aproximada sem deslocamento e reescrita da coordenada pública', () => {
  assert.throws(() => env.DB.bruto.prepare(`INSERT INTO terreiros (id, nome_casa, slug, vertente, distrito, bairro, lat_real, lng_real,
      lat_publica, lng_publica, nivel_privacidade) VALUES ('x','X','x','Umbanda','2º Distrito - Cascatinha','B',-22.4,-43.1,-22.4,-43.1,'Aproximado')`).run(),
  /CHECK constraint/);
  const c = inserir({ nome_casa: 'A', slug: 'a', nivel_privacidade: 'Aproximado' });
  assert.throws(() => env.DB.bruto.prepare('UPDATE terreiros SET lat_publica = -22.1 WHERE id = ?').run(c.id), /imutavel/);
});

test('cadastro: erros de preenchimento não gastam o limite; só aceitos contam', async () => {
  const ip = novoIp();
  for (let i = 0; i < 7; i++) assert.equal((await chamar('POST', '/api/cadastro', { ip, corpo: { nome_casa: 'x' } })).status, 422);
  for (let i = 0; i < 5; i++) {
    const r = await chamar('POST', '/api/cadastro', { ip, corpo: cadastroValido({ nome_casa: `Casa número ${i}` }) });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  }
  assert.equal((await chamar('POST', '/api/cadastro', { ip, corpo: cadastroValido({ nome_casa: 'Sexta casa' }) })).status, 429);
  const pendentes = (await env.DB.prepare("SELECT status_moderacao FROM terreiros").all()).results;
  assert.ok(pendentes.every((r) => r.status_moderacao === 'Pendente'));
});

test('cadastro: duplicata (mesmo nome sem acento + bairro) é recusada', async () => {
  assert.equal((await chamar('POST', '/api/cadastro', { ip: novoIp(), corpo: cadastroValido({ nome_casa: 'Ilê Àṣẹ Ògún' }) })).status, 201);
  assert.equal((await chamar('POST', '/api/cadastro', { ip: novoIp(), corpo: cadastroValido({ nome_casa: 'ile ase ogun' }) })).status, 409);
});

test('desbloqueio: só senha errada conta; sessão libera as outras casas', async () => {
  for (let i = 0; i < 10; i++) inserir({ nome_casa: `Restrita ${i}`, slug: `restrita-${i}`, contato_restrito: 1, nivel_privacidade: 'Aproximado' });
  const ip = novoIp();

  // Senha certa várias vezes seguidas não bloqueia ninguém.
  for (let i = 0; i < 10; i++) {
    assert.equal((await chamar('POST', '/api/desbloquear', { ip, corpo: { slug: `restrita-${i}`, senha: SENHA } })).status, 200);
  }
  // Com a sessão (cookie), nem precisa de senha.
  const r = await chamar('POST', '/api/desbloquear', { ip, corpo: { slug: 'restrita-0', senha: SENHA.toUpperCase() } });
  const cookie = r.headers.get('Set-Cookie').split(';')[0];
  assert.match(r.headers.get('Set-Cookie'), /HttpOnly; SameSite=Strict; Secure/);
  const comSessao = await chamar('POST', '/api/desbloquear', { ip, corpo: { slug: 'restrita-5' }, headers: { Cookie: cookie } });
  assert.equal(comSessao.status, 200);
  assert.equal(comSessao.json.dados_restritos.whatsapp, '5524999990000');
  assert.ok(!JSON.stringify(comSessao.json).includes('lat_real'));

  // Sem sessão e sem senha: pede a senha (não conta como erro).
  assert.equal((await chamar('POST', '/api/desbloquear', { ip, corpo: { slug: 'restrita-1' } })).json.precisa_senha, true);

  // Senhas erradas: 8 permitidas, depois bloqueia (mesmo com a senha certa).
  const ip2 = novoIp();
  for (let i = 0; i < 8; i++) assert.equal((await chamar('POST', '/api/desbloquear', { ip: ip2, corpo: { slug: 'restrita-1', senha: 'errada' } })).status, 401);
  assert.equal((await chamar('POST', '/api/desbloquear', { ip: ip2, corpo: { slug: 'restrita-1', senha: SENHA } })).status, 429);
});

test('desbloqueio: casa oculta não é liberada nem com a senha', async () => {
  inserir({ nome_casa: 'Oculta', slug: 'oculta', nivel_privacidade: 'Oculto_Apenas_Censo', contato_restrito: 1 });
  assert.equal((await chamar('POST', '/api/desbloquear', { ip: novoIp(), corpo: { slug: 'oculta', senha: SENHA } })).status, 404);
});

test('moderação: exige token, aprova e exclui', async () => {
  const ip = novoIp();
  assert.equal((await chamar('GET', '/api/admin', { ip })).status, 401);
  await chamar('POST', '/api/cadastro', { ip, corpo: cadastroValido() });
  const auth = { Authorization: `Bearer ${TOKEN}` };
  const { json } = await chamar('GET', '/api/admin?status=Pendente', { ip, headers: auth });
  assert.equal(json.registros.length, 1);
  const { id } = json.registros[0];
  assert.equal((await chamar('PATCH', '/api/admin', { ip, headers: auth, corpo: { id, status_moderacao: 'Aprovado' } })).status, 200);
  assert.equal((await chamar('GET', '/api/terreiros')).json.terreiros.length, 1);
  assert.equal((await chamar('DELETE', `/api/admin?id=${id}`, { ip, headers: auth })).status, 200);
  assert.equal((await chamar('GET', '/api/terreiros')).json.terreiros.length, 0);
});

test('cabeçalhos de segurança e rota inexistente', async () => {
  const r = await chamar('GET', '/api/nada');
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(r.headers.get('Strict-Transport-Security'), /max-age=31536000/);
});
