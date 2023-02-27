import "vite/modulepreload-polyfill";
import React, { PropsWithChildren, useEffect } from "react";
import { BrowserRouter as Router, useRoutes } from "react-router-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
if (!container) {
  throw new Error("Failed to find root element");
}
const root = createRoot(container);

const App: React.FC<PropsWithChildren> = ({ children }) => {
  useEffect(() => {
    Sentry.setUser(djangoData.user);
  }, [djangoData.user]);

  return <main>{children}</main>;
};

const AppRoutes = () =>
  useRoutes([
    { path: "/", element: <LandingPage /> },
    { path: ":admissionId/*", element: <ApplicationPortal /> },
    { path: "*", element: <NotFoundPage /> },
  ]);

root.render(
  <ErrorBoundary openReportDialog>
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <Router>
          <ScrollToTop>
            <App>
              <AppRoutes />
            </App>
          </ScrollToTop>
        </Router>
      </QueryClientProvider>
    </React.StrictMode>
  </ErrorBoundary>
);
