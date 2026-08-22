from datetime import timedelta

from django.contrib.sessions.models import Session
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.models import LegoUser


class SessionStatusViewTestCase(APITestCase):
    def setUp(self):
        self.user = LegoUser.objects.create(username="session-status", lego_id=93100)

    def test_anonymous_callers_get_nothing(self):
        res = self.client.get("/api/session/")

        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_reports_the_expiry_the_server_will_actually_enforce(self):
        """Not now() + SESSION_COOKIE_AGE.

        session.get_expiry_date() falls back to a freshly computed window
        whenever _session_expiry is unset, which is always the case here
        because renew_session avoids writing it on purpose. Reading that
        fallback made every response look like a brand new session, so the
        client-side warning could never fire. The stored expire_date is the
        value being enforced, so that is what this reports.
        """
        self.client.force_login(self.user)
        stored = Session.objects.get(session_key=self.client.session.session_key)
        # Move the row's expiry somewhere a fresh window would never land.
        stored.expire_date = timezone.now() + timedelta(minutes=3)
        stored.save(update_fields=["expire_date"])

        res = self.client.get("/api/session/")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res.data["expires_at"])
        reported = timezone.datetime.fromisoformat(res.data["expires_at"])
        self.assertAlmostEqual(
            reported.timestamp(),
            stored.expire_date.timestamp(),
            delta=1,
        )

    def test_reading_the_status_does_not_renew_the_session(self):
        """An open tab polls this, so it must not count as human activity."""
        self.client.force_login(self.user)
        key = self.client.session.session_key
        before = Session.objects.get(session_key=key).expire_date

        self.client.get("/api/session/")

        after = Session.objects.get(session_key=key).expire_date
        self.assertEqual(before, after)
