from django.core import mail
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from premailer import transform
from structlog import get_logger

log = get_logger()


# A full withdrawal and a single committee being unticked used to send the same
# anonymous mail, so recruiters could not tell "left us but still applying
# elsewhere" from "withdrew from the admission entirely".
MESSAGE_KIND_DELETED = "deleted"
MESSAGE_KIND_WITHDRAWN = "withdrawn"

_MESSAGE_KINDS = {
    MESSAGE_KIND_DELETED: {
        "template": "deleted_application",
        "title": "Søknad slettet",
        "subject": "Søknad til opptak slettet",
    },
    MESSAGE_KIND_WITHDRAWN: {
        "template": "withdrawn_application",
        "title": "Søknad trukket",
        "subject": "Søknad til {group} trukket",
    },
}


def send_message(admission_title, group, recipients, kind=MESSAGE_KIND_DELETED):
    """
    Send a message to members with role "recruiting" when users delete or
    withdraw applications.
    """

    variant = _MESSAGE_KINDS.get(kind, _MESSAGE_KINDS[MESSAGE_KIND_DELETED])

    connection = mail.get_connection()
    connection.open()

    plain_template = f"../templates/{variant['template']}.txt"
    html_template = f"../templates/{variant['template']}.html"
    context = {
        "admission_title": admission_title,
        "group": group,
        "system_name": "",
        "title": variant["title"],
    }
    subject = variant["subject"].format(group=group)
    from_email = "Abakus <no-reply@abakus.no>"

    plain_body = render_to_string(plain_template, context)
    html_body = render_to_string(html_template, context)

    log.info(
        "send_mail",
        subject=subject,
        from_email=from_email,
        recipient_count=len(recipients),
    )

    email = EmailMultiAlternatives(
        subject=subject,
        body=plain_body,
        from_email=from_email,
        bcc=recipients,
        connection=connection,
    )
    email.attach_alternative(transform(html_body), "text/html")

    email.send()

    connection.close()
