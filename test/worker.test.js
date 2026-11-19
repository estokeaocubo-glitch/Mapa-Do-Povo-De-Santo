// Testes de ponta a ponta do Worker (rotas da API + banco com as migrações reais).
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { coordenadaPublica } from '../lib/privacy.js';
import { gerarHash } from '../lib/senha.js';
import worker from '../worker/index.js';
import { criarD1 } from './d1-local.js';

// Cache API da Cloudflare: no teste, um cache que nunca guarda nada.
globalThis.caches = { default: { match: async () => undefined, put: async () => {}, delete: async () => true } };

const MODELO_HTML = '<html><head><title>Mapa</title><meta name="description" content="padrão" /><meta property="og:title" content="padrão" /><meta property="og:description" content="padrão" /></head><body></body></html>';
const SENHA = 'axé de oxum na serra';
const HASH = await gerarHash(SENHA);
const TOKEN = 'token-de-teste-com-mais-de-24-caracteres';
let env;
let ipSeq = 0;

beforeEach(() => {
  env = { DB: criarD1(), ACESSO_RESTRITO_HASH: HASH, ADMIN_TOKEN: TOKEN, IP_SALT: 'sal', ASSETS: { fetch: () => new Response(MODELO_HTML, { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'" } }) } };
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
      lat_real, lng_real, lat_publica, lng_publica, nivel_privacidade, whatsapp_contato, contato_restrito, status_moderacao, nacao_linha, ano_fundacao, historia_resumo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    c.id, c.nome_casa, c.slug, c.categoria, c.vertente, c.distrito, c.bairro, c.endereco_completo, c.lat_real, c.lng_real,
    pub.lat, pub.lng, c.nivel_privacidade, c.whatsapp_contato, c.contato_restrito, c.status_moderacao, c.nacao_linha ?? null, c.ano_fundacao ?? null, c.historia_resumo ?? null,
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

// ============================== Funcionalidades da fase de melhorias ==============================
const casaComGiras = (o = {}) => inserir({
  nome_casa: 'Casa das Giras', slug: 'casa-das-giras', nivel_privacidade: 'Exato', endereco_completo: 'Rua Pública, 10', ...o,
});

test('casa edita, muda privacidade e exclui o próprio cadastro com o código de edição', async () => {
  const ip = novoIp();
  const { json: r } = await chamar('POST', '/api/cadastro', { ip, corpo: cadastroValido() });
  assert.match(r.codigo_edicao, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const codigo = r.codigo_edicao.toLowerCase().replace(/-/g, ' '); // digitação descuidada também vale

  const ler = await chamar('POST', '/api/minha-casa', { ip, corpo: { codigo, acao: 'ler' } });
  assert.equal(ler.status, 200);
  assert.equal(ler.json.casa.nome_casa, 'Tenda de Teste');
  const antes = (await env.DB.prepare('SELECT lat_publica FROM terreiros').first()).lat_publica;

  // Mudar só o texto não sorteia nova coordenada pública.
  assert.equal((await chamar('POST', '/api/minha-casa', { ip, corpo: { codigo, acao: 'salvar', dados: { historia_resumo: 'Nova história' } } })).status, 200);
  assert.equal((await env.DB.prepare('SELECT lat_publica FROM terreiros').first()).lat_publica, antes);

  // "Exato" exige endereço (mesmas regras do cadastro).
  assert.equal((await chamar('POST', '/api/minha-casa', { ip, corpo: { codigo, acao: 'salvar', dados: { nivel_privacidade: 'Exato' } } })).status, 422);
  // Passar a "Oculto" apaga a coordenada pública.
  assert.equal((await chamar('POST', '/api/minha-casa', { ip, corpo: { codigo, acao: 'salvar', dados: { nivel_privacidade: 'Oculto_Apenas_Censo' } } })).status, 200);
  assert.equal((await env.DB.prepare('SELECT lat_publica FROM terreiros').first()).lat_publica, null);

  const log = (await env.DB.prepare('SELECT acao, autor FROM moderacao_log').all()).results;
  assert.ok(log.some((l) => l.acao === 'editado_pela_casa' && l.autor === 'a própria casa'));

  assert.equal((await chamar('POST', '/api/minha-casa', { ip, corpo: { codigo, acao: 'excluir' } })).status, 200);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM terreiros').first()).n, 0);
});

test('código de edição errado conta para o limite; certo não', async () => {
  const ip = novoIp();
  for (let i = 0; i < 10; i++) assert.equal((await chamar('POST', '/api/minha-casa', { ip, corpo: { codigo: 'AAAA-BBBB-CCCC', acao: 'ler' } })).status, 401);
  assert.equal((await chamar('POST', '/api/minha-casa', { ip, corpo: { codigo: 'AAAA-BBBB-CCCC', acao: 'ler' } })).status, 429);
});

test('código de visitante libera só a casa que o criou, vence e pode ser revogado', async () => {
  delete env.ACESSO_RESTRITO_HASH; // funciona mesmo sem senha da rede
  const ip = novoIp();
  const { json: r } = await chamar('POST', '/api/cadastro', { ip, corpo: cadastroValido() });
  const auth = { Authorization: `Bearer ${TOKEN}` };
  const { json: lista } = await chamar('GET', '/api/admin?status=Pendente', { ip, headers: auth });
  const id = lista.registros[0].id;
  await chamar('PATCH', '/api/admin', { ip, headers: auth, corpo: { id, status_moderacao: 'Aprovado', campos: { contato_restrito: true } } });
  const slug = (await env.DB.prepare('SELECT slug FROM terreiros WHERE id = ?1').bind(id).first()).slug;
  inserir({ nome_casa: 'Outra', slug: 'outra', contato_restrito: 1 });

  const gerado = await chamar('POST', '/api/minha-casa', { ip, corpo: { codigo: r.codigo_edicao, acao: 'gerar_visitante', dias: 7, rotulo: 'Pesquisa' } });
  assert.equal(gerado.status, 201);
  const visitante = gerado.json.codigo;

  assert.equal((await chamar('POST', '/api/desbloquear', { ip: novoIp(), corpo: { slug, senha: visitante } })).status, 200);
  assert.equal((await chamar('POST', '/api/desbloquear', { ip: novoIp(), corpo: { slug: 'outra', senha: visitante } })).status, 401);

  const { json: ativos } = await chamar('POST', '/api/minha-casa', { ip, corpo: { codigo: r.codigo_edicao, acao: 'listar_visitantes' } });
  assert.equal(ativos.codigos.length, 1);
  assert.equal(ativos.codigos[0].rotulo, 'Pesquisa');
  await chamar('POST', '/api/minha-casa', { ip, corpo: { codigo: r.codigo_edicao, acao: 'revogar_visitante', id: ativos.codigos[0].id } });
  assert.equal((await chamar('POST', '/api/desbloquear', { ip: novoIp(), corpo: { slug, senha: visitante } })).status, 401);

  env.DB.bruto.prepare('UPDATE codigos_visitante SET expira_em = 0').run();
});

test('moderação: vários moderadores, edição de campos, novo código e histórico com autoria', async () => {
  env.ADMIN_TOKENS = 'Mãe Ana:token-da-mae-ana-com-24-caracteres;Pedro:token-do-pedro-com-24-caracteres';
  const ip = novoIp();
  await chamar('POST', '/api/cadastro', { ip, corpo: cadastroValido() });
  const ana = { Authorization: 'Bearer token-da-mae-ana-com-24-caracteres' };
  const { json } = await chamar('GET', '/api/admin', { ip, headers: ana });
  assert.equal(json.moderador, 'Mãe Ana');
  const { id } = json.registros[0];
  assert.ok(!('codigo_edicao_hash' in json.registros[0]));

  assert.equal((await chamar('PATCH', '/api/admin', { ip, headers: ana, corpo: { id, campos: { nome_casa: 'Tenda Corrigida', lat_real: 0 } } })).status, 200);
  const r = await env.DB.prepare('SELECT nome_casa, lat_real FROM terreiros WHERE id = ?1').bind(id).first();
  assert.equal(r.nome_casa, 'Tenda Corrigida');
  assert.notEqual(r.lat_real, 0); // campo fora da lista branca é ignorado

  const novo = await chamar('POST', '/api/admin', { ip, headers: ana, corpo: { acao: 'codigo_edicao', id } });
  assert.equal((await chamar('POST', '/api/minha-casa', { ip, corpo: { codigo: novo.json.codigo, acao: 'ler' } })).status, 200);

  const { json: h } = await chamar('GET', '/api/admin?historico=1', { ip, headers: { Authorization: 'Bearer token-do-pedro-com-24-caracteres' } });
  assert.deepEqual(h.historico.map((x) => `${x.acao}:${x.autor}`), ['codigo_edicao:Mãe Ana', 'editado:Mãe Ana']);
});

test('página /casa/<slug> recebe título e prévia da casa; casa oculta não', async () => {
  casaComGiras({ historia_resumo: 'Fundada em 1970 <script>' });
  inserir({ nome_casa: 'Segredo', slug: 'segredo', nivel_privacidade: 'Oculto_Apenas_Censo' });
  const r = await chamar('GET', '/casa/casa-das-giras');
  assert.equal(r.status, 200);
  assert.match(r.texto, /<title>Casa das Giras · Mapa do Povo de Santo<\/title>/);
  assert.match(r.texto, /og:description" content="Umbanda em Centro, Petrópolis\/RJ. Fundada em 1970 &lt;script&gt;/);
  assert.equal(r.headers.get('Content-Security-Policy'), "default-src 'self'");
  const oculta = await chamar('GET', '/casa/segredo');
  assert.ok(!oculta.texto.includes('Segredo'));
});

test('dados abertos em CSV aplicam a supressão de grupos pequenos', async () => {
  casaComGiras();
  inserir({ nome_casa: 'Oculta', slug: 'oculta', nivel_privacidade: 'Oculto_Apenas_Censo', distrito: '5º Distrito - Posse' });
  const r = await chamar('GET', '/api/dados-abertos?formato=csv');
  assert.match(r.headers.get('Content-Type'), /text\/csv/);
  assert.match(r.texto, /"por_distrito","5º Distrito - Posse","<3"/);
  assert.ok(!r.texto.includes('Oculta'));
  const j = await chamar('GET', '/api/dados-abertos');
  assert.match(j.json.licenca, /CC BY 4.0/);
});

test('agenda .ics: giras recorrentes, sem endereço de casa restrita', async () => {
  const giras = JSON.stringify([
    { dia: 'Sábado', horario: '20h', tipo: 'Gira de Caboclo', frequencia: 'Semanal' },
    { dia: 'Domingo', horario: '16:00', tipo: 'Festa', frequencia: 'Último domingo do mês' },
    { dia: 'Sábado', horario: '21:00', tipo: 'Festa de Ogum', frequencia: 'Abril' },
  ]);
  casaComGiras();
  inserir({ nome_casa: 'Restrita', slug: 'restrita', contato_restrito: 1, endereco_completo: 'Rua Escondida, 9' });
  env.DB.bruto.prepare('UPDATE terreiros SET calendario_giras = ?').run(giras);
  const r = await chamar('GET', '/api/agenda.ics');
  assert.match(r.headers.get('Content-Type'), /text\/calendar/);
  assert.match(r.texto, /RRULE:FREQ=WEEKLY;BYDAY=SA/);
  assert.match(r.texto, /RRULE:FREQ=MONTHLY;BYDAY=-1SU/);
  assert.match(r.texto, /DTSTART;TZID=America\/Sao_Paulo:\d{8}T200000/);
  assert.equal((r.texto.match(/BEGIN:VEVENT/g) || []).length, 4); // "Abril" não tem regra automática
  assert.ok(r.texto.includes('Rua Pública\\, 10'));
  assert.ok(!r.texto.includes('Rua Escondida'));
});
