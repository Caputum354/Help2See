"""
Encoding-tolerant request handling.

ROOT CAUSE THIS FIXES
---------------------
FastAPI parses a JSON body with ``await request.json()``, which decodes the
raw bytes as UTF-8. If the client sends the body in another encoding the
decode raises ``UnicodeDecodeError`` and FastAPI returns the opaque

    HTTP 400  {"detail": "There was an error parsing the body"}

This is exactly what Windows PowerShell does: ``Invoke-RestMethod`` /
``Invoke-WebRequest`` encode a string ``-Body`` using the console code page
(often Windows-1252) instead of UTF-8, so Portuguese accents (á, ã, ç, õ…)
become invalid UTF-8. PowerShell also defaults the ``Content-Type`` to
``application/x-www-form-urlencoded`` when ``-ContentType`` is omitted, which
makes FastAPI treat the JSON string as form data (HTTP 422).

The custom ``APIRoute`` below normalizes the incoming request *before*
FastAPI parses it, without changing the route signature (so the Pydantic
model and the Swagger schema stay clean):

  * strips a UTF-8 BOM,
  * if the bytes are not valid UTF-8, re-decodes from cp1252/latin-1 and
    re-encodes as UTF-8,
  * if the body looks like JSON ("{...}") but the Content-Type is missing or
    form-urlencoded, forces Content-Type: application/json.
"""
import logging
from typing import Callable

from fastapi import Request, Response
from fastapi.routing import APIRoute
from starlette.datastructures import Headers

logger = logging.getLogger("help2see.request")


def _normalize_body(raw: bytes) -> bytes:
    """Return UTF-8 bytes, recovering from BOM / cp1252 / latin-1 inputs."""
    if not raw:
        return raw

    # Strip UTF-8 BOM if present (PowerShell's UTF8 encoder may add it).
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]

    # Already valid UTF-8? Keep as-is.
    try:
        raw.decode("utf-8")
        return raw
    except UnicodeDecodeError:
        pass

    # Try UTF-16 (PowerShell 5.1 default for some pipelines emits UTF-16).
    for enc in ("utf-16", "utf-16-le", "utf-16-be"):
        try:
            text = raw.decode(enc)
            logger.warning("Corpo recebido em %s; convertido para UTF-8.", enc)
            return text.encode("utf-8")
        except UnicodeDecodeError:
            continue

    # Fall back to Windows-1252 (a superset of latin-1 that never fails).
    text = raw.decode("cp1252", errors="replace")
    logger.warning("Corpo recebido em cp1252/latin-1; convertido para UTF-8.")
    return text.encode("utf-8")


class EncodingTolerantRoute(APIRoute):
    """APIRoute that repairs body encoding and Content-Type before parsing."""

    def get_route_handler(self) -> Callable:
        original_handler = super().get_route_handler()

        async def custom_handler(request: Request) -> Response:
            raw = await request.body()
            normalized = _normalize_body(raw)

            content_type = request.headers.get("content-type", "")
            looks_like_json = normalized.lstrip()[:1] in (b"{", b"[")
            force_json = looks_like_json and (
                not content_type
                or "application/json" not in content_type.lower()
            )

            if normalized != raw or force_json:
                # Rebuild headers + receive channel with the fixed body.
                headers = dict(request.headers)
                if force_json:
                    headers["content-type"] = "application/json"
                    logger.warning(
                        "Content-Type ajustado para application/json "
                        "(recebido: %r).",
                        content_type or "<vazio>",
                    )
                headers["content-length"] = str(len(normalized))

                raw_headers = [
                    (k.lower().encode("latin-1"), v.encode("latin-1"))
                    for k, v in headers.items()
                ]
                request.scope["headers"] = raw_headers
                request._headers = Headers(scope=request.scope)

                async def receive() -> dict:
                    return {
                        "type": "http.request",
                        "body": normalized,
                        "more_body": False,
                    }

                request._receive = receive
                request._body = normalized

            return await original_handler(request)

        return custom_handler
