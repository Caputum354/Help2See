"""
Rate limiting simples (janela fixa), em memória.

Usado para limitar ``/api/auth/forgot`` e ``/api/auth/verify-code`` por IP e por
e-mail (mitiga enumeração e força-bruta no código de recuperação).

Implementação proposital­mente leve, no mesmo espírito do cache de
``services.mysql``: um ``TTLCache`` por contador. É POR PROCESSO — suficiente
para um uvicorn de processo único. Em deploy multi-worker, troque por um backend
compartilhado (Redis/MySQL).
"""
import threading
from typing import Dict

from cachetools import TTLCache

_lock = threading.Lock()
# Um cache por janela (ttl). Criado sob demanda em _bucket().
_buckets: Dict[int, "TTLCache[str, int]"] = {}


def _bucket(window_s: int) -> "TTLCache[str, int]":
    bucket = _buckets.get(window_s)
    if bucket is None:
        bucket = TTLCache(maxsize=10000, ttl=window_s)
        _buckets[window_s] = bucket
    return bucket


def allow(key: str, max_hits: int, window_s: int) -> bool:
    """Registra um acesso e diz se ainda está dentro do limite.

    Retorna ``True`` enquanto houver no máximo ``max_hits`` acessos para ``key``
    dentro de ``window_s`` segundos; ``False`` quando o limite é estourado.
    """
    if max_hits <= 0:
        return False
    with _lock:
        bucket = _bucket(window_s)
        count = bucket.get(key, 0) + 1
        bucket[key] = count
        return count <= max_hits


def reset() -> None:
    """Limpa todos os contadores (usado nos testes)."""
    with _lock:
        _buckets.clear()
