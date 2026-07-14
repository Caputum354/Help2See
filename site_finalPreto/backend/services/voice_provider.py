"""
Voice provider abstraction (server side).

Mirrors the plugin's VoiceProvider design so additional TTS backends
(OpenAI, Azure, Google Cloud) can be added later without touching the
routes. The ElevenLabs key is read from the server config only and never
leaves the backend.

Key behaviours
--------------
* Every upstream failure logs the FULL ElevenLabs response body BEFORE an
  exception is raised (status + parsed JSON / raw text).
* HTTP 401/402/403/404/429/5xx are mapped individually to clear pt-BR
  messages via :class:`VoiceProviderError`.
* Voice resolution is dynamic: a deprecated/library voice that the account
  cannot use (HTTP 402 ``paid_plan_required``) is automatically swapped for
  an owned voice from ``GET /v1/voices`` and retried once.
"""
import logging
from abc import ABC, abstractmethod
from typing import Dict, Iterator, List, Optional

import requests

from utils.config import settings

logger = logging.getLogger("help2see.voice")


# ── Error type ──────────────────────────────────────────────────
class VoiceProviderError(Exception):
    """Normalised TTS provider failure.

    Attributes
    ----------
    http_status: status the API should return to the browser.
    upstream_status: original HTTP status from the provider (or None).
    code: provider-specific machine code (e.g. ``paid_plan_required``).
    message: friendly pt-BR message safe to expose.
    body: raw provider body (for logs/diagnostics, never the API key).
    """

    def __init__(self, message: str, *, http_status: int = 502,
                 upstream_status: Optional[int] = None,
                 code: Optional[str] = None, body=None):
        super().__init__(message)
        self.message = message
        self.http_status = http_status
        self.upstream_status = upstream_status
        self.code = code
        self.body = body


# ── Base interface ──────────────────────────────────────────────
class VoiceProvider(ABC):
    """Interface every TTS provider implements."""

    name: str = "base"

    @property
    @abstractmethod
    def available(self) -> bool:
        ...

    @abstractmethod
    def synthesize(self, text: str, voice_id: Optional[str] = None,
                   language: str = "pt-BR") -> Iterator[bytes]:
        """Yield audio bytes (audio/mpeg)."""
        ...

    def list_voices(self) -> List[Dict[str, str]]:
        """Return voices usable by this account: [{id, name, category}]."""
        raise NotImplementedError(f"{self.name} does not support list_voices().")


