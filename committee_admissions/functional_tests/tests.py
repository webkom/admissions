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

    def test_front_page(self):
        # Odin wants to apply for a committee in Abakus and visits the page
        # he heard he could send in applications from.
        self.browser.get(self.live_server_url)

        # He notices the page title mentions 'Opptak til Abakom'
        self.assertIn('Opptak til Abakom', self.browser.title)
        # He sees that the page has a title explaning the purpose of the site.
        self.assertIn('Her kan du søke om å bli med i komitéer i Abakus!', self.browser.find_element_by_tag_name('h1').text)

        self.fail("Finish the test")