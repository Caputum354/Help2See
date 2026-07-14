"""
Acesso ao MongoDB para o pipeline de analytics.

``events`` é uma coleção **time-series** (MongoDB 5.0+): o servidor agrupa os
documentos por tempo automaticamente, comprime bem e os expira sozinho via
``expireAfterSeconds`` (90 dias por padrão). Depois disso, só os agregados
sobrevivem.

Usamos um cliente síncrono (pymongo) para casar com os handlers de rota
síncronos do backend (ver ``routes/tts.py``).
"""
import logging
from typing import Optional

from pymongo import ASCENDING, MongoClient
from pymongo.database import Database
from pymongo.errors import CollectionInvalid

from utils.config import settings

logger = logging.getLogger("help2see.mongo")

EVENTS = "events"
METRICS_DAILY = "metrics_daily"
A11Y_ISSUES = "a11y_issues"
ALERTS = "alerts"
WCAG_STATUS = "wcag_status"

# Coleções de telemetria por concern (polyglot persistence). São coleções comuns
# (não time-series): expiram via índice TTL sobre o campo de data ``ts``.
SESSIONS = "sessions"          # ciclo de vida de cada sessão do plugin
ERRORS = "errors"             # erros de JS do plugin + exceções do servidor
PERFORMANCE = "performance"   # amostras de tempo (startup, ação, requisição)
APP_ACTIONS = "app_actions"   # espelho server-side das ações de auth

_client: Optional[MongoClient] = None


def get_client() -> MongoClient:
    """Singleton preguiçoso do cliente (o pymongo faz pooling internamente)."""
    global _client
    if _client is None:
        _client = MongoClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            tz_aware=True,
        )
    return _client


def get_db() -> Database:
    return get_client()[settings.MONGODB_DB]


def ensure_collections() -> None:
    """Cria a coleção time-series ``events`` + índices (idempotente)."""
    db = get_db()
    existing = set(db.list_collection_names())

    if EVENTS not in existing:
        try:
            db.create_collection(
                EVENTS,
                timeseries={
                    "timeField": "ts",
                    "metaField": "meta",
                    "granularity": "minutes",
                },
                expireAfterSeconds=settings.EVENTS_TTL_SECONDS,
            )
            logger.info(
                "Coleção time-series '%s' criada (TTL=%ss).",
                EVENTS, settings.EVENTS_TTL_SECONDS,
            )
        except CollectionInvalid:
            pass  # criada concorrentemente — tudo bem

    # Índices que dão suporte à varredura de agregação diária.
    db[EVENTS].create_index([("meta.site_id", ASCENDING), ("ts", ASCENDING)])
    db[EVENTS].create_index([("meta.type", ASCENDING)])
    # Novos: consultas por usuário autenticado e por sessão do plugin.
    db[EVENTS].create_index([("meta.user_id", ASCENDING), ("ts", ASCENDING)])
    db[EVENTS].create_index([("meta.session_id", ASCENDING)])

    # Coleções de agregados (comuns). O _id determinístico mantém os upserts
    # idempotentes; estes índices servem às consultas de leitura do painel.
    db[METRICS_DAILY].create_index([("site_id", ASCENDING), ("day", ASCENDING)])
    db[A11Y_ISSUES].create_index(
        [("site_id", ASCENDING), ("path", ASCENDING), ("issue_type", ASCENDING)]
    )
    db[ALERTS].create_index([("site_id", ASCENDING), ("status", ASCENDING)])
    # Status WCAG: um doc por site (_id = site_id). O índice por nível serve
    # à pergunta "quais sites têm (ou não têm) algum nível WCAG?".
    db[WCAG_STATUS].create_index([("level", ASCENDING)])

    # ── Coleções de telemetria por concern (com TTL sobre ``ts``) ──────
    # Cada uma expira sozinha; os índices cobrem os campos do prompt
    # (user_id, ts, action/type, session_id, plugin_version).
    _ensure_ttl(db, SESSIONS, settings.SESSIONS_TTL_SECONDS, [
        [("user_id", ASCENDING), ("started_at", ASCENDING)],
        [("session_id", ASCENDING)],
        [("plugin_version", ASCENDING)],
    ])
    _ensure_ttl(db, ERRORS, settings.ERRORS_TTL_SECONDS, [
        [("user_id", ASCENDING), ("ts", ASCENDING)],
        [("kind", ASCENDING)],
        [("session_id", ASCENDING)],
    ])
    _ensure_ttl(db, PERFORMANCE, settings.PERFORMANCE_TTL_SECONDS, [
        [("site_id", ASCENDING), ("ts", ASCENDING)],
        [("action", ASCENDING)],
        [("user_id", ASCENDING)],
    ])
    _ensure_ttl(db, APP_ACTIONS, settings.APP_ACTIONS_TTL_SECONDS, [
        [("user_id", ASCENDING), ("ts", ASCENDING)],
        [("action", ASCENDING)],
    ])
    logger.info("Índices de analytics garantidos.")


def _ensure_ttl(db: Database, name: str, ttl_seconds: int, indexes: list) -> None:
    """Garante o índice TTL sobre ``ts`` + os índices de consulta (idempotente).

    Em coleções comuns o MongoDB expira documentos via um índice TTL sobre um
    campo de data. ``create_index`` é idempotente quando os parâmetros batem.
    """
    coll = db[name]
    coll.create_index([("ts", ASCENDING)], expireAfterSeconds=ttl_seconds)
    for keys in indexes:
        coll.create_index(keys)


def reset_client() -> None:
    """Descarta o cliente em cache (usado pelos testes)."""
    global _client
    if _client is not None:
        _client.close()
    _client = None
