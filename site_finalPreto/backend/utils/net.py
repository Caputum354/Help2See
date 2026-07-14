"""
Utilitários de rede compartilhados pelas rotas.

``client_ip`` extrai o IP do cliente de forma robusta, honrando o
``X-Forwarded-For`` SOMENTE quando ``TRUST_PROXY`` está ligado (ligue só atrás de
um proxy que você controla). Centralizado aqui para ser reutilizado por
``routes.collect`` e ``routes.auth`` sem duplicar a lógica.
"""
from fastapi import Request

from utils.config import settings


def client_ip(request: Request) -> str:
    """IP do cliente (melhor esforço). Honra X-Forwarded-For só com TRUST_PROXY."""
    if settings.TRUST_PROXY:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else ""
