"""Health-check route."""
import logging

from fastapi import APIRouter
from sqlalchemy import text

from models.schemas import HealthResponse
from utils.config import settings

logger = logging.getLogger("help2see.health")

router = APIRouter()


def _mongo_ok() -> bool:
    """Ping rápido ao MongoDB; nunca levanta (retorna False em falha)."""
    try:
        from services.mongo import get_client

        get_client().admin.command("ping")
        return True
    except Exception:  # noqa: BLE001 — health check é tolerante
        return False


def _mysql_ok() -> bool:
    """SELECT 1 no MySQL; nunca levanta (retorna False em falha)."""
    try:
        from services.mysql import get_engine

        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001 — health check é tolerante
        return False


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health():
    return HealthResponse(
        status="ok",
        service="help2see-backend",
        version="3.0.0",
        elevenlabs_configured=settings.elevenlabs_configured,
        model_id=settings.ELEVENLABS_MODEL_ID,
        # Non-secret: just the voice ID (or "auto" when resolved dynamically).
        voice_id_configured=settings.ELEVENLABS_VOICE_ID or "auto",
        mongo_ok=_mongo_ok(),
        mysql_ok=_mysql_ok(),
    )
