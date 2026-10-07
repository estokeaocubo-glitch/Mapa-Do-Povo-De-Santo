-- =============================================================================
-- Mapa do Povo de Santo — Petrópolis/RJ
-- Schema PostgreSQL (compatível com Supabase e Neon)
--
-- Uso:  psql "$DATABASE_URL" -f db/schema.sql
--
-- PRINCÍPIOS DE SEGURANÇA (LGPD art. 11 — dado religioso é dado sensível):
--   1. Coordenadas reais e endereço completo NUNCA saem do banco para rotas
--      públicas: a API pública lê apenas a VIEW vw_terreiros_publicos.
--   2. A coordenada pública ofuscada é gerada UMA VEZ, aqui no banco, por
--      trigger. Se ela fosse sorteada a cada requisição, bastaria consultar a
--      API várias vezes e tirar a média dos pontos para achar o endereço real.
--   3. RLS ligado sem políticas: no Supabase, a chave "anon" (que fica exposta
--      no navegador) não consegue ler a tabela bruta via PostgREST.
-- =============================================================================

BEGIN;

-- gen_random_uuid() é nativo a partir do PostgreSQL 13 (Supabase/Neon usam 15+).


-- Recriação idempotente (ambiente de desenvolvimento) -------------------------
DROP VIEW  IF EXISTS vw_terreiros_publicos;
DROP VIEW  IF EXISTS vw_terreiros_censo;
DROP TABLE IF EXISTS terreiros;
DROP FUNCTION IF EXISTS fn_terreiros_coordenada_publica();
DROP FUNCTION IF EXISTS fn_ofuscar_coordenada(DECIMAL, DECIMAL);
DROP TYPE IF EXISTS vertente_enum;
DROP TYPE IF EXISTS distrito_enum;
DROP TYPE IF EXISTS privacidade_enum;
DROP TYPE IF EXISTS moderacao_enum;
DROP TYPE IF EXISTS categoria_enum;

-- Tipos ------------------------------------------------------------------------
CREATE TYPE vertente_enum AS ENUM (
  'Umbanda', 'Candomblé', 'Omolokô', 'Ifá', 'Kimbanda', 'Misto/Outros'
);

CREATE TYPE distrito_enum AS ENUM (
  '1º Distrito - Petrópolis (Centro)',
  '2º Distrito - Cascatinha',
  '3º Distrito - Itaipava',
  '4º Distrito - Pedro do Rio',
  '5º Distrito - Posse'
);

CREATE TYPE privacidade_enum AS ENUM ('Exato', 'Aproximado', 'Oculto_Apenas_Censo');

CREATE TYPE moderacao_enum AS ENUM ('Pendente', 'Aprovado', 'Rejeitado');

-- Extensão ao modelo pedido: distingue casas de culto de pontos da
-- Economia do Axé (lojas de artigos religiosos, ervas etc.) — pino roxo no mapa.
CREATE TYPE categoria_enum AS ENUM ('Casa de Axé', 'Economia do Axé');

