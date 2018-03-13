from django.contrib.staticfiles.testing import StaticLiveServerTestCase
from selenium import webdriver
from selenium.webdriver.common.keys import Keys
import time


class NewVisitorTest(StaticLiveServerTestCase):

    def setUp(self):
        self.browser = webdriver.Chrome("/usr/lib/chromium-browser/chromedriver")
        self.live_server_url = 'http://localhost:8000'

    def tearDown(self):
        self.browser.quit()

    def test_apply_for_committee(self):
        # Odin wants to apply for a committee in Abakus and visits the page
        # he heard he could send in applications from.
        self.browser.get(self.live_server_url)

        # He notices the page title mentions 'Opptak til Abakom'.
        self.assertIn('Opptak til Abakom', self.browser.title)

        # He sees that the page has a text explaning the purpose of the site.
        self.assertIn('Her kan du søke om å bli med i komitéer i Abakus!',
                      self.browser.find_element_by_tag_name('h1').text)

        # There is a button Odin can click on that redirects him to another page.
        overview_btn = self.browser.find_element_by_id('to-overview')
        overview_btn.click()

        # He sees his own application. It is empty.
        applications = self.browser.find_elements_by_css_selector('.committee-application')
        self.assertEqual(0, len(applications))

        # He sees a button to apply to different committees and clicks it. He is redirected.
        apply_committes_btn = self.browser.find_element_by_id('apply-committees')
        apply_committes_btn.click()

        # On this page all the committees you can apply for are listed, along with a
        # description of each.
        self.fail("Finish the test")

        # Underneath the committee Webkom there is a button that says "Søk Webkom".

        # Odin clicks this button and is redirected to a new page.

        # Odin sees a header that says "Søknad til Webkom".

        # He sees a description of Webkom and what they want you to write about.

        # There is a text field where Odin can write his application and he can use
        # it to type some words.

        # Odin sees a button that says "Send søknad".

        # When he presses the button, he is redirected to a page that confirms that
        # he has applied, and shows the deadline for changing the application.

        # On this page there is a button he can click, and when he clicks it, it takes
        # him back to the overview page of his applications.

        # Now the main application shows that Odin has applied for Webkom.

        # He can click on the Webkom application to see the text he wrote earlier
        # on the same page.

        # Odin is satisfied and goes to sleep.
