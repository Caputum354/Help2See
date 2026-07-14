"""
``resolve_site`` — traduz o ``site_key`` público na identidade interna do
tenant ``(site_id, org_id)``.

O plugin só conhece o ``site_key`` (o CHAR(26) público embutido no snippet). O
servidor é a fonte da verdade sobre a qual tenant um evento pertence: ele
consulta a chave no MySQL e carimba os ids resolvidos nos documentos do Mongo.
O plugin nunca envia ``org_id``.

Um cache de TTL curto evita bater no MySQL a cada evento, mas ainda deixa um
site recém-criado ou desativado fazer efeito em poucos minutos.
"""
import logging
import threading
from typing import Optional, Tuple

from cachetools import TTLCache
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from utils.config import settings

logger = logging.getLogger("help2see.mysql")

SiteIdentity = Tuple[int, int]  # (site_id, org_id)

_engine: Optional[Engine] = None
# Cacheia acertos e erros (None) por 5 min; limitado para evitar crescimento sem fim.
_cache: "TTLCache[str, Optional[SiteIdentity]]" = TTLCache(maxsize=4096, ttl=300)
_lock = threading.Lock()


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(
            settings.mysql_url,
            pool_pre_ping=True,   # recupera de conexões derrubadas
            pool_recycle=3600,
        )
    return _engine


def resolve_site(site_key: str) -> Optional[SiteIdentity]:
    """Retorna ``(site_id, org_id)`` para um site ativo, ou ``None``."""
    if not site_key:
        return None

    with _lock:
        if site_key in _cache:
            return _cache[site_key]

    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT id, org_id FROM sites "
                "WHERE site_key = :k AND is_active = 1 LIMIT 1"
            ),
            {"k": site_key},
        ).first()

    result: Optional[SiteIdentity] = (int(row[0]), int(row[1])) if row else None
    with _lock:
        _cache[site_key] = result
    return result


def reset_cache() -> None:
    """Limpa o cache de resolução (usado nos testes / após o seed)."""
    with _lock:
        _cache.clear()


def reset_engine() -> None:
    """Descarta o engine em cache (usado pelos testes)."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None
