"""
Regras de negócio da autenticação (cadastro, login, sessões, reset de senha).

Usa o mesmo MySQL do ``resolve_site`` (engine de ``services.mysql``). Decisões
de segurança:
  * senha gravada como hash Argon2 (com re-hash transparente no login);
  * tokens (sessão/reset) gravados só como SHA-256;
  * login e "esqueci a senha" não revelam se o e-mail existe (anti-enumeração);
  * trocar a senha invalida todas as sessões ativas do usuário.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy import text

from services.mysql import get_engine
from services.security import (
    generate_token, hash_password, hash_token, verify_password,
)
from utils.config import settings

logger = logging.getLogger("help2see.auth")

# Fuso do app (relógio local gravado no banco). Usa a base IANA quando disponível
# (tzdata) e cai para o offset fixo do Brasil (UTC−3, sem horário de verão) se não.
try:
    from zoneinfo import ZoneInfo
    _APP_TZ = ZoneInfo(settings.APP_TIMEZONE)
except Exception:  # noqa: BLE001 — sem tzdata: usa offset fixo do Brasil
    logger.warning(
        "Fuso '%s' indisponível (tzdata ausente?) — usando UTC−3 fixo.",
        settings.APP_TIMEZONE,
    )
    _APP_TZ = timezone(timedelta(hours=-3))

# Hash "isca": usado quando o e-mail não existe, para o login gastar o mesmo
# tempo de um login real (mitiga ataque de temporização / enumeração).
_DUMMY_HASH = hash_password("help2see-dummy-password")


class EmailTaken(Exception):
    """E-mail já cadastrado."""


class InvalidCredentials(Exception):
    """E-mail ou senha inválidos."""


class InvalidResetToken(Exception):
    """Token de reset inexistente, expirado ou já usado."""


def _now() -> datetime:
    """Horário local do app (``APP_TIMEZONE``) sem tzinfo — compatível com as
    colunas DATETIME/TIMESTAMP do MySQL. No Brasil grava em UTC−3, batendo com o
    relógio do usuário (ex.: ``email_verified_at``, sessões, códigos de reset).
    """
    return datetime.now(_APP_TZ).replace(tzinfo=None)


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _generate_code() -> str:
    """Código numérico de 6 dígitos para recuperação por e-mail (OTP)."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _user_dict(row) -> dict:
    return {
        "id": int(row.id),
        "name": row.name,
        "email": row.email,
        "role": row.role,
        "email_verified": row.email_verified_at is not None,
        # Plano efetivo (free | professional). Quando a query não traz a coluna
        # 'plan', cai para 'free'; get_user_by_token o resolve de fato abaixo.
        "plan": (getattr(row, "plan", None) or "free"),
    }


def _create_email_verification(conn, user_id: int) -> str:
    """Cria um token de confirmação de e-mail e retorna o valor bruto.

    Só o SHA-256 é gravado; o bruto vai no link enviado por e-mail. Recebe a
    conexão para participar da mesma transação do cadastro.
    """
    raw = generate_token()
    expires = _now() + timedelta(seconds=settings.EMAIL_VERIFICATION_TTL_SECONDS)
    conn.execute(
        text("INSERT INTO email_verifications (user_id, token_hash, expires_at) "
             "VALUES (:u, :h, :e)"),
        {"u": int(user_id), "h": hash_token(raw), "e": expires},
    )
    return raw


def _create_session(user_id: int) -> str:
    """Cria uma sessão e retorna o token bruto (só o hash é gravado)."""
    raw = generate_token()
    expires = _now() + timedelta(seconds=settings.SESSION_TTL_SECONDS)
    with get_engine().begin() as conn:
        conn.execute(
            text("INSERT INTO sessions (user_id, token_hash, expires_at) "
                 "VALUES (:u, :h, :e)"),
            {"u": user_id, "h": hash_token(raw), "e": expires},
        )
    return raw


def register(name: str, email: str, password: str) -> Tuple[dict, str, str]:
    """Cria o usuário, abre uma sessão (auto-login) e emite um token de confirmação.

    A conta nasce **não confirmada** (``email_verified_at`` NULL). Retorna
    ``(usuário, token_de_sessão, token_de_confirmação_bruto)`` — a rota envia o
    link de confirmação por e-mail. A recuperação de senha é por e-mail, então
    não exigimos telefone.
    """
    email = _normalize_email(email)
    pwd_hash = hash_password(password)
    with get_engine().begin() as conn:
        exists = conn.execute(
            text("SELECT id FROM users WHERE email = :e"), {"e": email}
        ).first()
        if exists:
            raise EmailTaken()
        result = conn.execute(
            text("INSERT INTO users (name, email, password_hash, role) "
                 "VALUES (:n, :e, :p, 'member')"),
            {"n": name.strip(), "e": email, "p": pwd_hash},
        )
        user_id = int(result.lastrowid)
        verify_token = _create_email_verification(conn, user_id)

    user = {
        "id": user_id, "name": name.strip(), "email": email,
        "role": "member", "email_verified": False,
    }
    token = _create_session(user_id)
    logger.info("Novo cadastro (e-mail pendente de confirmação): user_id=%s", user_id)
    return user, token, verify_token


