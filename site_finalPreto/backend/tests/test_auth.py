"""
Testes das primitivas de segurança da autenticação (sem banco).

As rotas/serviço que tocam o MySQL são verificados manualmente (ver README /
ANALYTICS). Aqui cobrimos o que é puro e crítico: hashing e tokens.
"""
from services import rate_limit, security


def test_password_hash_is_not_plaintext_and_verifies():
    h = security.hash_password("segredo123")
    assert h != "segredo123"
    assert h.startswith("$argon2")          # Argon2
    ok, _ = security.verify_password(h, "segredo123")
    assert ok is True


def test_wrong_password_fails():
    h = security.hash_password("segredo123")
    ok, _ = security.verify_password(h, "errada")
    assert ok is False


def test_verify_handles_garbage_hash_without_raising():
    ok, new = security.verify_password("nao-e-um-hash", "x")
    assert ok is False and new is None


def test_hashes_are_salted_unique():
    assert security.hash_password("a") != security.hash_password("a")


def test_token_is_urlsafe_and_hash_is_sha256_hex():
    raw = security.generate_token()
    assert len(raw) >= 32
    digest = security.hash_token(raw)
    assert len(digest) == 64 and all(c in "0123456789abcdef" for c in digest)
    # Determinístico e dependente do valor bruto.
    assert security.hash_token(raw) == digest
    assert security.hash_token(security.generate_token()) != digest


# ── E-mail: nunca quebra quando o SMTP não está configurado ──────────


def test_mailer_no_smtp_returns_false_without_raising(monkeypatch):
    from services import mailer
    # Sem SMTP configurado, o envio falha silenciosamente (não levanta).
    monkeypatch.setattr(mailer.settings, "SMTP_HOST", "", raising=False)
    monkeypatch.setattr(mailer.settings, "SMTP_FROM", "", raising=False)
    assert mailer.send_password_reset("alguem@exemplo.com", "123456") is False


# ── Rate limit: janela fixa em memória ───────────────────────────────


def test_rate_limit_allows_up_to_max_then_blocks():
    rate_limit.reset()
    key = "test:key"
    assert all(rate_limit.allow(key, max_hits=3, window_s=60) for _ in range(3))
    assert rate_limit.allow(key, max_hits=3, window_s=60) is False


def test_rate_limit_keys_are_independent():
    rate_limit.reset()
    assert rate_limit.allow("a", max_hits=1, window_s=60) is True
    assert rate_limit.allow("a", max_hits=1, window_s=60) is False
    # Outra chave tem o próprio contador.
    assert rate_limit.allow("b", max_hits=1, window_s=60) is True
