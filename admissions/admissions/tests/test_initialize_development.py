from unittest.mock import call, patch

from django.core.management import CommandError, call_command
from django.test import SimpleTestCase, override_settings


class InitializeDevelopmentCommandTest(SimpleTestCase):
    @patch("admissions.utils.management.commands.initialize_development.call_command")
    @override_settings(ALLOW_DEVELOPMENT_INITIALIZATION=True)
    def test_migrates_before_loading_admissions_fixtures(self, mocked_call_command):
        call_command("initialize_development", verbosity=0)

        self.assertEqual(
            mocked_call_command.call_args_list,
            [
                call("migrate", interactive=False, verbosity=0),
                call("load_fixtures", verbosity=0),
            ],
        )

    @override_settings(ALLOW_DEVELOPMENT_INITIALIZATION=False)
    def test_rejects_non_development_settings(self):
        with self.assertRaisesMessage(
            CommandError,
            "Development initialization is disabled by this settings module.",
        ):
            call_command("initialize_development", verbosity=0)

    @override_settings(ALLOW_DEVELOPMENT_INITIALIZATION=False)
    def test_load_fixtures_rejects_non_development_settings(self):
        with self.assertRaisesMessage(
            CommandError,
            "Development fixture loading is disabled by this settings module.",
        ):
            call_command("load_fixtures", verbosity=0)