def confirm_email(raw_token: str) -> bool:
    """Confirma o e-mail via token de uso único. Retorna True se confirmou.

    False se o token não existe, expirou ou já foi usado. Idempotente em relação
    ao usuário: marca ``email_verified_at`` só se ainda estiver pendente.
    """
    if not raw_token:
        return False
    with get_engine().begin() as conn:
        row = conn.execute(
            text("SELECT id, user_id FROM email_verifications "
                 "WHERE token_hash = :h AND used_at IS NULL AND expires_at > :now"),
            {"h": hash_token(raw_token), "now": _now()},
        ).first()
        if row is None:
            return False
        conn.execute(
            text("UPDATE users SET email_verified_at = :now "
                 "WHERE id = :u AND email_verified_at IS NULL"),
            {"now": _now(), "u": int(row.user_id)},
        )
        conn.execute(
            text("UPDATE email_verifications SET used_at = :now WHERE id = :id"),
            {"now": _now(), "id": int(row.id)},
        )
    logger.info("E-mail confirmado: user_id=%s", int(row.user_id))
    return True


def resend_email_verification(user_id: int) -> Optional[Tuple[str, str]]:
    """Reemite o token de confirmação se a conta ainda estiver pendente.

    Retorna ``(token_bruto, email)`` ou ``None`` (usuário inexistente ou já
    confirmado). Invalida tokens anteriores ainda não usados.
    """
    with get_engine().begin() as conn:
        user = conn.execute(
            text("SELECT id, email, email_verified_at FROM users WHERE id = :id"),
            {"id": int(user_id)},
        ).first()
        if user is None or user.email_verified_at is not None:
            return None
        conn.execute(
            text("UPDATE email_verifications SET used_at = :now "
                 "WHERE user_id = :u AND used_at IS NULL"),
            {"now": _now(), "u": int(user.id)},
        )
        raw = _create_email_verification(conn, int(user.id))
    return raw, user.email


def authenticate(email: str, password: str) -> Tuple[dict, str]:
    """Valida e-mail+senha; retorna (usuário, token). Mensagem genérica em falha."""
    email = _normalize_email(email)
    with get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT id, name, email, password_hash, role, email_verified_at "
                 "FROM users WHERE email = :e"),
            {"e": email},
        ).first()

    if row is None:
        verify_password(_DUMMY_HASH, password)  # gasta tempo equivalente
        raise InvalidCredentials()

    ok, new_hash = verify_password(row.password_hash, password)
    if not ok:
        raise InvalidCredentials()

    if new_hash:  # parâmetros do Argon2 mudaram → regrava
        with get_engine().begin() as conn:
            conn.execute(
                text("UPDATE users SET password_hash = :p WHERE id = :id"),
                {"p": new_hash, "id": int(row.id)},
            )

    return _user_dict(row), _create_session(int(row.id))


def get_user_by_token(raw_token: str) -> Optional[dict]:
    """Resolve o usuário de uma sessão válida (não expirada), ou None."""
    if not raw_token:
        return None
    with get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT u.id, u.name, u.email, u.role, u.email_verified_at "
                 "FROM sessions s JOIN users u ON u.id = s.user_id "
                 "WHERE s.token_hash = :h AND s.expires_at > :now"),
            {"h": hash_token(raw_token), "now": _now()},
        ).first()
    if not row:
        return None
    user = _user_dict(row)
    # Resolve o plano efetivo (assinatura) de forma isolada: import tardio para
    # evitar ciclo e best-effort (nunca derruba a autenticação).
    try:
        from services import subscription
        user["plan"] = subscription.effective_plan(user["id"])
    except Exception:  # noqa: BLE001
        user["plan"] = "free"
    return user


def logout(raw_token: str) -> None:
    """Encerra a sessão do token informado (idempotente)."""
    if not raw_token:
        return
    with get_engine().begin() as conn:
        conn.execute(
            text("DELETE FROM sessions WHERE token_hash = :h"),
            {"h": hash_token(raw_token)},
        )


def request_password_reset_code(email: str) -> Optional[Tuple[str, str]]:
    """Cria um código de recuperação (OTP) se o e-mail tiver conta.

    Retorna ``(codigo_bruto, email)`` ou ``None`` (sem revelar ao chamador se o
    e-mail existe — a rota responde sempre de forma genérica). O código de 6
    dígitos é enviado por e-mail; aqui só guardamos o SHA-256.
    """
    email = _normalize_email(email)
    with get_engine().begin() as conn:
        user = conn.execute(
            text("SELECT id, email FROM users WHERE email = :e"), {"e": email}
        ).first()
        if user is None:
            return None
        # Um código ativo por vez: invalida os anteriores ainda válidos.
        conn.execute(
            text("UPDATE password_reset_codes SET used_at = :now "
                 "WHERE user_id = :u AND used_at IS NULL"),
            {"now": _now(), "u": int(user.id)},
        )
        code = _generate_code()
        expires = _now() + timedelta(seconds=settings.PASSWORD_RESET_CODE_TTL_SECONDS)
        conn.execute(
            text("INSERT INTO password_reset_codes (user_id, code_hash, expires_at) "
                 "VALUES (:u, :h, :e)"),
            {"u": int(user.id), "h": hash_token(code), "e": expires},
        )
    return code, user.email


