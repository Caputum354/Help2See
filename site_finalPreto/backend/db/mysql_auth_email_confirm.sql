-- Help2See — confirmação de e-mail (token de uso único) no cadastro.
--
-- Migração ADITIVA: complementa db/mysql_auth.sql. Nenhuma tabela existente é
-- removida. Rode contra o mesmo banco (padrão help2see), DEPOIS de mysql_auth.sql:
--
--   mysql -u root -p help2see < db/mysql_auth_email_confirm.sql
--
-- O que muda:
--   * users.email_verified_at — quando a conta confirmou o e-mail (NULL = pendente).
--     Já existe em mysql_auth.sql; o bloco abaixo é idempotente para bancos antigos.
--   * email_verifications — token de confirmação enviado por e-mail no cadastro.
--     Só o SHA-256 fica gravado; o valor bruto vai no link enviado ao usuário.

USE help2see;

-- ── users.email_verified_at (idempotente) ───────────────────────────
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'email_verified_at'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP NULL AFTER role',
  'SELECT "users.email_verified_at já existe — pulando" AS info');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── Tokens de confirmação de e-mail (uso único, com expiração) ──────
-- token_hash : SHA-256 do token bruto (o bruto vai só no link do e-mail).
-- used_at    : marcado quando o usuário confirma; impede reuso do link.
CREATE TABLE IF NOT EXISTS email_verifications (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED    NOT NULL,
  token_hash   CHAR(64)        NOT NULL,              -- SHA-256 hex
  expires_at   DATETIME        NOT NULL,
  used_at      TIMESTAMP       NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_verif_token (token_hash),
  KEY idx_email_verif_user (user_id),
  CONSTRAINT fk_email_verif_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
