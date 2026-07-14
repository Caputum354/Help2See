"""
Schemas do formulário de contato comercial — ``/api/contact``.

Validação no servidor espelha a do front-end (nome, e-mail e empresa/site
obrigatórios); os demais campos são opcionais. Tamanhos são limitados para o
e-mail resultante ficar são e evitar abuso.
"""
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class ContactRequest(BaseModel):
    """Pedido de contato enviado pelo site (página contato.html)."""

    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    company: str = Field(min_length=1, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=40)
    subject: Optional[str] = Field(default=None, max_length=60)
    message: Optional[str] = Field(default=None, max_length=4000)


class ContactResponse(BaseModel):
    """Resultado do envio. ``delivered`` indica se o e-mail saiu (SMTP ok)."""

    ok: bool
    delivered: bool
