"""
Resolução opcional de identidade para a telemetria.

A telemetria é anônima por padrão (hash de visitante). Quando o plugin envia o
token de sessão de um usuário logado, validamos esse token contra o MySQL e
anexamos o ``user_id`` (int) ao evento. Esta é a **única** ponte entre os dois
bancos — sempre por id, nunca por credencial. O token é validado e descartado;
nada de senha/token é gravado no Mongo.

Mantém ``routes/collect`` desacoplado das entranhas de ``services.auth``.
"""
import logging
from typing import Optional

logger = logging.getLogger("help2see.identity")


def user_id_from_token(token: Optional[str]) -> Optional[int]:
    """Retorna o ``user_id`` do MySQL para um token de sessão válido, ou ``None``.

    Nunca levanta exceção: qualquer falha (token inválido, MySQL fora) vira
    ``None`` e a telemetria segue anônima.
    """
    if not token:
        return None
    try:
        # Import tardio para evitar acoplamento no carregamento do módulo.
        from services.auth import get_user_by_token

        user = get_user_by_token(token)
        return int(user["id"]) if user else None
    except Exception:  # noqa: BLE001 — identidade é best-effort
        logger.debug("Falha ao resolver user_id do token (anônimo).", exc_info=True)
        return None
