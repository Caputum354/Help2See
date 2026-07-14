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

CREATE DATABASE IF NOT EXISTS help2see
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE help2see;

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
