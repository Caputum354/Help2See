"""
Testes do formulário de contato — ``POST /api/contact``.

Não precisa de SMTP real: o ``mailer.send_contact_request`` é substituído por
um fake via monkeypatch, seguindo a mesma filosofia de ``test_auth.py``.
"""
from fastapi.testclient import TestClient

import app as app_module
from services import mailer, rate_limit
from utils.config import settings

client = TestClient(app_module.app)

_VALID = {
    "name": "Maria Silva",
    "email": "maria@example.com",
    "company": "example.com.br",
    "phone": "(11) 90000-0000",
    "subject": "comercial",
    "message": "Quero um diagnóstico do meu site.",
}


def setup_function(_fn):
    rate_limit.reset()


def test_contact_ok_delivered(monkeypatch):
    sent = {}

    def fake_send(**kw):
        sent.update(kw)
        return True

    monkeypatch.setattr(mailer, "send_contact_request", fake_send)
    resp = client.post("/api/contact", json=_VALID)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "delivered": True}
    assert sent["email"] == "maria@example.com"
    assert sent["company"] == "example.com.br"


def test_contact_ok_smtp_down(monkeypatch):
    """SMTP fora do ar não vira erro: ok=True com delivered=False."""
    monkeypatch.setattr(mailer, "send_contact_request", lambda **kw: False)
    resp = client.post("/api/contact", json=_VALID)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "delivered": False}


def test_contact_validation():
    # Campos obrigatórios ausentes / e-mail inválido → 422 do Pydantic.
    resp = client.post("/api/contact", json={"name": "X", "email": "não-é-email",
                                             "company": "y"})
    assert resp.status_code == 422
    resp = client.post("/api/contact", json={"email": "a@b.com"})
    assert resp.status_code == 422


def test_contact_rate_limit(monkeypatch):
    monkeypatch.setattr(mailer, "send_contact_request", lambda **kw: True)
    for _ in range(settings.RESET_RATE_MAX_HITS):
        assert client.post("/api/contact", json=_VALID).status_code == 200
    resp = client.post("/api/contact", json=_VALID)
    assert resp.status_code == 429
