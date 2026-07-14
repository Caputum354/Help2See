"""
Modelos Pydantic da assinatura do plano Profissional (``/api/subscription/*``).

Regras de negócio ficam em ``services.subscription``; aqui é só validação de
entrada e o formato de saída. O cliente NUNCA informa preço — o servidor decide
o valor a partir do ciclo. Nada de dado de pagamento é devolvido ao navegador.
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field


class CheckoutRequest(BaseModel):
    # Único campo que o cliente escolhe; o preço é resolvido no servidor.
    cycle: Literal["monthly", "annual"]


class CheckoutResponse(BaseModel):
    # URL do Checkout Pro (Mercado Pago) para onde o front redireciona.
    init_point: str


class ConfirmRequest(BaseModel):
    # Id do pagamento devolvido na back_url de sucesso (?payment_id=...).
    payment_id: str = Field(..., min_length=1, max_length=128)


class SubscriptionOut(BaseModel):
    """Estado da assinatura do usuário logado (ou plano gratuito)."""
    plan: str = "free"                              # free | professional
    status: Optional[str] = None                   # active | pending | canceled | expired
    billing_cycle: Optional[str] = None            # monthly | annual
    current_period_end: Optional[str] = None       # ISO-8601 (ou None)
    amount_cents: Optional[int] = None
