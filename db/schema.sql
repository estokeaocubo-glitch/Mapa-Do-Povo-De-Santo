-- =============================================================================
-- Mapa do Povo de Santo — Petrópolis/RJ
-- Schema Cloudflare D1 (SQLite)
--
--   Local:     npx wrangler d1 execute mapa-povo-de-santo --local  --file db/schema.sql
--   Produção:  npx wrangler d1 execute mapa-povo-de-santo --remote --file db/schema.sql
--   (atalhos: npm run db:schema:local / npm run db:schema:remote)
--
-- ATENÇÃO: este script RECRIA as tabelas (apaga os dados). Rode só na criação.
--
-- PRINCÍPIOS DE SEGURANÇA (LGPD art. 11 — dado religioso é dado sensível):
--   1. Coordenadas reais e endereço completo NUNCA saem do banco para rotas
--      públicas: a API pública lê apenas a VIEW vw_terreiros_publicos.
--   2. A coordenada pública ofuscada é gerada UMA VEZ, na gravação (Worker ou
--      script de carga). Se ela fosse sorteada a cada requisição, bastaria
--      consultar a API várias vezes e tirar a média para achar o endereço real.
--      As CHECK constraints abaixo impedem gravar uma combinação insegura.
--   3. O D1 não é acessível pela internet: só o Worker (binding DB) o consulta.
-- =============================================================================

DROP VIEW IF EXISTS vw_terreiros_publicos;
DROP VIEW IF EXISTS vw_terreiros_censo;
DROP TABLE IF EXISTS terreiros;
DROP TABLE IF EXISTS tentativas;

CREATE TABLE terreiros (
  id                        TEXT PRIMARY KEY,                -- UUID gerado no Worker/script
  nome_casa                 TEXT NOT NULL CHECK (length(nome_casa) BETWEEN 1 AND 160),
  slug                      TEXT NOT NULL UNIQUE,
  categoria                 TEXT NOT NULL DEFAULT 'Casa de Axé'
                              CHECK (categoria IN ('Casa de Axé', 'Economia do Axé')),
  vertente                  TEXT NOT NULL
                              CHECK (vertente IN ('Umbanda', 'Candomblé', 'Omolokô', 'Ifá', 'Kimbanda', 'Misto/Outros')),
  nacao_linha               TEXT,
  orixa_guia_regente        TEXT,
  lideranca_titulo          TEXT,
  lideranca_nome_religioso  TEXT,
  ano_fundacao              INTEGER CHECK (ano_fundacao IS NULL OR ano_fundacao BETWEEN 1800 AND 2100),
  distrito                  TEXT NOT NULL CHECK (distrito IN (
                              '1º Distrito - Petrópolis (Centro)',
                              '2º Distrito - Cascatinha',
                              '3º Distrito - Itaipava',
                              '4º Distrito - Pedro do Rio',
                              '5º Distrito - Posse')),
  bairro                    TEXT NOT NULL,

  -- ===== CAMPOS PRIVADOS — nunca expostos pela listagem pública =====
  endereco_completo         TEXT,
  lat_real                  REAL NOT NULL CHECK (lat_real BETWEEN -90 AND 90),
  lng_real                  REAL NOT NULL CHECK (lng_real BETWEEN -180 AND 180),
  -- ===================================================================

  lat_publica               REAL,
  lng_publica               REAL,
  nivel_privacidade         TEXT NOT NULL DEFAULT 'Aproximado'
                              CHECK (nivel_privacidade IN ('Exato', 'Aproximado', 'Oculto_Apenas_Censo')),

  historia_resumo           TEXT,
  calendario_giras          TEXT NOT NULL DEFAULT '[]'
                              CHECK (json_valid(calendario_giras) AND json_type(calendario_giras) = 'array'),
  acoes_sociais             TEXT NOT NULL DEFAULT '[]'
                              CHECK (json_valid(acoes_sociais) AND json_type(acoes_sociais) = 'array'),
  whatsapp_contato          TEXT,
  instagram_url             TEXT,
  -- 1 = WhatsApp, Instagram e endereço só são liberados por POST /api/desbloquear
  -- (senha verificada no servidor). Nunca saem na listagem pública.
  contato_restrito          INTEGER NOT NULL DEFAULT 0 CHECK (contato_restrito IN (0, 1)),
  status_moderacao          TEXT NOT NULL DEFAULT 'Pendente'
                              CHECK (status_moderacao IN ('Pendente', 'Aprovado', 'Rejeitado')),
  consentimento_lgpd_em     TEXT,                            -- prova do consentimento (LGPD art. 11, I)
  created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  -- ===== SEGURANÇA GEOGRÁFICA: o banco recusa combinações inseguras =====
  CHECK (
    (nivel_privacidade = 'Exato'
       AND lat_publica = lat_real AND lng_publica = lng_real)
    OR (nivel_privacidade = 'Aproximado'
       AND lat_publica IS NOT NULL AND lng_publica IS NOT NULL
       AND (lat_publica <> lat_real OR lng_publica <> lng_real)
       -- deslocamento mínimo de ~300 m (0,0027° ≈ 300 m de latitude)
       AND ((lat_publica - lat_real) * (lat_publica - lat_real)
          + (lng_publica - lng_real) * (lng_publica - lng_real)) > 0.0027 * 0.0027 * 0.8)
    OR (nivel_privacidade = 'Oculto_Apenas_Censo'
       AND lat_publica IS NULL AND lng_publica IS NULL)
  )
);

