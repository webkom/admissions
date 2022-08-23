import "vite/modulepreload-polyfill";
import React, { useEffect } from "react";
import { BrowserRouter as Router, useRoutes } from "react-router-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "react-query";
import { defaultQueryFn } from "./query/queries";

import NotFoundPage from "src/routes/NotFoundPage";
import LandingPage from "src/routes/LandingPage/";
import ErrorBoundary from "src/containers/ErrorBoundary/";
import ApplicationPortal from "src/routes/ApplicationPortal";

import ScrollToTop from "./scrollToTop";
import * as Sentry from "@sentry/browser";
import "src/styles/globals.css";
import config from "src/utils/config";
import djangoData from "src/utils/djangoData";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: process.env.NODE_ENV === "production",
      refetchOnWindowFocus: process.env.NODE_ENV === "production",
      queryFn: defaultQueryFn,
      staleTime: 60000,
    },
  },
});

const container = document.getElementById("root");
const root = createRoot(container);

const App = ({ children }) => {
  useEffect(() => {
    Sentry.setUser(djangoData.user);
  }, [djangoData.user]);

  return <main>{children}</main>;
};

const AppRoutes = () =>
  useRoutes([
    { path: "/", element: <LandingPage /> },
    { path: "/velg-komiteer", element: <ApplicationPortal /> },
    { path: "/min-soknad", element: <ApplicationPortal /> },
    { path: "/admin", element: <ApplicationPortal /> },
    { path: "*", element: <NotFoundPage /> },
  ]);

root.render(
  <QueryClientProvider client={queryClient}>
    <Router>
      <ScrollToTop>
        <App>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </App>
      </ScrollToTop>
    </Router>
  </QueryClientProvider>
);

if (module.hot) {
  module.hot.accept();
}
