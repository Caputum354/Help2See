"""
Modelos Pydantic do endpoint de ingestão de analytics (``POST /api/collect``).

O plugin acumula eventos de telemetria de acessibilidade no navegador e os
envia em lote para cá. O payload é propositalmente permissivo na rede (o plugin
nunca pode quebrar a página hospedeira) — o *servidor* é a fonte da verdade:

  * tipos de evento desconhecidos são descartados (ver ``services.sanitizer``);
  * ``detail`` passa por whitelist por tipo (nunca guarda valores digitados);
  * o tenant (org_id) é resolvido no servidor a partir do ``site_key`` — o
    navegador só conhece o ``site_key`` público.
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from utils.config import settings


class IncomingEvent(BaseModel):
    """Um único evento bruto, como enviado pelo plugin.

    ``ts`` é o epoch em milissegundos (relógio do navegador). É opcional: o
    servidor cai no próprio relógio quando ausente. ``detail`` é livre aqui, mas
    passa por whitelist no servidor antes de ser armazenado.
    """

    type: str = Field(..., min_length=1, max_length=64,
                      description="Tipo do evento (ex.: page_view, form_error).")
    ts: Optional[int] = Field(
        default=None, description="Epoch em milissegundos (relógio do navegador)."
    )
    path: str = Field(default="/", max_length=2048,
                      description="Caminho da página (sanitizado no servidor).")
    detail: Optional[Dict[str, Any]] = Field(
        default=None, description="Contexto do evento; filtrado por whitelist."
    )
    device: Optional[str] = Field(default=None, max_length=32)
    browser: Optional[str] = Field(default=None, max_length=64)
    a11y: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Flags dos recursos do Help2See ativos (tts, font_scale, "
        "high_contrast, keyboard_nav, screen_reader).",
    )
    session_id: Optional[str] = Field(
        default=None, max_length=64,
        description="Id da sessão do plugin (gerado no navegador, por carregamento).",
    )


class EventBatch(BaseModel):
    """O corpo do ``POST /api/collect``."""

    site_key: str = Field(
        ..., min_length=8, max_length=64,
        description="Chave pública do site (embutida no snippet do plugin).",
    )
    events: List[IncomingEvent] = Field(
        ..., min_length=1, max_length=settings.COLLECT_MAX_BATCH,
        description="Lote de eventos acumulados no navegador.",
    )
    # Identidade OPCIONAL: token de sessão do usuário logado. É validado no
    # servidor (→ user_id) e descartado; nunca é gravado. Ausente = anônimo.
    auth_token: Optional[str] = Field(
        default=None, max_length=512,
        description="Token de sessão (h2s_token) do usuário logado, se houver.",
    )
    session_id: Optional[str] = Field(
        default=None, max_length=64,
        description="Id da sessão do plugin (fallback para os eventos do lote).",
    )
    plugin_version: Optional[str] = Field(
        default=None, max_length=32,
        description="Versão do plugin Help2See que emitiu o lote.",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "site_key": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                    "events": [
                        {"type": "page_view", "ts": 1718900000000, "path": "/checkout"},
                        {"type": "form_error", "path": "/checkout",
                         "detail": {"field": "email", "code": "invalid_format"}},
                    ],
                }
            ]
        }
    }


class CollectResponse(BaseModel):
    """Resultado de uma chamada de ingestão."""

    accepted: int = Field(..., description="Eventos sanitizados e gravados.")
    dropped: int = Field(..., description="Eventos descartados (tipo desconhecido/ inválido).")
