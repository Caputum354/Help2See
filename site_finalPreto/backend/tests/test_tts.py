"""
Automated tests for the Help2See TTS backend (FastAPI TestClient).

Run from the backend/ folder:
    pip install -r requirements-dev.txt
    pytest -q

No real network and no API key are needed — ``requests`` is monkeypatched
to simulate the ElevenLabs API (including the 402 Free-tier case).
"""
import importlib

import pytest
from fastapi.testclient import TestClient


# ── Fake ElevenLabs HTTP responses ──────────────────────────────
class FakeResp:
    def __init__(self, status_code, json_body=None, text="", chunks=None):
        self.status_code = status_code
        self._json = json_body
        self.text = text if text else ("" if json_body is None else "json")
        self._chunks = chunks or [b"\xff\xf3ID3", b"FAKE-MP3"]

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json

    def iter_content(self, chunk_size=4096):
        for c in self._chunks:
            yield c

    def close(self):
        pass


@pytest.fixture()
def env(monkeypatch):
    """Reload modules with a fake key + blank configured voice."""
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "")
    monkeypatch.setenv("ELEVENLABS_AUTO_RESOLVE_VOICE", "true")

    import utils.config as config
    importlib.reload(config)
    import services.voice_provider as vp
    importlib.reload(vp)
    import routes.tts as tts
    importlib.reload(tts)
    import routes.voices as voices
    importlib.reload(voices)
    import routes.health as health
    importlib.reload(health)
    import app as app_module
    importlib.reload(app_module)

    return app_module, vp


@pytest.fixture()
def client(env):
    app_module, _ = env
    return TestClient(app_module.app)


# ── Health / docs ───────────────────────────────────────────────
def test_health_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["elevenlabs_configured"] is True
    assert data["model_id"] == "eleven_multilingual_v2"


def test_openapi_tts_is_audio(client):
    spec = client.get("/openapi.json").json()
    ct = spec["paths"]["/api/tts"]["post"]["responses"]["200"]["content"]
    assert "audio/mpeg" in ct


# ── Happy path ──────────────────────────────────────────────────
def test_tts_valid_json_returns_audio(client, env, monkeypatch):
    _, vp = env
    monkeypatch.setattr(vp.requests, "get",
                        lambda *a, **k: FakeResp(200, {"voices": [
                            {"voice_id": "OWNED1", "name": "Aria", "category": "premade"}]}))
    monkeypatch.setattr(vp.requests, "post", lambda *a, **k: FakeResp(200))
    resp = client.post("/api/tts",
                       json={"text": "Olá, mundo!", "language": "pt-BR"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("audio/mpeg")
    assert len(resp.content) > 0


def test_tts_powershell_cp1252_body_is_tolerated(client, env, monkeypatch):
    _, vp = env
    monkeypatch.setattr(vp.requests, "get",
                        lambda *a, **k: FakeResp(200, {"voices": [
                            {"voice_id": "OWNED1", "name": "Aria", "category": "premade"}]}))
    monkeypatch.setattr(vp.requests, "post", lambda *a, **k: FakeResp(200))
    body = '{"text":"Configuração — ção"}'.encode("cp1252")
    resp = client.post("/api/tts", content=body,
                       headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert resp.status_code == 200, resp.text


def test_tts_empty_text_is_422(client):
    resp = client.post("/api/tts", json={"text": ""})
    assert resp.status_code == 422


# ── Voice discovery ─────────────────────────────────────────────
def test_voices_endpoint_lists_account_voices(client, env, monkeypatch):
    _, vp = env
    monkeypatch.setattr(vp.requests, "get", lambda *a, **k: FakeResp(200, {"voices": [
        {"voice_id": "v1", "name": "Aria", "category": "premade"},
        {"voice_id": "v2", "name": "Bia", "category": "cloned"},
    ]}))
    resp = client.get("/api/voices")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2
    assert data["voices"][0]["id"] == "v1"


# ── The 402 root cause ──────────────────────────────────────────
ERR_402 = {
    "detail": {
        "type": "payment_required",
        "code": "paid_plan_required",
        "status": "paid_plan_required",
        "message": "Free users cannot use library voices via the API.",
    }
}


def test_tts_402_autoretry_with_owned_voice(client, env, monkeypatch):
    """Configured/legacy voice is rejected (402); backend retries an owned one."""
    _, vp = env
    # First POST → 402 entitlement; second POST → 200.
    posts = [FakeResp(402, ERR_402), FakeResp(200)]
    monkeypatch.setattr(vp.requests, "post", lambda *a, **k: posts.pop(0))
    monkeypatch.setattr(vp.requests, "get", lambda *a, **k: FakeResp(200, {"voices": [
        {"voice_id": "OWNED", "name": "Aria", "category": "premade"}]}))
    resp = client.post("/api/tts", json={"text": "Olá", "voice_id": "21m00Tcm4TlvDq8ikWAM"})
    assert resp.status_code == 200
    assert len(resp.content) > 0


def test_tts_402_maps_cleanly_when_autoretry_disabled(env, monkeypatch):
    monkeypatch.setenv("ELEVENLABS_AUTO_RESOLVE_VOICE", "false")
    import utils.config as config
    importlib.reload(config)
    import services.voice_provider as vp
    importlib.reload(vp)
    import routes.tts as tts
    importlib.reload(tts)
    import app as app_module
    importlib.reload(app_module)

    monkeypatch.setattr(vp.requests, "post", lambda *a, **k: FakeResp(402, ERR_402))
    cl = TestClient(app_module.app)
    resp = cl.post("/api/tts", json={"text": "Olá", "voice_id": "21m00Tcm4TlvDq8ikWAM"})
    assert resp.status_code == 402
    detail = resp.json()["detail"]
    assert detail["code"] == "paid_plan_required"
    assert detail["upstream_status"] == 402


def test_tts_429_maps_to_429(client, env, monkeypatch):
    _, vp = env
    monkeypatch.setattr(vp.requests, "get",
                        lambda *a, **k: FakeResp(200, {"voices": [
                            {"voice_id": "OWNED", "name": "Aria", "category": "premade"}]}))
    monkeypatch.setattr(vp.requests, "post", lambda *a, **k: FakeResp(
        429, {"detail": {"status": "too_many_requests", "message": "slow down"}}))
    resp = client.post("/api/tts", json={"text": "Olá"})
    assert resp.status_code == 429


def test_tts_401_maps_to_502(client, env, monkeypatch):
    _, vp = env
    monkeypatch.setattr(vp.requests, "get",
                        lambda *a, **k: FakeResp(200, {"voices": [
                            {"voice_id": "OWNED", "name": "Aria", "category": "premade"}]}))
    monkeypatch.setattr(vp.requests, "post", lambda *a, **k: FakeResp(
        401, {"detail": {"status": "invalid_api_key", "message": "bad key"}}))
    resp = client.post("/api/tts", json={"text": "Olá"})
    assert resp.status_code == 502
    assert resp.json()["detail"]["upstream_status"] == 401
