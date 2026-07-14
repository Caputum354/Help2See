"""
``ingest_events`` — o coração do caminho de ingestão.

Para cada evento de um lote ele: resolve o tenant (no servidor), valida o tipo,
normaliza o caminho, sanitiza ``detail``/``a11y`` (privacy-first) e carimba o
``visitor`` pseudônimo do dia. O IP e o User-Agent alimentam apenas o hash —
nem o IP nem a chave bruta são persistidos.

Identidade OPCIONAL: quando a rota resolve um ``user_id`` (token de sessão válido),
ele é carimbado no evento; caso contrário o evento segue anônimo.

Fan-out: tipos dedicados (``session_*``, ``perf_sample``, ``client_error``) não
vão para ``events`` — são roteados para as coleções ``sessions`` / ``performance``
/ ``errors`` via ``services.telemetry`` (writes não-bloqueantes).
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from models.analytics_schemas import CollectResponse, EventBatch
from services import sanitizer, telemetry
from services.mongo import EVENTS, get_db
from services.mysql import resolve_site
from services.visitor import utc_day, visitor_hash

logger = logging.getLogger("help2see.ingest")


class SiteNotFoundError(Exception):
    """Disparada quando um ``site_key`` não mapeia para um site ativo."""


def _to_datetime(ts_ms) -> datetime:
    """Epoch-ms do navegador → datetime UTC aware; cai no relógio do servidor."""
    if ts_ms is None:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    except (OverflowError, OSError, ValueError, TypeError):
        return datetime.now(timezone.utc)


def _fan_out(ev_type: str, clean: dict, *, site_id: int, user_id: Optional[int],
             session_id: Optional[str], path: str, plugin_version: Optional[str],
             device: Optional[str], browser: Optional[str]) -> None:
    """Roteia um evento dedicado para a coleção certa (best-effort, não bloqueia)."""
    if ev_type == "client_error":
        telemetry.log_error(
            kind="client", message=str(clean.get("message", "")),
            source=clean.get("source"), lineno=clean.get("lineno"),
            site_id=site_id, user_id=user_id, session_id=session_id, path=path,
        )
    elif ev_type == "perf_sample":
        telemetry.record_performance(
            action=str(clean.get("action", "sample")), ms=clean.get("ms"),
            site_id=site_id, user_id=user_id, session_id=session_id, path=path,
            plugin_version=clean.get("plugin_version") or plugin_version,
        )
    elif ev_type == "session_start":
        telemetry.start_session(
            session_id=session_id or "", site_id=site_id, user_id=user_id,
            os=clean.get("os"), language=clean.get("language"),
            screen=clean.get("screen"), device=clean.get("device") or device,
            browser=clean.get("browser") or browser,
            plugin_version=clean.get("plugin_version") or plugin_version,
        )
    elif ev_type == "session_end":
        telemetry.end_session(
            session_id=session_id or "", duration_ms=clean.get("duration_ms"),
        )


def ingest_events(batch: EventBatch, *, client_ip: str, user_agent: str,
                  user_id: Optional[int] = None) -> CollectResponse:
    site = resolve_site(batch.site_key)
    if site is None:
        raise SiteNotFoundError(batch.site_key)
    site_id, org_id = site
    plugin_version = batch.plugin_version

    docs = []
    dropped = 0
    accepted = 0
    for ev in batch.events:
        if not sanitizer.is_allowed_type(ev.type):
            dropped += 1
            continue

        ts = _to_datetime(ev.ts)
        path = sanitizer.normalize_path(ev.path)
        session_id = ev.session_id or batch.session_id
        clean_detail = sanitizer.sanitize_detail(ev.type, ev.detail)

        # Tipos dedicados não vão para ``events`` — são roteados para a coleção
        # certa (sessions/performance/errors). Continuam contando como aceitos.
        if ev.type in sanitizer.FANOUT_TYPES:
            _fan_out(
                ev.type, clean_detail, site_id=site_id, user_id=user_id,
                session_id=session_id, path=path, plugin_version=plugin_version,
                device=ev.device, browser=ev.browser,
            )
            accepted += 1
            continue

        docs.append({
            "ts": ts,
            "meta": {
                "org_id": org_id,
                "site_id": site_id,
                "type": ev.type,
                "path": path,
                # Identidade opcional + contexto de sessão/versão.
                "user_id": user_id,
                "session_id": session_id,
                "plugin_version": plugin_version,
            },
            # IP + UA são entradas só do hash; nunca armazenados.
            "visitor": visitor_hash(site_id, client_ip, user_agent, utc_day(ts)),
            "device": ev.device,
            "browser": ev.browser,
            "a11y": sanitizer.sanitize_a11y(ev.a11y),
            "detail": clean_detail,
        })

    if docs:
        get_db()[EVENTS].insert_many(docs, ordered=False)

    accepted += len(docs)
    logger.info(
        "Ingest site_id=%s aceitos=%d descartados=%d user=%s",
        site_id, accepted, dropped, user_id if user_id is not None else "anon",
    )
    return CollectResponse(accepted=accepted, dropped=dropped)
