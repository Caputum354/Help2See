-- Help2See — recuperação de senha via WhatsApp (Twilio) + histórico de login.
--
-- Migração ADITIVA: complementa db/mysql_auth.sql. Nenhuma tabela existente é
-- removida. Rode contra o mesmo banco (padrão help2see), DEPOIS de mysql_auth.sql:
--
--   mysql -u root -p help2see < db/mysql_auth_whatsapp.sql
--
-- O que muda:
--   * users.phone — telefone E.164 do usuário (necessário para enviar o código
--     de recuperação por WhatsApp). NULL para contas antigas (compatível).
--   * password_reset_codes — código numérico de uso único (OTP), só o SHA-256
--     fica gravado; expira em 15 min; conta tentativas (anti força-bruta).
--   * login_history — registro de eventos de login e de recuperação de senha.
--
-- A tabela link-based `password_resets` (de mysql_auth.sql) NÃO é usada pelo
-- fluxo de WhatsApp; é mantida para compatibilidade.

USE help2see;

-- ── Telefone do usuário (E.164, ex.: +5511999998888) ────────────────
-- Idempotência: rode só se a coluna ainda não existir. O bloco abaixo evita
-- erro "Duplicate column" ao reaplicar a migração.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL AFTER email',
  'SELECT "users.phone já existe — pulando" AS info');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── Códigos de recuperação por WhatsApp (OTP de uso único) ──────────
-- code_hash      : SHA-256 do código de 6 dígitos (o bruto vai só ao WhatsApp).
-- attempts       : tentativas erradas de verificação (trava em N — ver backend).
-- exchange_hash  : SHA-256 do token de troca emitido após verificar o código;
--                  é ele (e não o código) que autoriza a etapa de nova senha.
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED    NOT NULL,
  code_hash     CHAR(64)        NOT NULL,              -- SHA-256 hex
  attempts      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  exchange_hash CHAR(64)        NULL,                  -- SHA-256 hex (pós-verificação)
  expires_at    DATETIME        NOT NULL,
  verified_at   TIMESTAMP       NULL,
  used_at       TIMESTAMP       NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reset_codes_user (user_id),
  KEY idx_reset_codes_code (code_hash),
  KEY idx_reset_codes_exchange (exchange_hash),
  CONSTRAINT fk_reset_codes_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Histórico de login e tentativas de recuperação ─────────────────
-- user_id é NULL quando o e-mail informado não corresponde a nenhuma conta.
-- action: login_success | login_fail | reset_request | reset_verify_fail |
--         reset_success
CREATE TABLE IF NOT EXISTS login_history (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED    NULL,
  email_attempted VARCHAR(255)    NULL,
  action          VARCHAR(32)     NOT NULL,
  ip              VARCHAR(45)     NULL,                -- IPv4/IPv6
  user_agent      VARCHAR(255)    NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_login_history_user (user_id, created_at),
  CONSTRAINT fk_login_history_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
