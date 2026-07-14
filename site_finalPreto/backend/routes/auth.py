"""
Rotas de autenticação — ``/api/auth/*``.

  POST /register     → cria conta (com telefone) e já devolve um token (auto-login)
  POST /login        → autentica e devolve token (registra em login_history)
  POST /logout       → encerra a sessão (Authorization: Bearer <token>)
  GET  /me           → dados do usuário logado (Bearer)
  POST /forgot       → envia o código de recuperação por e-mail (resposta genérica)
  POST /verify-code  → valida o código e devolve um token de troca (uso único)
  POST /reset        → redefine a senha via token de troca

Recuperação de senha é feita por e-mail (SMTP): /forgot envia um código de 6
dígitos; /verify-code troca o código por um exchange_token; /reset usa esse token.

Usa ``EncodingTolerantRoute`` (mesma robustez de encoding/Content-Type das
demais rotas).
"""
import hashlib
import hmac
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response

from models.auth_schemas import (
    AuthResponse, ConfirmRequest, ForgotRequest, LoginRequest, MessageResponse,
    RegisterRequest, ResetRequest, UserOut, VerifyCodeRequest, VerifyCodeResponse,
)
from services import auth as auth_service
from services import mailer, rate_limit, telemetry
from utils.config import settings
from utils.net import client_ip
from utils.request_normalizer import EncodingTolerantRoute

logger = logging.getLogger("help2see.auth")

router = APIRouter(prefix="/auth", tags=["auth"], route_class=EncodingTolerantRoute)


