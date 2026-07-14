"""
Testes do pipeline de ingestão de analytics (FastAPI TestClient).

Não precisa de MongoDB / MySQL reais: ``resolve_site`` e ``get_db`` são
substituídos por fakes via monkeypatch. O TestClient é usado SEM bloco ``with``
para que o lifespan do app (que tocaria os bancos reais) não rode — a mesma
abordagem do ``test_tts.py``.
"""
from fastapi.testclient import TestClient

import app as app_module
import services.ingest as ingest_mod
from services import sanitizer
from services.visitor import visitor_hash

SITE_KEY = "01ARZ3NDEKTSV4RRFFQ69G5FAV"  # ULID base32 de Crockford válido


# ── Fakes ───────────────────────────────────────────────────────
class FakeCollection:
    def __init__(self):
        self.docs = []

    def insert_many(self, docs, ordered=True):
        self.docs.extend(docs)


class FakeDB:
    def __init__(self):
        self.events = FakeCollection()

    def __getitem__(self, _name):
        return self.events


def _patch_backends(monkeypatch):
    """Liga o ingest_events a fakes em memória; retorna a coleção de eventos."""
    fake_db = FakeDB()
    monkeypatch.setattr(ingest_mod, "get_db", lambda: fake_db)
    monkeypatch.setattr(
        ingest_mod, "resolve_site",
        lambda key: (1, 1) if key == SITE_KEY else None,
    )
    return fake_db.events


def _client():
    return TestClient(app_module.app)


# ── Sanitizador (puro) ──────────────────────────────────────────
def test_normalize_path_strips_query_and_ids():
    assert sanitizer.normalize_path("/user/123?token=abc") == "/user/:id"
    assert sanitizer.normalize_path("/checkout/") == "/checkout"
    assert sanitizer.normalize_path("/a/01ARZ3NDEKTSV4RRFFQ69G5FAV/edit") == "/a/:id/edit"
    assert sanitizer.normalize_path("") == "/"
    assert sanitizer.normalize_path(None) == "/"


def test_sanitize_detail_drops_value_for_form_error():
    out = sanitizer.sanitize_detail(
        "form_error", {"field": "email", "code": "invalid_format", "value": "italo@x.com"}
    )
    assert out == {"field": "email", "code": "invalid_format"}
    assert "value" not in out


def test_sanitize_detail_unknown_type_is_empty():
    assert sanitizer.sanitize_detail("mystery", {"anything": 1}) == {}


def test_wcag_audit_type_is_allowed_and_whitelisted():
    assert sanitizer.is_allowed_type("wcag_audit")
    out = sanitizer.sanitize_detail("wcag_audit", {
        "level": "A", "score": 73, "violations": 4, "contrast": 2,
        "missing_alt": 0, "no_h1": 1, "secret": "drop-me",
    })
    assert out == {"level": "A", "score": 73, "violations": 4,
                   "contrast": 2, "missing_alt": 0, "no_h1": 1}
    assert "secret" not in out


def test_wcag_issue_types_keep_only_selector():
    for t in ("alt_issue", "label_issue", "name_issue"):
        assert sanitizer.is_allowed_type(t)
        out = sanitizer.sanitize_detail(t, {"selector": "input#email", "value": "x@y.com"})
        assert out == {"selector": "input#email"}


def test_sanitize_a11y_keeps_only_known_flags():
    out = sanitizer.sanitize_a11y(
        {"high_contrast": True, "font_scale": 1.5, "secret": "x", "nested": {"a": 1}}
    )
    assert out == {"high_contrast": True, "font_scale": 1.5}


# ── visitor_hash ────────────────────────────────────────────────
def test_visitor_hash_is_stable_per_day_and_rotates():
    a = visitor_hash(1, "9.9.9.9", "UA", day="2026-06-21")
    a2 = visitor_hash(1, "9.9.9.9", "UA", day="2026-06-21")
    b = visitor_hash(1, "9.9.9.9", "UA", day="2026-06-22")
    assert a == a2                 # determinístico dentro de um dia
    assert a != b                  # rotaciona diariamente
    assert len(a) == 64 and all(c in "0123456789abcdef" for c in a)


def test_visitor_hash_depends_on_ip():
    assert visitor_hash(1, "1.1.1.1", "UA", day="2026-06-21") != \
        visitor_hash(1, "2.2.2.2", "UA", day="2026-06-21")


# ── /api/collect ────────────────────────────────────────────────
def test_collect_sanitizes_and_never_stores_value_or_ip(monkeypatch):
    events = _patch_backends(monkeypatch)
    resp = _client().post("/api/collect", json={
        "site_key": SITE_KEY,
        "events": [
            {"type": "page_view", "ts": 1718900000000, "path": "/user/123?token=abc"},
            {"type": "form_error", "path": "/checkout",
             "detail": {"field": "email", "code": "required", "value": "italo@x.com"}},
        ],
    })
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"accepted": 2, "dropped": 0}

    # Caminho normalizado, sem id vazado.
    page = next(d for d in events.docs if d["meta"]["type"] == "page_view")
    assert page["meta"]["path"] == "/user/:id"

    # form_error guarda só field+code; value nunca é persistido.
    err = next(d for d in events.docs if d["meta"]["type"] == "form_error")
    assert err["detail"] == {"field": "email", "code": "required"}

    # Pseudônimo do visitante presente; IP bruto nunca armazenado no doc.
    for d in events.docs:
        assert isinstance(d["visitor"], str) and len(d["visitor"]) == 64
        assert "ip" not in d
        assert d["meta"]["org_id"] == 1 and d["meta"]["site_id"] == 1


