from django.core.mail import EmailMultiAlternatives
from django.core import mail
from django.template.loader import render_to_string

from premailer import transform
from structlog import get_logger

log = get_logger()


def send_message(admission_title, recipients):
    """
    Send a message to members with role "recruiting" when users delete applications.
    """

    connection = mail.get_connection()
    connection.open()

    plain_template = "../templates/email/deleted_application.txt"
    html_template = "../templates/email/deleted_application.html"
    context = {
        "admission_title": admission_title,
        "system_name": "",
        "title": "Søknad slettet"
    }
    subject = "Søknad til opptak slettet"
    from_email = "Abakus <no-reply@abakus.no>"


    recipient_list = get_recipients(recipients)
    plain_body = render_to_string(plain_template, context)
    html_body = render_to_string(html_template, context)

    log.info(
        "send_mail",
        subject=subject,
        from_email=from_email,
        recipient_list=recipient_list,
    )

    email = EmailMultiAlternatives(
        subject=subject,
        body=plain_body,
        from_email=from_email,
        bcc=recipient_list,
        connection=connection,
    )
    email.attach_alternative(transform(html_body), "text/html")
    
    email.send()

    connection.close()


def get_recipients(recipients):
    return [recipient.user.email for recipient in recipients]

