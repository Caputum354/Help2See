"""
Regras de negócio da assinatura do plano Profissional (MySQL = fonte da verdade).

Fluxo (Checkout Pro do Mercado Pago):
  1. ``start_checkout`` cria uma linha ``pending`` e uma preference; devolve a URL.
  2. O usuário paga no Mercado Pago e volta para ``conta.html``.
  3. ``activate_from_payment`` (via /confirm de retorno OU webhook) confirma o
     pagamento aprovado e marca a assinatura ``active`` com um período de acesso.

Semântica do plano efetivo: o usuário é **Profissional** enquanto houver uma
assinatura ``active`` (ou ``canceled`` ainda dentro do período pago) cujo
``current_period_end`` esteja no futuro; caso contrário, ``free``. Cancelar não
corta o acesso na hora — ele vai até o fim do período já pago (padrão SaaS).

Toda transição é espelhada no Mongo via ``telemetry.log_action`` (não-bloqueante);
nenhum dado de pagamento sensível sai daqui para o navegador.
"""
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy import text

from services import payments, telemetry
from services.auth import _now  # mesmo relógio local (APP_TIMEZONE) do auth
from services.mysql import get_engine
from utils.config import settings

logger = logging.getLogger("help2see.subscription")

PLAN_PROFESSIONAL = "professional"
_ACTIVE_STATES = ("active", "canceled")  # 'canceled' ainda vale até o fim do período


def _price_cents(cycle: str) -> int:
    return (settings.SUBSCRIPTION_PRICE_ANNUAL_CENTS if cycle == "annual"
            else settings.SUBSCRIPTION_PRICE_MONTHLY_CENTS)


def _period_end(cycle: str, start: datetime) -> datetime:
    return start + timedelta(days=365 if cycle == "annual" else 30)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def effective_plan(user_id: int) -> str:
    """Retorna ``'professional'`` se houver assinatura vigente, senão ``'free'``.

    Best-effort: qualquer erro (ex.: tabela ``subscriptions`` ainda não migrada)
    resulta em ``'free'`` — nunca quebra o login/``/me``.
    """
    try:
        with get_engine().connect() as conn:
            row = conn.execute(
                text("SELECT plan FROM subscriptions "
                     "WHERE user_id = :u AND status IN ('active', 'canceled') "
                     "AND current_period_end IS NOT NULL AND current_period_end > :now "
                     "ORDER BY current_period_end DESC LIMIT 1"),
                {"u": int(user_id), "now": _now()},
            ).first()
        return row.plan if row else "free"
    except Exception:  # noqa: BLE001 — plano nunca pode derrubar a autenticação
        logger.debug("effective_plan falhou — assumindo 'free'.", exc_info=True)
        return "free"


def subscription_view(user_id: int) -> Dict[str, Any]:
    """Estado atual da assinatura para o ``SubscriptionOut`` (ou plano gratuito)."""
    with get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT plan, status, billing_cycle, current_period_end, amount_cents "
                 "FROM subscriptions "
                 "WHERE user_id = :u AND status IN ('active', 'canceled') "
                 "AND current_period_end IS NOT NULL AND current_period_end > :now "
                 "ORDER BY current_period_end DESC LIMIT 1"),
            {"u": int(user_id), "now": _now()},
        ).first()
    if not row:
        return {"plan": "free", "status": None, "billing_cycle": None,
                "current_period_end": None, "amount_cents": None}
    return {
        "plan": row.plan,
        "status": row.status,                       # active | canceled (ainda válido)
        "billing_cycle": row.billing_cycle,
        "current_period_end": _iso(row.current_period_end),
        "amount_cents": int(row.amount_cents) if row.amount_cents is not None else None,
    }


def start_checkout(*, user_id: int, cycle: str,
                   payer_email: Optional[str] = None) -> str:
    """Cria a assinatura ``pending`` + a preference do Checkout Pro; devolve a URL."""
    amount = _price_cents(cycle)
    with get_engine().begin() as conn:
        res = conn.execute(
            text("INSERT INTO subscriptions "
                 "(user_id, plan, billing_cycle, status, provider, amount_cents) "
                 "VALUES (:u, 'professional', :c, 'pending', 'mercadopago', :amt)"),
            {"u": int(user_id), "c": cycle, "amt": amount},
        )
        sub_id = int(res.lastrowid)

    pref_id, init_point = payments.create_preference(
        subscription_id=sub_id, cycle=cycle, amount_cents=amount,
        payer_email=payer_email,
    )
    with get_engine().begin() as conn:
        conn.execute(
            text("UPDATE subscriptions SET provider_ref = :p WHERE id = :id"),
            {"p": pref_id, "id": sub_id},
        )
    telemetry.log_action(action="subscription_checkout", user_id=user_id,
                         context={"cycle": cycle, "amount_cents": amount})
    return init_point


def activate_from_payment(payment: Optional[Dict[str, Any]]) -> bool:
    """Confirma um pagamento APROVADO e ativa a assinatura. Idempotente.

    Reconcilia pelo ``external_reference`` (id da nossa assinatura). O lock
    ``FOR UPDATE`` + o UNIQUE em ``provider_payment_id`` impedem ativação dupla
    quando o webhook e o /confirm chegam quase juntos.
    """
    if not payment or payment.get("status") != "approved":
        return False
    payment_id = str(payment.get("id") or "")
    ext_ref = payment.get("external_reference")
    if not payment_id or not (ext_ref and str(ext_ref).isdigit()):
        return False
    sub_id = int(ext_ref)

    with get_engine().begin() as conn:
        row = conn.execute(
            text("SELECT id, user_id, billing_cycle, status, provider_payment_id "
                 "FROM subscriptions WHERE id = :id FOR UPDATE"),
            {"id": sub_id},
        ).first()
        if row is None:
            return False
        # Já ativado por este mesmo pagamento → no-op idempotente.
        if row.status == "active" and row.provider_payment_id == payment_id:
            return True
        start = _now()
        end = _period_end(row.billing_cycle, start)
        conn.execute(
            text("UPDATE subscriptions SET status = 'active', "
                 "provider_payment_id = :pid, started_at = :s, "
                 "current_period_end = :e WHERE id = :id"),
            {"pid": payment_id, "s": start, "e": end, "id": sub_id},
        )
        user_id = int(row.user_id)
        cycle = row.billing_cycle

    telemetry.log_action(action="subscription_activated", user_id=user_id,
                         context={"cycle": cycle, "payment_id": payment_id})
    return True


def confirm_payment(payment_id: str) -> bool:
    """Busca o pagamento no Mercado Pago e ativa se aprovado (caminho /confirm)."""
    payment = payments.get_payment(payment_id)
    return activate_from_payment(payment)


def cancel(*, user_id: int) -> bool:
    """Cancela a assinatura ativa do usuário (acesso segue até o fim do período)."""
    with get_engine().begin() as conn:
        res = conn.execute(
            text("UPDATE subscriptions SET status = 'canceled', canceled_at = :n "
                 "WHERE user_id = :u AND status = 'active'"),
            {"u": int(user_id), "n": _now()},
        )
        changed = res.rowcount or 0
    if changed:
        telemetry.log_action(action="subscription_canceled", user_id=user_id)
    return bool(changed)
