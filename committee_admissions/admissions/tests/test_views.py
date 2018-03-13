from django.test import TestCase


class LandingPageTest(TestCase):
    def test_uses_landing_page_template(self):
        response = self.client.get('/')
        self.assertTemplateUsed(response, 'admissions/landing_page.html')


class DashboardTest(TestCase):
    def test_uses_dashboard_template(self):
        response = self.client.get('/overview')
        self.assertTemplateUsed(response, 'admissions/dashboard.html')
