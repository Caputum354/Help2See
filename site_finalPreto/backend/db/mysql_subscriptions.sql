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

USE help2see;

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
