-- =============================================================================
-- MODELO para carregar as casas reais. NÃO coloque dados reais neste arquivo.
--
-- 1. Copie para db/seed-real.sql (já ignorado pelo git) e preencha.
-- 2. Rode no banco de produção:  psql "$DATABASE_URL" -f db/seed-real.sql
--    (localmente, sem DATABASE_URL, o servidor carrega o arquivo sozinho).
--
-- Regras:
--  • nivel_privacidade = 'Aproximado' → o mapa mostra só um círculo de 500 m
--    em torno de um ponto deslocado de 400–800 m (calculado pelo trigger).
--  • contato_restrito = true → WhatsApp, Instagram e endereço só saem por
--    POST /api/desbloquear, depois de a senha ser conferida.
--  • vertente aceita apenas: Umbanda, Candomblé, Omolokô, Ifá, Kimbanda,
--    Misto/Outros. Casas mistas ("Candomblé e Umbanda") → 'Misto/Outros',
--    com o detalhe em nacao_linha. Nações (Angola, Ketu…) vão em nacao_linha.
--  • distrito precisa ser exatamente um dos 5 valores do ENUM.
--  • endereco_completo pode ser NULL ("informado diretamente pela liderança").
--  • consentimento_lgpd_em: preencha com a data da autorização da liderança.
-- =============================================================================

INSERT INTO terreiros (
  nome_casa, slug, vertente, nacao_linha, lideranca_nome_religioso,
  distrito, bairro, endereco_completo, lat_real, lng_real,
  nivel_privacidade, contato_restrito, whatsapp_contato,
  status_moderacao, consentimento_lgpd_em
) VALUES
(
  'Nome da Casa (exemplo)', 'nome-da-casa-exemplo', 'Misto/Outros', 'Candomblé e Umbanda', 'Nome da liderança',
  '1º Distrito - Petrópolis (Centro)', 'Centro', NULL, -22.5100, -43.1780,
  'Aproximado', true, '5524900000000',
  'Aprovado', '2026-10-01'
);
