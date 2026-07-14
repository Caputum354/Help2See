"""
Modelos Pydantic da autenticação (``/api/auth/*``).

Regras de negócio ficam em ``services.auth``; aqui é só validação de entrada
e o formato de saída (sem nunca expor hash de senha ou token interno).
"""
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from utils.config import settings

_MIN = settings.AUTH_PASSWORD_MIN_LEN


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=_MIN, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class ForgotRequest(BaseModel):
    email: EmailStr


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=8)


class ResetRequest(BaseModel):
    # Token de troca emitido após verificar o código (não é o código em si).
    exchange_token: str = Field(..., min_length=10, max_length=256)
    password: str = Field(..., min_length=_MIN, max_length=128)


class ConfirmRequest(BaseModel):
    # Token de confirmação de e-mail (vem no link enviado no cadastro).
    token: str = Field(..., min_length=10, max_length=256)


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    # True quando a conta já confirmou o e-mail (email_verified_at preenchido).
    email_verified: bool = False
    # Plano efetivo do usuário: 'free' ou 'professional' (assinatura vigente).
    plan: str = "free"


class AuthResponse(BaseModel):
    """Retorno de register/login: dados do usuário + token de sessão."""
    user: UserOut
    token: str
    # Apenas em modo dev (sem SMTP): o token de confirmação volta aqui para
    # teste manual do link. Em produção fica None (vai só por e-mail).
    dev_verify_token: Optional[str] = None


class MessageResponse(BaseModel):
    message: str
    # Apenas em modo dev (sem SMTP): o código de recuperação volta aqui para
    # teste manual.
    dev_code: Optional[str] = None


class VerifyCodeResponse(BaseModel):
    """Retorno de /verify-code: token de troca para a etapa de nova senha."""
    exchange_token: str
