"""
Testes da assinatura do plano Profissional — lógica pura + idempotência.

Não precisa de MySQL / Mongo / Mercado Pago reais: o engine do SQLAlchemy e o
``telemetry.log_action`` são substituídos por fakes via monkeypatch. As rotas
que tocam o banco no caminho feliz são verificadas manualmente (ver ANALYTICS),
seguindo a mesma filosofia de ``test_auth.py``.
"""
import hashlib
import hmac

from fastapi.testclient import TestClient

import app as app_module
from services import payments, subscription
from utils.config import settings


# ── Fakes mínimos do engine SQLAlchemy ──────────────────────────
class _FakeResult:
    def __init__(self, rows=None, lastrowid=None, rowcount=0):
        self._rows = rows or []
        self.lastrowid = lastrowid
        self.rowcount = rowcount

    def first(self):
        return self._rows[0] if self._rows else None


class _Row:
    """Acesso por atributo, como uma Row do SQLAlchemy."""
    def __init__(self, **kw):
        self.__dict__.update(kw)


class _FakeConn:
    def __init__(self, select_row, writes):
        self._select_row = select_row
        self._writes = writes      # lista que coleta UPDATE/INSERT executados

    def execute(self, stmt, params=None):
        sql = str(stmt).strip().upper()
        if sql.startswith("SELECT"):
            return _FakeResult(rows=[self._select_row] if self._select_row else [])
        self._writes.append((str(stmt), params))   # UPDATE / INSERT
        return _FakeResult(rowcount=1, lastrowid=99)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _FakeEngine:
    def __init__(self, select_row=None, writes=None):
        self._select_row = select_row
        self._writes = writes if writes is not None else []

    def begin(self):
        return _FakeConn(self._select_row, self._writes)

    def connect(self):
        return _FakeConn(self._select_row, self._writes)


def _silence_telemetry(monkeypatch):
    monkeypatch.setattr(subscription.telemetry, "log_action", lambda **kw: None)


# ── Preço resolvido no servidor (cliente nunca informa valor) ───
def test_price_cents_per_cycle():
    assert subscription._price_cents("monthly") == settings.SUBSCRIPTION_PRICE_MONTHLY_CENTS
    assert subscription._price_cents("annual") == settings.SUBSCRIPTION_PRICE_ANNUAL_CENTS
    # Qualquer valor inesperado cai no mensal (nunca cobra o anual por engano).
    assert subscription._price_cents("weird") == settings.SUBSCRIPTION_PRICE_MONTHLY_CENTS


def test_period_end_adds_30_or_365_days():
    from datetime import datetime
    start = datetime(2026, 1, 1, 12, 0, 0)
    assert (subscription._period_end("monthly", start) - start).days == 30
    assert (subscription._period_end("annual", start) - start).days == 365


# ── effective_plan: free por padrão e à prova de falha ──────────
def test_effective_plan_free_when_no_active_subscription(monkeypatch):
    monkeypatch.setattr(subscription, "get_engine", lambda: _FakeEngine(select_row=None))
    assert subscription.effective_plan(1) == "free"


def test_effective_plan_professional_when_active(monkeypatch):
    monkeypatch.setattr(subscription, "get_engine",
                        lambda: _FakeEngine(select_row=_Row(plan="professional")))
    assert subscription.effective_plan(1) == "professional"


def test_effective_plan_swallows_db_errors(monkeypatch):
    def boom():
        raise RuntimeError("MySQL fora do ar")
    monkeypatch.setattr(subscription, "get_engine", boom)
    # Nunca pode derrubar a autenticação → assume 'free'.
    assert subscription.effective_plan(1) == "free"


# ── activate_from_payment: guardas + idempotência ───────────────
def test_activate_ignores_non_approved_and_missing_ref():
    assert subscription.activate_from_payment(None) is False
    assert subscription.activate_from_payment({"status": "pending", "id": "1",
                                               "external_reference": "5"}) is False
    # Aprovado mas sem external_reference válido → não ativa.
    assert subscription.activate_from_payment({"status": "approved", "id": "1",
                                               "external_reference": "abc"}) is False


