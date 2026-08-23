from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):
    call_command("createcachetable", database=schema_editor.connection.alias)


def drop_cache_table(apps, schema_editor):
    schema_editor.execute("DROP TABLE IF EXISTS django_cache")


class Migration(migrations.Migration):
    # Backs the "default" DatabaseCache configured in settings/base.py, used
    # by DRF throttling and the member-search cache. Postgres rather than a
    # new Redis service, so uwsgi's 4 processes share one set of counters
    # without provisioning new infrastructure.

    dependencies = [
        ("admissions", "0035_conflictreviewlist"),
    ]

    operations = [
        migrations.RunPython(create_cache_table, drop_cache_table),
    ]
