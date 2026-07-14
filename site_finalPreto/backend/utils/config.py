"""
Centralised configuration for the Help2See backend.

Reads everything from environment variables / the .env file via
python-dotenv. Secrets (the ElevenLabs API key) live ONLY here on the
server and are never sent to the browser.
"""
import os

from dotenv import load_dotenv

load_dotenv()


def _split(csv: str):
    return [item.strip() for item in csv.split(",") if item.strip()]


class Settings:
    # ── ElevenLabs ──────────────────────────────────────────────
    # Secret: loaded ONLY from the environment, never hardcoded.
    ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "")

    # IMPORTANT: this must be a voice your account actually owns / can use
    # via the API. Legacy "premade" IDs such as Rachel (21m00Tcm4TlvDq8ikWAM)
    # are deprecated and rejected with HTTP 402 on the Free tier
    # ("Free users cannot use library voices via the API"). Leave it blank to
    # let the backend auto-resolve the first voice from GET /v1/voices, or set
    # one returned by GET /api/voices.
    ELEVENLABS_VOICE_ID: str = os.getenv("ELEVENLABS_VOICE_ID", "").strip()

    ELEVENLABS_MODEL_ID: str = os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
    ELEVENLABS_BASE_URL: str = os.getenv(
        "ELEVENLABS_BASE_URL", "https://api.elevenlabs.io/v1"
    )
    # mp3_44100_128 is supported on every plan; override only if needed.
    ELEVENLABS_OUTPUT_FORMAT: str = os.getenv(
        "ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128"
    )

    # When the configured/default voice is rejected for entitlement reasons
    # (402 paid_plan_required), automatically resolve an owned voice and retry.
    ELEVENLABS_AUTO_RESOLVE_VOICE: bool = os.getenv(
        "ELEVENLABS_AUTO_RESOLVE_VOICE", "true"
    ).strip().lower() in ("1", "true", "yes", "on")

    # (connect, read) timeouts in seconds.
    ELEVENLABS_CONNECT_TIMEOUT: float = float(
        os.getenv("ELEVENLABS_CONNECT_TIMEOUT", "10")
    )
    ELEVENLABS_READ_TIMEOUT: float = float(
        os.getenv("ELEVENLABS_READ_TIMEOUT", "60")
    )

    # ── Server ──────────────────────────────────────────────────
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))

    # Fuso usado para gravar os horários de auth (confirmação, sessões, reset)
    # no relógio local do usuário. Brasil: America/Sao_Paulo (UTC−3).
    APP_TIMEZONE: str = os.getenv("APP_TIMEZONE", "America/Sao_Paulo")

    # Origins allowed to call this API (the static site). Comma-separated.
    CORS_ORIGINS = _split(os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500,"
        "http://localhost:8080,http://127.0.0.1:8080"
    ))

    # ── Pipeline de analytics ───────────────────────────────────
    # O MongoDB guarda os eventos brutos (time-series, com expiração automática)
    # e os agregados diários que o painel lê.
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017")
    MONGODB_DB: str = os.getenv("MONGODB_DB", "help2see")

    # O MySQL guarda o mapeamento público site_key → (site_id, org_id) que o
    # resolve_site() traduz. Só esta fatia mínima é necessária aqui.
    MYSQL_HOST: str = os.getenv("MYSQL_HOST", "127.0.0.1")
    MYSQL_PORT: int = int(os.getenv("MYSQL_PORT", "3306"))
    MYSQL_USER: str = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD: str = os.getenv("MYSQL_PASSWORD", "")
    MYSQL_DB: str = os.getenv("MYSQL_DB", "help2see")

    # Segredo do pseudônimo de visitante com rotação diária (HMAC). DEVE ser
    # definido em produção; o padrão de dev deixa o teste local sem atrito.
    VISITOR_HASH_SECRET: str = os.getenv(
        "VISITOR_HASH_SECRET", "dev-only-change-me"
    )

    # Eventos brutos expiram em 90 dias; só o agregado sobrevive.
    EVENTS_TTL_SECONDS: int = int(os.getenv("EVENTS_TTL_SECONDS", str(90 * 24 * 3600)))

    # TTL (em segundos) das coleções de telemetria por concern. Padrão 90 dias.
    # Coleções comuns (não time-series) expiram via índice TTL sobre a data.
    _DEFAULT_TTL = str(90 * 24 * 3600)
    ERRORS_TTL_SECONDS: int = int(os.getenv("ERRORS_TTL_SECONDS", _DEFAULT_TTL))
    PERFORMANCE_TTL_SECONDS: int = int(os.getenv("PERFORMANCE_TTL_SECONDS", _DEFAULT_TTL))
    SESSIONS_TTL_SECONDS: int = int(os.getenv("SESSIONS_TTL_SECONDS", _DEFAULT_TTL))
    APP_ACTIONS_TTL_SECONDS: int = int(os.getenv("APP_ACTIONS_TTL_SECONDS", _DEFAULT_TTL))

    # Liga/desliga toda a telemetria de Mongo de uma vez (writes fire-and-forget).
    TELEMETRY_ENABLED: bool = os.getenv("TELEMETRY_ENABLED", "true").strip().lower() in (
        "1", "true", "yes", "on"
    )
    # Amostragem (0..1) do middleware de tempo de requisição da API (performance).
    # 0 desliga; 1 registra todas. Padrão baixo para não amplificar escrita.
    API_TELEMETRY_SAMPLE_RATE: float = float(
        os.getenv("API_TELEMETRY_SAMPLE_RATE", "0.1")
    )

    # Máximo de eventos aceitos por lote no /collect (guarda contra abuso).
    COLLECT_MAX_BATCH: int = int(os.getenv("COLLECT_MAX_BATCH", "200"))

    # Confiar no X-Forwarded-For para o IP do cliente (ligue só atrás de um proxy
    # que você controla). O IP é usado só para computar o hash, nunca gravado.
    TRUST_PROXY: bool = os.getenv("TRUST_PROXY", "false").strip().lower() in (
        "1", "true", "yes", "on"
    )

    # Roda o job de agregação horário in-process (APScheduler). Desligue para
    # rodá-lo externamente via cron / `python -m jobs.aggregate`.
    SCHEDULER_ENABLED: bool = os.getenv("SCHEDULER_ENABLED", "false").strip().lower() in (
        "1", "true", "yes", "on"
    )

    # ── Autenticação ────────────────────────────────────────────
    # Tamanho mínimo de senha (alinhado ao formulário do front-end).
    AUTH_PASSWORD_MIN_LEN: int = int(os.getenv("AUTH_PASSWORD_MIN_LEN", "6"))
    # Validade da sessão de login (30 dias).
    SESSION_TTL_SECONDS: int = int(os.getenv("SESSION_TTL_SECONDS", str(30 * 24 * 3600)))

    # Base pública do site (usada para montar o link de confirmação de e-mail).
    FRONTEND_BASE_URL: str = os.getenv("FRONTEND_BASE_URL", "http://127.0.0.1:5500")
    # Validade do token de confirmação de e-mail (padrão 24h).
    EMAIL_VERIFICATION_TTL_SECONDS: int = int(
        os.getenv("EMAIL_VERIFICATION_TTL_SECONDS", str(24 * 3600))
    )

    # ── Recuperação de senha por e-mail (código OTP) ────────────
    # Validade do código de 6 dígitos (padrão 15 min) e teto de tentativas de
    # verificação antes de invalidar o código (anti força-bruta).
    PASSWORD_RESET_CODE_TTL_SECONDS: int = int(
        os.getenv("PASSWORD_RESET_CODE_TTL_SECONDS", "900")
    )
    PASSWORD_RESET_MAX_ATTEMPTS: int = int(os.getenv("PASSWORD_RESET_MAX_ATTEMPTS", "5"))

    # Rate limit (janela fixa) para /forgot e /verify-code: nº máximo de
    # requisições por janela, por chave (IP e e-mail).
    RESET_RATE_MAX_HITS: int = int(os.getenv("RESET_RATE_MAX_HITS", "5"))
    RESET_RATE_WINDOW_SECONDS: int = int(os.getenv("RESET_RATE_WINDOW_SECONDS", "300"))

    # ── SMTP (envio do código de recuperação por e-mail) ────────
    # Credenciais SÓ no ambiente; nunca vão ao navegador. Em dev, deixe em branco:
    # o backend devolve o código na resposta de /forgot (campo dev_code).
    SMTP_HOST: str = os.getenv("SMTP_HOST", "").strip()
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    # Remetente exibido; se vazio, usa SMTP_USER.
    SMTP_FROM: str = os.getenv("SMTP_FROM", "") or os.getenv("SMTP_USER", "")
    # Nome amigável do remetente (ex.: "Help2See").
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Help2See")
    SMTP_STARTTLS: bool = os.getenv("SMTP_STARTTLS", "true").strip().lower() in (
        "1", "true", "yes", "on"
    )
    SMTP_SSL: bool = os.getenv("SMTP_SSL", "false").strip().lower() in (
        "1", "true", "yes", "on"
    )

    # ── Assinatura do plano Profissional (Mercado Pago) ─────────
    # Credenciais SÓ no ambiente; nunca vão ao navegador. Em dev/sandbox use o
    # access token de TESTE (prefixo "TEST-"). Sem token, o checkout fica
    # desabilitado e a rota responde 503 (em vez de quebrar).
    MERCADOPAGO_ACCESS_TOKEN: str = os.getenv("MERCADOPAGO_ACCESS_TOKEN", "").strip()
    # Segredo da assinatura do webhook (Mercado Pago → "x-signature"). Usado para
    # validar a origem das notificações antes de confiar nelas.
    MERCADOPAGO_WEBHOOK_SECRET: str = os.getenv("MERCADOPAGO_WEBHOOK_SECRET", "").strip()
    # URL pública desta API (ex.: túnel ngrok) para o Mercado Pago entregar o
    # webhook. Em dev local fica vazio: o app usa o retorno /confirm da back_url
    # (localhost não é acessível pelo Mercado Pago).
    API_PUBLIC_URL: str = os.getenv("API_PUBLIC_URL", "").strip()

    # Preço do plano Profissional, em centavos (decidido no servidor — o cliente
    # nunca informa valor). Mensal R$49,00; anual R$468,00 (= R$39,00/mês).
    SUBSCRIPTION_PRICE_MONTHLY_CENTS: int = int(
        os.getenv("SUBSCRIPTION_PRICE_MONTHLY_CENTS", "4900")
    )
    SUBSCRIPTION_PRICE_ANNUAL_CENTS: int = int(
        os.getenv("SUBSCRIPTION_PRICE_ANNUAL_CENTS", "46800")
    )

    @property
    def mercadopago_configured(self) -> bool:
        return bool(self.MERCADOPAGO_ACCESS_TOKEN)

    @property
    def email_configured(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_FROM)

    @property
    def elevenlabs_configured(self) -> bool:
        return bool(self.ELEVENLABS_API_KEY)

    @property
    def elevenlabs_timeout(self):
        return (self.ELEVENLABS_CONNECT_TIMEOUT, self.ELEVENLABS_READ_TIMEOUT)

    @property
    def mysql_url(self) -> str:
        """URL do SQLAlchemy para o banco com o mapeamento de site_key."""
        from urllib.parse import quote_plus

        pwd = quote_plus(self.MYSQL_PASSWORD)
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{pwd}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DB}?charset=utf8mb4"
        )


settings = Settings()
