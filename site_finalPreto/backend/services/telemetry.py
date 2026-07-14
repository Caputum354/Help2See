"""
Camada de serviço/repositório de telemetria do MongoDB (polyglot persistence).

Responsabilidades:
  * **Nunca bloquear** o caminho da requisição — toda escrita é *fire-and-forget*
    em um ``ThreadPoolExecutor`` limitado. Falhas são logadas e engolidas: a
    telemetria jamais pode derrubar uma rota (mesmo Mongo fora do ar).
  * **Sanitizar** todo documento antes de gravar (strings limitadas, só escalares)
    — defesa contra injeção e contra vazar conteúdo do usuário.
  * Isolar o Mongo do resto do app: o SQLAlchemy/auth nunca importa isto, e aqui
    não há modelo de MySQL. A ligação entre os bancos é apenas o ``user_id`` (int).

Coleções por concern (ver ``services.mongo``): ``errors``, ``performance``,
``sessions``, ``app_actions``. O fluxo de ``events`` continua em ``ingest.py``.
"""
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from services.mongo import APP_ACTIONS, ERRORS, PERFORMANCE, SESSIONS, get_db
from utils.config import settings

logger = logging.getLogger("help2see.telemetry")

# Pool pequeno e limitado: telemetria é best-effort, não pode acumular memória.
# A fila do executor é ilimitada por padrão, então protegemos no submit (try).
_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="telemetry")

_MAX_STR = 256
_MAX_KEYS = 24  # teto de chaves num dicionário de contexto


def _now() -> datetime:
    """Carimbo UTC aware (consistente com o resto do pipeline de analytics)."""
    return datetime.now(timezone.utc)


def _clip(value: Any) -> Any:
    """Mantém escalares (string limitada, bool/número); descarta o resto."""
    if isinstance(value, str):
        return value[:_MAX_STR]
    if isinstance(value, bool) or isinstance(value, (int, float)):
        return value
    return None


def _safe_context(ctx: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Achata um dicionário de contexto para apenas chaves→escalares limitados."""
    if not isinstance(ctx, dict):
        return {}
    clean: Dict[str, Any] = {}
    for key, val in list(ctx.items())[:_MAX_KEYS]:
        cv = _clip(val)
        if cv is not None:
            clean[str(key)[:64]] = cv
    return clean


def fire(fn, *args, **kwargs) -> None:
    """Agenda ``fn`` no executor sem bloquear. No-op se a telemetria está off.

    Engole qualquer falha de submit (fila cheia/encerrada) — best-effort.
    """
    if not settings.TELEMETRY_ENABLED:
        return
    try:
        _EXECUTOR.submit(_guard, fn, *args, **kwargs)
    except Exception:  # noqa: BLE001 — submit não pode derrubar a rota
        logger.debug("Telemetria: submit falhou (descartado).", exc_info=True)


def _guard(fn, *args, **kwargs) -> None:
    """Executa o write no worker, isolando exceções (Mongo fora, etc.)."""
    try:
        fn(*args, **kwargs)
    except Exception:  # noqa: BLE001 — write best-effort
        logger.warning("Telemetria: write falhou (descartado).", exc_info=True)


# ── Writers (rodam no worker; nunca chamados direto do caminho da requisição) ──

def _insert(collection: str, doc: Dict[str, Any]) -> None:
    get_db()[collection].insert_one(doc)


def _upsert_session_start(doc: Dict[str, Any]) -> None:
    sid = doc["session_id"]
    get_db()[SESSIONS].update_one(
        {"_id": sid},
        {"$setOnInsert": doc},
        upsert=True,
    )


def _update_session_end(session_id: str, ended_at: datetime,
                        duration_ms: Optional[int]) -> None:
    get_db()[SESSIONS].update_one(
        {"_id": session_id},
        {"$set": {"ended_at": ended_at, "duration_ms": duration_ms}},
    )


# ── API pública (não-bloqueante) ──────────────────────────────────────────────

def log_error(*, kind: str, message: str, source: Optional[str] = None,
              lineno: Optional[int] = None, site_id: Optional[int] = None,
              user_id: Optional[int] = None, session_id: Optional[str] = None,
              path: Optional[str] = None,
              context: Optional[Dict[str, Any]] = None) -> None:
    """Registra um erro/exceção (cliente ou servidor) na coleção ``errors``."""
    doc = {
        "ts": _now(),
        "kind": _clip(kind),
        "message": _clip(message),
        "source": _clip(source),
        "lineno": _clip(lineno),
        "site_id": site_id,
        "user_id": user_id,
        "session_id": _clip(session_id),
        "path": _clip(path),
        "context": _safe_context(context),
    }
    fire(_insert, ERRORS, doc)


def record_performance(*, action: str, ms: Any, site_id: Optional[int] = None,
                       user_id: Optional[int] = None,
                       session_id: Optional[str] = None,
                       path: Optional[str] = None,
                       plugin_version: Optional[str] = None) -> None:
    """Registra uma amostra de tempo (ms) na coleção ``performance``."""
    doc = {
        "ts": _now(),
        "action": _clip(action),
        "ms": _clip(ms),
        "site_id": site_id,
        "user_id": user_id,
        "session_id": _clip(session_id),
        "path": _clip(path),
        "plugin_version": _clip(plugin_version),
    }
    fire(_insert, PERFORMANCE, doc)


def start_session(*, session_id: str, site_id: Optional[int] = None,
                  user_id: Optional[int] = None, os: Optional[str] = None,
                  language: Optional[str] = None, screen: Optional[str] = None,
                  device: Optional[str] = None, browser: Optional[str] = None,
                  plugin_version: Optional[str] = None) -> None:
    """Abre (idempotente) o doc de uma sessão do plugin na coleção ``sessions``."""
    if not session_id:
        return
    now = _now()
    doc = {
        "_id": _clip(session_id),
        "session_id": _clip(session_id),
        "ts": now,            # usado pelo índice TTL
        "started_at": now,
        "ended_at": None,
        "duration_ms": None,
        "site_id": site_id,
        "user_id": user_id,
        "os": _clip(os),
        "language": _clip(language),
        "screen": _clip(screen),
        "device": _clip(device),
        "browser": _clip(browser),
        "plugin_version": _clip(plugin_version),
    }
    fire(_upsert_session_start, doc)


def end_session(*, session_id: str, duration_ms: Optional[int] = None) -> None:
    """Fecha a sessão (marca ``ended_at`` + duração)."""
    if not session_id:
        return
    fire(_update_session_end, _clip(session_id), _now(), _clip(duration_ms))


def log_action(*, action: str, user_id: Optional[int] = None,
               ip_hash: Optional[str] = None, path: Optional[str] = None,
               status: Optional[int] = None,
               context: Optional[Dict[str, Any]] = None) -> None:
    """Espelha uma ação server-side (login/logout/reset/…) em ``app_actions``.

    Nunca grava senha/token/IP cru — só ``user_id`` (int) e metadados técnicos.
    """
    doc = {
        "ts": _now(),
        "action": _clip(action),
        "user_id": user_id,
        "ip_hash": _clip(ip_hash),
        "path": _clip(path),
        "status": _clip(status),
        "context": _safe_context(context),
    }
    fire(_insert, APP_ACTIONS, doc)


def shutdown() -> None:
    """Encerra o executor no shutdown do app (não espera writes pendentes)."""
    _EXECUTOR.shutdown(wait=False)