def test_activate_fresh_payment_writes_update(monkeypatch):
    _silence_telemetry(monkeypatch)
    writes = []
    row = _Row(id=5, user_id=42, billing_cycle="annual", status="pending",
               provider_payment_id=None)
    monkeypatch.setattr(subscription, "get_engine",
                        lambda: _FakeEngine(select_row=row, writes=writes))
    ok = subscription.activate_from_payment(
        {"status": "approved", "id": "PAY1", "external_reference": "5"})
    assert ok is True
    # Houve exatamente um UPDATE de ativação.
    assert len(writes) == 1 and "UPDATE" in writes[0][0].upper()
    assert writes[0][1]["pid"] == "PAY1"


def test_activate_is_idempotent_for_same_payment(monkeypatch):
    _silence_telemetry(monkeypatch)
    writes = []
    # Já ativado por este mesmo pagamento.
    row = _Row(id=5, user_id=42, billing_cycle="annual", status="active",
               provider_payment_id="PAY1")
    monkeypatch.setattr(subscription, "get_engine",
                        lambda: _FakeEngine(select_row=row, writes=writes))
    ok = subscription.activate_from_payment(
        {"status": "approved", "id": "PAY1", "external_reference": "5"})
    assert ok is True
    # Nenhum UPDATE: a reentrega do webhook/confirm não reativa nem estende o período.
    assert writes == []


# ── verify_signature do webhook (HMAC) ──────────────────────────
def _make_sig(secret, ts, data_id, request_id):
    manifest = f"id:{data_id};request-id:{request_id};ts:{ts};"
    v1 = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return f"ts={ts},v1={v1}"


def test_verify_signature_accepts_valid_and_rejects_tampered(monkeypatch):
    monkeypatch.setattr(settings, "MERCADOPAGO_WEBHOOK_SECRET", "shh", raising=False)
    header = _make_sig("shh", "1700000000", "abc123", "req-1")
    assert payments.verify_signature(signature_header=header,
                                     request_id="req-1", data_id="abc123") is True
    # v1 adulterado.
    bad = header[:-2] + ("00" if not header.endswith("00") else "11")
    assert payments.verify_signature(signature_header=bad,
                                     request_id="req-1", data_id="abc123") is False
    # data.id divergente.
    assert payments.verify_signature(signature_header=header,
                                     request_id="req-1", data_id="other") is False


def test_verify_signature_requires_secret_and_header(monkeypatch):
    monkeypatch.setattr(settings, "MERCADOPAGO_WEBHOOK_SECRET", "", raising=False)
    assert payments.verify_signature(signature_header="ts=1,v1=x",
                                     request_id="r", data_id="d") is False
    monkeypatch.setattr(settings, "MERCADOPAGO_WEBHOOK_SECRET", "shh", raising=False)
    assert payments.verify_signature(signature_header=None,
                                     request_id="r", data_id="d") is False


# ── Rotas: guardas de auth e de configuração ────────────────────
def _client():
    return TestClient(app_module.app)


def test_get_subscription_requires_auth():
    # Sem Authorization → 401 (não toca no banco: token vazio resolve None).
    resp = _client().get("/api/subscription")
    assert resp.status_code == 401


def test_checkout_returns_503_when_mercadopago_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "MERCADOPAGO_ACCESS_TOKEN", "", raising=False)
    resp = _client().post("/api/subscription/checkout", json={"cycle": "monthly"})
    assert resp.status_code == 503


def test_checkout_validates_cycle(monkeypatch):
    # cycle inválido → 422 (validação do Pydantic, antes de qualquer I/O).
    monkeypatch.setattr(settings, "MERCADOPAGO_ACCESS_TOKEN", "TEST-x", raising=False)
    resp = _client().post("/api/subscription/checkout", json={"cycle": "lifetime"})
    assert resp.status_code == 422
