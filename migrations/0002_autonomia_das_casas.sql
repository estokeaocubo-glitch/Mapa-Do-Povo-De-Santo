-- =============================================================================
-- Autonomia das casas e moderação com histórico
--   • Código de edição: a casa altera os próprios dados, muda a privacidade ou
--     exclui o cadastro sem depender da moderação (LGPD, art. 18).
--   • Códigos de visitante: a liderança libera o contato restrito para pessoas
--     específicas, por prazo limitado, e pode revogar a qualquer momento.
--   • Histórico de moderação: quem aprovou, rejeitou, editou ou excluiu.
-- Só HASHES dos códigos são guardados; o código em si aparece uma única vez.
-- =============================================================================

ALTER TABLE terreiros ADD COLUMN codigo_edicao_hash TEXT;
ALTER TABLE terreiros ADD COLUMN editado_em TEXT;
CREATE UNIQUE INDEX idx_terreiros_codigo_edicao ON terreiros (codigo_edicao_hash) WHERE codigo_edicao_hash IS NOT NULL;

CREATE TABLE codigos_visitante (
  id           TEXT PRIMARY KEY,
  terreiro_id  TEXT NOT NULL REFERENCES terreiros (id) ON DELETE CASCADE,
  codigo_hash  TEXT NOT NULL UNIQUE,
  rotulo       TEXT,                 -- ex.: "Pesquisadora UFRJ" (opcional, só a casa vê)
  expira_em    INTEGER NOT NULL,     -- epoch em ms
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_codigos_visitante_casa ON codigos_visitante (terreiro_id);

CREATE TABLE moderacao_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  terreiro_id  TEXT,
  nome_casa    TEXT,
  acao         TEXT NOT NULL,        -- aprovado, rejeitado, editado, excluido, codigo_edicao, editado_pela_casa...
  autor        TEXT NOT NULL,        -- nome do moderador ou 'a própria casa'
  detalhes     TEXT,
  em           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_moderacao_log_em ON moderacao_log (em);
