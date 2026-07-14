-- Help2See — schema de autenticação (cadastro + login + recuperação de senha).
--
-- Complementa o db/mysql_sites.sql (analytics). Rode contra o mesmo banco
-- indicado em MYSQL_DB (padrão help2see):
--
--   mysql -u root -p help2see < db/mysql_auth.sql
--
-- Segurança:
--   * password_hash guarda o hash Argon2 (nunca a senha em texto).
--   * tokens (reset/sessão) guardam só o SHA-256 — o valor bruto vai ao usuário.
--   * utf8mb4 + InnoDB para acentos/emoji e chaves estrangeiras.

CREATE DATABASE IF NOT EXISTS help2see
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE help2see;

CREATE TABLE IF NOT EXISTS users (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name              VARCHAR(255)    NOT NULL,
  email             VARCHAR(255)    NOT NULL,
  password_hash     VARCHAR(255)    NOT NULL,         -- Argon2
  role              VARCHAR(20)     NOT NULL DEFAULT 'member',  -- owner/admin/member
  email_verified_at TIMESTAMP       NULL,
  created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessões de login. O cliente guarda o token bruto; aqui fica só o hash.
CREATE TABLE IF NOT EXISTS sessions (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED    NOT NULL,
  token_hash   CHAR(64)        NOT NULL,              -- SHA-256 hex
  expires_at   DATETIME        NOT NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tokens de recuperação de senha (uso único, com expiração).
CREATE TABLE IF NOT EXISTS password_resets (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED    NOT NULL,
  token_hash   CHAR(64)        NOT NULL,              -- SHA-256 hex
  expires_at   DATETIME        NOT NULL,
  used_at      TIMESTAMP       NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_resets_token (token_hash),
  KEY idx_resets_user (user_id),
  CONSTRAINT fk_resets_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
