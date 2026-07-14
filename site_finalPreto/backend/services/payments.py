"""
Adaptador fino do Mercado Pago (Checkout Pro) para a assinatura Profissional.

Isola o SDK do resto do app: só este módulo conhece o ``mercadopago``. Decisões:
  * o **preço** é resolvido no servidor (centavos → reais), nunca vindo do cliente;
  * o **webhook é verificado por assinatura** (HMAC ``x-signature``) antes de
    qualquer ativação — sem segredo configurado, recusamos a notificação;
  * nenhuma credencial vai para o navegador (o token fica só no ambiente).

Em dev/sandbox use o Access Token de TESTE (prefixo ``TEST-``). Sem token, o
``mercadopago_configured`` é False e a rota responde 503.
"""
import hashlib
import hmac
import logging
from typing import Any, Dict, Optional, Tuple

from utils.config import settings

logger = logging.getLogger("help2see.payments")

# Rótulos exibidos no checkout por ciclo de cobrança.
_TITLES = {
    "monthly": "Help2See Profissional — mensal",
    "annual": "Help2See Profissional — anual",
}


class PaymentsUnavailable(Exception):
    """Mercado Pago não está configurado (sem access token)."""


def _sdk():
    """Instancia o SDK sob demanda (import tardio: dependência opcional)."""
    if not settings.mercadopago_configured:
        raise PaymentsUnavailable("MERCADOPAGO_ACCESS_TOKEN não configurado.")
    import mercadopago  # import tardio para não exigir o pacote quando desligado

    return mercadopago.SDK(settings.MERCADOPAGO_ACCESS_TOKEN)


def create_preference(*, subscription_id: int, cycle: str, amount_cents: int,
                      payer_email: Optional[str]) -> Tuple[str, str]:
    """Cria uma preference do Checkout Pro e retorna ``(preference_id, init_point)``.

    ``external_reference`` carrega o id da nossa assinatura para reconciliar o
    pagamento depois (no /confirm e no webhook).
    """
    frontend = settings.FRONTEND_BASE_URL.rstrip("/")
    unit_price = round(int(amount_cents) / 100.0, 2)
    success_url = f"{frontend}/conta.html?checkout=success"

    preference: Dict[str, Any] = {
        "items": [{
            "title": _TITLES.get(cycle, "Help2See Profissional"),
            "quantity": 1,
            "unit_price": unit_price,
            "currency_id": "BRL",
        }],
        "external_reference": str(subscription_id),
        "metadata": {"subscription_id": subscription_id, "cycle": cycle},
        "back_urls": {
            "success": success_url,
            "pending": f"{frontend}/conta.html?checkout=pending",
            "failure": f"{frontend}/conta.html?checkout=failure",
        },
    }
    # auto_return exige back_url pública: o Mercado Pago rejeita localhost. Em dev
    # local o usuário volta pelo botão de sucesso (sem redirecionamento automático).
    if not any(h in success_url for h in ("localhost", "127.0.0.1")):
        preference["auto_return"] = "approved"
    if payer_email:
        preference["payer"] = {"email": payer_email}
    # Webhook só quando há URL pública (em dev local usamos o /confirm de retorno).
    if settings.API_PUBLIC_URL:
        preference["notification_url"] = (
            f"{settings.API_PUBLIC_URL.rstrip('/')}/api/subscription/webhook"
        )

    result = _sdk().preference().create(preference)
    resp = (result or {}).get("response") or {}
    pref_id = resp.get("id")
    init_point = resp.get("init_point") or resp.get("sandbox_init_point")
    if not pref_id or not init_point:
        raise RuntimeError(f"Resposta inesperada do Mercado Pago: {result}")
    return str(pref_id), str(init_point)


def get_payment(payment_id: str) -> Optional[Dict[str, Any]]:
    """Busca um pagamento pelo id. Retorna o dict de resposta ou None."""
    if not payment_id:
        return None
    result = _sdk().payment().get(str(payment_id))
    if not result or result.get("status") not in (200, 201):
        logger.warning("Mercado Pago: pagamento %s não encontrado (%s).",
                       payment_id, (result or {}).get("status"))
        return None
    return (result or {}).get("response")


def verify_signature(*, signature_header: Optional[str],
                     request_id: Optional[str], data_id: Optional[str]) -> bool:
    """Valida o ``x-signature`` do webhook (HMAC-SHA256), conforme o Mercado Pago.

    Manifesto: ``id:<data.id>;request-id:<x-request-id>;ts:<ts>;`` assinado com
    ``MERCADOPAGO_WEBHOOK_SECRET``. Sem segredo configurado, recusa (False).
    """
    secret = settings.MERCADOPAGO_WEBHOOK_SECRET
    if not secret or not signature_header:
        return False
    # Header no formato "ts=1700000000,v1=abc123..."
    parts = {}
    for chunk in signature_header.split(","):
        if "=" in chunk:
            k, v = chunk.split("=", 1)
            parts[k.strip()] = v.strip()
    ts, v1 = parts.get("ts"), parts.get("v1")
    if not ts or not v1:
        return False
    # data.id alfanumérico deve entrar em minúsculas (regra do Mercado Pago).
    did = (data_id or "").lower()
    manifest = f"id:{did};request-id:{request_id or ''};ts:{ts};"
    expected = hmac.new(secret.encode("utf-8"), manifest.encode("utf-8"),
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)
