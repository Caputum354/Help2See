"""
Sanitização "privacy-first" dos eventos recebidos.

Duas garantias moram aqui e são cobertas por testes:

1. ``normalize_path`` remove a query string / fragmento e colapsa segmentos de
   id de alta cardinalidade (``/user/123`` → ``/user/:id``), para os caminhos
   continuarem agregáveis e nunca vazarem ids passados na URL.
2. ``sanitize_detail`` mantém apenas uma *whitelist* de campos técnicos por
   tipo de evento. Um ``form_error`` guarda ``field`` + ``code`` e NUNCA o valor
   digitado — qualquer coisa fora da whitelist (incluindo ``value``) é descartada.

Tipos de evento desconhecidos são rejeitados por ``ALLOWED_TYPES`` e contados
como descartados.
"""
import re
from typing import Any, Dict, Optional

# Tipos de evento que o pipeline entende. Qualquer outro é descartado na ingestão.
ALLOWED_TYPES = frozenset({
    "page_view",
    "form_error",
    "form_abandon",
    "a11y_toggle",
    "contrast_issue",
    "focus_issue",
    "tts_used",
    # Auditoria WCAG silenciosa (rodada pelo scanner do plugin no carregamento).
    "wcag_audit",     # resultado geral (nível + contagens)
    "alt_issue",      # imagem sem alt (1.1.1)
    "label_issue",    # campo de formulário sem rótulo (1.3.1/4.1.2)
    "name_issue",     # link/botão sem nome acessível (4.1.2)
    # ── Telemetria de uso do plugin (vão para a coleção time-series events) ──
    "plugin_opened",
    "plugin_closed",
    "feature_used",
    "settings_changed",
    "voice_read_start",
    "voice_read_finish",
    "shortcut_used",
    # ── Tipos com fan-out para coleções dedicadas (sessions/performance/errors) ──
    "session_start",
    "session_end",
    "perf_sample",
    "client_error",
})

# Tipos que NÃO são gravados no fluxo ``events``: o ingest os roteia para as
# coleções dedicadas (sessions / performance / errors). Continuam passando pela
# mesma sanitização de ``detail``.
FANOUT_TYPES = frozenset({
    "session_start", "session_end", "perf_sample", "client_error",
})

# Whitelist de campos de detail por tipo. Chaves fora desta lista são descartadas.
# CRÍTICO: nenhuma entrada inclui um *valor* fornecido pelo usuário (ex.: input de formulário).
_DETAIL_WHITELIST: Dict[str, frozenset] = {
    "page_view": frozenset({"load_ms", "referrer_host"}),
    "form_error": frozenset({"field", "code"}),       # nunca "value"
    "form_abandon": frozenset({"field", "form"}),
    "a11y_toggle": frozenset({"feature", "active"}),
    "contrast_issue": frozenset({"selector", "ratio", "required"}),
    "focus_issue": frozenset({"selector", "reason"}),
    "tts_used": frozenset({"chars"}),
    # Auditoria WCAG: só dado técnico/contagens — nada de conteúdo da página.
    "wcag_audit": frozenset({
        "level", "score", "violations", "version",
        "contrast", "missing_alt", "missing_label", "missing_name",
        "no_lang", "no_title", "no_h1",
    }),
    "alt_issue": frozenset({"selector"}),
    "label_issue": frozenset({"selector"}),
    "name_issue": frozenset({"selector"}),
    # ── Telemetria de uso (só campos técnicos/escalares; nunca conteúdo) ──
    "feature_used": frozenset({"feature"}),
    "settings_changed": frozenset({"setting", "value"}),
    "voice_read_start": frozenset({"chars", "lang"}),
    "voice_read_finish": frozenset({"chars", "lang", "ms"}),
    "shortcut_used": frozenset({"keys"}),
    # Fan-out: detail carrega os campos consumidos pelo ingest ao rotear.
    "session_start": frozenset({
        "os", "language", "screen", "plugin_version", "device", "browser",
    }),
    "session_end": frozenset({"duration_ms"}),
    "perf_sample": frozenset({"action", "ms", "plugin_version"}),
    # client_error: mensagem técnica clipada; sem PII (o plugin não envia conteúdo).
    "client_error": frozenset({"message", "source", "lineno"}),
}

# Flags de acessibilidade conhecidas que vale a pena persistir do snapshot do plugin.
_A11Y_FLAGS = frozenset({
    "tts", "font_scale", "high_contrast", "keyboard_nav", "screen_reader",
})

# Limita qualquer string livre que guardamos, como defesa em profundidade contra abuso.
_MAX_STR = 256

# Identificadores em formato de segmento que colapsamos para ":id".
_RE_NUMERIC = re.compile(r"^\d+$")
_RE_UUID = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
_RE_ULID = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")        # base32 de Crockford
_RE_LONG_HEX = re.compile(r"^[0-9a-fA-F]{16,}$")


def _looks_like_id(segment: str) -> bool:
    return bool(
        _RE_NUMERIC.match(segment)
        or _RE_UUID.match(segment)
        or _RE_ULID.match(segment)
        or _RE_LONG_HEX.match(segment)
    )


def normalize_path(path: Optional[str]) -> str:
    """Retorna um caminho agregável e sem ids. Sempre começa com ``/``."""
    if not path:
        return "/"
    # Remove query string e fragmento.
    path = path.split("?", 1)[0].split("#", 1)[0].strip()
    if not path or path == "/":
        return "/"
    # Normaliza cada segmento.
    parts = [p for p in path.split("/") if p != ""]
    norm = [":id" if _looks_like_id(p) else p for p in parts]
    return "/" + "/".join(norm)


def _clip(value: Any) -> Any:
    """Limita strings; repassa bools/números; rejeita estruturas aninhadas."""
    if isinstance(value, str):
        return value[:_MAX_STR]
    if isinstance(value, (bool, int, float)):
        return value
    return None  # descarta dicts/listas/lixo em formato None dentro de detail


def sanitize_detail(event_type: str, detail: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Mantém apenas os campos escalares da whitelist para o tipo de evento dado."""
    allowed = _DETAIL_WHITELIST.get(event_type)
    if not allowed or not isinstance(detail, dict):
        return {}
    clean: Dict[str, Any] = {}
    for key in allowed:
        if key in detail:
            v = _clip(detail[key])
            if v is not None:
                clean[key] = v
    return clean


def sanitize_a11y(a11y: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Mantém apenas as flags de acessibilidade conhecidas, como escalares."""
    if not isinstance(a11y, dict):
        return {}
    clean: Dict[str, Any] = {}
    for key in _A11Y_FLAGS:
        if key in a11y:
            v = _clip(a11y[key])
            if v is not None:
                clean[key] = v
    return clean


def is_allowed_type(event_type: str) -> bool:
    return event_type in ALLOWED_TYPES
