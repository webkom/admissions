from django.apps import AppConfig


class AdmissionsConfig(AppConfig):
    default_auto_field = "django.db.models.AutoField"
    name = "admissions.admissions"

    def ready(self):
        from admissions.admissions import signals  # noqa: F401
