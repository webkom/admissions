from django.core.mail import send_mail
from django.core import mail
from django.template.loader import render_to_string

from premailer import transform
from structlog import get_logger

log = get_logger()


def send_message(admission_title, recipients):
    """
    Send a message to members with role "recruiting" when users delete applications.
    """

    # setup connection
    connection = mail.get_connection()
    connection.open()

    plain_template = "admissions/templates/email/deleted_application.txt"
    html_template = "admissions/templates/email/deleted_application.html"
    context = {
        "admission_title": admission_title
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

    send_mail(
        subject=subject,
        message=plain_body,
        from_email=from_email,
        recipient_list=recipient_list,
        # optional connection
        connection=connection,
        html_message=transform(html_body),
        fail_silently=False,
    )

    #close connection
    connection.close()


def get_recipients(recipients):
    return [recipient.email_address for recipient in recipients]

