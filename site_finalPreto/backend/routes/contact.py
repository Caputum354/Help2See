"""
Rota do formulário de contato comercial — ``/api/contact``.

  POST /contact → valida, aplica rate-limit por IP e encaminha por e-mail
                  para a caixa da equipe (Reply-To = visitante)

Sem autenticação (é o funil de vendas do site público), por isso o rate-limit
é mais importante aqui: reusa os mesmos limites do fluxo de recuperação de
senha (``RESET_RATE_*``). Nada é persistido no servidor — o pedido vira só um
e-mail (privacy-first, como o resto do produto).
"""
import logging

from fastapi import APIRouter, HTTPException, Request

from models.contact_schemas import ContactRequest, ContactResponse
from services import mailer, rate_limit
from utils.config import settings
from utils.net import client_ip
from utils.request_normalizer import EncodingTolerantRoute

logger = logging.getLogger("help2see.contact")

router = APIRouter(prefix="/contact", tags=["contact"],
                   route_class=EncodingTolerantRoute)


@router.post("", response_model=ContactResponse,
             summary="Envia um pedido de contato comercial")
def contact(req: ContactRequest, request: Request) -> ContactResponse:
    ip = client_ip(request)
    if not rate_limit.allow(f"contact:{ip}", settings.RESET_RATE_MAX_HITS,
                            settings.RESET_RATE_WINDOW_SECONDS):
        raise HTTPException(status_code=429,
                            detail="Muitos envios. Tente novamente em alguns minutos.")

    delivered = mailer.send_contact_request(
        name=req.name.strip(), email=str(req.email), company=req.company.strip(),
        phone=(req.phone or "").strip() or None,
        subject=(req.subject or "").strip() or None,
        message=(req.message or "").strip() or None,
    )
    if not delivered:
        # SMTP indisponível/não configurado: o front decide guardar localmente.
        logger.warning("Pedido de contato de %s aceito mas não entregue.", req.email)
    return ContactResponse(ok=True, delivered=delivered)
