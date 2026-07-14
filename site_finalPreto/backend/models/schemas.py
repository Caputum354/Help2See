"""Pydantic models for request/response validation."""
from typing import List, Optional

from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    """Payload sent by the plugin's ElevenLabsVoiceProvider.

    Explicit and simple on purpose — the body is plain ``application/json``:

        {
          "text": "Olá, mundo!",
          "voice_id": null,
          "language": "pt-BR"
        }
    """

    text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Texto a ser sintetizado em fala.",
    )
    voice_id: Optional[str] = Field(
        default=None,
        description="ID da voz ElevenLabs. Se ausente, usa a voz padrão do servidor.",
    )
    language: str = Field(
        default="pt-BR",
        description="Tag de idioma BCP-47 (padrão pt-BR).",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"text": "Olá, mundo!", "voice_id": None, "language": "pt-BR"}
            ]
        }
    }


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    # Boolean only — we never expose whether/what the key is, just that the
    # provider is ready. The key itself never leaves the server.
    elevenlabs_configured: bool
    # Non-secret diagnostics so /api/health is useful when debugging.
    model_id: Optional[str] = None
    voice_id_configured: Optional[str] = None
    # Conectividade dos bancos (ping rápido; None = não checado/erro).
    mongo_ok: Optional[bool] = None
    mysql_ok: Optional[bool] = None


class VoiceInfo(BaseModel):
    id: str
    name: str
    category: str = ""


class VoicesResponse(BaseModel):
    count: int
    voices: List[VoiceInfo]
