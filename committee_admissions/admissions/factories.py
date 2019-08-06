from django.contrib.auth import models

import factory

from committee_admissions.admissions.models import (
    Admission,
    Committee,
    CommitteeApplication,
    UserApplication,
)


class RandomUserFactory(factory.DjangoModelFactory):
    class Meta:
        model = models.User

    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    email = factory.Faker("safe_email")
    username = factory.Sequence(lambda n: "user_%d" % n)
    password = factory.PostGenerationMethodCall("set_password", "defaultpassword")
    is_active = True


class RandomAdmissionFactory(factory.DjangoModelFactory):
    class Meta:
        model = Admission

    title = factory.Sequence(lambda n: "Opptak %d" % n)
    open_from = factory.Faker("past_datetime", start_date="-10d", tzinfo=None)
    public_deadline = factory.Faker("future_datetime", end_date="+15d", tzinfo=None)
    application_deadline = factory.Faker(
        "future_datetime", end_date="+15d", tzinfo=None
    )


class RandomCommitteeFactory(factory.DjangoModelFactory):
    class Meta:
        model = Committee
        django_get_or_create = ("name",)

    name = factory.Iterator(
        ["Webkom", "Arrkom", "Bedkom", "Fagkom", "Koskom", "LaBamba", "readme", "PR"]
    )
    description = factory.Faker("text", max_nb_chars=200)
    response_label = factory.Faker("text", max_nb_chars=50)
    logo = factory.django.FileField(filename="committee.png")


class RandomUserApplicationFactory(factory.DjangoModelFactory):
    class Meta:
        model = UserApplication

    admission = RandomAdmissionFactory()
    user = factory.SubFactory(RandomUserFactory)
    text = factory.Faker("text", max_nb_chars=50)
    time_sent = factory.Faker("past_datetime", start_date="-0d", tzinfo=None)


class RandomCommitteeApplicationFactory(factory.DjangoModelFactory):
    class Meta:
        model = CommitteeApplication

    application = factory.SubFactory(RandomUserApplicationFactory)
    committee = factory.SubFactory(RandomCommitteeFactory)
    text = factory.Faker("text", max_nb_chars=200)
