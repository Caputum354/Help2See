"""
Help2See 3.0 — FastAPI backend entrypoint.

Run (development):
    uvicorn app:app --reload

Run (production):
    uvicorn app:app --host 127.0.0.1 --port 8000

Interactive docs: http://127.0.0.1:8000/docs
"""
import logging
import random
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routes import auth, collect, contact, health, subscription, tts, voices
from services import telemetry
from utils.config import settings

# ── Logging ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("help2see")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown diagnostics (modern replacement for on_event)."""
    logger.info(
        "Help2See backend 3.0.0 | elevenlabs_configured=%s | model=%s | voice=%s",
        settings.elevenlabs_configured,
        settings.ELEVENLABS_MODEL_ID,
        settings.ELEVENLABS_VOICE_ID or "auto (GET /api/voices)",
    )
    if not settings.elevenlabs_configured:
        logger.warning(
            "ELEVENLABS_API_KEY ausente — o plugin usará a voz do navegador."
        )

    # Bootstrap do analytics. Falhas aqui NÃO podem derrubar o proxy de TTS,
    # então são logadas e o app sobe assim mesmo (/api/collect vai então dar
    # erro por requisição até o Mongo ficar acessível).
    try:
        from services.mongo import ensure_collections

        ensure_collections()
    except Exception as exc:  # noqa: BLE001 — telemetria é "best-effort" no startup
        # Sem traceback: o MongoDB é opcional (só o pipeline de analytics usa).
        # A API de auth/TTS sobe normalmente; só /api/collect fica indisponível.
        logger.warning(
            "MongoDB indisponível — analytics desligado (auth/TTS seguem normais). "
            "Detalhe: %s", exc,
        )

    scheduler = None
    if settings.SCHEDULER_ENABLED:
        scheduler = _start_scheduler()

    yield

    if scheduler is not None:
        scheduler.shutdown(wait=False)
    telemetry.shutdown()  # encerra o executor de telemetria (não espera writes)
    logger.info("Help2See backend encerrado.")


def _start_scheduler():
    """Roda o rollup diário de hora em hora, in-process (opcional — ver SCHEDULER_ENABLED)."""
    from apscheduler.schedulers.background import BackgroundScheduler

    from jobs.aggregate import run as run_aggregation

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(run_aggregation, "interval", hours=1, id="aggregate",
                      max_instances=1, coalesce=True)
    scheduler.start()
    logger.info("Scheduler de agregação iniciado (intervalo de 1h).")
    return scheduler


app = FastAPI(
    title="Help2See API",
    version="3.0.0",
    description=(
        "Backend services for the Help2See accessibility plugin "
        "(ElevenLabs TTS proxy + reserved AI hooks)."
    ),
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Endpoints excluídos do timing (evita ruído e loop de telemetria).
_TIMING_SKIP = {"/api/health", "/api/collect"}


@app.middleware("http")
async def _telemetry_timing(request: Request, call_next):
    """Mede o tempo de cada chamada de API e amostra para ``performance``.

    Não bloqueia: o write é fire-and-forget. Pula health/collect (ruído/loop) e
    respeita ``API_TELEMETRY_SAMPLE_RATE`` (0 desliga).
    """
    start = time.perf_counter()
    response = await call_next(request)
    try:
        path = request.url.path
        if (settings.TELEMETRY_ENABLED
                and settings.API_TELEMETRY_SAMPLE_RATE > 0
                and path.startswith("/api")
                and path not in _TIMING_SKIP
                and random.random() < settings.API_TELEMETRY_SAMPLE_RATE):
            ms = round((time.perf_counter() - start) * 1000, 1)
            telemetry.record_performance(
                action=f"{request.method} {path}", ms=ms, path=path,
            )
    except Exception:  # noqa: BLE001 — telemetria nunca afeta a resposta
        pass
    return response


# ── Error visibility ────────────────────────────────────────────
def _safe_preview(raw, limit: int = 500) -> str:
    """Best-effort, never-throwing preview of a raw request body for logs."""
    if raw is None:
        return "<vazio>"
    if isinstance(raw, bytes):
        text = raw.decode("utf-8", errors="replace")
    else:
        text = str(raw)
    return text[:limit]


@app.exception_handler(RequestValidationError)
async def on_validation_error(request: Request, exc: RequestValidationError):
    """Log body-parsing/validation problems so they are visible server-side."""
    logger.warning(
        "RequestValidationError em %s %s | body=%s | erros=%s",
        request.method,
        request.url.path,
        _safe_preview(exc.body),
        exc.errors(),
    )
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "mensagem": "Corpo da requisição inválido. "
            "Envie JSON UTF-8 com Content-Type: application/json.",
        },
    )


@app.exception_handler(500)
async def on_internal_error(request: Request, exc: Exception):
    logger.exception("Erro interno em %s %s", request.method, request.url.path)
    # Espelha a exceção do servidor na coleção ``errors`` (fire-and-forget).
    telemetry.log_error(
        kind="server", message=f"{type(exc).__name__}: {exc}",
        source=request.url.path, path=request.url.path,
        context={"method": request.method, "status": 500},
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Erro interno do servidor."},
    )


# ── Routers ─────────────────────────────────────────────────────
app.include_router(health.router, prefix="/api")
app.include_router(tts.router, prefix="/api")
app.include_router(voices.router, prefix="/api")
app.include_router(collect.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(subscription.router, prefix="/api")
app.include_router(contact.router, prefix="/api")


@app.get("/", tags=["system"])
def root():
    return {
        "service": "help2see-backend",
        "version": "3.0.0",
        "docs": "/docs",
    }


# -----------------------------
# ENTRYPOINT
# -----------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        reload=False,  # importante para evitar shutdown no Windows
    )
