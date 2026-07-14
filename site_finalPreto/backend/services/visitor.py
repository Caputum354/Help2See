"""
Pseudônimo de visitante com rotação diária.

``visitor_hash`` é um HMAC-SHA256 sobre ``site_id + ip + user_agent + dia``.
Como o dia do calendário faz parte da entrada, o mesmo visitante recebe um hash
*diferente* a cada dia: dá para contar visitantes únicos *dentro de um dia* (o
que a métrica diária precisa), mas não dá para seguir uma pessoa ao longo dos dias.

O IP é usado APENAS para computar esse hash — ele nunca é retornado nem gravado.
"""
import hashlib
import hmac
from datetime import datetime, timezone

from utils.config import settings


def utc_day(ts: datetime | None = None) -> str:
    """Retorna o dia do calendário em UTC como ``YYYY-MM-DD``."""
    dt = ts or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")


def visitor_hash(site_id: int | str, ip: str, user_agent: str,
                 day: str | None = None) -> str:
    """Id pseudônimo do visitante, por dia. Nunca reversível ao IP bruto."""
    day = day or utc_day()
    message = f"{site_id}|{ip or ''}|{user_agent or ''}|{day}".encode("utf-8")
    key = settings.VISITOR_HASH_SECRET.encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()
