from django.conf import settings
from rest_framework.exceptions import APIException


class SchedulerUnavailable(APIException):
    status_code = 503
    default_detail = (
        "Intervjuplanleggeren er ikke tilgjengelig ennå. Prøv igjen senere."
    )
    default_code = "scheduler_disabled"


class SchedulerFeatureGateMixin:
    """Fail closed until the web app and solve worker are deployed together."""

    def initial(self, request, *args, **kwargs):
        if not getattr(settings, "ADMISSIONS_SCHEDULER_ENABLED", True):
            raise SchedulerUnavailable
        return super().initial(request, *args, **kwargs)