# ── ElevenLabs ──────────────────────────────────────────────────
class ElevenLabsProvider(VoiceProvider):
    name = "elevenlabs"

    # Entitlement codes that mean "this voice/plan is not allowed" — these
    # trigger the automatic owned-voice retry.
    _ENTITLEMENT_CODES = {
        "paid_plan_required",
        "free_users_not_allowed",
        "voice_not_allowed",
    }

    def __init__(self):
        self._resolved_voice_id: Optional[str] = None

    # -- config helpers ------------------------------------------
    @property
    def available(self) -> bool:
        return settings.elevenlabs_configured

    def _headers(self, accept: str = "application/json") -> Dict[str, str]:
        return {
            "xi-api-key": settings.ELEVENLABS_API_KEY,  # stays on the server
            "Content-Type": "application/json",
            "Accept": accept,
        }

    # -- voice discovery -----------------------------------------
    def list_voices(self) -> List[Dict[str, str]]:
        url = f"{settings.ELEVENLABS_BASE_URL}/voices"
        resp = requests.get(
            url, headers=self._headers(), timeout=settings.elevenlabs_timeout
        )
        if resp.status_code >= 400:
            self._raise_for_response(resp, context="listar vozes")
        data = resp.json() or {}
        voices = []
        for v in data.get("voices", []):
            voices.append({
                "id": v.get("voice_id", ""),
                "name": v.get("name", ""),
                "category": v.get("category", ""),
            })
        return voices

    def resolve_voice_id(self, requested: Optional[str]) -> str:
        """Pick the voice to use: requested → configured → first owned."""
        if requested and requested != "string":
            return requested
        if settings.ELEVENLABS_VOICE_ID:
            return settings.ELEVENLABS_VOICE_ID
        if self._resolved_voice_id:
            return self._resolved_voice_id
        voices = self.list_voices()
        if not voices:
            raise VoiceProviderError(
                "Nenhuma voz disponível na conta ElevenLabs. "
                "Adicione uma voz em 'My Voices' no painel.",
                http_status=502, code="no_voices_available",
            )
        self._resolved_voice_id = voices[0]["id"]
        logger.info(
            "Voz resolvida automaticamente: %s (%s).",
            voices[0]["name"], self._resolved_voice_id,
        )
        return self._resolved_voice_id

    # -- synthesis -----------------------------------------------
    def synthesize(self, text: str, voice_id: Optional[str] = None,
                   language: str = "pt-BR") -> Iterator[bytes]:
        """Return an audio iterator.

        The upstream POST is performed *eagerly* so HTTP errors (401/402/…)
        raise here — inside the route's try/except — instead of later, while
        StreamingResponse is already streaming. Only the audio body is read
        lazily/iteratively.
        """
        vid = self.resolve_voice_id(voice_id)
        try:
            return self._stream(text, vid)
        except VoiceProviderError as exc:
            # Automatic workaround for the classic Free-tier 402: the
            # configured voice is a library/legacy voice the account can't
            # use via the API. Resolve an owned voice and retry once.
            retryable = (
                settings.ELEVENLABS_AUTO_RESOLVE_VOICE
                and exc.upstream_status == 402
                and (exc.code in self._ENTITLEMENT_CODES)
            )
            if not retryable:
                raise
            logger.warning(
                "Voz %s rejeitada (402/%s). Tentando uma voz da conta…",
                vid, exc.code,
            )
            self._resolved_voice_id = None  # force fresh discovery
            owned = self.list_voices()
            alt = next((v["id"] for v in owned if v["id"] and v["id"] != vid), None)
            if not alt:
                raise
            self._resolved_voice_id = alt
            logger.info("Repetindo síntese com voz da conta: %s.", alt)
            return self._stream(text, alt)

    def _stream(self, text: str, voice_id: str) -> Iterator[bytes]:
        url = (
            f"{settings.ELEVENLABS_BASE_URL}"
            f"/text-to-speech/{voice_id}/stream"
            f"?output_format={settings.ELEVENLABS_OUTPUT_FORMAT}"
        )
        payload = {
            "text": text,
            "model_id": settings.ELEVENLABS_MODEL_ID,
            # language is auto-detected by eleven_multilingual_v2; sending an
            # unsupported language_code can cause a 400, so it is omitted.
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }

        try:
            resp = requests.post(
                url, json=payload, headers=self._headers("audio/mpeg"),
                stream=True, timeout=settings.elevenlabs_timeout,
            )
        except requests.RequestException as exc:
            logger.exception("Falha de rede ao contatar a ElevenLabs.")
            raise VoiceProviderError(
                "Falha de comunicação com o serviço de voz.",
                http_status=502, code="network_error",
            ) from exc

        if resp.status_code >= 400:
            self._raise_for_response(resp, context="gerar áudio")

        def _iter() -> Iterator[bytes]:
            try:
                for chunk in resp.iter_content(chunk_size=4096):
                    if chunk:
                        yield chunk
            finally:
                resp.close()

        return _iter()

    # -- diagnostics + error mapping -----------------------------
    def _raise_for_response(self, resp: requests.Response, *, context: str):
        """Log the FULL response body, then raise a mapped VoiceProviderError.

        Implements the requested 'print everything before raising' pattern.
        """
        status = resp.status_code

        # 1) Always surface the raw body in the server log first.
        body = None
        try:
            body = resp.json()
            logger.error("ElevenLabs STATUS = %s | BODY = %s", status, body)
        except ValueError:
            body = resp.text
            logger.error("ElevenLabs STATUS = %s | BODY(text) = %s", status, body)

        # 2) Extract ElevenLabs' machine code + message when present.
        code = None
        upstream_msg = ""
        if isinstance(body, dict):
            detail = body.get("detail")
            if isinstance(detail, dict):
                code = detail.get("status") or detail.get("code")
                upstream_msg = detail.get("message", "") or ""
            elif isinstance(detail, str):
                upstream_msg = detail

        # 3) Map to a friendly pt-BR message + the status we return to the UI.
        mapping = {
            401: ("Chave de API ElevenLabs inválida ou não autorizada.", 502),
            402: ("Plano/voz não permitido pela ElevenLabs. "
                  "Verifique GET /api/voices e use uma voz da sua conta.", 402),
            403: ("Acesso negado pela ElevenLabs (permissões da chave).", 502),
            404: ("Voz ou endpoint não encontrado na ElevenLabs. "
                  "Confira o voice_id em GET /api/voices.", 502),
            429: ("Limite de requisições da ElevenLabs atingido. "
                  "Tente novamente em instantes.", 429),
        }
        if status in mapping:
            friendly, http_status = mapping[status]
        elif 500 <= status < 600:
            friendly, http_status = (
                "Erro interno no serviço de voz (ElevenLabs).", 502)
        else:
            friendly, http_status = (
                f"Falha ao {context} (upstream {status}).", 502)

        raise VoiceProviderError(
            friendly, http_status=http_status, upstream_status=status,
            code=code, body=body,
        )


# ── Future providers — ARCHITECTURE ONLY (not implemented yet) ──
class _UnconfiguredProvider(VoiceProvider):
    """Reserved slot for an upcoming provider; advertises as unavailable."""

    @property
    def available(self) -> bool:
        return False

    def synthesize(self, text, voice_id=None, language="pt-BR"):
        raise VoiceProviderError(
            f"Provedor '{self.name}' ainda não implementado.",
            http_status=501, code="not_implemented",
        )


class OpenAITTSProvider(_UnconfiguredProvider):
    name = "openai"


class AzureSpeechProvider(_UnconfiguredProvider):
    name = "azure"


class GoogleCloudTTSProvider(_UnconfiguredProvider):
    name = "google"


# ── Registry ────────────────────────────────────────────────────
_PROVIDERS: Dict[str, VoiceProvider] = {
    p.name: p for p in (
        ElevenLabsProvider(),
        OpenAITTSProvider(),
        AzureSpeechProvider(),
        GoogleCloudTTSProvider(),
    )
}


def get_provider(name: str = "elevenlabs") -> VoiceProvider:
    return _PROVIDERS.get(name, _PROVIDERS["elevenlabs"])
