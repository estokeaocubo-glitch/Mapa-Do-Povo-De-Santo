# Mapa do Povo de Santo — Petrópolis/RJ

Mapa interativo, memória histórica e censo comunitário das casas de Umbanda, Candomblé e tradições de matriz africana dos 5 distritos de Petrópolis. A privacidade de cada casa é tratada como requisito de segurança: dado religioso é dado sensível (LGPD, art. 11).

## O que o site faz

- **Mapa** com pinos (local exato), pinos vazados e círculos de 500 m (área aproximada), agrupamento, limites dos distritos e tema claro/escuro.
- **Lista que acompanha o mapa**: ordenar por centro do mapa, nome, antiguidade ou "perto de mim" (a posição fica só no aparelho); filtros de segmento, vertente/nação, distrito, ação social, **"Gira hoje"** e "só nesta área". No celular, um carrossel de cards sincronizado com o mapa.
- **Ficha da casa** com endereço próprio (`/casa/<slug>`, com prévia para WhatsApp e redes), compartilhar, adicionar as giras à agenda do celular (`.ics`), termos ligados a um **glossário** e orientações de visita.
- **Contato protegido**: a casa pode esconder WhatsApp e endereço e entregar **códigos de visitante** (com prazo e revogação); a senha da rede é opcional.
- **Cadastro em 6 passos**, com rascunho salvo no aparelho e revisão. Ao final, a casa recebe um **código de edição** para editar os dados, mudar a privacidade, criar códigos de visitante ou excluir o cadastro ("Editar minha casa").
- **Moderação** em `/admin.html`: um token por moderador, correção de dados, aviso de aprovação e novo código de edição pelo WhatsApp da casa, histórico com autoria.
- **Censo** em `/censo.html` (imprimir/PDF) e **dados abertos** em `/api/dados-abertos` (JSON e CSV, CC BY 4.0).
- **Funciona com sinal fraco** (PWA): o site, a última lista de casas e os blocos do mapa já vistos ficam guardados no aparelho.

**Hospedagem: Cloudflare.** O site e a API rodam num Worker com arquivos estáticos, e o banco é o **Cloudflare D1** (SQLite gerenciado). O plano gratuito atende o projeto.

## Rodar localmente

```bash
npm install
cp .dev.vars.example .dev.vars   # preencha ADMIN_TOKEN e ACESSO_RESTRITO_HASH
npm run db:local                 # aplica as migrações no D1 local e carrega os dados fictícios
npm run dev                      # http://localhost:8787
npm test                         # 23 testes (privacidade, validação, senha, sessão, giras, censo, Worker)
```

## Publicar na Cloudflare (primeira vez)

```bash
npx wrangler login                              # abre o navegador para entrar na sua conta
npx wrangler d1 create mapa-povo-de-santo       # copie o database_id para wrangler.jsonc
npm run db:migrar:remote                        # aplica as migrações (seguro rodar de novo)

# Casas reais: copie o modelo, preencha e carregue (o arquivo fica fora do git)
cp db/seed-real.example.json db/seed-real.json
npm run db:seed-real:remote

npm run hash-senha                              # gera o hash da senha de acesso
npx wrangler secret put ACESSO_RESTRITO_HASH    # cole o hash
# Moderação: um token por pessoa, para o histórico registrar quem fez o quê
npx wrangler secret put ADMIN_TOKENS            # formato: "Mãe Ana:token1;Pedro:token2" (tokens com 24+ caracteres)
openssl rand -hex 32 | npx wrangler secret put IP_SALT
npm run distritos                               # baixa do IBGE os limites dos 5 distritos (uma vez)
# Mapa: peça a chave gratuita em carto.com/basemaps/apikey, restrinja-a ao domínio
# do site (e a localhost:8787 para testes) e cole em CHAVE_CARTO (public/js/constants.js).
# Antes de publicar: preencha responsável e contato em public/privacidade.html (item 1).

npm run deploy                                  # publica em https://mapa-povo-de-santo.<sua-conta>.workers.dev
```

Depois disso, cada `npm run deploy` publica a versão nova. Também dá para conectar este repositório em *Workers & Pages → Create → Import a repository*, e cada push publica sozinho. Domínio próprio: *Worker → Settings → Domains & Routes*.

## Estrutura

