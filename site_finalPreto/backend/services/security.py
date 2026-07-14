"""
Primitivas de segurança da autenticação.

* Senhas: hash Argon2id (recomendação OWASP) via argon2-cffi, com re-hash
  transparente quando os parâmetros mudam.
* Tokens (sessão e reset): valor bruto aleatório vai ao usuário; no banco fica
  só o SHA-256. Se o banco vazar, os tokens são inúteis.
"""
import hashlib
import secrets
from typing import Optional, Tuple

from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error

# Parâmetros padrão do argon2-cffi são um bom ponto de partida (OWASP).
_ph = PasswordHasher()


def hash_password(password: str) -> str:
    """Retorna o hash Argon2id da senha."""
    return _ph.hash(password)


def verify_password(stored_hash: str, password: str) -> Tuple[bool, Optional[str]]:
    """Verifica a senha.

    Retorna ``(ok, novo_hash)``. ``novo_hash`` vem preenchido quando o hash
    precisa ser atualizado (parâmetros antigos) — o chamador deve regravá-lo.
    """
    try:
        _ph.verify(stored_hash, password)
    except (Argon2Error, Exception):  # noqa: BLE001 — qualquer falha = senha inválida
        return False, None

    new_hash = None
    try:
        if _ph.check_needs_rehash(stored_hash):
            new_hash = _ph.hash(password)
    except Exception:  # noqa: BLE001 — re-hash é "best-effort"
        new_hash = None
    return True, new_hash


def generate_token(nbytes: int = 32) -> str:
    """Token opaco, seguro para URL (valor bruto entregue ao usuário)."""
    return secrets.token_urlsafe(nbytes)


def hash_token(raw_token: str) -> str:
    """SHA-256 (hex) do token — é o que fica guardado no banco."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
