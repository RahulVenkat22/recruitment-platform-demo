"""``OutreachService``: email a candidate about a job and log it as a Communication.

The recruiter picks a ``MessageTemplate``; its placeholders are filled from the
application (candidate, job, recruiter, company); the mail goes out through
Django's email backend -- SMTP when ``EMAIL_HOST`` is set, the console
otherwise -- and the sent text is written to the contact log through
``CommunicationService.log`` with the ``email_sent`` outcome, which moves an
untouched candidate to Contact Pending.

Safe mode: while ``EMAIL_SAFE_RECIPIENT`` is set, every mail is delivered to
that address instead of the candidate, with the intended recipient named in
the subject and the first line. The library holds real people's resumes, so
the whole flow can be exercised without writing to any of them.
"""

from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from rest_framework.exceptions import ValidationError

from common.enums import CommunicationChannel, CommunicationOutcome
from pipeline.exceptions import EmailDeliveryFailed, InvalidTransition, NoRecipient
from pipeline.models import Application, Communication, MessageTemplate
from pipeline.services._common import require_active
from pipeline.services.communications import CommunicationService

logger = logging.getLogger(__name__)

# What a template may reference as `{name}`; unknown names render as "".
PLACEHOLDERS: tuple[str, ...] = (
    "candidate_name",
    "candidate_first_name",
    "job_title",
    "job_location",
    "company",
    "recruiter_name",
    "recruiter_email",
)


@dataclass(frozen=True)
class EmailConfig:
    configured: bool
    from_email: str
    reply_to: str
    safe_recipient: str
    company: str


def email_config() -> EmailConfig:
    """What the UI needs to say about outgoing mail: configured, sender, safe mode."""
    return EmailConfig(
        configured=bool(settings.EMAIL_HOST),
        from_email=settings.DEFAULT_FROM_EMAIL,
        reply_to=settings.EMAIL_REPLY_TO,
        safe_recipient=settings.EMAIL_SAFE_RECIPIENT,
        company=settings.EMAIL_COMPANY_NAME,
    )


def recipient_for(candidate: Any) -> str:
    """The address to write to, or ``""`` for a placeholder identity."""
    email = (candidate.email or "").strip()
    return "" if not email or email.endswith("@no-email.invalid") else email


def context_for(application: Application, actor: Any) -> dict[str, str]:
    candidate, jd = application.candidate, application.job_description
    name = " ".join((candidate.full_name or "").split())
    return {
        "candidate_name": name or "there",
        "candidate_first_name": name.split(" ")[0] if name else "there",
        "job_title": jd.title,
        "job_location": jd.location or "",
        "company": settings.EMAIL_COMPANY_NAME,
        "recruiter_name": getattr(actor, "full_name", "") or "The talent team",
        "recruiter_email": getattr(actor, "email", "") or settings.EMAIL_REPLY_TO,
    }


def render(text: str, context: dict[str, str]) -> str:
    """Fill ``{placeholders}``; plain replacement, so a stray brace never breaks a mail."""
    out = text or ""
    for key in PLACEHOLDERS:
        out = out.replace("{" + key + "}", context.get(key, ""))
    return out


def render_template(
    template: MessageTemplate, application: Application, actor: Any
) -> tuple[str, str]:
    context = context_for(application, actor)
    return render(template.subject, context), render(template.body, context)


class OutreachService:
    @staticmethod
    def send_email(
        application: Application,
        *,
        subject: str,
        body: str,
        actor: Any,
        connection: Any = None,
    ) -> Communication:
        """Send one mail and log it; raises before sending when it cannot be logged."""
        require_active(application, "Emailing the candidate")
        to = recipient_for(application.candidate)
        if not to:
            raise NoRecipient
        subject = " ".join((subject or "").split())[:200]
        body = (body or "").strip()
        if not subject or not body:
            raise ValidationError("A subject and a body are required.")

        config = email_config()
        sent_to, sent_subject, sent_body = to, subject, body
        if config.safe_recipient:
            sent_to = config.safe_recipient
            sent_subject = f"[TEST for {to}] {subject}"[:255]
            sent_body = (
                f"Safe mode: this message was written for {application.candidate.full_name} "
                f"<{to}> and redirected here.\n\n{body}"
            )
        message = EmailMessage(
            subject=sent_subject,
            body=sent_body,
            from_email=config.from_email,
            to=[sent_to],
            reply_to=[config.reply_to] if config.reply_to else None,
            connection=connection,
        )
        try:
            message.send(fail_silently=False)
        except (smtplib.SMTPException, OSError) as exc:
            # The exception text can carry the server's reply; the type is enough
            # for the UI and the detail goes to the log.
            logger.warning("email to %s failed: %s: %s", to, type(exc).__name__, exc)
            raise EmailDeliveryFailed(
                f"The mail could not be sent ({type(exc).__name__}); check the email settings."
            ) from exc

        notes = body
        if config.safe_recipient:
            notes += f"\n\n[Safe mode: delivered to {config.safe_recipient} instead of {to}]"
        return CommunicationService.log(
            application,
            channel=CommunicationChannel.EMAIL,
            outcome=CommunicationOutcome.EMAIL_SENT,
            summary=f"Email: {subject}",
            notes=notes,
            actor=actor,
        )

    @staticmethod
    def send_bulk(
        applications: list[Application], *, template: MessageTemplate, actor: Any
    ) -> tuple[list[Communication], dict[str, str]]:
        """One personalised mail per application over one connection; skips are reported."""
        sent: list[Communication] = []
        skipped: dict[str, str] = {}
        with get_connection() as connection:
            for application in applications:
                subject, body = render_template(template, application, actor)
                try:
                    sent.append(
                        OutreachService.send_email(
                            application,
                            subject=subject,
                            body=body,
                            actor=actor,
                            connection=connection,
                        )
                    )
                except (NoRecipient, InvalidTransition, EmailDeliveryFailed) as exc:
                    skipped[str(application.pk)] = str(exc.detail)
        return sent, skipped
