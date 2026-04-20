from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("admissions", "0007_savedschedule_show_candidate_names"),
    ]

    operations = [
        migrations.CreateModel(
            name="InterviewAvailability",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("slots", models.JSONField(blank=True, default=list)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "admission",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="interview_availabilities",
                        to="admissions.admission",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="interview_availabilities",
                        to="admissions.legouser",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="interviewavailability",
            constraint=models.UniqueConstraint(
                fields=("admission", "user"),
                name="unique_admission_user_availability",
            ),
        ),
    ]