def _bearer(request: Request) -> Optional[str]:
    """Extrai o token de 'Authorization: Bearer <token>'."""
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def _hash_ip(ip: Optional[str]) -> Optional[str]:
    """Pseudônimo curto do IP (HMAC com o segredo do app). Nunca grava o IP cru."""
    if not ip:
        return None
    digest = hmac.new(
        settings.VISITOR_HASH_SECRET.encode("utf-8"), ip.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest[:16]


def _audit(action: str, *, user_id: Optional[int] = None,
           email: Optional[str] = None, ip: Optional[str] = None,
           user_agent: Optional[str] = None) -> None:
    """Registra uma ação de auth no MySQL (login_history) E espelha no Mongo.

    O MySQL continua sendo a fonte da verdade; o Mongo (``app_actions``) é um
    espelho não-bloqueante para analytics unificado. Nunca grava IP cru/senha/token.
    """
    auth_service.record_login_event(
        action, user_id=user_id, email=email, ip=ip, user_agent=user_agent
    )
    telemetry.log_action(action=action, user_id=user_id, ip_hash=_hash_ip(ip))


def _rate_limited(*keys: str) -> bool:
    """True se QUALQUER chave estourou o rate limit (janela fixa, por processo)."""
    max_hits = settings.RESET_RATE_MAX_HITS
    window = settings.RESET_RATE_WINDOW_SECONDS
    # Avalia todas as chaves (não faz curto-circuito) para que cada uma conte o hit.
    blocked = False
    for key in keys:
        if not rate_limit.allow(key, max_hits, window):
            blocked = True
    return blocked


def _send_confirmation(email: str, verify_token: str) -> Optional[str]:
    """Envia o e-mail de confirmação. Em dev (sem SMTP) devolve o token p/ teste."""
    link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/confirm.html?token={verify_token}"
    if settings.email_configured:
        mailer.send_email_confirmation(email, link)
        return None
    logger.warning("SMTP off — link de confirmação (dev) para %s: %s", email, link)
    return verify_token


@router.post("/register", response_model=AuthResponse, status_code=201,
             summary="Cria uma conta (cadastro) e envia o e-mail de confirmação")
def register(req: RegisterRequest, request: Request) -> AuthResponse:
    try:
        user, token, verify_token = auth_service.register(
            req.name, req.email, req.password
        )
    except auth_service.EmailTaken:
        raise HTTPException(status_code=409, detail="Este e-mail já tem conta. Faça login.")
    dev_token = _send_confirmation(user["email"], verify_token)
    _audit(
        "register", user_id=user["id"], email=user["email"],
        ip=client_ip(request), user_agent=request.headers.get("user-agent", ""),
    )
    return AuthResponse(user=UserOut(**user), token=token, dev_verify_token=dev_token)


@router.post("/confirm", response_model=MessageResponse,
             summary="Confirma o e-mail via token (do link enviado no cadastro)")
def confirm(req: ConfirmRequest, request: Request) -> MessageResponse:
    if not auth_service.confirm_email(req.token):
        raise HTTPException(
            status_code=400,
            detail="Link de confirmação inválido ou expirado. Solicite um novo.",
        )
    _audit("email_confirm", ip=client_ip(request),
           user_agent=request.headers.get("user-agent", ""))
    return MessageResponse(message="E-mail confirmado com sucesso. Sua conta está ativa.")


@router.post("/resend-confirmation", response_model=MessageResponse,
             summary="Reenvia o e-mail de confirmação (Bearer do usuário logado)")
def resend_confirmation(request: Request) -> MessageResponse:
    generic = "Se a conta existe e ainda não foi confirmada, reenviamos o e-mail."
    user = auth_service.get_user_by_token(_bearer(request) or "")
    if not user:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada.")
    result = auth_service.resend_email_verification(user["id"])
    if result is not None:
        token, email = result
        _send_confirmation(email, token)
    return MessageResponse(message=generic)


@router.post("/login", response_model=AuthResponse, summary="Entra na conta (login)")
def login(req: LoginRequest, request: Request) -> AuthResponse:
    ip = client_ip(request)
    user_agent = request.headers.get("user-agent", "")
    try:
        user, token = auth_service.authenticate(req.email, req.password)
    except auth_service.InvalidCredentials:
        _audit("login_fail", email=req.email, ip=ip, user_agent=user_agent)
        # Mensagem genérica idêntica para e-mail inexistente OU senha errada.
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos.")
    _audit(
        "login_success", user_id=user["id"], email=user["email"],
        ip=ip, user_agent=user_agent,
    )
    return AuthResponse(user=UserOut(**user), token=token)


@router.post("/logout", status_code=204, summary="Encerra a sessão")
def logout(request: Request) -> Response:
    token = _bearer(request) or ""
    # Resolve o usuário ANTES de encerrar a sessão, para auditar com user_id.
    user = auth_service.get_user_by_token(token) if token else None
    auth_service.logout(token)
    _audit(
        "logout", user_id=(user["id"] if user else None),
        email=(user["email"] if user else None), ip=client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )
    return Response(status_code=204)


@router.get("/me", response_model=UserOut, summary="Usuário logado")
def me(request: Request) -> UserOut:
    user = auth_service.get_user_by_token(_bearer(request) or "")
    if not user:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada.")
    return UserOut(**user)


@router.post("/forgot", response_model=MessageResponse,
             summary="Solicita recuperação de senha (envia código por e-mail)")
def forgot(req: ForgotRequest, request: Request) -> MessageResponse:
    # Resposta SEMPRE genérica — não revela se o e-mail existe (anti-enumeração).
    generic = "Se existe uma conta com esse e-mail, enviamos um código de recuperação."
    ip = client_ip(request)

    if _rate_limited(f"forgot:ip:{ip}", f"forgot:email:{req.email.lower()}"):
        raise HTTPException(
            status_code=429,
            detail="Muitas solicitações. Aguarde alguns minutos e tente de novo.",
        )

    _audit(
        "reset_request", email=req.email, ip=ip,
        user_agent=request.headers.get("user-agent", ""),
    )

    result = auth_service.request_password_reset_code(req.email)
    if result is None:
        return MessageResponse(message=generic)

    code, user_email = result
    if settings.email_configured:
        mailer.send_password_reset(user_email, code)
        return MessageResponse(message=generic)

    # Sem SMTP (modo dev): devolve o código para teste manual.
    logger.warning("SMTP off — código de reset (dev) para %s: %s", user_email, code)
    return MessageResponse(message=generic, dev_code=code)


@router.post("/verify-code", response_model=VerifyCodeResponse,
             summary="Valida o código de recuperação e devolve um token de troca")
def verify_code(req: VerifyCodeRequest, request: Request) -> VerifyCodeResponse:
    ip = client_ip(request)
    if _rate_limited(f"verify:ip:{ip}", f"verify:email:{req.email.lower()}"):
        raise HTTPException(
            status_code=429,
            detail="Muitas tentativas. Aguarde alguns minutos e tente de novo.",
        )

    exchange = auth_service.verify_reset_code(req.email, req.code)
    if exchange is None:
        _audit(
            "reset_verify_fail", email=req.email, ip=ip,
            user_agent=request.headers.get("user-agent", ""),
        )
        raise HTTPException(status_code=400, detail="Código inválido ou expirado.")
    return VerifyCodeResponse(exchange_token=exchange)


@router.post("/reset", response_model=MessageResponse, summary="Redefine a senha")
def reset(req: ResetRequest, request: Request) -> MessageResponse:
    try:
        auth_service.reset_password_with_exchange(req.exchange_token, req.password)
    except auth_service.InvalidResetToken:
        raise HTTPException(
            status_code=400,
            detail="Sessão de redefinição inválida ou expirada. Recomece o processo.",
        )
    _audit(
        "reset_success", ip=client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )
    return MessageResponse(message="Senha redefinida com sucesso. Você já pode entrar.")