CREATE INDEX idx_terreiros_publicacao ON terreiros (status_moderacao, nivel_privacidade);
CREATE INDEX idx_terreiros_distrito   ON terreiros (distrito);

-- A coordenada pública não pode ser alterada depois de gravada sem que a
-- localização real ou o nível também mudem (impede "reofuscar" até vazar).
CREATE TRIGGER trg_terreiros_coordenada_estavel
BEFORE UPDATE OF lat_publica, lng_publica ON terreiros
WHEN NEW.lat_real = OLD.lat_real AND NEW.lng_real = OLD.lng_real
 AND NEW.nivel_privacidade = OLD.nivel_privacidade
 AND (NEW.lat_publica IS NOT OLD.lat_publica OR NEW.lng_publica IS NOT OLD.lng_publica)
BEGIN
  SELECT RAISE(ABORT, 'coordenada publica e imutavel');
END;

CREATE TRIGGER trg_terreiros_updated_at
AFTER UPDATE ON terreiros
BEGIN
  UPDATE terreiros SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

-- =============================================================================
-- VIEW PÚBLICA — a ÚNICA fonte da listagem do mapa.
-- Não contém lat_real/lng_real; endereço só para 'Exato'; contatos de casas
-- com contato_restrito saem como NULL. Ocultas e não aprovadas não entram.
-- =============================================================================
CREATE VIEW vw_terreiros_publicos AS
SELECT
  id, nome_casa, slug, categoria, vertente, nacao_linha, orixa_guia_regente,
  lideranca_titulo, lideranca_nome_religioso, ano_fundacao, distrito, bairro,
  CASE WHEN nivel_privacidade = 'Exato' AND contato_restrito = 0 THEN endereco_completo END AS endereco_publico,
  lat_publica, lng_publica, nivel_privacidade,
  historia_resumo, calendario_giras, acoes_sociais,
  CASE WHEN contato_restrito = 0 THEN whatsapp_contato END AS whatsapp_contato,
  CASE WHEN contato_restrito = 0 THEN instagram_url END    AS instagram_url,
  contato_restrito,
  created_at
FROM terreiros
WHERE status_moderacao = 'Aprovado'
  AND nivel_privacidade IN ('Exato', 'Aproximado');

-- VIEW do CENSO — inclui casas ocultas, apenas com campos agregáveis.
CREATE VIEW vw_terreiros_censo AS
SELECT
  CASE WHEN nivel_privacidade <> 'Oculto_Apenas_Censo' THEN nome_casa END AS nome_casa,
  CASE WHEN nivel_privacidade <> 'Oculto_Apenas_Censo' THEN slug END      AS slug,
  categoria, vertente, nacao_linha, ano_fundacao, distrito, nivel_privacidade, acoes_sociais
FROM terreiros
WHERE status_moderacao = 'Aprovado';

-- =============================================================================
-- Limite de tentativas (senha, cadastro, admin) — global, entre todas as
-- instâncias do Worker. Guarda só um HASH do IP, nunca o IP em si.
-- =============================================================================
CREATE TABLE tentativas (
  chave  TEXT NOT NULL,        -- ex.: 'desbloquear:<sha256 do ip>'
  em     INTEGER NOT NULL      -- epoch em ms
);
CREATE INDEX idx_tentativas ON tentativas (chave, em);