-- Tabela principal -------------------------------------------------------------
CREATE TABLE terreiros (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_casa                 VARCHAR(160) NOT NULL,
  slug                      VARCHAR(180) UNIQUE NOT NULL,
  categoria                 categoria_enum NOT NULL DEFAULT 'Casa de Axé',
  vertente                  vertente_enum NOT NULL,
  nacao_linha               VARCHAR(80),
  orixa_guia_regente        VARCHAR(120),
  lideranca_titulo          VARCHAR(60),
  lideranca_nome_religioso  VARCHAR(120),
  ano_fundacao              INT CHECK (ano_fundacao BETWEEN 1800 AND 2100),
  distrito                  distrito_enum NOT NULL,
  bairro                    VARCHAR(100) NOT NULL,

  -- ===== CAMPOS PRIVADOS — nunca expostos pela API pública =====
  endereco_completo         TEXT,
  lat_real                  DECIMAL(9,6) NOT NULL CHECK (lat_real BETWEEN -90 AND 90),
  lng_real                  DECIMAL(9,6) NOT NULL CHECK (lng_real BETWEEN -180 AND 180),
  -- ==============================================================

  -- Coordenada que pode ir para o mapa (preenchida pelo trigger abaixo)
  lat_publica               DECIMAL(9,6),
  lng_publica               DECIMAL(9,6),
  nivel_privacidade         privacidade_enum NOT NULL DEFAULT 'Aproximado',

  historia_resumo           TEXT,
  calendario_giras          JSONB NOT NULL DEFAULT '[]'::jsonb,
  acoes_sociais             TEXT[] NOT NULL DEFAULT '{}',
  whatsapp_contato          VARCHAR(20),
  instagram_url             VARCHAR(200),
  status_moderacao          moderacao_enum NOT NULL DEFAULT 'Pendente',
  consentimento_lgpd_em     TIMESTAMPTZ,      -- prova do consentimento (LGPD art. 11, I)
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT calendario_e_array CHECK (jsonb_typeof(calendario_giras) = 'array')
);

CREATE INDEX idx_terreiros_publicacao ON terreiros (status_moderacao, nivel_privacidade);
CREATE INDEX idx_terreiros_distrito   ON terreiros (distrito);

-- =============================================================================
-- SEGURANÇA GEOGRÁFICA: ofuscação de coordenadas
-- Desloca o ponto real entre 400 m e 800 m em direção aleatória.
--   Δlat = d·cos(θ) / 111 320 m
--   Δlng = d·sin(θ) / (111 320 m · cos(lat))
-- =============================================================================
CREATE FUNCTION fn_ofuscar_coordenada(p_lat DECIMAL, p_lng DECIMAL,
                                      OUT lat_out DECIMAL, OUT lng_out DECIMAL)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  distancia_m DOUBLE PRECISION := 400 + random() * 400;     -- 400 a 800 m
  angulo      DOUBLE PRECISION := random() * 2 * pi();
BEGIN
  lat_out := round((p_lat + (distancia_m * cos(angulo)) / 111320.0)::numeric, 6);
  lng_out := round((p_lng + (distancia_m * sin(angulo))
                     / (111320.0 * cos(radians(p_lat::double precision))))::numeric, 6);
END;
$$;

-- O trigger decide a coordenada pública a partir do nível de privacidade.
-- Só sorteia de novo se a localização real ou o nível mudarem: a coordenada
-- ofuscada é estável e não pode ser "triangulada" por consultas repetidas.
CREATE FUNCTION fn_terreiros_coordenada_publica() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ofuscada RECORD;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.lat_real = OLD.lat_real
     AND NEW.lng_real = OLD.lng_real
     AND NEW.nivel_privacidade = OLD.nivel_privacidade THEN
    -- Impede que alguém sobrescreva manualmente a coordenada pública.
    NEW.lat_publica := OLD.lat_publica;
    NEW.lng_publica := OLD.lng_publica;
  ELSIF NEW.nivel_privacidade = 'Exato' THEN
    NEW.lat_publica := NEW.lat_real;
    NEW.lng_publica := NEW.lng_real;
  ELSIF NEW.nivel_privacidade = 'Aproximado' THEN
    SELECT * INTO ofuscada FROM fn_ofuscar_coordenada(NEW.lat_real, NEW.lng_real);
    NEW.lat_publica := ofuscada.lat_out;
    NEW.lng_publica := ofuscada.lng_out;
  ELSE -- 'Oculto_Apenas_Censo': não existe coordenada pública
    NEW.lat_publica := NULL;
    NEW.lng_publica := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_terreiros_coordenada_publica
  BEFORE INSERT OR UPDATE ON terreiros
  FOR EACH ROW EXECUTE FUNCTION fn_terreiros_coordenada_publica();

