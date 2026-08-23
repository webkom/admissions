import json
from copy import deepcopy

from django.test import SimpleTestCase

from admissions.utils.sentry import remove_sensitive_data


class SentryPrivacyTestCase(SimpleTestCase):
    def test_removes_request_data_identity_and_breadcrumbs(self):
        event = {
            "user": {"id": "candidate-id", "email": "candidate@example.com"},
            "request": {
                "method": "POST",
                "url": "/api/admin/admission/example/schedule/",
                "data": {"candidate": "Candidate Name"},
                "headers": {"Cookie": "session=secret"},
                "cookies": {"session": "secret"},
                "query_string": "candidate_id=secret-id",
            },
            "breadcrumbs": [{"message": "Candidate Name"}],
            "extra": {"request_data": {"phone_number": "12345678"}},
        }

        filtered = remove_sensitive_data(deepcopy(event), None)

        self.assertEqual(filtered, {})

    def test_scrubs_sensitive_values_inside_lists(self):
        event = {
            "contexts": {
                "values": [
                    {
                        "phone_number": "12345678",
                        "nested": [{"candidate_id": "secret-id"}],
                    }
                ]
            }
        }

        filtered = remove_sensitive_data(deepcopy(event), None)

        self.assertEqual(filtered, {})

    def test_allowlist_removes_secrets_from_every_free_form_field(self):
        secrets = ["Candidate Name", "secret-id", "private answer"]
        event = {
            "event_id": "safe-event-id",
            "message": secrets[0],
            "request": {"url": f"/application/{secrets[1]}/"},
            "contexts": {"profile": {"answer": secrets[2]}},
            "tags": {"candidate": secrets[0]},
            "exception": {
                "values": [
                    {
                        "type": "ValueError",
                        "value": secrets[2],
                        "stacktrace": {
                            "frames": [
                                {
                                    "filename": "views.py",
                                    "lineno": 10,
                                    "vars": {"candidate": secrets[0]},
                                }
                            ]
                        },
                    }
                ]
            },
        }

        serialized = json.dumps(remove_sensitive_data(deepcopy(event), None))

        for secret in secrets:
            self.assertNotIn(secret, serialized)
        self.assertIn("ValueError", serialized)
        self.assertIn("views.py", serialized)

    def test_allowlisted_tags_and_transaction_survive(self):
        event = {
            "event_id": "safe-event-id",
            "transaction": "GET /api/admin/admission/example/schedule/",
            "tags": {
                "api.status": 502,
                "api.method": "GET",
                "api.route": "/api/admin/admission/example/schedule/",
                "candidate": "Candidate Name",
            },
        }

        filtered = remove_sensitive_data(deepcopy(event), None)

        self.assertEqual(
            filtered["transaction"],
            "GET /api/admin/admission/example/schedule/",
        )
        self.assertEqual(
            filtered["tags"],
            {
                "api.status": 502,
                "api.method": "GET",
                "api.route": "/api/admin/admission/example/schedule/",
            },
        )

    def test_unlisted_tags_and_missing_transaction_are_dropped(self):
        event = {"event_id": "safe-event-id", "tags": {"candidate": "Candidate Name"}}

        filtered = remove_sensitive_data(deepcopy(event), None)

        self.assertNotIn("tags", filtered)
        self.assertNotIn("transaction", filtered)