```
wrangler.jsonc             configuração do Worker, assets e banco D1
worker/index.js            roteador: /api/* → rotas; o resto → arquivos de public/
worker/rotas/              terreiros, estatisticas, cadastro, desbloquear, minha-casa, admin,
                           pagina-casa (/casa/<slug>), agenda (.ics), dados-abertos
lib/privacy.js             ofuscação de coordenadas + saneamento por lista branca
lib/senha.js               hash PBKDF2 da senha, comparação em tempo constante
lib/limite.js              limite de tentativas guardado no D1 (IP só como hash)
lib/sessao.js              sessão de desbloqueio (cookie HttpOnly assinado, 30 min)
lib/codigos.js             códigos de edição e de visitante (só o hash vai ao banco)
lib/registro.js            edição de cadastro com as mesmas regras do cadastro
public/js/giras.js         interpreta o calendário (dias, frequência, "gira hoje", agenda)
public/js/tema.js          tema automático/claro/escuro
public/sw.js               uso sem internet (service worker)
public/censo.html          censo para compartilhar e imprimir
scripts/baixar-distritos.mjs  limites dos distritos (IBGE) → public/data/distritos.geojson
public/js/validacao.js     validação do cadastro, a MESMA no navegador e no Worker
public/js/dominio.js       listas de vertentes, distritos etc., compartilhadas
public/admin.html          painel de moderação (token ADMIN_TOKEN)
public/privacidade.html    política de privacidade (LGPD)
test/                      testes com node:test; node:sqlite faz o papel do D1
lib/stats.js               censo agregado
migrations/                tabelas, CHECKs de segurança, gatilhos e views (migrações D1)
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
| `POST /api/desbloquear` | `{slug, senha}` → WhatsApp/endereço de casas com contato protegido (senha da rede ou código de visitante) |
| `POST /api/minha-casa` | `{codigo, acao}` → a casa lê, edita, exclui e gerencia códigos de visitante |
| `GET /api/agenda.ics[?slug=]` | giras públicas recorrentes, para assinar no celular |
| `GET /api/dados-abertos[?formato=csv]` | censo agregado com metodologia e licença |
| `GET /casa/<slug>` | o site já aberto na casa, com título e prévia próprios |
| `GET/PATCH/POST/DELETE /api/admin` | moderação, com `Authorization: Bearer <token>` |

A moderação é feita em `/admin.html`: você cola o `ADMIN_TOKEN` e aprova, rejeita ou exclui cada cadastro. Recomenda-se proteger essa página também com Cloudflare Access.

## Travas de privacidade

| Nível | No mapa | Endereço | Coordenada enviada ao navegador |
|---|---|---|---|
| `Exato` | pino | visível | real |
| `Aproximado` | círculo de 500 m (sempre contém a casa) | nunca | deslocada 200–450 m, sorteada **uma vez** na gravação |
| `Oculto_Apenas_Censo` | não aparece | nunca | nenhuma (só conta no censo, anonimizada) |

- A API pública lê apenas a view `vw_terreiros_publicos`, que não tem `lat_real`, `lng_real` nem o endereço das casas aproximadas. `toPublicTerreiro()` remonta cada registro por lista branca, e `assertSemCamposPrivados()` aborta a resposta se algo escapar.
- O próprio banco recusa combinações inseguras: uma casa `Aproximado` sem deslocamento, ou uma `Oculta` com coordenada pública. Um gatilho também impede alterar a coordenada pública depois de gravada; se ela pudesse ser sorteada de novo, várias versões permitiriam triangular o endereço.
- `contato_restrito = 1` esconde WhatsApp, Instagram e endereço da listagem. Eles só saem por `/api/desbloquear`, que confere a senha contra um hash PBKDF2 (guardado como secret da Cloudflare, nunca no código). Só senhas **erradas** contam para o limite (8 a cada 15 min por IP). Depois de acertar uma vez, um cookie HttpOnly assinado libera as outras casas por 30 minutos.
- O censo não publica o número exato de grupos com 1 ou 2 casas quando alguma delas é oculta: mostra "menos de 3".
- O cadastro tem limite de 5 envios **aceitos** por hora; erros de preenchimento não contam. Duplicatas (mesmo nome e bairro) são recusadas.
- O D1 não é acessível pela internet, apenas pelo Worker.
- O cadastro não usa geocodificação externa: a casa é marcada no mapa, e o endereço não é enviado a terceiros.
- Cabeçalhos de segurança: CSP sem nenhum recurso de terceiros além dos blocos do mapa (fontes e ícones são servidos pelo próprio site), HSTS e `Referrer-Policy: no-referrer`, para que WhatsApp e Instagram não saibam qual casa foi consultada. A única exceção são os blocos do mapa, que enviam só a origem do site (`referrerPolicy: 'origin'`) para a CARTO validar a chave restrita ao domínio.

## Riscos conhecidos e aceitos

- `npm audit` aponta o pacote `braces` (alta) dentro do observador de arquivos do Tailwind 4. Não existe versão corrigida; ele só roda no build, processando os padrões de arquivo do próprio projeto, e não vai para o site publicado.
- Os limites dos distritos dependem de rodar `npm run distritos` com acesso ao IBGE; sem isso, o mapa simplesmente não os desenha.
- A identidade visual (logo, ícones, ornamentos) é provisória e deve ser definida com as casas. O antigo padrão "kente" (de Gana) foi trocado por um filete neutro.
- A senha de desbloqueio, quando usada, é única para toda a rede; os códigos de visitante por casa são a alternativa recomendada. Prefira uma frase-senha (letras são aceitas) e troque-a periodicamente com `npm run hash-senha`; trocar a senha encerra todas as sessões abertas.
