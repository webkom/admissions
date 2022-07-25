import React from "react";
import { BrowserRouter as Router, useRoutes } from "react-router-dom";
import { createRoot } from "react-dom/client";

import NotFoundPage from "src/routes/NotFoundPage";
import LandingPage from "src/routes/LandingPage/";
import ErrorBoundary from "src/containers/ErrorBoundary/";
import ApplicationPortal from "src/routes/ApplicationPortal";

import ScrollToTop from "./scrollToTop";
import * as Sentry from "@sentry/browser";
import "src/styles/globals.css";
import config from "src/utils/config";
import "@babel/polyfill";

Sentry.init({
  dsn: config.SENTRY_DSN,
  release: config.RELEASE,
  environment: config.ENVIRONMENT,
  beforeSend(event) {
    if (event.body?.applications) {
      delete event.body.applications;
    }
    if (event.body?.text) {
      delete event.body.text;
    }
    return event;
  },
});

const container = document.getElementById("root");
const root = createRoot(container);

const AppRoutes = () =>
  useRoutes([
    { path: "/", element: <LandingPage /> },
    { path: "/velg-komiteer", element: <ApplicationPortal /> },
    { path: "/min-soknad", element: <ApplicationPortal /> },
    { path: "/admin", element: <ApplicationPortal /> },
    { path: "*", element: <NotFoundPage /> },
  ]);

root.render(
  <Router>
    <ScrollToTop>
      <div>
        <main>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </main>
      </div>
    </ScrollToTop>
  </Router>
);

if (module.hot) {
  module.hot.accept();
}