def test_collect_drops_unknown_event_types(monkeypatch):
    events = _patch_backends(monkeypatch)
    resp = _client().post("/api/collect", json={
        "site_key": SITE_KEY,
        "events": [
            {"type": "page_view", "path": "/"},
            {"type": "evil_exfiltrate", "path": "/", "detail": {"x": 1}},
        ],
    })
    assert resp.status_code == 200
    assert resp.json() == {"accepted": 1, "dropped": 1}
    assert all(d["meta"]["type"] != "evil_exfiltrate" for d in events.docs)


def test_collect_accepts_wcag_audit_and_issues(monkeypatch):
    events = _patch_backends(monkeypatch)
    resp = _client().post("/api/collect", json={
        "site_key": SITE_KEY,
        "events": [
            {"type": "wcag_audit", "path": "/",
             "detail": {"level": "A", "score": 80, "violations": 3, "contrast": 2}},
            {"type": "alt_issue", "path": "/", "detail": {"selector": "img.logo"}},
        ],
    })
    assert resp.status_code == 200
    assert resp.json() == {"accepted": 2, "dropped": 0}
    audit = next(d for d in events.docs if d["meta"]["type"] == "wcag_audit")
    assert audit["detail"]["level"] == "A"
    assert audit["detail"]["violations"] == 3


def test_collect_unknown_site_key_is_404(monkeypatch):
    _patch_backends(monkeypatch)
    resp = _client().post("/api/collect", json={
        "site_key": "unknown_key_123456",
        "events": [{"type": "page_view", "path": "/"}],
    })
    assert resp.status_code == 404


def test_collect_empty_batch_is_422(monkeypatch):
    _patch_backends(monkeypatch)
    resp = _client().post("/api/collect", json={"site_key": SITE_KEY, "events": []})
    assert resp.status_code == 422


# ── Telemetria estendida: fan-out + user_id opcional ────────────
def _patch_fanout(monkeypatch):
    """Captura as chamadas de fan-out de telemetria sem tocar no Mongo real."""
    import services.telemetry as tel

    calls = {"perf": [], "err": [], "sess_start": [], "sess_end": []}
    monkeypatch.setattr(tel, "record_performance", lambda **kw: calls["perf"].append(kw))
    monkeypatch.setattr(tel, "log_error", lambda **kw: calls["err"].append(kw))
    monkeypatch.setattr(tel, "start_session", lambda **kw: calls["sess_start"].append(kw))
    monkeypatch.setattr(tel, "end_session", lambda **kw: calls["sess_end"].append(kw))
    return calls


def test_collect_fans_out_dedicated_types_and_attaches_user_id(monkeypatch):
    events = _patch_backends(monkeypatch)
    calls = _patch_fanout(monkeypatch)
    # Token válido → user_id 42; sem tocar no MySQL.
    import services.identity as ident
    monkeypatch.setattr(ident, "user_id_from_token", lambda t: 42 if t == "tok" else None)

    resp = _client().post("/api/collect", json={
        "site_key": SITE_KEY, "auth_token": "tok",
        "plugin_version": "3.5.0", "session_id": "S1",
        "events": [
            {"type": "page_view", "path": "/"},
            {"type": "perf_sample", "path": "/", "detail": {"action": "plugin_startup", "ms": 12}},
            {"type": "client_error", "path": "/", "detail": {"message": "boom", "lineno": 5}},
            {"type": "session_start", "path": "/", "detail": {"os": "windows", "language": "pt-BR"}},
            {"type": "session_end", "path": "/", "detail": {"duration_ms": 999}},
        ],
    })
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"accepted": 5, "dropped": 0}

    # Só page_view vai para ``events``; os tipos dedicados fazem fan-out.
    assert [d["meta"]["type"] for d in events.docs] == ["page_view"]
    pv = events.docs[0]
    assert pv["meta"]["user_id"] == 42            # identidade carimbada
    assert pv["meta"]["session_id"] == "S1"
    assert pv["meta"]["plugin_version"] == "3.5.0"

    # Fan-out chamou as coleções certas, com user_id propagado.
    assert calls["perf"] and calls["perf"][0]["user_id"] == 42
    assert calls["err"] and calls["err"][0]["message"] == "boom"
    assert calls["sess_start"] and calls["sess_start"][0]["session_id"] == "S1"
    assert calls["sess_end"] and calls["sess_end"][0]["duration_ms"] == 999


def test_collect_without_token_stays_anonymous(monkeypatch):
    events = _patch_backends(monkeypatch)
    _patch_fanout(monkeypatch)
    resp = _client().post("/api/collect", json={
        "site_key": SITE_KEY,
        "events": [{"type": "page_view", "path": "/"}],
    })
    assert resp.status_code == 200
    assert events.docs[0]["meta"]["user_id"] is None     # anônimo por padrão
    assert isinstance(events.docs[0]["visitor"], str)    # mantém o hash de visitante
