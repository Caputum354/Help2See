"""
Text-to-speech route.

ElevenLabs is called only from the backend. The browser never sees the API
key — it POSTs JSON here and gets ``audio/mpeg`` back. On any failure the
endpoint returns a clean non-2xx response so the plugin falls back to the
free browser voice (Web Speech API).

The router uses :class:`EncodingTolerantRoute` so PowerShell / non-UTF-8
clients can't trigger the opaque "There was an error parsing the body" 400.
"""
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.schemas import TTSRequest
from services.voice_provider import VoiceProviderError, get_provider
from utils.request_normalizer import EncodingTolerantRoute

logger = logging.getLogger("help2see.tts")

router = APIRouter(route_class=EncodingTolerantRoute)

DEFAULT_LANGUAGE = "pt-BR"

# OpenAPI/Swagger metadata so the docs show an MP3 stream, not JSON.
TTS_RESPONSES = {
    200: {
        "description": "Áudio sintetizado (stream MP3).",
        "content": {
            "audio/mpeg": {"schema": {"type": "string", "format": "binary"}}
        },
    },
    402: {"description": "Plano/voz não permitido pela ElevenLabs."},
    422: {"description": "Corpo JSON inválido."},
    429: {"description": "Limite de requisições atingido."},
    502: {"description": "Falha de comunicação com o provedor de voz."},
    503: {"description": "Voz premium não configurada no servidor."},
}


@router.post(
    "/tts",
    tags=["voice"],
    summary="Sintetiza texto em áudio (ElevenLabs)",
    response_class=StreamingResponse,
    responses=TTS_RESPONSES,
)
def text_to_speech(req: TTSRequest) -> StreamingResponse:
    """Recebe ``application/json`` e devolve ``audio/mpeg`` em streaming."""
    provider = get_provider("elevenlabs")

    if not provider.available:
        raise HTTPException(
            status_code=503,
            detail="Serviço de voz premium indisponível. "
            "Configure ELEVENLABS_API_KEY no backend.",
        )

    language = req.language or DEFAULT_LANGUAGE

    try:
        audio = provider.synthesize(req.text, req.voice_id, language)
        return StreamingResponse(audio, media_type="audio/mpeg")

    except VoiceProviderError as exc:
        # Full upstream body was already logged in the provider. Return a
        # clean, mapped error so the plugin degrades to the browser voice.
        logger.error(
            "TTS falhou: upstream=%s code=%s -> %s",
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
