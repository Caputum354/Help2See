"""
Rota de ingestão de analytics — ``POST /api/collect``.

O plugin acumula eventos em lote e os envia para cá. A rota:
  * valida o ``site_key`` cedo (404 se desconhecido) — ``resolve_site`` é cacheado;
  * conta aceitos/descartados (barato, sem I/O) para a resposta;
  * **agenda a ingestão em background** (BackgroundTasks): resolver o ``user_id``
    e gravar no Mongo acontecem FORA do caminho da resposta, então a API nunca
    bloqueia nem dá erro por causa da telemetria (mesmo Mongo lento/fora).

Usa :class:`EncodingTolerantRoute` para a mesma robustez de encoding/Content-Type
da rota de TTS.
"""
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from models.analytics_schemas import CollectResponse, EventBatch
from services import identity, ingest, sanitizer
from utils.net import client_ip as _client_ip
from utils.request_normalizer import EncodingTolerantRoute

logger = logging.getLogger("help2see.collect")

router = APIRouter(route_class=EncodingTolerantRoute)

COLLECT_RESPONSES = {
    200: {"description": "Lote aceito (aceitos/descartados; gravação assíncrona)."},
    404: {"description": "site_key desconhecido ou inativo."},
    422: {"description": "Corpo JSON inválido."},
}


def _safe_ingest(batch: EventBatch, ip: str, user_agent: str) -> None:
    """Resolve identidade (opcional) e ingere; isolado de qualquer exceção."""
    try:
        user_id = identity.user_id_from_token(batch.auth_token)
        ingest.ingest_events(batch, client_ip=ip, user_agent=user_agent,
                             user_id=user_id)
    except ingest.SiteNotFoundError:
        pass  # site ficou inativo entre a validação e o background — ignora
    except Exception:  # noqa: BLE001 — telemetria nunca pode derrubar nada
        logger.warning("Falha na ingestão em background (descartado).", exc_info=True)


@router.post(
    "/collect",
    response_model=CollectResponse,
    tags=["analytics"],
    summary="Ingere um lote de eventos de telemetria de acessibilidade",
    responses=COLLECT_RESPONSES,
)
def collect(batch: EventBatch, request: Request,
            background_tasks: BackgroundTasks) -> CollectResponse:
    # Valida o tenant cedo (cacheado). 404, não 403, para não confirmar chaves.
    # Referência via módulo ``ingest`` para que o monkeypatch dos testes valha aqui.
    if ingest.resolve_site(batch.site_key) is None:
        raise HTTPException(status_code=404, detail="site_key desconhecido ou inativo.")

    ip = _client_ip(request)
    user_agent = request.headers.get("user-agent", "")

    # Contagem barata (sem I/O) para a resposta; a gravação é assíncrona.
    accepted = sum(1 for ev in batch.events if sanitizer.is_allowed_type(ev.type))
    dropped = len(batch.events) - accepted

    background_tasks.add_task(_safe_ingest, batch, ip, user_agent)
    return CollectResponse(accepted=accepted, dropped=dropped)
