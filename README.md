# Mapa do Povo de Santo — Petrópolis/RJ

Mapa interativo, memória histórica e censo comunitário das casas de Umbanda, Candomblé e tradições de matriz africana dos 5 distritos de Petrópolis. A privacidade de cada casa é tratada como requisito de segurança: dado religioso é dado sensível (LGPD, art. 11).

## Rodar localmente

```bash
npm install
npm start            # compila CSS/vendor e sobe http://localhost:3000
```

Sem `DATABASE_URL`, o servidor usa **PGlite** (PostgreSQL em memória) carregado com `db/schema.sql` e seus dados fictícios. Assim o trigger de ofuscação e as views funcionam igual à produção. Variáveis podem ficar em `.env` (veja `.env.example`).

## Estrutura

```
db/schema.sql              tabela, ENUMs, trigger de ofuscação, views pública/censo, RLS, dados fictícios
db/seed-real.example.sql   modelo para carregar as casas reais (o arquivo real fica fora do git)
api/terreiros.js           GET  lista pública do mapa + estatísticas
api/estatisticas.js        GET  censo agregado (inclui casas ocultas, sem identificá-las)
api/cadastro.js            POST formulário público → sempre 'Pendente'
api/desbloquear.js         POST senha → WhatsApp/endereço de casas com contato restrito
api/admin.js               GET/PATCH/DELETE moderação (Bearer ADMIN_TOKEN)
lib/privacy.js             saneamento por lista branca + trava contra vazamento
lib/senha.js               hash scrypt da senha de acesso
public/                    index.html, app.js e módulos (mapa, ficha, censo, cadastro)
server.js                  servidor local (os mesmos handlers rodam como funções na Vercel)
```

## Travas de privacidade

| Nível | No mapa | Endereço | Coordenada enviada ao navegador |
|---|---|---|---|
| `Exato` | pino | visível | real |
| `Aproximado` | círculo de 500 m | nunca | deslocada 400–800 m, sorteada **uma vez** no banco |
| `Oculto_Apenas_Censo` | não aparece | nunca | nenhuma (só conta no censo, anonimizada) |

- A API pública lê apenas a view `vw_terreiros_publicos`, que não tem `lat_real`, `lng_real` nem o endereço das casas aproximadas. `toPublicTerreiro()` remonta cada registro por lista branca, e `assertSemCamposPrivados()` aborta a resposta se algo escapar.
- A coordenada ofuscada é fixa. Se fosse sorteada a cada requisição, bastaria tirar a média de várias consultas para achar o endereço real.
- `contato_restrito = true` esconde WhatsApp, Instagram e endereço da listagem. Eles só saem por `/api/desbloquear`, que confere a senha contra um hash e limita tentativas (8 a cada 15 min por IP).
- O cadastro não usa geocodificação externa: a casa é marcada no mapa, e o endereço não é enviado a terceiros.
- Cabeçalhos de segurança: CSP sem scripts de terceiros e `Referrer-Policy: no-referrer`, para que WhatsApp e Instagram não saibam qual casa foi consultada.

## Deploy (Vercel + Neon/Supabase)

1. Crie o banco e rode `psql "$DATABASE_URL" -f db/schema.sql`. Esse script **recria** a tabela: use-o só na primeira vez.
2. Carregue as casas reais: `cp db/seed-real.example.sql db/seed-real.sql`, preencha e rode com `psql`.
3. Gere o hash da senha: `npm run hash-senha`.
4. Na Vercel, configure `DATABASE_URL`, `ADMIN_TOKEN` (`openssl rand -hex 32`) e `ACESSO_RESTRITO_HASH`. O `vercel.json` já define o build e os cabeçalhos.

Moderação: `GET /api/admin?status=Pendente` e `PATCH /api/admin {"id","status_moderacao":"Aprovado"}`, ambos com `Authorization: Bearer $ADMIN_TOKEN`.
