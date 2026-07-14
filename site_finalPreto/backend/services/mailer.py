"""
Envio de e-mail — API HTTP do Brevo (preferida) com fallback SMTP.

Dois transportes, escolhidos por configuração:
  * **Brevo** (``BREVO_API_KEY``): envia por HTTPS/443 — funciona em hosts que
    bloqueiam portas SMTP em planos gratuitos (Railway/Render). O remetente é
    ``SMTP_FROM`` e precisa estar verificado no painel do Brevo.
  * **SMTP** (``SMTP_HOST``): biblioteca padrão, usado quando não há chave do
    Brevo (ex.: dev local com Gmail).

Se nenhum transporte estiver configurado, nada é enviado — apenas registramos
um aviso e devolvemos ``False``. Os fluxos nunca quebram por causa disso (em
dev, a rota /forgot devolve o código na resposta para teste manual).

Credenciais ficam SÓ no ambiente (ver ``utils.config`` / ``.env``); nunca são
enviadas ao navegador.
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional, Tuple

import requests

from utils.config import settings

logger = logging.getLogger("help2see.mailer")

_BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"

# (nome, e-mail) para onde as respostas devem ir, quando diferente do remetente.
ReplyTo = Tuple[str, str]


def _send_via_brevo(to: str, subject: str, text: str, html: Optional[str],
                    reply_to: Optional[ReplyTo]) -> bool:
    """Envia pela API HTTP do Brevo. Retorna True em 2xx."""
    payload = {
        "sender": {"name": settings.SMTP_FROM_NAME, "email": settings.SMTP_FROM},
        "to": [{"email": to}],
        "subject": subject,
        "textContent": text,
    }
    if html:
        payload["htmlContent"] = html
    if reply_to:
        payload["replyTo"] = {"name": reply_to[0], "email": reply_to[1]}
    try:
        resp = requests.post(
            _BREVO_ENDPOINT, json=payload, timeout=15,
            headers={"api-key": settings.BREVO_API_KEY,
                     "content-type": "application/json"},
        )
        if 200 <= resp.status_code < 300:
            logger.info("E-mail '%s' enviado para %s via Brevo.", subject, to)
            return True
        logger.error("Brevo recusou o e-mail para %s: HTTP %s %s",
                     to, resp.status_code, resp.text[:300])
        return False
    except Exception:  # noqa: BLE001 — falha de rede não pode derrubar a rota
        logger.exception("Falha ao enviar e-mail via Brevo para %s.", to)
        return False


def _send_via_smtp(to: str, subject: str, text: str, html: Optional[str],
                   reply_to: Optional[ReplyTo]) -> bool:
    """Envia por SMTP (smtplib). Retorna True se entregou ao servidor."""
    msg = EmailMessage()
    msg["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM))
    msg["To"] = to
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = formataddr(reply_to)
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    try:
        if settings.SMTP_SSL:
            with smtplib.SMTP_SSL(
                settings.SMTP_HOST, settings.SMTP_PORT,
                context=ssl.create_default_context(), timeout=15,
            ) as server:
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
                if settings.SMTP_STARTTLS:
                    server.starttls(context=ssl.create_default_context())
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        logger.info("E-mail '%s' enviado para %s via SMTP.", subject, to)
        return True
    except Exception:  # noqa: BLE001 — falha de SMTP não pode derrubar a rota
        logger.exception("Falha ao enviar e-mail SMTP para %s.", to)
        return False


def send_email(to: str, subject: str, text: str, html: str | None = None,
               reply_to: Optional[ReplyTo] = None) -> bool:
    """Envia um e-mail pelo transporte configurado (Brevo > SMTP).

    Nunca levanta exceção: falhas de rede/credencial são logadas e viram False.
    """
    if not settings.email_configured:
        logger.warning(
            "E-mail não configurado — '%s' para %s NÃO enviado.", subject, to
        )
        return False
    if settings.BREVO_API_KEY:
        return _send_via_brevo(to, subject, text, html, reply_to)
    return _send_via_smtp(to, subject, text, html, reply_to)


def send_email_confirmation(to: str, confirm_link: str) -> bool:
    """Envia o link de confirmação de e-mail (token de uso único) no cadastro."""
    subject = "Help2See — Confirme seu e-mail"
    text = (
        "Bem-vindo(a) à Help2See!\n\n"
        "Confirme seu endereço de e-mail abrindo este link (expira em 24 horas):\n"
        f"{confirm_link}\n\n"
        "Se você não criou esta conta, ignore este e-mail."
    )
    html = (
        "<p>Bem-vindo(a) à <strong>Help2See</strong>!</p>"
        "<p>Confirme seu endereço de e-mail clicando no botão abaixo "
        "(o link expira em 24 horas):</p>"
        f'<p style="margin:18px 0"><a href="{confirm_link}" '
        'style="background:#6C4CF1;color:#fff;padding:12px 22px;border-radius:8px;'
        'text-decoration:none;font-weight:700;display:inline-block">'
        "Confirmar e-mail</a></p>"
        f'<p style="font-size:13px;color:#666">Ou copie e cole no navegador:<br>'
        f'<a href="{confirm_link}">{confirm_link}</a></p>'
        "<p>Se você não criou esta conta, ignore este e-mail.</p>"
    )
    return send_email(to, subject, text, html)


def send_contact_request(*, name: str, email: str, company: str,
                         phone: str | None, subject: str | None,
                         message: str | None) -> bool:
    """Encaminha um pedido de contato do site para a caixa da equipe.

    O destinatário é o próprio ``SMTP_FROM`` (caixa da equipe); o Reply-To é o
    e-mail do visitante, então responder no cliente de e-mail já vai direto
    para ele.
    """
    lines = [
        f"Nome: {name}",
        f"E-mail: {email}",
        f"Empresa/site: {company}",
    ]
    if phone:
        lines.append(f"Telefone: {phone}")
    if subject:
        lines.append(f"Assunto: {subject}")
    if message:
        lines.append("")
        lines.append("Mensagem:")
        lines.append(message)
    text = "\n".join(lines)

    return send_email(
        settings.SMTP_FROM,
        f"Help2See — Novo pedido de contato ({subject or 'geral'})",
        text,
        reply_to=(name, email),
    )


def send_password_reset(to: str, code: str) -> bool:
    """Envia o código de recuperação de senha (OTP de 6 dígitos) por e-mail."""
    subject = "Help2See — Código de recuperação de senha"
    text = (
        "Você (ou alguém) pediu para redefinir a senha da sua conta Help2See.\n\n"
        f"Seu código de verificação é: {code}\n\n"
        "Ele expira em 15 minutos. Se não foi você, ignore este e-mail — sua "
        "senha continua a mesma."
    )
    html = (
        "<p>Você (ou alguém) pediu para redefinir a senha da sua conta "
        "<strong>Help2See</strong>.</p>"
        "<p>Seu código de verificação é:</p>"
        f'<p style="font-size:28px;font-weight:700;letter-spacing:4px;'
        f'margin:12px 0">{code}</p>'
        "<p>Ele expira em 15 minutos. Se não foi você, ignore este e-mail — "
        "sua senha continua a mesma.</p>"
    )
    return send_email(to, subject, text, html)
