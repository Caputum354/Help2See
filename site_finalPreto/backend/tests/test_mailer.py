"""
Testes do mailer — roteamento Brevo (API HTTP) vs SMTP.

Sem rede real: o ``requests.post`` é substituído por um fake via monkeypatch.
"""
from services import mailer
from utils.config import settings


class _FakeResponse:
    def __init__(self, status_code=201, text="{}"):
        self.status_code = status_code
        self.text = text


def test_send_email_uses_brevo_when_key_set(monkeypatch):
    sent = {}

    def fake_post(url, json=None, timeout=None, headers=None):
        sent["url"] = url
        sent["json"] = json
        sent["headers"] = headers
        return _FakeResponse(201)

    monkeypatch.setattr(settings, "BREVO_API_KEY", "xkeysib-teste")
    monkeypatch.setattr(settings, "SMTP_FROM", "equipe@help2see.com")
    monkeypatch.setattr(mailer.requests, "post", fake_post)

    ok = mailer.send_email("dest@example.com", "Assunto", "corpo",
                           html="<b>corpo</b>")
    assert ok is True
    assert sent["url"] == "https://api.brevo.com/v3/smtp/email"
    assert sent["headers"]["api-key"] == "xkeysib-teste"
    assert sent["json"]["to"] == [{"email": "dest@example.com"}]
    assert sent["json"]["sender"]["email"] == "equipe@help2see.com"
    assert sent["json"]["htmlContent"] == "<b>corpo</b>"


def test_brevo_failure_returns_false(monkeypatch):
    monkeypatch.setattr(settings, "BREVO_API_KEY", "xkeysib-teste")
    monkeypatch.setattr(settings, "SMTP_FROM", "equipe@help2see.com")
    monkeypatch.setattr(mailer.requests, "post",
                        lambda *a, **kw: _FakeResponse(401, "unauthorized"))
    assert mailer.send_email("dest@example.com", "Assunto", "corpo") is False


def test_contact_request_sets_reply_to(monkeypatch):
    sent = {}

    def fake_post(url, json=None, timeout=None, headers=None):
        sent["json"] = json
        return _FakeResponse(201)

    monkeypatch.setattr(settings, "BREVO_API_KEY", "xkeysib-teste")
    monkeypatch.setattr(settings, "SMTP_FROM", "equipe@help2see.com")
    monkeypatch.setattr(mailer.requests, "post", fake_post)

    ok = mailer.send_contact_request(
        name="Maria", email="maria@example.com", company="example.com",
        phone=None, subject="comercial", message="Olá",
    )
    assert ok is True
    # Vai para a caixa da equipe, com Reply-To no visitante.
    assert sent["json"]["to"] == [{"email": "equipe@help2see.com"}]
    assert sent["json"]["replyTo"] == {"name": "Maria",
                                       "email": "maria@example.com"}


def test_unconfigured_returns_false(monkeypatch):
    monkeypatch.setattr(settings, "BREVO_API_KEY", "")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "SMTP_FROM", "")
    assert mailer.send_email("dest@example.com", "Assunto", "corpo") is False
