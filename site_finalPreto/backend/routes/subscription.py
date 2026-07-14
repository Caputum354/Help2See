"""
Rotas da assinatura do plano Profissional — ``/api/subscription/*``.

  GET  /subscription          → estado da assinatura do usuário logado (Bearer)
  POST /subscription/checkout → cria a preference do Checkout Pro (Bearer) → init_point
  POST /subscription/confirm  → confirma o pagamento de retorno (Bearer) e ativa
  POST /subscription/cancel   → cancela a assinatura ativa (Bearer)
  POST /subscription/webhook  → notificação do Mercado Pago (sem auth, assinada)

MySQL é a fonte da verdade (``services.subscription``); o pagamento é processado
pelo Mercado Pago (``services.payments``). ``user_id`` é sempre derivado do token
de sessão no servidor — nunca informado pelo cliente. Preço é decidido no servidor.
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

from models.subscription_schemas import (
    CheckoutRequest, CheckoutResponse, ConfirmRequest, SubscriptionOut,
)
from services import auth as auth_service
from services import payments, subscription
from utils.config import settings
from utils.request_normalizer import EncodingTolerantRoute

logger = logging.getLogger("help2see.subscription")

router = APIRouter(prefix="/subscription", tags=["subscription"],
                   route_class=EncodingTolerantRoute)


def _bearer(request: Request) -> Optional[str]:
    """Extrai o token de 'Authorization: Bearer <token>'."""
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def _require_user(request: Request) -> dict:
    """Resolve o usuário logado pelo Bearer; 401 se a sessão for inválida."""
    user = auth_service.get_user_by_token(_bearer(request) or "")
    if not user:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada.")
    return user


@router.get("", response_model=SubscriptionOut, summary="Assinatura do usuário logado")
def get_subscription(request: Request) -> SubscriptionOut:
    user = _require_user(request)
    return SubscriptionOut(**subscription.subscription_view(user["id"]))


@router.post("/checkout", response_model=CheckoutResponse,
             summary="Inicia o checkout do plano Profissional (Mercado Pago)")
def checkout(req: CheckoutRequest, request: Request) -> CheckoutResponse:
    if not settings.mercadopago_configured:
        raise HTTPException(status_code=503,
                            detail="Pagamento indisponível no momento.")
    user = _require_user(request)
    try:
        init_point = subscription.start_checkout(
            user_id=user["id"], cycle=req.cycle, payer_email=user.get("email"),
        )
    except payments.PaymentsUnavailable:
        raise HTTPException(status_code=503,
                            detail="Pagamento indisponível no momento.")
    except Exception:  # noqa: BLE001
        logger.exception("Falha ao criar checkout da assinatura.")
        raise HTTPException(status_code=502,
                            detail="Não foi possível iniciar o pagamento.")
    return CheckoutResponse(init_point=init_point)


@router.post("/confirm", response_model=SubscriptionOut,
             summary="Confirma o pagamento de retorno e ativa a assinatura")
def confirm(req: ConfirmRequest, request: Request) -> SubscriptionOut:
    user = _require_user(request)
    try:
        subscription.confirm_payment(req.payment_id)
    except Exception:  # noqa: BLE001 — confirmação é best-effort; devolve estado atual
        logger.warning("Falha ao confirmar pagamento %s.", req.payment_id, exc_info=True)
    return SubscriptionOut(**subscription.subscription_view(user["id"]))


@router.post("/cancel", response_model=SubscriptionOut,
             summary="Cancela a assinatura ativa (acesso até o fim do período)")
def cancel(request: Request) -> SubscriptionOut:
    user = _require_user(request)
    subscription.cancel(user_id=user["id"])
    return SubscriptionOut(**subscription.subscription_view(user["id"]))


@router.post("/webhook", summary="Webhook de notificação do Mercado Pago")
async def webhook(request: Request) -> dict:
    """Recebe notificações do Mercado Pago. Valida a assinatura, busca o pagamento
    e ativa a assinatura quando aprovado. Sempre responde 200 (o Mercado Pago
    reentrega em erro); a ativação é idempotente.
    """
    raw = await request.body()  # noqa: F841 — corpo lido p/ não travar o cliente
    data_id = request.query_params.get("data.id") or request.query_params.get("id")
    topic = request.query_params.get("type") or request.query_params.get("topic")

    if not payments.verify_signature(
        signature_header=request.headers.get("x-signature"),
        request_id=request.headers.get("x-request-id"),
        data_id=data_id,
    ):
        logger.warning("Webhook do Mercado Pago com assinatura inválida — ignorado.")
        return {"ok": False}

    # Só nos interessa notificação de pagamento.
    if topic and topic != "payment":
        return {"ok": True}
    try:
        payment = payments.get_payment(data_id)
        subscription.activate_from_payment(payment)
    except Exception:  # noqa: BLE001 — nunca devolve erro ao Mercado Pago
        logger.warning("Falha ao processar webhook do pagamento %s.", data_id,
                       exc_info=True)
    return {"ok": True}