-- =============================================================================
-- VIEW PÚBLICA — a ÚNICA fonte da listagem do mapa.
-- Não contém lat_real, lng_real; endereço só aparece quando a casa escolheu
-- 'Exato'. Casas ocultas e não aprovadas nem chegam a existir aqui.
-- =============================================================================
CREATE VIEW vw_terreiros_publicos AS
SELECT
  id, nome_casa, slug, categoria, vertente, nacao_linha, orixa_guia_regente,
  lideranca_titulo, lideranca_nome_religioso, ano_fundacao, distrito, bairro,
  CASE WHEN nivel_privacidade = 'Exato' THEN endereco_completo END AS endereco_publico,
  lat_publica, lng_publica, nivel_privacidade,
  historia_resumo, calendario_giras, acoes_sociais, whatsapp_contato, instagram_url,
  created_at
FROM terreiros
WHERE status_moderacao = 'Aprovado'
  AND nivel_privacidade IN ('Exato', 'Aproximado');

-- VIEW do CENSO — inclui as casas ocultas, mas apenas com campos agregáveis.
-- O nome só aparece para casas visíveis no mapa (o ranking de "casas mais
-- antigas" anonimiza as ocultas no back-end).
CREATE VIEW vw_terreiros_censo AS
SELECT
  CASE WHEN nivel_privacidade <> 'Oculto_Apenas_Censo' THEN nome_casa END AS nome_casa,
  CASE WHEN nivel_privacidade <> 'Oculto_Apenas_Censo' THEN slug END      AS slug,
  categoria, vertente, nacao_linha, ano_fundacao, distrito, nivel_privacidade, acoes_sociais
FROM terreiros
WHERE status_moderacao = 'Aprovado';

-- =============================================================================
-- Endurecimento de permissões (Supabase). No Neon/Postgres puro esses papéis
-- não existem e o bloco é ignorado. O back-end conecta como dono da tabela
-- (ou service_role), que não é afetado pelo RLS.
-- =============================================================================
ALTER TABLE terreiros ENABLE ROW LEVEL SECURITY;  -- sem políticas = acesso negado
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON terreiros FROM %I', r);
      EXECUTE format('REVOKE ALL ON vw_terreiros_publicos, vw_terreiros_censo FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- DADOS FICTÍCIOS PARA TESTE (nomes e pessoas inventados)
-- Cobrem os 3 níveis de privacidade e 5 bairros/distritos de Petrópolis.
-- lat_publica/lng_publica são calculadas pelo trigger.
-- =============================================================================
INSERT INTO terreiros (
  nome_casa, slug, categoria, vertente, nacao_linha, orixa_guia_regente,
  lideranca_titulo, lideranca_nome_religioso, ano_fundacao, distrito, bairro,
  endereco_completo, lat_real, lng_real, nivel_privacidade, historia_resumo,
  calendario_giras, acoes_sociais, whatsapp_contato, instagram_url,
  status_moderacao, consentimento_lgpd_em
) VALUES
-- 1) CENTRO — Candomblé Ketu — localização EXATA
(
  'Ilê Àṣẹ Ọ̀ṣun Ìyámi Petrópolis', 'ile-ase-osun-iyami-petropolis', 'Casa de Axé',
  'Candomblé', 'Ketu', 'Oxum', 'Yalorixá', 'Mãe Iracema de Oxum', 1968,
  '1º Distrito - Petrópolis (Centro)', 'Centro',
  'Rua Fictícia do Axé, 120 — Centro, Petrópolis/RJ', -22.505400, -43.178200, 'Exato',
  'Fundada por Mãe Iracema após chegar de Salvador, a casa é uma das mais antigas casas de Ketu da Serra. Mantém o xirê anual de Oxum na cachoeira e um acervo de fotografias das festas desde os anos 1970.',
  '[{"dia":"Sábado","horario":"19:00","tipo":"Xirê / festa pública","frequencia":"1º sábado do mês"},{"dia":"Quarta-feira","horario":"15:00","tipo":"Jogo de búzios (agendado)","frequencia":"Semanal"}]',
  ARRAY['Cesta Básica', 'Biblioteca Afro', 'Oficina de Percussão'],
  '5524999990001', 'https://instagram.com/ileaseosuniyami', 'Aprovado', now()
),
-- 2) QUITANDINHA — Umbanda — localização APROXIMADA
(
  'Tenda de Umbanda Caboclo Sete Flechas', 'tenda-umbanda-caboclo-sete-flechas', 'Casa de Axé',
  'Umbanda', 'Umbanda Tradicional', 'Caboclo Sete Flechas / Oxóssi', 'Pai de Santo', 'Pai Jorge de Oxóssi', 1979,
  '1º Distrito - Petrópolis (Centro)', 'Quitandinha',
  'Estrada Fictícia da Mata, 45 — Quitandinha, Petrópolis/RJ', -22.526800, -43.213500, 'Aproximado',
  'Nasceu como um centro de caridade no quintal da família. Hoje atende dezenas de pessoas por semana nas giras de caboclo e preto-velho, com forte atuação junto às famílias atingidas pelas chuvas de 2022.',
  '[{"dia":"Sexta-feira","horario":"20:00","tipo":"Gira de Caboclo","frequencia":"Semanal"},{"dia":"Segunda-feira","horario":"19:30","tipo":"Gira de Preto-Velho","frequencia":"Quinzenal"}]',
  ARRAY['Cesta Básica', 'Acolhimento Psicológico', 'Doação de Roupas'],
  '5524999990002', 'https://instagram.com/tendasete.flechas', 'Aprovado', now()
),
-- 3) CORRÊAS — Candomblé Angola — OCULTO (apenas censo)
(
  'Nzo Kisimbi Ria Mazambi', 'nzo-kisimbi-ria-mazambi', 'Casa de Axé',
  'Candomblé', 'Angola', 'Kisimbi / Dandalunda', 'Mametu', 'Mametu Kafuinji', 1985,
  '2º Distrito - Cascatinha', 'Corrêas',
  'Endereço sigiloso — Corrêas, Petrópolis/RJ', -22.446100, -43.140300, 'Oculto_Apenas_Censo',
  'A casa optou por não aparecer no mapa após episódios de intolerância religiosa na vizinhança. Participa apenas do censo comunitário.',
  '[]', ARRAY['Cesta Básica'], NULL, NULL, 'Aprovado', now()
),
-- 4) ALTO DA SERRA — Omolokô — localização EXATA
(
  'Terreiro de Omolokô Pai Joaquim de Aruanda', 'terreiro-omoloko-pai-joaquim-aruanda', 'Casa de Axé',
  'Omolokô', 'Omolokô (Tancredo da Silva Pinto)', 'Pai Joaquim de Angola / Xangô', 'Tata', 'Tata Kambondo Ngunzu', 1952,
  '1º Distrito - Petrópolis (Centro)', 'Alto da Serra',
  'Travessa Fictícia dos Pretos-Velhos, 8 — Alto da Serra, Petrópolis/RJ', -22.523600, -43.165800, 'Exato',
  'Fundado por ferroviários da antiga Leopoldina que subiam a serra, guarda cantigas de Omolokô transmitidas oralmente há quatro gerações.',
  '[{"dia":"Sábado","horario":"18:00","tipo":"Gira de Pretos-Velhos","frequencia":"Último sábado do mês"}]',
  ARRAY['Oficina de Percussão', 'Biblioteca Afro', 'Reforço Escolar'],
  '5524999990004', NULL, 'Aprovado', now()
),
-- 5) ITAIPAVA — Umbanda Sagrada — localização EXATA
(
  'Templo de Umbanda Luz de Aruanda', 'templo-umbanda-luz-de-aruanda', 'Casa de Axé',
  'Umbanda', 'Umbanda Sagrada', 'Ogum', 'Mãe de Santo', 'Mãe Lúcia de Ogum', 2004,
  '3º Distrito - Itaipava', 'Itaipava',
  'Estrada Fictícia União-Indústria, 9.000 — Itaipava, Petrópolis/RJ', -22.387500, -43.135000, 'Exato',
  'Casa jovem e muito ativa nas redes, conhecida pelos cursos abertos sobre história da Umbanda e pelo grupo de curimba que se apresenta em eventos culturais da cidade.',
  '[{"dia":"Domingo","horario":"16:00","tipo":"Gira aberta de Umbanda","frequencia":"Semanal"},{"dia":"Terça-feira","horario":"20:00","tipo":"Curso de Teologia Umbandista","frequencia":"Semanal"}]',
  ARRAY['Oficina de Percussão', 'Acolhimento Psicológico'],
  '5524999990005', 'https://instagram.com/luzdearuanda.itaipava', 'Aprovado', now()
),
-- 6) POSSE — Candomblé Efòn — localização APROXIMADA
(
  'Ilê Àṣẹ Ògún Àkórò Efòn', 'ile-ase-ogun-akoro-efon', 'Casa de Axé',
  'Candomblé', 'Efòn', 'Ogum', 'Babalorixá', 'Pai Adilson de Ogum', 1991,
  '5º Distrito - Posse', 'Posse',
  'Sítio Fictício Ọ̀nà, s/n — Posse, Petrópolis/RJ', -22.228400, -43.083900, 'Aproximado',
  'Casa rural cercada de mata nativa, mantém horta de ervas litúrgicas e recebe filhos de santo de toda a região serrana para as obrigações anuais.',
  '[{"dia":"Sábado","horario":"21:00","tipo":"Festa de Ogum (pública)","frequencia":"Abril"}]',
  ARRAY['Horta Comunitária', 'Cesta Básica'],
  '5524999990006', NULL, 'Aprovado', now()
),
-- 7) BÔNUS — Economia do Axé (pino roxo) — CENTRO, EXATO
(
  'Casa das Ervas Mãe Preta', 'casa-das-ervas-mae-preta', 'Economia do Axé',
  'Misto/Outros', 'Artigos religiosos', NULL, NULL, NULL, 1997,
  '1º Distrito - Petrópolis (Centro)', 'Centro',
  'Rua Fictícia do Mercado, 33 — Centro, Petrópolis/RJ', -22.509100, -43.176400, 'Exato',
  'Loja de ervas frescas, louças e guias, ponto de encontro do povo de santo no centro da cidade.',
  '[{"dia":"Segunda a sábado","horario":"09:00–18:00","tipo":"Atendimento da loja","frequencia":"Diário"}]',
  ARRAY[]::TEXT[], '5524999990007', NULL, 'Aprovado', now()
),
-- 8) Exemplo na FILA DE MODERAÇÃO (não aparece no mapa nem no censo)
(
  'Centro Espírita de Umbanda Vovó Cambinda', 'centro-umbanda-vovo-cambinda', 'Casa de Axé',
  'Umbanda', 'Umbanda Tradicional', 'Vovó Cambinda / Nanã', 'Mãe de Santo', 'Mãe Rosa de Nanã', 2011,
  '4º Distrito - Pedro do Rio', 'Pedro do Rio',
  'Rua Fictícia da Fé, 210 — Pedro do Rio, Petrópolis/RJ', -22.330200, -43.133900, 'Aproximado',
  'Cadastro enviado pelo formulário público e aguardando revisão.',
  '[{"dia":"Quinta-feira","horario":"20:00","tipo":"Gira de Preto-Velho","frequencia":"Semanal"}]',
  ARRAY['Cesta Básica'], '5524999990008', NULL, 'Pendente', now()
);

COMMIT;
