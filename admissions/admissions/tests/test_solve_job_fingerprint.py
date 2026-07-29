from django.test import SimpleTestCase

from admissions.admissions.solve_jobs import planning_input_fingerprint


class PlanningInputFingerprintTestCase(SimpleTestCase):
    def _request_data(self):
        return {
            "candidates": [
                {
                    "id": "candidate-1",
                    "user_id": "user-1",
                    "name": "Display name",
                    "gender": "male",
                }
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Interviewer name",
                    "gender": "female",
                    "availability": ["2026-04-20|540"],
                    "biased": [],
                    "experience_level": "experienced",
                }
            ],
            "panel_size": 1,
            "options": {"policy_version": 2},
            "all_slots": ["2026-04-20|540"],
            "blocks": [],
            "block_metadata": [],
            "locked_assignments": [],
            "availability_generation": 1,
            "layout_version": 1,
        }

    def test_display_names_do_not_change_planning_fingerprint(self):
        original = self._request_data()
        renamed = self._request_data()
        renamed["candidates"][0]["name"] = "Another display name"
        renamed["interviewers"][0]["name"] = "Another interviewer name"

        self.assertEqual(
            planning_input_fingerprint(original),
            planning_input_fingerprint(renamed),
        )

    def test_solver_relevant_input_changes_planning_fingerprint(self):
        original = self._request_data()
        changed = self._request_data()
        changed["interviewers"][0]["availability"] = ["2026-04-20|600"]

        self.assertNotEqual(
            planning_input_fingerprint(original),
            planning_input_fingerprint(changed),
        )