def verify_reset_code(email: str, code: str) -> Optional[str]:
    """Valida o código de 6 dígitos e emite um token de troca (uso único).

    Retorna o ``exchange_token`` bruto em caso de sucesso, ou ``None`` em qualquer
    falha (código errado/expirado, e-mail sem código ativo, ou teto de tentativas
    atingido). Cada erro incrementa ``attempts``; ao atingir
    ``PASSWORD_RESET_MAX_ATTEMPTS`` o código é invalidado (anti força-bruta).
    """
    email = _normalize_email(email)
    code = (code or "").strip()
    with get_engine().begin() as conn:
        user = conn.execute(
            text("SELECT id FROM users WHERE email = :e"), {"e": email}
        ).first()
        if user is None:
            return None

        row = conn.execute(
            text("SELECT id, attempts FROM password_reset_codes "
                 "WHERE user_id = :u AND used_at IS NULL AND verified_at IS NULL "
                 "AND expires_at > :now ORDER BY id DESC LIMIT 1"),
            {"u": int(user.id), "now": _now()},
        ).first()
        if row is None:
            return None

        if int(row.attempts) >= settings.PASSWORD_RESET_MAX_ATTEMPTS:
            conn.execute(
                text("UPDATE password_reset_codes SET used_at = :now WHERE id = :id"),
                {"now": _now(), "id": int(row.id)},
            )
            return None

        match = conn.execute(
            text("SELECT 1 FROM password_reset_codes "
                 "WHERE id = :id AND code_hash = :h"),
            {"id": int(row.id), "h": hash_token(code)},
        ).first()
        if match is None:
            new_attempts = int(row.attempts) + 1
            if new_attempts >= settings.PASSWORD_RESET_MAX_ATTEMPTS:
                conn.execute(
                    text("UPDATE password_reset_codes SET attempts = :a, used_at = :now "
                         "WHERE id = :id"),
                    {"a": new_attempts, "now": _now(), "id": int(row.id)},
                )
            else:
                conn.execute(
                    text("UPDATE password_reset_codes SET attempts = :a WHERE id = :id"),
                    {"a": new_attempts, "id": int(row.id)},
                )
            return None

        exchange = generate_token()
        conn.execute(
            text("UPDATE password_reset_codes "
                 "SET verified_at = :now, exchange_hash = :x WHERE id = :id"),
            {"now": _now(), "x": hash_token(exchange), "id": int(row.id)},
        )
    return exchange


def reset_password_with_exchange(exchange_token: str, new_password: str) -> None:
    """Troca a senha via token de troca (pós-verificação) e derruba as sessões.

    O token de troca é emitido por :func:`verify_reset_code` e é de uso único.
    """
    exchange_hash = hash_token(exchange_token)
    new_hash = hash_password(new_password)
    with get_engine().begin() as conn:
        row = conn.execute(
            text("SELECT id, user_id FROM password_reset_codes "
                 "WHERE exchange_hash = :x AND verified_at IS NOT NULL "
                 "AND used_at IS NULL AND expires_at > :now"),
            {"x": exchange_hash, "now": _now()},
        ).first()
        if row is None:
            raise InvalidResetToken()

        conn.execute(
            text("UPDATE users SET password_hash = :p WHERE id = :id"),
            {"p": new_hash, "id": int(row.user_id)},
        )
        conn.execute(
            text("UPDATE password_reset_codes SET used_at = :now WHERE id = :id"),
            {"now": _now(), "id": int(row.id)},
        )
        # Invalida todas as sessões ativas (logout global após troca de senha).
        conn.execute(
            text("DELETE FROM sessions WHERE user_id = :u"), {"u": int(row.user_id)}
        )
    logger.info("Senha redefinida (e-mail): user_id=%s", int(row.user_id))


def record_login_event(
    action: str,
    *,
    user_id: Optional[int] = None,
    email: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """Registra um evento de login/recuperação em ``login_history``.

    Best-effort: qualquer falha é logada e engolida — auditoria nunca pode
    derrubar a rota de autenticação.
    """
    try:
        with get_engine().begin() as conn:
            conn.execute(
                text("INSERT INTO login_history "
                     "(user_id, email_attempted, action, ip, user_agent) "
                     "VALUES (:u, :e, :a, :ip, :ua)"),
                {
                    "u": user_id,
                    "e": (email or None),
                    "a": action,
                    "ip": (ip or None),
                    "ua": (user_agent or "")[:255] or None,
                },
            )
    except Exception:  # noqa: BLE001 — auditoria é best-effort
        logger.exception("Falha ao registrar evento de login (%s).", action)
