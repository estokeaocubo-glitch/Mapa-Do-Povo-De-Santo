# Mapa do Povo de Santo — Petrópolis/RJ

Mapa interativo, memória histórica e censo comunitário das casas de Umbanda, Candomblé e tradições de matriz africana dos 5 distritos de Petrópolis. A privacidade de cada casa é tratada como requisito de segurança: dado religioso é dado sensível (LGPD, art. 11).

**Hospedagem: Cloudflare.** O site e a API rodam num Worker com arquivos estáticos, e o banco é o **Cloudflare D1** (SQLite gerenciado). O plano gratuito atende o projeto.

## Rodar localmente

```bash
npm install
cp .dev.vars.example .dev.vars   # preencha ADMIN_TOKEN e ACESSO_RESTRITO_HASH
npm run db:local                 # cria o D1 local com os dados fictícios
npm run dev                      # http://localhost:8787
```

## Publicar na Cloudflare (primeira vez)

```bash
npx wrangler login                              # abre o navegador para entrar na sua conta
npx wrangler d1 create mapa-povo-de-santo       # copie o database_id para wrangler.jsonc
npm run db:schema:remote                        # cria as tabelas (APAGA dados: só na 1ª vez)

# Casas reais: copie o modelo, preencha e carregue (o arquivo fica fora do git)
cp db/seed-real.example.json db/seed-real.json
npm run db:seed-real:remote

npm run hash-senha                              # gera o hash da senha de acesso
npx wrangler secret put ACESSO_RESTRITO_HASH    # cole o hash
openssl rand -hex 32 | npx wrangler secret put ADMIN_TOKEN

npm run deploy                                  # publica em https://mapa-povo-de-santo.<sua-conta>.workers.dev
```

Depois disso, cada `npm run deploy` publica a versão nova. Também dá para conectar este repositório em *Workers & Pages → Create → Import a repository*, e cada push publica sozinho. Domínio próprio: *Worker → Settings → Domains & Routes*.

## Estrutura

```
wrangler.jsonc             configuração do Worker, assets e banco D1
worker/index.js            roteador: /api/* → rotas; o resto → arquivos de public/
worker/rotas/              terreiros, estatisticas, cadastro, desbloquear, admin
lib/privacy.js             ofuscação de coordenadas + saneamento por lista branca
lib/senha.js               hash PBKDF2 da senha, comparação em tempo constante
lib/limite.js              limite de tentativas guardado no D1 (IP só como hash)
lib/validation.js          validação do formulário público
lib/stats.js               censo agregado
db/schema.sql              tabelas, CHECKs de segurança, gatilhos e views (SQLite/D1)
db/seed-ficticio.json      casas fictícias para teste
db/seed-real.example.json  modelo para as casas reais
scripts/gerar-seed.mjs     JSON → SQL, sorteando a coordenada ofuscada uma única vez
public/                    site: index.html, app.js, js/, _headers (CSP etc.)
```

## API

| Rota | Uso |
|---|---|
| `GET /api/terreiros` | casas aprovadas para o mapa + estatísticas |
| `GET /api/estatisticas` | censo agregado (inclui ocultas, sem identificá-las) |
| `POST /api/cadastro` | formulário público → sempre entra como `Pendente` |
| `POST /api/desbloquear` | `{slug, senha}` → WhatsApp/endereço de casas com contato restrito |
| `GET/PATCH/DELETE /api/admin` | moderação, com `Authorization: Bearer <ADMIN_TOKEN>` |

Aprovar um cadastro:

```bash
curl -X PATCH https://SEU-SITE/api/admin -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' -d '{"id":"<uuid>","status_moderacao":"Aprovado"}'
```

## Travas de privacidade

| Nível | No mapa | Endereço | Coordenada enviada ao navegador |
|---|---|---|---|
| `Exato` | pino | visível | real |
| `Aproximado` | círculo de 500 m | nunca | deslocada 400–800 m, sorteada **uma vez** na gravação |
| `Oculto_Apenas_Censo` | não aparece | nunca | nenhuma (só conta no censo, anonimizada) |

- A API pública lê apenas a view `vw_terreiros_publicos`, que não tem `lat_real`, `lng_real` nem o endereço das casas aproximadas. `toPublicTerreiro()` remonta cada registro por lista branca, e `assertSemCamposPrivados()` aborta a resposta se algo escapar.
- O próprio banco recusa combinações inseguras: uma casa `Aproximado` sem deslocamento, ou uma `Oculta` com coordenada pública. Um gatilho também impede alterar a coordenada pública depois de gravada; se ela pudesse ser sorteada de novo, várias versões permitiriam triangular o endereço.
- `contato_restrito = 1` esconde WhatsApp, Instagram e endereço da listagem. Eles só saem por `/api/desbloquear`, que confere a senha contra um hash PBKDF2 (guardado como secret da Cloudflare, nunca no código) e aceita 8 tentativas a cada 15 minutos por IP. O limite vale para todas as instâncias do Worker.
- O D1 não é acessível pela internet, apenas pelo Worker.
- O cadastro não usa geocodificação externa: a casa é marcada no mapa, e o endereço não é enviado a terceiros.
- Cabeçalhos de segurança: CSP sem scripts de terceiros e `Referrer-Policy: no-referrer`, para que WhatsApp e Instagram não saibam qual casa foi consultada.
