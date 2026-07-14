"""
Voice discovery route.

Returns the voices the configured ElevenLabs account can actually use. This
is the practical fix for the Free-tier HTTP 402 ("Free users cannot use
library voices via the API"): call this endpoint and set ELEVENLABS_VOICE_ID
(or send voice_id) to one of the returned IDs.
"""
import logging

from fastapi import APIRouter, HTTPException

from models.schemas import VoicesResponse
from services.voice_provider import VoiceProviderError, get_provider

logger = logging.getLogger("help2see.voices")

router = APIRouter()


@router.get(
    "/voices",
    response_model=VoicesResponse,
    tags=["voice"],
    summary="Lista as vozes utilizáveis pela conta ElevenLabs",
)
def list_voices() -> VoicesResponse:
    provider = get_provider("elevenlabs")
    if not provider.available:
        raise HTTPException(
            status_code=503,
            detail="Serviço de voz premium indisponível. "
            "Configure ELEVENLABS_API_KEY no backend.",
        )
    try:
        voices = provider.list_voices()
    except VoiceProviderError as exc:
        logger.error(
            "Falha ao listar vozes: upstream=%s code=%s -> %s",
            exc.upstream_status, exc.code, exc.message,
        )
        raise HTTPException(
            status_code=exc.http_status,
            detail={
                "message": exc.message,
                "upstream_status": exc.upstream_status,
                "code": exc.code,
            },
        )
    return VoicesResponse(count=len(voices), voices=voices)
