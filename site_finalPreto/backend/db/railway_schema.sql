-- Help2See — schema completo para o MySQL do Railway.
-- Sem criacao/selecao de banco: o editor do Railway ja esta conectado
-- ao banco 'railway'. Cole tudo na aba Data -> Query e execute.

-- ══════════ mysql_sites.sql ══════════
-- Help2See — mapeamento mínimo de site_key para o pipeline de analytics.
--
-- ESCOPO: esta é a PEQUENA fatia que o resolve_site() precisa para traduzir o
-- site_key público em (site_id, org_id). É de propósito um SUBCONJUNTO do schema
-- completo de auth (users/tokens/login) e tem o formato para fundir limpo com ele
-- depois: `organizations` e `sites` mantêm os mesmos nomes/chaves que o schema de
-- auth vai estender. Rode contra o banco indicado em MYSQL_DB (padrão help2see).
--
--   mysql -u root -p help2see < db/mysql_sites.sql
--
-- utf8mb4 + InnoDB em tudo, para acentos/emoji e chaves estrangeiras funcionarem.

CREATE TABLE IF NOT EXISTS organizations (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(255)    NOT NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sites (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id        INT UNSIGNED NOT NULL,
  -- Chave pública embutida no snippet do plugin (estilo ULID, 26 chars).
  site_key      CHAR(26)        NOT NULL,
  name          VARCHAR(255)    NOT NULL,
  domain        VARCHAR(255)    NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sites_site_key (site_key),
  KEY idx_sites_org (org_id),
  CONSTRAINT fk_sites_org FOREIGN KEY (org_id)
    REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Seed para verificação local ─────────────────────────────────
-- Uma org + site conhecidos para o /api/collect resolver durante os testes. O
-- site_key abaixo é o usado nos passos de verificação do plano.
INSERT INTO organizations (id, name)
VALUES (1, 'Help2See Demo')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO sites (id, org_id, site_key, name, domain, is_active)
VALUES (1, 1, '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'Demo Site', 'localhost', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active);

-- ══════════ mysql_auth.sql ══════════
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

-- ══════════ mysql_auth_whatsapp.sql ══════════
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

-- ══════════ mysql_auth_email_confirm.sql ══════════
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

-- ══════════ mysql_subscriptions.sql ══════════
-- Help2See — assinatura do plano Profissional (Mercado Pago).
--
-- Migração ADITIVA: complementa db/mysql_auth.sql. Nenhuma tabela existente é
-- alterada ou removida. Rode contra o mesmo banco (padrão help2see), DEPOIS de
-- mysql_auth.sql:
--
--   mysql -u root -p help2see < db/mysql_subscriptions.sql
--
-- Reaplicar é seguro: CREATE TABLE IF NOT EXISTS é idempotente por natureza.
--
-- Modelo: o plano efetivo do usuário é a linha `active` mais recente cujo
-- `current_period_end` ainda está no futuro; caso contrário ele é 'free'. Não
-- adicionamos coluna em `users` — o estado da assinatura vive na própria tabela
-- (a tabela `users` continua sendo só identidade/autenticação).

-- ── Assinaturas do plano Profissional ──────────────────────────────
-- billing_cycle       : 'monthly' (R$49) ou 'annual' (R$468 = R$39/mês).
-- status              : pending (checkout criado) → active (pagamento aprovado)
--                       → canceled (usuário cancelou) / expired (período venceu).
-- provider_ref        : id da preference do Checkout Pro (Mercado Pago).
-- provider_payment_id : id do pagamento APROVADO. UNIQUE → garante que o webhook
--                       (e o /confirm de retorno) sejam idempotentes: o mesmo
--                       pagamento nunca ativa a assinatura duas vezes.
-- amount_cents        : valor cobrado em centavos (decidido no servidor).
-- current_period_end  : fim do período de acesso (+30d mensal / +365d anual).
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id             INT UNSIGNED    NOT NULL,
  plan                VARCHAR(32)     NOT NULL DEFAULT 'professional',
  billing_cycle       VARCHAR(16)     NOT NULL,            -- monthly | annual
  status              VARCHAR(16)     NOT NULL DEFAULT 'pending',
  provider            VARCHAR(32)     NOT NULL DEFAULT 'mercadopago',
  provider_ref        VARCHAR(128)    NULL,                -- preference id
  provider_payment_id VARCHAR(128)    NULL,                -- payment id aprovado
  amount_cents        INT UNSIGNED    NOT NULL DEFAULT 0,
  started_at          DATETIME        NULL,
  current_period_end  DATETIME        NULL,
  canceled_at         TIMESTAMP       NULL,
  created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sub_payment (provider_payment_id),         -- idempotência do webhook
  KEY idx_sub_user (user_id, status),
  KEY idx_sub_status (status, current_period_end),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ══════════ mysql_site_producao.sql ══════════
-- Help2See — site_key EXCLUSIVA do site institucional (produção/Vercel).
--
-- Registra a organização e o site oficiais para a telemetria do plugin
-- (POST /api/collect). A site_key é pública (vai no HTML), mas só funciona
-- porque está cadastrada aqui com is_active = 1; o domain é informativo.
--
-- Rodar no MySQL local E no MySQL de produção (Railway):
--   Get-Content db/mysql_site_producao.sql -Raw | mysql -u root help2see

INSERT INTO organizations (id, name)
VALUES (2, 'Help2See')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO sites (id, org_id, site_key, name, domain, is_active)
VALUES (2, 2, '01KXF5AHSAE0DNKZFX27SXWCRF', 'Site institucional Help2See',
        'help2-see.vercel.app', 1)
ON DUPLICATE KEY UPDATE
  site_key = VALUES(site_key), name = VALUES(name),
  domain = VALUES(domain), is_active = VALUES(is_active);

